import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';

const renderer = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true,
  typographer: true
});

const defaultLinkOpen =
  renderer.renderer.rules.link_open ||
  ((tokens: Token[], index: number, options: MarkdownIt.Options, env: object, self: MarkdownIt.Renderer) =>
    self.renderToken(tokens, index, options));

renderer.renderer.rules.link_open = (
  tokens: Token[],
  index: number,
  options: MarkdownIt.Options,
  env: object,
  self: MarkdownIt.Renderer
) => {
  const token = tokens[index];
  const href = token.attrGet('href') || '';
  if (/^https?:\/\//i.test(href)) {
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noreferrer noopener');
  }
  return defaultLinkOpen(tokens, index, options, env, self);
};

export function MarkdownBlock({ content, className }: { content?: string | null; className?: string }) {
  const html = renderer.render(content || '');
  if (!html.trim()) {
    return null;
  }

  return <div className={`markdown-block ${className || ''}`.trim()} dangerouslySetInnerHTML={{ __html: html }} />;
}
