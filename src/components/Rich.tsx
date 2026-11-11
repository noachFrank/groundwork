import { Fragment, type ReactNode } from 'react';

/** Renders `code`, **bold** and *italics* inside plain strings that come from lesson files. */
function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 3) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

const ITEM = /^(\d+\.|-) /;

/**
 * A "1. " or "- " list. Indented lines belong to the item above them, and indented
 * "- " lines become a list inside that item.
 */
function list(lines: string[], key: string): ReactNode {
  const items: { text: string; sub: string[] }[] = [];
  for (const line of lines) {
    if (ITEM.test(line)) items.push({ text: line.replace(ITEM, ''), sub: [] });
    else if (/^\s+- /.test(line)) items[items.length - 1].sub.push(line.replace(/^\s+- /, ''));
    else {
      const last = items[items.length - 1];
      if (last.sub.length) last.sub[last.sub.length - 1] += ` ${line.trim()}`;
      else last.text += ` ${line.trim()}`;
    }
  }
  const body = items.map((it, k) => (
    <li key={k}>
      {inline(it.text)}
      {it.sub.length > 0 && <ul>{it.sub.map((s, n) => <li key={n}>{inline(s)}</li>)}</ul>}
    </li>
  ));
  return /^\d/.test(lines[0]) ? <ol key={key}>{body}</ol> : <ul key={key}>{body}</ul>;
}

/**
 * Paragraphs, plus the extras lesson files use: ```fenced code```, "- " bullet lists and
 * "1. " numbered lists (with indented sub-points). Fences are split out first, because
 * code can contain blank lines.
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
          const lines = para.replace(/^\n+|\s+$/g, '').split('\n');
          if (lines.every((l) => /^\s*- /.test(l))) {
            blocks.push(<ul key={`${i}-${j}`}>{lines.map((l, k) => <li key={k}>{inline(l.replace(/^\s*- /, ''))}</li>)}</ul>);
          } else if (ITEM.test(lines[0])) {
            blocks.push(list(lines, `${i}-${j}`));
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
