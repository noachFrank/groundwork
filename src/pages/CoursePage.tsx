import { Link } from 'react-router-dom';
import { useApi } from '../hooks.ts';
import { type CourseData, hoursText, nextIn, ProgressBar, statsFor } from './course-shared.tsx';

/** The whole course: progress for each stage, and a card for each module that opens its lessons. */
export function CoursePage() {
  const { data, error } = useApi<CourseData>('/curriculum');
  if (error) return <div className="card error-box">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;
  const { curriculum, modules, lessons } = data;
  const overall = statsFor(lessons);
  const next = nextIn(lessons);

  return (
    <div>
      <h1>Course</h1>
      <p className="lede">Four stages, each made of courses. Open a course to see its lessons.</p>

      <section className="card overall">
        <div className="overall-head">
          <div>
            <span className="eyebrow">Your progress</span>
            <strong className="big-number">{overall.percent}%</strong>
            <span className="muted"> of the lessons written so far</span>
          </div>
          {next && (
            <Link className="btn" to={`/lessons/${next.id}`}>
              {next.status === 'in_progress' ? 'Continue' : 'Next lesson'}: {next.title}
            </Link>
          )}
        </div>
        <ProgressBar percent={overall.percent} label="Progress through all written lessons" />
        <p className="muted small">
          {overall.done} of {overall.total} lessons done
          {overall.inProgress > 0 && `, ${overall.inProgress} in progress`} · about {hoursText(overall.minutesLeft)} left.{' '}
          <Link to="/lessons">See every lesson</Link>
        </p>
      </section>

      {curriculum.stages.map((stage) => {
        const stageModules = modules.filter((m) => m.stage === stage.id);
        const stageLessons = lessons.filter((l) => stageModules.some((m) => m.id === l.module));
        const s = statsFor(stageLessons);
        const writtenMinutes = (topicId: string) => lessons.filter((l) => l.topic === topicId).reduce((n, l) => n + l.minutes, 0);
        const coming = stage.topics.filter((t) => writtenMinutes(t.id) < t.hours * 60 * 0.9);

        return (
          <section key={stage.id} className="stage" style={{ borderTopColor: stage.color }}>
            <div className="stage-head">
              <h2>{stage.title}</h2>
              <span className="muted small">
                {stageLessons.length > 0 ? `${s.percent}% done · ` : ''}about {stage.hours} hours{stage.note ? ` · ${stage.note}` : ''}
              </span>
            </div>
            {stageLessons.length > 0 && <ProgressBar percent={s.percent} label={`${stage.title} progress`} color={stage.color} />}

            <div className="module-grid">
              {stageModules.map((m) => {
                const ml = lessons.filter((l) => l.module === m.id);
                const ms = statsFor(ml);
                const state = ms.done === ms.total ? 'Complete' : ms.done > 0 || ms.inProgress > 0 ? 'In progress' : 'Not started';
                return (
                  <Link key={m.id} to={`/course/${m.id}`} className={`module-card ${ms.done === ms.total ? 'complete' : ''}`}>
                    <span className="eyebrow">{state}</span>
                    <h3>{m.title}</h3>
                    <p className="muted small">{m.summary}</p>
                    <ProgressBar percent={ms.percent} label={`${m.title} progress`} color={stage.color} />
                    <p className="module-card-foot small">
                      <strong>{ms.percent}%</strong> · {ms.done} of {ms.total} lessons
                      {ms.minutesLeft > 0 && <span className="muted"> · {hoursText(ms.minutesLeft)} left</span>}
                    </p>
                  </Link>
                );
              })}
            </div>

            {coming.length > 0 && (
              <div className="coming">
                <h3 className="small">{stageModules.length ? 'More coming in this stage' : 'Coming in a future update'}</h3>
                <ul>
                  {coming.map((t) => (
                    <li key={t.id}>
                      <strong>{t.title}</strong> <span className="muted small">· about {t.hours} hours{writtenMinutes(t.id) > 0 ? ', partly covered above' : ''}</span>
                      <div className="muted small">{t.summary}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {stage.milestone && <p className="milestone"><strong style={{ color: stage.color }}>Milestone:</strong> {stage.milestone}</p>}
          </section>
        );
      })}

      <section className="stage branch">
        <h2>{curriculum.optionalBranch.title}</h2>
        <p className="muted small">{curriculum.optionalBranch.hours}</p>
        <p>{curriculum.optionalBranch.summary}</p>
      </section>
      <p className="muted small">Already know some of this? <Link to="/test-out">Test out of lessons</Link>.</p>
    </div>
  );
}
