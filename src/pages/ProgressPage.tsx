import { Link } from 'react-router-dom';
import { useApi } from '../hooks.ts';

interface Stats {
  lessons: {
    id: string;
    title: string;
    status: string;
    recallBest: number | null;
    recallAttempts: number;
    taskAttempts: number;
    tasksPassed: number;
    tasksTotal: number;
    minutes: number;
  }[];
  weak: { id: string; title: string; forgot: number; failed: number }[];
  totalHours: number;
  totalCards: number;
  totalReviews: number;
  dueNow: number;
}

const LABEL: Record<string, string> = { not_started: 'Not started', in_progress: 'In progress', completed: 'Complete', tested_out: 'Tested out' };

export function ProgressPage() {
  const { data, error } = useApi<Stats>('/stats');
  if (error) return <div className="card error-box">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;
  const done = data.lessons.filter((l) => l.status === 'completed' || l.status === 'tested_out').length;
  return (
    <div>
      <h1>Progress</h1>
      <div className="card">
        <dl className="stat-row">
          <div><dt>Lessons done</dt><dd>{done} / {data.lessons.length}</dd></div>
          <div><dt>Hours studied</dt><dd>{data.totalHours}</dd></div>
          <div><dt>Ideas in review</dt><dd>{data.totalCards}</dd></div>
          <div><dt>Reviews done</dt><dd>{data.totalReviews}</dd></div>
        </dl>
      </div>

      <div className="card">
        <h2>Weak spots</h2>
        {data.weak.length === 0 ? (
          <p className="muted">Nothing yet. Topics you struggle with will appear here so you know where to look again.</p>
        ) : (
          <ul>
            {data.weak.map((w) => (
              <li key={w.id}>
                <Link to={`/lessons/${w.id}`}>{w.title}</Link>
                <span className="muted small"> {[w.failed > 0 && `${w.failed} failed ${w.failed === 1 ? 'try' : 'tries'}`, w.forgot > 0 && `forgot ${w.forgot} ${w.forgot === 1 ? 'time' : 'times'} in review`].filter(Boolean).join(', ')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Every lesson</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Lesson</th><th>Status</th><th>Tasks</th><th>Task tries</th><th>Best recall</th><th>Recall tries</th><th>Minutes</th></tr>
            </thead>
            <tbody>
              {data.lessons.map((l) => (
                <tr key={l.id}>
                  <td><Link to={`/lessons/${l.id}`}>{l.title}</Link></td>
                  <td>{LABEL[l.status]}</td>
                  <td>{l.tasksPassed}/{l.tasksTotal}</td>
                  <td>{l.taskAttempts}</td>
                  <td>{l.recallBest === null ? '–' : `${l.recallBest}%`}</td>
                  <td>{l.recallAttempts}</td>
                  <td>{l.minutes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
