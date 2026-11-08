import { useEffect, useRef, useState } from 'react';
import { CodeEditor } from '../components/CodeEditor.tsx';
import type { PythonRunResult } from '../../shared/python-harness.ts';
import type { PythonTask } from '../../shared/types.ts';
import type { TaskApi } from './TaskCard.tsx';

const RUN_LIMIT_MS = 15000;

export function PythonTaskView({ task, api }: { task: PythonTask; api: TaskApi }) {
  const [code, setCode] = useState(task.starter);
  const [editorKey, setEditorKey] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'running'>('loading');
  const [result, setResult] = useState<PythonRunResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);
  const codeRef = useRef(code);
  codeRef.current = code;

  const spawn = () => {
    worker.current?.terminate();
    const w = new Worker(new URL('./python.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    setStatus('loading');
    w.onmessage = (e) => {
      if (e.data.type === 'loaded') setStatus('ready');
      if (e.data.type === 'error') {
        setProblem(`Python had a problem: ${e.data.message}`);
        setStatus('ready');
      }
    };
    w.onerror = () => {
      setProblem('Python could not start. Try closing Groundwork and starting it again.');
      setStatus('ready');
    };
    w.postMessage({ id: 0, type: 'load' });
    return w;
  };

  useEffect(() => {
    spawn();
    return () => worker.current?.terminate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = () => {
    const w = worker.current;
    if (!w || status !== 'ready') return;
    setStatus('running');
    setProblem(null);
    const limit = setTimeout(() => {
      setProblem('Your code ran for more than 15 seconds, so it was stopped. Check for a loop that never ends.');
      spawn();
    }, RUN_LIMIT_MS);
    w.onmessage = (e) => {
      if (e.data.type === 'loaded') return;
      clearTimeout(limit);
      setStatus('ready');
      if (e.data.type === 'error') {
        setProblem(`Python had a problem: ${e.data.message}`);
        return;
      }
      const r = e.data.result as PythonRunResult;
      setResult(r);
      const passed = r.error === null && r.tests.every((t) => t.passed);
      void api.report(passed, Math.round((r.tests.filter((t) => t.passed).length / Math.max(1, r.tests.length)) * 100));
    };
    w.postMessage({ id: 1, type: 'run', code: codeRef.current, tests: task.tests });
  };

  return (
    <>
      <CodeEditor key={editorKey} language="python" value={task.starter} onChange={setCode} onRun={run} label="Python code editor" />
      <div className="row">
        <button className="btn" disabled={status !== 'ready'} onClick={run}>
          {status === 'loading' ? 'Starting Python…' : status === 'running' ? 'Running…' : 'Run and check'}
        </button>
        <button className="btn ghost" onClick={() => { setCode(task.starter); setResult(null); setProblem(null); setEditorKey(editorKey + 1); }}>Start over</button>
        <span className="muted small">Ctrl+Enter also runs it</span>
      </div>
      {problem && <div className="feedback bad">{problem}</div>}
      {result && (
        <div className="run-output">
          {(result.output || result.error) && (
            <pre className={result.error ? 'output has-error' : 'output'}>{result.output}{result.error}</pre>
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
