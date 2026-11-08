import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks.ts';
import type { LessonSummary } from '../../shared/types.ts';
import { type CourseData, isDone, LessonRow, statsFor } from './course-shared.tsx';

const FILTERS = [
  ['all', 'All'],
  ['in_progress', 'In progress'],
  ['not_started', 'Not started'],
  ['done', 'Done'],
] as const;
type Filter = (typeof FILTERS)[number][0];

const matches = (l: LessonSummary, f: Filter) =>
  f === 'all' || (f === 'done' ? isDone(l.status) : l.status === f);

/** Every lesson in the course, with what's done, started and not started. */
export function LessonsPage() {
  const { data, error } = useApi<CourseData>('/curriculum');
  const [filter, setFilter] = useState<Filter>('all');
  if (error) return <div className="card error-box">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;
  const all = statsFor(data.lessons);
  const count = (f: Filter) => data.lessons.filter((l) => matches(l, f)).length;

  return (
    <div>
      <h1>All lessons</h1>
      <p className="lede">
        {all.done} of {all.total} done, {all.inProgress} in progress, {all.total - all.done - all.inProgress} not started.
      </p>

      <div className="filter-row" role="group" aria-label="Show lessons">
        {FILTERS.map(([id, label]) => (
          <button key={id} className={`btn small ${filter === id ? '' : 'ghost'}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {label} ({count(id)})
          </button>
        ))}
      </div>

      {data.modules.map((m) => {
        const lessons = data.lessons.filter((l) => l.module === m.id);
        const shown = lessons.filter((l) => matches(l, filter));
        if (shown.length === 0) return null;
        const s = statsFor(lessons);
        return (
          <section key={m.id} className="card">
            <div className="stage-head">
              <h2>
                <Link to={`/course/${m.id}`}>{m.title}</Link>
              </h2>
              <span className="muted small">{s.done} of {s.total} done · {s.percent}%</span>
            </div>
            <ul className="lesson-list">
              {shown.map((l) => (
                <LessonRow key={l.id} lesson={l} number={lessons.indexOf(l) + 1} />
              ))}
            </ul>
          </section>
        );
      })}
      {count(filter) === 0 && <p className="card muted">No lessons here yet.</p>}
    </div>
  );
}
