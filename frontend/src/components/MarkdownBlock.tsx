import type { ReactNode } from 'react';
import { Typography } from 'antd';

const { Paragraph, Text, Title } = Typography;

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'space'; lines: number }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] };

export function MarkdownBlock({ content, className }: { content?: string | null; className?: string }) {
  const blocks = parseMarkdown(content || '');
  if (!blocks.length) {
    return null;
  }

  return (
    <div className={className}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return (
            <Title key={`${block.type}-${index}`} level={toTitleLevel(block.level)}>
              {renderInline(block.text)}
            </Title>
          );
        }
        if (block.type === 'ul') {
          return (
            <ul key={`${block.type}-${index}`} className="markdown-block__list">
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === 'ol') {
          return (
            <ol key={`${block.type}-${index}`} className="markdown-block__list">
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`}>{renderInline(item)}</li>
              ))}
            </ol>
          );
        }
        if (block.type === 'space') {
          return <div key={`${block.type}-${index}`} className="markdown-block__spacer" style={{ height: `${block.lines * 14}px` }} aria-hidden />;
        }
        return (
          <Paragraph key={`${block.type}-${index}`} className="public-paragraph public-paragraph--pre">
            {renderInline(block.text)}
          </Paragraph>
        );
      })}
    </div>
  );
}

function parseMarkdown(content: string): Block[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let blankCount = 0;

  function flushParagraph() {
    if (!paragraphLines.length) {
      return;
    }
    blocks.push({ type: 'paragraph', text: paragraphLines.join('\n').trim() });
    paragraphLines = [];
  }

  function flushList() {
    if (!listType || !listItems.length) {
      listType = null;
      listItems = [];
      return;
    }
    blocks.push({ type: listType, items: [...listItems] });
    listType = null;
    listItems = [];
  }

  function flushBlankSpace() {
    if (blankCount > 1) {
      blocks.push({ type: 'space', lines: blankCount - 1 });
    }
    blankCount = 0;
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      blankCount += 1;
      continue;
    }

    flushBlankSpace();

    const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'heading', level: heading[1].length as 1 | 2 | 3, text: heading[2].trim() });
      continue;
    }

    const ul = trimmed.match(/^[-*]\s+(.*)$/);
    if (ul) {
      flushParagraph();
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
      }
      listItems.push(ul[1].trim());
      continue;
    }

    const ol = trimmed.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      flushParagraph();
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
      }
      listItems.push(ol[1].trim());
      continue;
    }

    flushList();
    paragraphLines.push(trimmed);
  }

  flushParagraph();
  flushList();
  return blocks;
}

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  const segments = text.split(pattern).filter(Boolean);

  segments.forEach((segment, index) => {
    if (segment.startsWith('**') && segment.endsWith('**')) {
      parts.push(
        <Text key={`${segment}-${index}`} strong>
          {segment.slice(2, -2)}
        </Text>
      );
      return;
    }
    if (segment.startsWith('`') && segment.endsWith('`')) {
      parts.push(
        <Text key={`${segment}-${index}`} code>
          {segment.slice(1, -1)}
        </Text>
      );
      return;
    }
    const link = segment.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      parts.push(
        <a key={`${segment}-${index}`} href={link[2]} target="_blank" rel="noreferrer">
          {link[1]}
        </a>
      );
      return;
    }
    parts.push(segment);
  });

  return parts;
}

function toTitleLevel(level: 1 | 2 | 3): 3 | 4 | 5 {
  if (level === 1) {
    return 3;
  }
  if (level === 2) {
    return 4;
  }
  return 5;
}
