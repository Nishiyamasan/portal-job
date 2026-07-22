import type {ReactNode} from 'react';

type MarkdownContentProps = {
  content: string;
  className?: string;
};

function isSafeHref(href: string) {
  return href.startsWith('/') || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:');
}

function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\*([^*]+)\*|_([^_]+)_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const key = `${match.index}-${match[0]}`;
    if (match[2] && match[3]) {
      const href = match[3];
      nodes.push(
        isSafeHref(href) ? (
          <a key={key} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noreferrer' : undefined}>
            {parseInline(match[2])}
          </a>
        ) : (
          match[2]
        )
      );
    } else if (match[4] || match[5]) {
      nodes.push(<strong key={key}>{parseInline(match[4] || match[5])}</strong>);
    } else if (match[6]) {
      nodes.push(<code key={key}>{match[6]}</code>);
    } else if (match[7] || match[8]) {
      nodes.push(<em key={key}>{parseInline(match[7] || match[8])}</em>);
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export function MarkdownContent({content, className = ''}: MarkdownContentProps) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let paragraphLines: string[] = [];
  let unorderedItems: string[] = [];
  let orderedItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    blocks.push(
      <p key={`p-${blocks.length}`}>
        {paragraphLines.map((line, index) => (
          <span key={`${index}-${line}`}>
            {index > 0 && <br />}
            {parseInline(line)}
          </span>
        ))}
      </p>
    );
    paragraphLines = [];
  };

  const flushLists = () => {
    if (unorderedItems.length > 0) {
      blocks.push(
        <ul key={`ul-${blocks.length}`}>
          {unorderedItems.map((item, index) => (
            <li key={`${index}-${item}`}>{parseInline(item)}</li>
          ))}
        </ul>
      );
      unorderedItems = [];
    }

    if (orderedItems.length > 0) {
      blocks.push(
        <ol key={`ol-${blocks.length}`}>
          {orderedItems.map((item, index) => (
            <li key={`${index}-${item}`}>{parseInline(item)}</li>
          ))}
        </ol>
      );
      orderedItems = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      flushParagraph();
      flushLists();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const unordered = line.match(/^[-*]\s+(.+)$/);
    const ordered = line.match(/^\d+\.\s+(.+)$/);
    const quote = line.match(/^>\s+(.+)$/);

    if (heading) {
      flushParagraph();
      flushLists();
      const level = heading[1].length;
      const children = parseInline(heading[2]);
      if (level === 1) blocks.push(<h2 key={`h-${blocks.length}`}>{children}</h2>);
      if (level === 2) blocks.push(<h3 key={`h-${blocks.length}`}>{children}</h3>);
      if (level === 3) blocks.push(<h4 key={`h-${blocks.length}`}>{children}</h4>);
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      flushParagraph();
      flushLists();
      blocks.push(<hr key={`hr-${blocks.length}`} />);
      continue;
    }

    if (unordered) {
      flushParagraph();
      if (orderedItems.length > 0) flushLists();
      unorderedItems.push(unordered[1]);
      continue;
    }

    if (ordered) {
      flushParagraph();
      if (unorderedItems.length > 0) flushLists();
      orderedItems.push(ordered[1]);
      continue;
    }

    if (quote) {
      flushParagraph();
      flushLists();
      blocks.push(<blockquote key={`quote-${blocks.length}`}>{parseInline(quote[1])}</blockquote>);
      continue;
    }

    flushLists();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushLists();

  return (
    <div
      className={`markdown-content space-y-5 leading-8 text-gray-700 [&_a]:font-semibold [&_a]:text-brand-600 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-brand-200 [&_blockquote]:bg-brand-50/60 [&_blockquote]:px-5 [&_blockquote]:py-3 [&_blockquote]:text-gray-700 [&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_code]:font-semibold [&_h2]:text-2xl [&_h2]:font-black [&_h2]:text-gray-950 [&_h3]:text-xl [&_h3]:font-black [&_h3]:text-gray-950 [&_h4]:text-lg [&_h4]:font-bold [&_h4]:text-gray-950 [&_hr]:border-gray-200 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6 [&_strong]:font-black [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 ${className}`}
    >
      {blocks}
    </div>
  );
}
