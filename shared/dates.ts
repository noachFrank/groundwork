/** All "days" and "weeks" follow the learner's own clock, not UTC, so a review
 *  due "tomorrow" doesn't appear at 7pm because the UTC date rolled over. */
const pad = (n: number) => String(n).padStart(2, '0');

export function localDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return localDay(d);
}

/** Monday of the week containing `day`. */
export function weekStart(day: string): string {
  const d = parseDay(day);
  return addDays(day, -((d.getDay() + 6) % 7));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86400000);
}
