function resolveHost(siteUrl?: string | null) {
  const fallback = typeof window !== 'undefined' ? window.location.host : '';
  if (!siteUrl) {
    return fallback;
  }
  try {
    return new URL(siteUrl).host || fallback;
  } catch {
    return fallback;
  }
}

function compactParts(parts: Array<string | null | undefined>) {
  return parts.map((item) => String(item || '').trim()).filter(Boolean);
}

export function buildPublicPageTitle(options: {
  siteName?: string | null;
  pageName?: string | null;
  siteUrl?: string | null;
}) {
  const host = resolveHost(options.siteUrl);
  const parts = compactParts([options.siteName, options.pageName, host]);
  return parts.join(' | ') || 'nicefk';
}

export function buildConsolePageTitle(pageName: string, scope?: string) {
  const host = resolveHost();
  return compactParts([scope, pageName, host]).join(' | ') || pageName;
}

export function useDocumentTitle(title: string) {
  if (typeof document !== 'undefined') {
    document.title = title;
  }
}
