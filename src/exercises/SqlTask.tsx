import { useEffect, useRef, useState } from 'react';
import initSqlJs from 'sql.js';
import { CodeEditor } from '../components/CodeEditor.tsx';
import { sameResult, type SqlResult } from '../../shared/sql-compare.ts';
import type { SqlTask } from '../../shared/types.ts';
import type { TaskApi } from './TaskCard.tsx';

const datasets = import.meta.glob<string>('../../content/datasets/*.sql', { query: '?raw', import: 'default' });

function runQuery(db: any, sql: string): SqlResult {
  const results = db.exec(sql);
  const last = results[results.length - 1];
  return last ? { columns: last.columns, rows: last.values } : { columns: [], rows: [] };
}

function ResultTable({ result }: { result: SqlResult }) {
  if (result.columns.length === 0) return <p className="muted">That ran, but returned no rows.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{result.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
        <tbody>
          {result.rows.map((r, i) => (
            <tr key={i}>{r.map((v, j) => <td key={j}>{v === null ? <em>NULL</em> : String(v)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SqlTaskView({ task, api }: { task: SqlTask; api: TaskApi }) {
  const [code, setCode] = useState(task.starter);
  const [ready, setReady] = useState(false);
  const [result, setResult] = useState<SqlResult | null>(null);
  const [verdict, setVerdict] = useState<'pass' | 'fail' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sqlRef = useRef<any>(null);
  const seedRef = useRef('');
  const codeRef = useRef(code);
  codeRef.current = code;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      sqlRef.current = await initSqlJs({ locateFile: (f: string) => `/vendor/sql.js/${f}` });
      seedRef.current = await datasets[`../../content/datasets/${task.dataset}.sql`]();
      if (!cancelled) setReady(true);
    })().catch(() => setError('The practice database could not load. Try closing Groundwork and starting it again.'));
    return () => {
      cancelled = true;
    };
  }, [task.dataset]);

  const run = () => {
    if (!sqlRef.current) return;
    // A fresh database every run, so a bad UPDATE can't wreck later attempts.
    const fresh = () => {
      const db = new sqlRef.current.Database();
      db.run(seedRef.current);
      return db;
    };
    setError(null);
    setVerdict(null);
    let db: any;
    let check: any;
    try {
      db = fresh();
      const mine = runQuery(db, codeRef.current);
      setResult(mine);
      check = fresh();
      const expected = runQuery(check, task.solution);
      const passed = sameResult(mine, expected, !!task.ordered);
      setVerdict(passed ? 'pass' : 'fail');
      void api.report(passed);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
      void api.report(false);
    } finally {
      db?.close();
      check?.close();
    }
  };

  return (
    <>
      <CodeEditor language="sql" value={task.starter} onChange={setCode} onRun={run} label="SQL editor" />
      <div className="row">
        <button className="btn" disabled={!ready} onClick={run}>{ready ? 'Run and check' : 'Loading database…'}</button>
        <span className="muted small">Ctrl+Enter also runs it</span>
      </div>
      {error && <pre className="output has-error">{error}</pre>}
      {result && <ResultTable result={result} />}
      {verdict === 'pass' && <div className="feedback good"><strong>Passed.</strong> That matches the expected result.</div>}
      {verdict === 'fail' && <div className="feedback bad"><strong>Not yet.</strong> It ran, but those aren't the expected rows. Check which columns and rows the task asked for.</div>}
    </>
  );
}
