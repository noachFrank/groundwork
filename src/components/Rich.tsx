import { Fragment, type ReactNode } from 'react';

/** Renders `code` and **bold** inside plain strings that come from lesson files. */
function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 3) return <strong key={i}>{part.slice(2, -2)}</strong>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/**
 * Paragraphs, plus two extras lesson files use: ```fenced code``` and "- " bullet lists.
 * Fences are split out first, because code can contain blank lines.
 */
export function Rich({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  text
    .trim()
    .split(/(```[\w-]*\n[\s\S]*?\n```)/g)
    .forEach((part, i) => {
      const fence = part.match(/^```[\w-]*\n([\s\S]*?)\n```$/);
      if (fence) {
        blocks.push(<pre key={`f${i}`} className="rich-code"><code>{fence[1]}</code></pre>);
        return;
      }
      part
        .split(/\n\s*\n/)
        .filter((p) => p.trim())
        .forEach((para, j) => {
          const lines = para.trim().split('\n');
          if (lines.every((l) => /^\s*- /.test(l))) {
            blocks.push(<ul key={`${i}-${j}`}>{lines.map((l, k) => <li key={k}>{inline(l.replace(/^\s*- /, ''))}</li>)}</ul>);
          } else {
            blocks.push(<p key={`${i}-${j}`}>{inline(para.trim().replace(/\n/g, ' '))}</p>);
          }
        });
    });
  return <>{blocks}</>;
}

export function RichInline({ text }: { text: string }) {
  return <>{inline(text)}</>;
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  return (
    <button
      className="btn small ghost"
      onClick={async (e) => {
        const button = e.currentTarget;
        try {
          await navigator.clipboard.writeText(text);
          button.textContent = 'Copied!';
        } catch {
          button.textContent = 'Select the text and copy it';
        }
        setTimeout(() => (button.textContent = label), 1500);
      }}
    >
      {label}
    </button>
  );
}

export function CommandLine({ command }: { command: string }) {
  return (
    <div className="command">
      <code>{command}</code>
      <CopyButton text={command} />
    </div>
  );
}
