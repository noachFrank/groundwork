import { useState } from 'react';
import { CommandLine, CopyButton, RichInline } from '../components/Rich.tsx';
import { useApi } from '../hooks.ts';
import type { TerminalTask } from '../../shared/types.ts';
import type { TaskApi } from './TaskCard.tsx';

interface Result {
  passed: boolean;
  checks: { path: string; ok: boolean; hint: string }[];
}

export function TerminalTaskView({ task, api }: { task: TerminalTask; api: TaskApi }) {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: about } = useApi<{ practicePath: string; nodeDir: string }>('/about');
  // Lessons write {{nodeDir}} for the folder holding the Node that came with Groundwork.
  const fill = (text: string) => text.replaceAll('{{nodeDir}}', about?.nodeDir ?? '…');
  return (
    <>
      {about && (
        <p className="practice-path small">
          Your practice folder: <code>{about.practicePath}</code> <CopyButton text={about.practicePath} />
        </p>
      )}
      <ol className="steps">
        {task.steps.map((s, i) => (
          <li key={i}>
            <RichInline text={fill(s.text)} />
            {s.command && <CommandLine command={fill(s.command)} />}
          </li>
        ))}
      </ol>
      <button
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setResult(await api.serverCheck<Result>());
          } finally {
            setBusy(false);
          }
        }}
      >
        Check my work
      </button>
      <p className="muted small">This only looks at files in your practice folder. It never runs anything.</p>
      {result && (
        <div className={`feedback ${result.passed ? 'good' : 'bad'}`}>
          {result.passed ? (
            <strong>Passed. The practice folder has everything it should.</strong>
          ) : (
            <>
              <strong>Not yet.</strong>
              <ul>
                {result.checks.map((c) => (
                  <li key={c.path}>
                    {c.ok ? '✓' : '✗'} <code>{c.path}</code>
                    {!c.ok && <>: <RichInline text={c.hint} /></>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </>
  );
}
