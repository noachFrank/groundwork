import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.ts';
import { RichInline } from '../components/Rich.tsx';
import { useApi } from '../hooks.ts';
import type { ReviewCard, ReviewRating } from '../../shared/types.ts';

const RATINGS: { rating: ReviewRating; label: string; help: string }[] = [
  { rating: 'again', label: 'Forgot', help: 'Comes back tomorrow' },
  { rating: 'hard', label: 'Hard', help: 'Got it, with effort' },
  { rating: 'good', label: 'Good', help: 'Got it' },
  { rating: 'easy', label: 'Easy', help: 'Instantly' },
];

export function ReviewsPage() {
  const [params] = useSearchParams();
  const all = params.get('all') === '1';
  const { data, error } = useApi<{ cards: ReviewCard[]; totalDue: number; limited: boolean }>(`/reviews${all ? '?all=1' : ''}`);
  const [index, setIndex] = useState(0);
  const [showing, setShowing] = useState(false);
  const [typed, setTyped] = useState('');
  const [reviewed, setReviewed] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [data]);

  if (error) return <div className="card error-box">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;

  const card = data.cards[index];
  if (!card) {
    return (
      <div>
        <h1>Reviews</h1>
        <div className="card">
          {reviewed > 0 ? <h2>Done. {reviewed} reviewed.</h2> : <h2>Nothing to review right now</h2>}
          <p className="muted">
            {data.limited || data.totalDue > reviewed ? (
              <>That's today's limit, so you don't get buried. <Link to="/reviews?all=1">Keep going anyway</Link>, or come back tomorrow.</>
            ) : (
              'Ideas come back here once it\'s time to practise them again.'
            )}
          </p>
          <Link className="btn" to="/today">Back to Today</Link>
        </div>
      </div>
    );
  }

  const rate = async (rating: ReviewRating) => {
    await api(`/reviews/${encodeURIComponent(card.id)}`, { body: { rating } });
    setReviewed(reviewed + 1);
    setIndex(index + 1);
    setShowing(false);
    setTyped('');
  };

  return (
    <div>
      <h1>Reviews</h1>
      <p className="muted">{index + 1} of {data.cards.length}</p>
      <div className="card review-card">
        <span className="eyebrow">{card.lessonTitle}</span>
        <p className="question"><RichInline text={card.front} /></p>
        {!showing ? (
          <>
            <textarea aria-label="Your answer (optional)" rows={2} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Say or type your answer before looking…" />
            <button className="btn" onClick={() => setShowing(true)}>Show answer</button>
          </>
        ) : (
          <>
            <div className="model"><RichInline text={card.back} /></div>
            <p className="muted small">How did that go?</p>
            <div className="rating-row">
              {RATINGS.map((r) => (
                <button key={r.rating} className={`rating rating-${r.rating}`} onClick={() => rate(r.rating)}>
                  <strong>{r.label}</strong>
                  <span className="small">{r.help}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
