import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { RichInline } from '../components/Rich.tsx';
import { useApi } from '../hooks.ts';
import type { McqQuestion } from '../../shared/types.ts';

interface Group {
  lessonId: string;
  title: string;
  questions: McqQuestion[];
}
interface Outcome {
  results: { lessonId: string; title: string; correct: number; total: number; passed: boolean }[];
}

export function TestOutPage() {
  const { data, error } = useApi<Group[]>('/testout');
  const [answers, setAnswers] = useState<Record<string, Record<string, number>>>({});
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [notSure, setNotSure] = useState<Set<string>>(new Set());

  const remaining = useMemo(() => (data ?? []).filter((g) => !notSure.has(g.lessonId)), [data, notSure]);
  if (error) return <div className="card error-box">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;

  if (outcome) {
    const passed = outcome.results.filter((r) => r.passed);
    return (
      <div>
        <h1>Test-out results</h1>
        <div className="card">
          <p><strong>{passed.length}</strong> of {outcome.results.length} lessons skipped.</p>
          <ul className="checklist">
            {outcome.results.map((r) => (
              <li key={r.lessonId} className={r.passed ? 'yes' : 'no'}>{r.title}: {r.correct}/{r.total}{r.passed ? ', skipped' : ', kept in your plan'}</li>
            ))}
          </ul>
          <p className="muted">Skipped lessons still bring a few ideas back in reviews, just less often, in case you knew less than you thought.</p>
          <Link className="btn" to="/today">Back to Today</Link>
        </div>
      </div>
    );
  }

  const complete = remaining.length > 0 && remaining.every((g) => g.questions.every((q) => answers[g.lessonId]?.[q.id] !== undefined));

  return (
    <div>
      <h1>Test out</h1>
      <p className="lede">Already know some of this? Get every question for a lesson right and you can skip it.</p>
      <p className="muted">Don't guess. If a topic is new, choose "This is new to me" and it stays in your plan. Skipping something you don't know only costs you later.</p>
      {data.length === 0 && <div className="card"><p>There's nothing left to test out of.</p></div>}
      {data.map((g) => (
        <section className="card" key={g.lessonId}>
          <div className="task-head">
            <h2>{g.title}</h2>
            <label className="inline-check small">
              <input
                type="checkbox"
                checked={notSure.has(g.lessonId)}
                onChange={() => {
                  const next = new Set(notSure);
                  if (next.has(g.lessonId)) next.delete(g.lessonId);
                  else next.add(g.lessonId);
                  setNotSure(next);
                }}
              />
              This is new to me
            </label>
          </div>
          {!notSure.has(g.lessonId) &&
            g.questions.map((q) => (
              <div className="question-block" key={q.id}>
                <p className="question"><RichInline text={q.prompt} /></p>
                <div className="options">
                  {q.options.map((opt, i) => (
                    <label key={i} className="option">
                      <input
                        type="radio"
                        name={`${g.lessonId}-${q.id}`}
                        checked={answers[g.lessonId]?.[q.id] === i}
                        onChange={() => setAnswers({ ...answers, [g.lessonId]: { ...answers[g.lessonId], [q.id]: i } })}
                      />
                      <span><RichInline text={opt} /></span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
        </section>
      ))}
      {data.length > 0 && (
        <button
          className="btn"
          disabled={!complete}
          onClick={async () => {
            setOutcome(await api('/testout', { body: { lessonIds: remaining.map((g) => g.lessonId), answers } }));
          }}
        >
          Submit
        </button>
      )}
    </div>
  );
}
