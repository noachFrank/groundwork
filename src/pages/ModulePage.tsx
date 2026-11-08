import { Link, useParams } from 'react-router-dom';
import { useApi } from '../hooks.ts';
import { type CourseData, hoursText, LessonRow, nextIn, ProgressBar, statsFor } from './course-shared.tsx';

/** One course (module): its progress and its lessons in order. */
export function ModulePage() {
  const { moduleId } = useParams();
  const { data, error } = useApi<CourseData>('/curriculum');
  if (error) return <div className="card error-box">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;
  const mod = data.modules.find((m) => m.id === moduleId);
  if (!mod) {
    return (
      <div className="card">
        <p>That course doesn't exist.</p>
        <Link to="/course">Back to the course</Link>
      </div>
    );
  }
  const stage = data.curriculum.stages.find((s) => s.id === mod.stage);
  const lessons = data.lessons.filter((l) => l.module === mod.id);
  const s = statsFor(lessons);
  const next = nextIn(lessons);

  return (
    <div>
      <p className="crumb">
        <Link to="/course">Course</Link> / {stage?.title}
      </p>
      <h1>{mod.title}</h1>
      <p className="lede">{mod.summary}</p>

      <section className="card overall">
        <div className="overall-head">
          <div>
            <strong className="big-number">{s.percent}%</strong>
            <span className="muted"> done · {s.done} of {s.total} lessons</span>
          </div>
          {next ? (
            <Link className="btn" to={`/lessons/${next.id}`}>
              {next.status === 'in_progress' ? 'Continue' : s.done === 0 ? 'Start' : 'Next lesson'}: {next.title}
            </Link>
          ) : (
            <span className="tag tag-done">Course complete</span>
          )}
        </div>
        <ProgressBar percent={s.percent} label={`${mod.title} progress`} color={stage?.color} />
        <p className="muted small">
          {s.inProgress > 0 && `${s.inProgress} in progress · `}
          {s.minutesLeft > 0 ? `About ${hoursText(s.minutesLeft)} left` : 'Every lesson is done. Reviews will keep it fresh.'}
        </p>
      </section>

      <section className="card">
        <h2>Lessons</h2>
        <ul className="lesson-list">
          {lessons.map((l, i) => (
            <LessonRow key={l.id} lesson={l} number={i + 1} />
          ))}
        </ul>
      </section>
    </div>
  );
}
