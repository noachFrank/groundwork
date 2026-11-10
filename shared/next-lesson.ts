import type { Connectivity, LessonStatus, Prerequisite } from './types.ts';

export interface Pickable {
  id: string;
  connectivity: Connectivity;
  prerequisites: Prerequisite[];
}

const done = (s?: LessonStatus) => s === 'completed' || s === 'tested_out';

/** Only essential prerequisites count. Nothing is ever blocked from opening; this just steers suggestions. */
export function isLocked(lesson: Pickable, statuses: Record<string, LessonStatus>): boolean {
  return lesson.prerequisites.some((p) => p.need === 'essential' && !done(statuses[p.id]));
}

/**
 * The next lesson to suggest, in course order, skipping finished, locked and
 * "come back later" lessons. When offline, a lesson that needs internet is
 * passed over for the next one that doesn't, and `fallback` says so.
 */
export function pickNextLesson<T extends Pickable>(
  lessons: T[],
  statuses: Record<string, LessonStatus>,
  online: boolean,
  comeBackLater: Set<string> = new Set(),
): { lesson: T | null; fallback: boolean } {
  const open = lessons.filter((l) => !done(statuses[l.id]) && !isLocked(l, statuses) && !comeBackLater.has(l.id));
  const first = open[0] ?? null;
  if (online || !first || first.connectivity === 'offline') return { lesson: first, fallback: false };
  const offlineLesson = open.find((l) => l.connectivity === 'offline');
  return offlineLesson ? { lesson: offlineLesson, fallback: true } : { lesson: first, fallback: false };
}
