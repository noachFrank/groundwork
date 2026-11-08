import { useState } from 'react';
import { Rich, RichInline } from '../components/Rich.tsx';
import type { FlawTask } from '../../shared/types.ts';
import type { TaskApi } from './TaskCard.tsx';

export function FlawTaskView({ task, api }: { task: FlawTask; api: TaskApi }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [found, setFound] = useState(api.alreadyPassed);
  const lines = task.code.replace(/\n$/, '').split('\n');

  const pick = (n: number) => {
    setPicked(n);
    if (task.flawLines.includes(n)) {
      setFound(true);
      if (!api.alreadyPassed) void api.report(true);
    } else if (!found) {
      void api.report(false, undefined, { line: n });
    }
  };

  const wrongNote = picked !== null && !task.flawLines.includes(picked) ? task.lineNotes[String(picked)] : null;

  return (
    <>
      <p className="muted small">Click the line you think is the problem.</p>
      <div className="code-lines" role="group" aria-label={`${task.language} code`}>
        {lines.map((line, i) => {
          const n = i + 1;
          const isFlaw = task.flawLines.includes(n);
          const state = found && isFlaw ? 'flaw' : picked === n && !isFlaw ? 'miss' : '';
          return (
            <button key={n} className={`code-line ${state}`} onClick={() => pick(n)} aria-label={`Line ${n}: ${line.trim() || 'blank'}`}>
              <span className="ln">{n}</span>
              <code>{line || ' '}</code>
            </button>
          );
        })}
      </div>
      {picked !== null && !task.flawLines.includes(picked) && !found && (
        <div className="feedback bad">
          <strong>That line is fine.</strong> {wrongNote ? <RichInline text={wrongNote} /> : 'Look for something that would be dangerous in real use.'}
        </div>
      )}
      {found && (
        <div className="feedback good">
          <strong>Found it.</strong>
          <Rich text={task.explanation} />
        </div>
      )}
    </>
  );
}
