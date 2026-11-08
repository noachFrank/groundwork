import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import type { Curriculum, PlanSettings, Schedule } from '../../shared/types.ts';

const fmt = (d: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, opts);

export function PlanPage() {
  const { data, reload } = useApi<{ settings: PlanSettings | null; schedule: Schedule | null }>('/plan');
  const { data: course } = useApi<{ curriculum: Curriculum }>('/curriculum');
  const [hours, setHours] = useState('');
  const [limit, setLimit] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.settings) {
      setHours(String(data.settings.hoursPerWeek));
      setLimit(String(data.settings.dailyReviewLimit));
    }
  }, [data?.settings]);

  if (!data || !course) return <p className="muted">Loading…</p>;
  const colorOf = (stageId: string) => course.curriculum.stages.find((s) => s.id === stageId)?.color ?? '#888';
  const { settings, schedule } = data;

  const save = async () => {
    await api('/plan', { method: 'PUT', body: { hoursPerWeek: Number(hours), dailyReviewLimit: Number(limit) || undefined } });
    await reload();
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const slipped = settings?.originalFinish && schedule?.finishDate && schedule.finishDate > settings.originalFinish;
  const weeks = schedule?.weeks ?? [];
  const visible = showAll ? weeks : weeks.slice(0, 6);

  return (
    <div>
      <h1>Study plan</h1>
      <div className="card plan-settings">
        <div className="field">
          <label htmlFor="hours">Hours a week</label>
          <input id="hours" className="text-input narrow" type="number" min={0.5} max={80} value={hours} onChange={(e) => setHours(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="limit">Most reviews a day</label>
          <input id="limit" className="text-input narrow" type="number" min={1} max={500} value={limit} onChange={(e) => setLimit(e.target.value)} />
        </div>
        <button className="btn" onClick={save} disabled={!(Number(hours) >= 0.5 && Number(hours) <= 80)}>{saved ? 'Saved' : settings ? 'Update plan' : 'Build my plan'}</button>
      </div>

      {schedule && (
        <>
          <div className="card">
            <dl className="stat-row">
              <div><dt>Hours left</dt><dd>{schedule.remainingHours}</dd></div>
              <div><dt>Weeks left</dt><dd>{weeks.length}</dd></div>
              <div><dt>Finish around</dt><dd>{schedule.finishDate ? fmt(schedule.finishDate, { month: 'short', year: 'numeric' }) : 'Done!'}</dd></div>
              <div><dt>Hours so far</dt><dd>{schedule.spentHours}</dd></div>
            </dl>
            {schedule.behindHours >= 1 ? (
              <p>You're about <strong>{schedule.behindHours} hours</strong> behind your pace, so everything has shifted. {slipped && <>Your first target was {fmt(settings!.originalFinish!, { month: 'long', day: 'numeric', year: 'numeric' })}.</>} If that's not realistic, change your hours above rather than feeling bad about it.</p>
            ) : (
              <p className="muted">You're on pace. This plan rebuilds itself from what's actually left, every time you open it.</p>
            )}
            <p className="muted small">Already know some of this? <Link to="/test-out">Take the test-out quiz</Link> to skip it.</p>
          </div>

          <div className="plan-weeks">
            {visible.map((w, i) => (
              <div className="card plan-week" key={w.weekStart}>
                <div className="plan-week-head">
                  <strong>{i === 0 ? 'This week' : `Week of ${fmt(w.weekStart)}`}</strong>
                  <span className="muted small">{w.hours} h</span>
                </div>
                <ul>
                  {w.items.map((item) => (
                    <li key={`${item.id}-${w.weekStart}`}>
                      <span className="stage-dot" style={{ background: colorOf(item.stageId) }} />
                      {item.title} <span className="muted small">{item.hours} h</span>
                      {!item.written && <span className="tag">not written yet</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {weeks.length > 6 && (
            <button className="btn ghost" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer weeks' : `Show all ${weeks.length} weeks`}</button>
          )}
          <p className="muted small">"Not written yet" lessons arrive through updates. Connect to the internet and double-click <code>update.bat</code> in your Groundwork folder to get them.</p>
        </>
      )}
    </div>
  );
}
