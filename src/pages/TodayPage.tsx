import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import { useOnline } from '../online.tsx';
import type { Today } from '../../shared/types.ts';
import { useDeveloperName } from '../lesson/LessonExtras.tsx';

const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

function Welcome({ onDone }: { onDone: () => void }) {
  const [hours, setHours] = useState(10);
  return (
    <section className="card welcome">
      <h1>Welcome to Groundwork</h1>
      <p className="lede">A course that takes you from near-beginner toward working as a software consultant, in four stages.</p>
      <p>You won't just watch. Every lesson makes you guess, read, do something real, and answer from memory. Ideas then come back on a schedule until they stick.</p>
      <label htmlFor="hours"><strong>How many hours a week can you study?</strong></label>
      <div className="row">
        <input id="hours" className="text-input narrow" type="number" min={1} max={80} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
        <button
          className="btn"
          disabled={!(hours >= 1 && hours <= 80)}
          onClick={async () => {
            await api('/plan', { method: 'PUT', body: { hoursPerWeek: hours } });
            onDone();
          }}
        >
          Build my plan
        </button>
      </div>
      <p className="muted small">At 10 hours a week the whole course takes about 4 months. You can change this any time.</p>
    </section>
  );
}

export function TodayPage() {
  const { data, error, reload } = useApi<Today>('/today');
  const { online } = useOnline();
  const developer = useDeveloperName();
  if (error) return <div className="card error-box">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;
  if (!data.planSet) return <Welcome onDone={reload} />;

  const remainingReviewAllowance = Math.max(0, data.reviewLimit - data.reviewsDoneToday);
  const reviewsNow = Math.min(data.reviewsDue, remainingReviewAllowance);

  return (
    <div className="today">
      <h1>Today</h1>

      {data.feedback.due && (
        <section className="card today-card feedback-nudge">
          <span className="eyebrow">Weekly feedback</span>
          <p>
            You have <strong>{data.feedback.unsent}</strong> note{data.feedback.unsent === 1 ? '' : 's'} about lessons that {developer ?? 'the person who gave you Groundwork'} hasn't seen yet.
            Download them as a file and send it on WhatsApp. It takes a minute and it's how lessons get fixed.
          </p>
          <Link className="btn" to="/settings#feedback">Send my feedback</Link>
        </section>
      )}

      <section className="card today-card">
        <span className="eyebrow">First: reviews</span>
        {reviewsNow > 0 ? (
          <>
            <h2>{reviewsNow} {reviewsNow === 1 ? 'idea' : 'ideas'} to review</h2>
            <p className="muted">A few minutes now keeps what you've already learned.</p>
            <Link className="btn" to="/reviews">Start reviews</Link>
          </>
        ) : data.reviewsDue > 0 ? (
          <p>You've hit today's limit of {data.reviewLimit} reviews. {data.reviewsDue} more can wait until tomorrow. <Link to="/reviews?all=1">Keep going anyway</Link></p>
        ) : (
          <p className="muted">Nothing due right now. {data.reviewsDoneToday > 0 ? `You reviewed ${data.reviewsDoneToday} today.` : 'Finished lessons will bring ideas back here.'}</p>
        )}
      </section>

      <section className="card today-card">
        <span className="eyebrow">Then: next lesson</span>
        {data.nextLesson ? (
          <>
            <h2>{data.nextLesson.title}</h2>
            <p>{data.nextLesson.summary}</p>
            <p className="meta">
              About {data.nextLesson.minutes} minutes ·{' '}
              {data.nextLesson.connectivity === 'offline' ? <span className="tag tag-off">works offline</span> : <span className="tag tag-net">needs internet</span>}
            </p>
            {data.nextIsFallback && <p className="muted small">The next lesson in order needs the internet, so this is the next one you can do offline.</p>}
            {!data.nextIsFallback && data.nextLesson.connectivity === 'needs-internet' && online === false && (
              <div className="offline-box">This lesson needs the internet, and you're offline. Connect to do it, or use this time for reviews.</div>
            )}
            <Link className="btn" to={`/lessons/${data.nextLesson.id}`}>{data.nextLesson.status === 'in_progress' ? 'Continue lesson' : 'Start lesson'}</Link>
          </>
        ) : data.completedCount === data.totalLessons ? (
          <>
            <h2>You've finished every lesson written so far</h2>
            <p>That's every lesson written so far. More lessons arrive through updates: connect to the internet and double-click <code>update.bat</code> in your Groundwork folder. Your progress stays safe.</p>
            <p>This is also the moment to give feedback: what was boring, confusing or useful?</p>
          </>
        ) : (
          <p className="muted">Nothing else is open right now. Check your "come back later" list below.</p>
        )}
      </section>

      <section className="card today-card">
        <span className="eyebrow">This week</span>
        {data.week && (
          <>
            <div className="week-bar" role="img" aria-label={`${data.week.spent} of ${data.week.planned} hours studied this week`}>
              <div style={{ width: `${Math.min(100, (data.week.spent / data.week.planned) * 100)}%` }} />
            </div>
            <p><strong>{data.week.spent}</strong> of {data.week.planned} hours studied. <strong>{data.week.left}</strong> left this week.</p>
            {data.behindHours >= 1 && (
              <p className="muted">You're about {data.behindHours} hours behind your original pace. That's fine: your plan has already adjusted itself. {data.finishDate && <>New finish: {fmtDate(data.finishDate)}.</>}</p>
            )}
            {data.behindHours < 1 && data.finishDate && <p className="muted">On this pace you'll finish around {fmtDate(data.finishDate)}.</p>}
          </>
        )}
        <Link to="/plan" className="small">See the full plan</Link>
      </section>

      {data.rewritten.length > 0 && (
        <section className="card today-card">
          <span className="eyebrow">Rewritten since you finished them</span>
          <p className="muted small">These lessons now explain more, including things the old versions skipped. A re-read is worth it.</p>
          <ul>{data.rewritten.map((l) => <li key={l.id}><Link to={`/lessons/${l.id}`}>{l.title}</Link></li>)}</ul>
        </section>
      )}

      {(data.needReview.length > 0 || data.comeBackLater.length > 0) && (
        <section className="card today-card">
          {data.needReview.length > 0 && (
            <>
              <span className="eyebrow">You flagged: need to review</span>
              <ul>{data.needReview.map((l) => <li key={l.id}><Link to={`/lessons/${l.id}`}>{l.title}</Link></li>)}</ul>
            </>
          )}
          {data.comeBackLater.length > 0 && (
            <>
              <span className="eyebrow">Come back later</span>
              <ul>{data.comeBackLater.map((l) => <li key={l.id}><Link to={`/lessons/${l.id}`}>{l.title}</Link></li>)}</ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
