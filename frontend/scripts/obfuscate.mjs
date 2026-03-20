import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join } from 'node:path';
import JavaScriptObfuscator from 'javascript-obfuscator';

const assetsDir = new URL('../../backend/app/static/assets/', import.meta.url);
const assetsPath = fileURLToPath(assetsDir);
const skip = process.env.SKIP_OBFUSCATE === '1';
const allowPrefixes = ['PublicGoodsPage-', 'OrderStatusPage-', 'OrderSearchPage-', 'PublicPage-', 'StatusTag-'];

async function main() {
  if (skip) {
    console.log('[obfuscate] skipped by SKIP_OBFUSCATE=1');
    return;
  }

  const filenames = await readdir(assetsPath);
  const jsFiles = [];
  for (const filename of filenames) {
    if (extname(filename) !== '.js') {
      continue;
    }
    if (!allowPrefixes.some((prefix) => filename.startsWith(prefix))) {
      continue;
    }
    const filePath = join(assetsPath, filename);
    const fileStat = await stat(filePath);
    if (fileStat.isFile()) {
      jsFiles.push(filePath);
    }
  }

  for (const filePath of jsFiles) {
    const source = await readFile(filePath, 'utf8');
    const result = JavaScriptObfuscator.obfuscate(source, {
      compact: true,
      identifierNamesGenerator: 'hexadecimal',
      renameGlobals: false,
      selfDefending: false,
      simplify: true,
      splitStrings: true,
      splitStringsChunkLength: 8,
      stringArray: true,
      stringArrayCallsTransform: true,
      stringArrayEncoding: ['base64'],
      stringArrayIndexShift: true,
      stringArrayRotate: true,
      stringArrayShuffle: true,
      stringArrayThreshold: 0.75,
      transformObjectKeys: true,
      unicodeEscapeSequence: false
    });
    await writeFile(filePath, result.getObfuscatedCode(), 'utf8');
    console.log(`[obfuscate] processed ${filePath}`);
  }
}

main().catch((error) => {
  console.error('[obfuscate] failed', error);
  process.exitCode = 1;
});
