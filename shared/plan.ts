import { addDays, daysBetween, weekStart } from './dates.ts';
import type { Content, Curriculum, LessonStatus, Module, PlanItem, PlanWeek, Schedule } from './types.ts';

/** Course order: by stage, then by each module's order within its stage. */
export function sortModules(modules: Module[], curriculum: Curriculum): Module[] {
  const stageIndex = new Map(curriculum.stages.map((s, i) => [s.id, i]));
  const rank = (m: Module) => stageIndex.get(m.stage) ?? Number.MAX_SAFE_INTEGER;
  return [...modules].sort((a, b) => rank(a) - rank(b) || a.order - b.order);
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const isDone = (s: LessonStatus | undefined) => s === 'completed' || s === 'tested_out';

/**
 * What's left to learn, in order. Lessons that exist come first, then every
 * curriculum topic not written yet, so the plan shows the whole 180-hour road.
 */
export function buildPlanItems(content: Content, statuses: Record<string, LessonStatus>): PlanItem[] {
  const items: PlanItem[] = [];
  const writtenMinutesByTopic: Record<string, number> = {};
  for (const l of content.lessons) {
    writtenMinutesByTopic[l.topic] = (writtenMinutesByTopic[l.topic] ?? 0) + l.minutes;
  }

  for (const m of sortModules(content.modules, content.curriculum)) {
    const remaining = content.lessons.filter((l) => l.module === m.id && !isDone(statuses[l.id]));
    if (remaining.length === 0) continue;
    items.push({
      id: `module:${m.id}`,
      title: m.title,
      stageId: m.stage,
      hours: round1(remaining.reduce((sum, l) => sum + l.minutes, 0) / 60),
      written: true,
    });
  }
  for (const s of content.curriculum.stages) {
    for (const t of s.topics) {
      const written = (writtenMinutesByTopic[t.id] ?? 0) / 60;
      // A topic whose lessons cover at least 90% of its estimate counts as fully written.
      if (written >= t.hours * 0.9) continue;
      const hours = round1(Math.max(0, t.hours - written));
      if (hours > 0) items.push({ id: `topic:${t.id}`, title: t.title, stageId: s.id, hours, written: false });
    }
  }
  return items;
}

export interface ScheduleInput {
  items: PlanItem[];
  hoursPerWeek: number;
  startDate: string;
  today: string;
  /** Hours actually studied since the start date. */
  spentHours: number;
  spentThisWeek: number;
}

/**
 * Lays the remaining work out week by week starting now. Because it always
 * plans from today and what's actually left, falling behind reschedules itself.
 */
export function generateSchedule(input: ScheduleInput): Schedule {
  const { items, hoursPerWeek, startDate, today, spentHours, spentThisWeek } = input;
  const perWeek = Math.max(0.5, hoursPerWeek);
  const remainingHours = round1(items.reduce((s, i) => s + i.hours, 0));

  const started = today >= startDate;
  const elapsedDays = started ? daysBetween(startDate, today) : 0;
  const expectedHours = round1((elapsedDays / 7) * perWeek);
  const behindHours = started ? round1(Math.max(0, expectedHours - spentHours)) : 0;

  const weeks: PlanWeek[] = [];
  let cursor = weekStart(started ? today : startDate);
  let capacity = started ? Math.max(0, perWeek - spentThisWeek) : perWeek;
  let current: PlanWeek = { weekStart: cursor, hours: 0, items: [] };
  const queue = items.map((i) => ({ ...i }));

  while (queue.length > 0) {
    if (capacity < 0.05) {
      weeks.push(current);
      cursor = addDays(cursor, 7);
      capacity = perWeek;
      current = { weekStart: cursor, hours: 0, items: [] };
      continue;
    }
    const item = queue[0];
    const take = Math.min(item.hours, capacity);
    current.items.push({ ...item, hours: round1(take) });
    current.hours = round1(current.hours + take);
    capacity -= take;
    item.hours -= take;
    if (item.hours < 0.05) queue.shift();
  }
  if (current.items.length > 0) weeks.push(current);

  const realWeeks = weeks.filter((w) => w.items.length > 0);
  const last = realWeeks[realWeeks.length - 1];
  return {
    weeks: realWeeks,
    finishDate: last ? addDays(last.weekStart, 6) : null,
    remainingHours,
    expectedHours,
    spentHours: round1(spentHours),
    behindHours,
    thisWeek: {
      planned: perWeek,
      spent: round1(spentThisWeek),
      left: round1(Math.max(0, perWeek - spentThisWeek)),
    },
  };
}
