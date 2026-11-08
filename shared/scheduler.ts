import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from 'ts-fsrs';
import type { ReviewRating } from './types.ts';

// Day-based scheduling (no same-day "learning steps"): a beginner should see a
// shaky idea tomorrow, not be drilled on it again ten minutes later.
const scheduler = fsrs(generatorParameters({ enable_fuzz: false, enable_short_term: false, request_retention: 0.9 }));

const RATINGS: Record<ReviewRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

export type StoredCard = Card;

/** A new card's first schedule. Struggling with the lesson brings it back sooner. */
export function firstSchedule(now: Date, outcome: 'struggled' | 'normal' | 'tested_out'): StoredCard {
  const rating = outcome === 'struggled' ? Rating.Again : outcome === 'tested_out' ? Rating.Easy : Rating.Good;
  return scheduler.next(createEmptyCard(now), now, rating).card;
}

export function nextSchedule(card: StoredCard, now: Date, rating: ReviewRating): StoredCard {
  return scheduler.next(card, now, RATINGS[rating]).card;
}

export function reviveCard(json: string): StoredCard {
  const raw = JSON.parse(json);
  return {
    ...raw,
    due: new Date(raw.due),
    last_review: raw.last_review ? new Date(raw.last_review) : undefined,
  };
}
