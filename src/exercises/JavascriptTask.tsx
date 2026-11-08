import { useRef, useState } from 'react';
import { CodeEditor } from '../components/CodeEditor.tsx';
import type { JsRunResult } from '../../shared/js-harness.ts';
import type { JavascriptTask } from '../../shared/types.ts';
import type { TaskApi } from './TaskCard.tsx';

const RUN_LIMIT_MS = 5000;

/**
 * Each run gets a fresh worker from /js-runner.js. That file has its own strict
 * security policy, so the code can be evaluated but can't reach anything, and a
 * loop that never ends is stopped by terminating the worker.
 */
export function JavascriptTaskView({ task, api }: { task: JavascriptTask; api: TaskApi }) {
  const [code, setCode] = useState(task.starter);
  const [editorKey, setEditorKey] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<JsRunResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const codeRef = useRef(code);
  codeRef.current = code;

  const run = () => {
    if (running) return;
    setRunning(true);
    setProblem(null);
    const worker = new Worker('/js-runner.js');
    const finish = () => {
      clearTimeout(limit);
      worker.terminate();
      setRunning(false);
    };
    const limit = setTimeout(() => {
      finish();
      setProblem('Your code ran for more than 5 seconds, so it was stopped. Check for a loop that never ends.');
    }, RUN_LIMIT_MS);
    worker.onmessage = (e) => {
      finish();
      const r = e.data as JsRunResult;
      setResult(r);
      const passed = r.error === null && r.tests.length > 0 && r.tests.every((t) => t.passed);
      void api.report(passed, Math.round((r.tests.filter((t) => t.passed).length / Math.max(1, r.tests.length)) * 100));
    };
    worker.onerror = () => {
      finish();
      setProblem('JavaScript could not start. Try closing Groundwork and starting it again.');
    };
    worker.postMessage({ code: codeRef.current, tests: task.tests });
  };

  return (
    <>
      <CodeEditor key={editorKey} language="javascript" value={task.starter} onChange={setCode} onRun={run} label="JavaScript code editor" />
      <div className="row">
        <button className="btn" disabled={running} onClick={run}>{running ? 'Running…' : 'Run and check'}</button>
        <button className="btn ghost" onClick={() => { setCode(task.starter); setResult(null); setProblem(null); setEditorKey(editorKey + 1); }}>Start over</button>
        <span className="muted small">Ctrl+Enter also runs it</span>
      </div>
      {problem && <div className="feedback bad">{problem}</div>}
      {result && (
        <div className="run-output">
          {(result.output || result.error) && (
            <pre className={result.error ? 'output has-error' : 'output'}>{result.output}{result.output && result.error ? '\n' : ''}{result.error}</pre>
          )}
          <ul className="test-list">
            {result.tests.map((t) => (
              <li key={t.name} className={t.passed ? 'yes' : 'no'}>
                <strong>{t.passed ? '✓' : '✗'} {t.name}</strong>
                {!t.passed && t.message && <span> {t.message}</span>}
              </li>
            ))}
          </ul>
          {result.error === null && result.tests.every((t) => t.passed) && (
            <div className="feedback good"><strong>Passed.</strong> All the hidden checks are happy.</div>
          )}
        </div>
      )}
    </>
  );
}
