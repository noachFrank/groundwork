import type { ReactNode } from 'react';
import { ExternalLink } from '../online.tsx';
import { Viz } from '../viz/index.tsx';
import { Term } from './LessonExtras.tsx';

function Callout({ title, children, kind = 'note' }: { title?: string; children: ReactNode; kind?: 'note' | 'warn' | 'consultant' }) {
  return (
    <aside className={`callout callout-${kind}`}>
      {title && <strong className="callout-title">{title}</strong>}
      <div>{children}</div>
    </aside>
  );
}

function ConsultantNote({ children }: { children: ReactNode }) {
  return <Callout kind="consultant" title="Why a consultant cares">{children}</Callout>;
}

export const mdxComponents = {
  Viz,
  Callout,
  ConsultantNote,
  Term,
  // Links in lesson text know when they can't be opened.
  a: ({ href, children }: { href?: string; children?: ReactNode }) => <ExternalLink href={href ?? '#'}>{children}</ExternalLink>,
};
