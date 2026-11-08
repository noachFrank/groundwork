import type { DatabaseSync } from 'node:sqlite';
import { addDays, localDay, weekStart } from '../shared/dates.ts';
import { isLocked, pickNextLesson } from '../shared/next-lesson.ts';
import { buildPlanItems, generateSchedule } from '../shared/plan.ts';
import { gradeQuestion } from '../shared/questions.ts';
import { firstSchedule, nextSchedule, reviveCard } from '../shared/scheduler.ts';
import type {
  Content,
  Lesson,
  LessonProgress,
  LessonStatus,
  LessonSummary,
  PlanSettings,
  ReviewCard,
  ReviewRating,
  Schedule,
  StepName,
  Today,
} from '../shared/types.ts';
import { SCHEMA_VERSION, TABLES } from './db.ts';

const iso = (d = new Date()) => d.toISOString();
const DEFAULT_REVIEW_LIMIT = 30;

export class Store {
  private db: DatabaseSync;
  private content: Content;
  /** Injectable so tests can move through time. */
  now: () => Date;

  constructor(db: DatabaseSync, content: Content, now: () => Date = () => new Date()) {
    this.db = db;
    this.content = content;
    this.now = now;
    this.syncCards();
  }

  lesson(id: string): Lesson | undefined {
    return this.content.lessons.find((l) => l.id === id);
  }

  // ---- Settings -----------------------------------------------------------
  getSetting<T>(key: string): T | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as T) : null;
  }
  setSetting(key: string, value: unknown) {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value));
  }

  // ---- Lesson progress ----------------------------------------------------
  private row(id: string): any {
    return this.db.prepare('SELECT * FROM lesson_progress WHERE lesson_id = ?').get(id);
  }
  private ensureRow(id: string) {
    this.db.prepare('INSERT OR IGNORE INTO lesson_progress (lesson_id) VALUES (?)').run(id);
  }

  statuses(): Record<string, LessonStatus> {
    const rows = this.db.prepare('SELECT lesson_id, status FROM lesson_progress').all() as { lesson_id: string; status: LessonStatus }[];
    return Object.fromEntries(rows.map((r) => [r.lesson_id, r.status]));
  }

  progress(id: string): LessonProgress {
    const r = this.row(id);
    const tasks = this.db.prepare('SELECT * FROM task_results WHERE lesson_id = ?').all(id) as any[];
    const secs = this.db.prepare('SELECT COALESCE(SUM(seconds), 0) AS s FROM time_log WHERE lesson_id = ?').get(id) as { s: number };
    return {
      lessonId: id,
      status: r?.status ?? 'not_started',
      step: r?.step ?? 'predict',
      predictAnswer: r?.predict_answer ?? null,
      recallPassed: !!r?.recall_passed,
      recallAttempts: r?.recall_attempts ?? 0,
      recallBest: r?.recall_best ?? null,
      needReview: !!r?.need_review,
      comeBackLater: !!r?.come_back_later,
      startedAt: r?.started_at ?? null,
      completedAt: r?.completed_at ?? null,
      seconds: secs.s,
      tasks: tasks.map((t) => ({ taskId: t.task_id, passed: !!t.passed, bestScore: t.best_score, attempts: t.attempts })),
    };
  }

  private start(id: string) {
    this.ensureRow(id);
    this.db
      .prepare(`UPDATE lesson_progress SET status = 'in_progress', started_at = COALESCE(started_at, ?) WHERE lesson_id = ? AND status = 'not_started'`)
      .run(iso(this.now()), id);
  }

  setStep(id: string, step: StepName) {
    this.start(id);
    this.db.prepare('UPDATE lesson_progress SET step = ? WHERE lesson_id = ?').run(step, id);
  }

  private logAttempt(lessonId: string, kind: string, ref: string | null, passed: boolean | null, score: number | null, detail: unknown) {
    this.db
      .prepare('INSERT INTO attempts (lesson_id, kind, ref, passed, score, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(lessonId, kind, ref, passed === null ? null : passed ? 1 : 0, score, detail === undefined ? null : JSON.stringify(detail), iso(this.now()));
  }

  recordPredict(id: string, answer: number) {
    const lesson = this.lesson(id)!;
    this.start(id);
    this.db.prepare('UPDATE lesson_progress SET predict_answer = ? WHERE lesson_id = ?').run(answer, id);
    this.logAttempt(id, 'predict', lesson.predict.id, answer === lesson.predict.answer, null, { answer });
  }

  recordTask(id: string, taskId: string, passed: boolean, score: number | null = null, detail?: unknown): LessonProgress {
    this.start(id);
    this.db
      .prepare(
        `INSERT INTO task_results (lesson_id, task_id, passed, best_score, attempts, updated_at) VALUES (?, ?, ?, ?, 1, ?)
         ON CONFLICT (lesson_id, task_id) DO UPDATE SET
           passed = MAX(passed, excluded.passed),
           best_score = CASE WHEN best_score IS NULL THEN excluded.best_score WHEN excluded.best_score IS NULL THEN best_score ELSE MAX(best_score, excluded.best_score) END,
           attempts = attempts + 1,
           updated_at = excluded.updated_at`,
      )
      .run(id, taskId, passed ? 1 : 0, score, iso(this.now()));
    this.logAttempt(id, 'task', taskId, passed, score, detail);
    this.maybeComplete(id);
    return this.progress(id);
  }

  /** Grades on the server so a score can't drift from the answer key. Self-scored questions use the learner's own verdict. */
  recordRecall(id: string, responses: Record<string, { response: string | number | null; selfCorrect?: boolean }>) {
    const lesson = this.lesson(id)!;
    this.start(id);
    const results = lesson.recall.map((q) => {
      const r = responses[q.id];
      const graded = gradeQuestion(q, r?.response ?? null);
      return { id: q.id, correct: graded ?? !!r?.selfCorrect };
    });
    const percent = Math.round((results.filter((r) => r.correct).length / results.length) * 100);
    const passed = percent >= lesson.recallPassPercent;
    this.db
      .prepare(
        `UPDATE lesson_progress SET recall_attempts = recall_attempts + 1,
         recall_best = MAX(COALESCE(recall_best, 0), ?), recall_passed = MAX(recall_passed, ?) WHERE lesson_id = ?`,
      )
      .run(percent, passed ? 1 : 0, id);
    this.logAttempt(id, 'recall', null, passed, percent, results);
    this.maybeComplete(id);
    return { percent, passed, results, progress: this.progress(id) };
  }

  /** A lesson only counts as complete once Do and Recall both pass. */
  private maybeComplete(id: string) {
    const lesson = this.lesson(id);
    if (!lesson) return;
    const p = this.progress(id);
    if (p.status === 'completed' || !p.recallPassed) return;
    const passedTasks = new Set(p.tasks.filter((t) => t.passed).map((t) => t.taskId));
    if (!lesson.tasks.filter((t) => t.required).every((t) => passedTasks.has(t.id))) return;
    this.db
      .prepare(`UPDATE lesson_progress SET status = 'completed', step = 'review', completed_at = ?, come_back_later = 0 WHERE lesson_id = ?`)
      .run(iso(this.now()), id);
    // Struggling is what brings a topic back sooner: a failed recall, or repeated failed tasks.
    const struggled = p.recallAttempts > 1 || p.tasks.some((t) => t.attempts >= 4);
    this.createCards(lesson, struggled ? 'struggled' : 'normal');
  }

  private createCards(lesson: Lesson, outcome: 'struggled' | 'normal' | 'tested_out') {
    const now = this.now();
    for (const c of lesson.cards) {
      const card = firstSchedule(now, outcome);
      this.db
        .prepare('INSERT OR IGNORE INTO cards (id, lesson_id, due, state, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(`${lesson.id}:${c.id}`, lesson.id, iso(card.due), JSON.stringify(card), iso(now));
    }
  }

  /** If an update adds review cards to a lesson already finished, they join the schedule. */
  private syncCards() {
    for (const [id, status] of Object.entries(this.statuses())) {
      const lesson = this.lesson(id);
      if (lesson && (status === 'completed' || status === 'tested_out')) this.createCards(lesson, 'normal');
    }
  }

  setFlags(id: string, flags: { needReview?: boolean; comeBackLater?: boolean }) {
    this.ensureRow(id);
    if (flags.comeBackLater !== undefined) {
      this.db.prepare('UPDATE lesson_progress SET come_back_later = ? WHERE lesson_id = ?').run(flags.comeBackLater ? 1 : 0, id);
    }
    if (flags.needReview !== undefined) {
      this.db.prepare('UPDATE lesson_progress SET need_review = ? WHERE lesson_id = ?').run(flags.needReview ? 1 : 0, id);
      // "Need to review" brings the lesson's cards back today.
      if (flags.needReview) {
        const nowIso = iso(this.now());
        this.db.prepare('UPDATE cards SET due = ? WHERE lesson_id = ? AND due > ?').run(nowIso, id, nowIso);
      }
    }
    return this.progress(id);
  }

  // ---- Notes and problem reports ------------------------------------------
  getNote(id: string): string {
    const r = this.db.prepare('SELECT body FROM notes WHERE lesson_id = ?').get(id) as { body: string } | undefined;
    return r?.body ?? '';
  }
  setNote(id: string, body: string) {
    this.db
      .prepare('INSERT INTO notes (lesson_id, body, updated_at) VALUES (?, ?, ?) ON CONFLICT (lesson_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at')
      .run(id, body, iso(this.now()));
  }
  addProblem(id: string, message: string) {
    this.db.prepare('INSERT INTO problems (lesson_id, message, created_at) VALUES (?, ?, ?)').run(id, message, iso(this.now()));
  }
  listProblems() {
    const rows = this.db.prepare('SELECT * FROM problems ORDER BY id DESC').all() as any[];
    return rows.map((r) => ({
      id: r.id,
      lessonId: r.lesson_id,
      lessonTitle: this.lesson(r.lesson_id)?.title ?? r.lesson_id,
      message: r.message,
      resolved: !!r.resolved,
      createdAt: r.created_at,
    }));
  }
  resolveProblem(id: number, resolved: boolean) {
    this.db.prepare('UPDATE problems SET resolved = ? WHERE id = ?').run(resolved ? 1 : 0, id);
  }

  // ---- Reviews ------------------------------------------------------------
  private dueRows(): any[] {
    const rows = this.db
      .prepare(
        `SELECT c.* FROM cards c LEFT JOIN lesson_progress p ON p.lesson_id = c.lesson_id
         WHERE c.due <= ? ORDER BY COALESCE(p.need_review, 0) DESC, c.due ASC`,
      )
      .all(iso(this.now())) as any[];
    // A card removed from the course in an update simply stops appearing.
    return rows.filter((r) => this.findCard(r.id));
  }

  private findCard(cardId: string) {
    const split = cardId.indexOf(':');
    const lesson = this.lesson(cardId.slice(0, split));
    return lesson ? { lesson, card: lesson.cards.find((c) => c.id === cardId.slice(split + 1)) } : null;
  }

  reviewsDoneToday(): number {
    const r = this.db.prepare('SELECT COUNT(*) AS n FROM card_reviews WHERE day = ?').get(localDay(this.now())) as { n: number };
    return r.n;
  }

  /** Reviews stay within a daily limit so a long course never buries the learner. `all` overrides it. */
  dueCards(all = false): { cards: ReviewCard[]; totalDue: number; limited: boolean } {
    const rows = this.dueRows();
    const limit = all ? Infinity : Math.max(0, this.reviewLimit() - this.reviewsDoneToday());
    const cards = rows.slice(0, limit).map((r) => {
      const found = this.findCard(r.id)!;
      return { id: r.id, lessonId: found.lesson.id, lessonTitle: found.lesson.title, front: found.card!.front, back: found.card!.back, due: r.due };
    });
    return { cards, totalDue: rows.length, limited: cards.length < rows.length };
  }

  rateCard(cardId: string, rating: ReviewRating) {
    const row = this.db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId) as any;
    if (!row) return null;
    const now = this.now();
    const next = nextSchedule(reviveCard(row.state), now, rating);
    this.db.prepare('UPDATE cards SET due = ?, state = ? WHERE id = ?').run(iso(next.due), JSON.stringify(next), cardId);
    this.db
      .prepare('INSERT INTO card_reviews (card_id, lesson_id, rating, day, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(cardId, row.lesson_id, rating, localDay(now), iso(now));
    const left = this.db.prepare('SELECT COUNT(*) AS n FROM cards WHERE lesson_id = ? AND due <= ?').get(row.lesson_id, iso(now)) as { n: number };
    if (left.n === 0) this.db.prepare('UPDATE lesson_progress SET need_review = 0 WHERE lesson_id = ?').run(row.lesson_id);
    return { due: iso(next.due) };
  }

  cardsForLesson(id: string) {
    const rows = this.db.prepare('SELECT id, due FROM cards WHERE lesson_id = ? ORDER BY due').all(id) as { id: string; due: string }[];
    return rows.map((r) => ({ id: r.id, due: r.due }));
  }

  // ---- Test out -----------------------------------------------------------
  testOutQuestions() {
    const statuses = this.statuses();
    return this.content.lessons
      .filter((l) => statuses[l.id] !== 'completed' && statuses[l.id] !== 'tested_out')
      .map((l) => ({ lessonId: l.id, title: l.title, questions: l.testOut }));
  }

  /** Every question for a lesson must be right to skip it: a guess shouldn't skip a topic. */
  submitTestOut(lessonIds: string[], answers: Record<string, Record<string, number>>) {
    const results = lessonIds.map((id) => {
      const lesson = this.lesson(id)!;
      const given = answers[id] ?? {};
      const correct = lesson.testOut.filter((q) => given[q.id] === q.answer).length;
      const passed = correct === lesson.testOut.length;
      this.logAttempt(id, 'testout', null, passed, Math.round((correct / lesson.testOut.length) * 100), given);
      if (passed) {
        this.ensureRow(id);
        this.db
          .prepare(`UPDATE lesson_progress SET status = 'tested_out', step = 'review', completed_at = ?, started_at = COALESCE(started_at, ?), come_back_later = 0 WHERE lesson_id = ?`)
          .run(iso(this.now()), iso(this.now()), id);
        this.createCards(lesson, 'tested_out');
      }
      return { lessonId: id, title: lesson.title, correct, total: lesson.testOut.length, passed };
    });
    return { results };
  }

  // ---- Time ---------------------------------------------------------------
  addTime(lessonId: string | null, seconds: number) {
    const clamped = Math.min(Math.max(0, Math.round(seconds)), 120);
    this.db
      .prepare(`INSERT INTO time_log (day, lesson_id, seconds) VALUES (?, ?, ?) ON CONFLICT (day, lesson_id) DO UPDATE SET seconds = seconds + excluded.seconds`)
      .run(localDay(this.now()), lessonId ?? '', clamped);
  }
  private secondsSince(day: string): number {
    const r = this.db.prepare('SELECT COALESCE(SUM(seconds), 0) AS s FROM time_log WHERE day >= ?').get(day) as { s: number };
    return r.s;
  }

  // ---- Plan ---------------------------------------------------------------
  planSettings(): PlanSettings | null {
    return this.getSetting<PlanSettings>('plan');
  }
  reviewLimit(): number {
    return this.planSettings()?.dailyReviewLimit ?? DEFAULT_REVIEW_LIMIT;
  }
  savePlan(input: { hoursPerWeek: number; startDate?: string; dailyReviewLimit?: number }): Schedule {
    const prior = this.planSettings();
    const settings: PlanSettings = {
      hoursPerWeek: input.hoursPerWeek,
      startDate: input.startDate ?? prior?.startDate ?? localDay(this.now()),
      originalFinish: null,
      dailyReviewLimit: input.dailyReviewLimit ?? prior?.dailyReviewLimit ?? DEFAULT_REVIEW_LIMIT,
    };
    this.setSetting('plan', settings);
    const schedule = this.schedule()!;
    // Choosing different hours sets a new goal; slipping against it is what gets reported.
    this.setSetting('plan', { ...settings, originalFinish: schedule.finishDate });
    return schedule;
  }
  schedule(): Schedule | null {
    const plan = this.planSettings();
    if (!plan) return null;
    const today = localDay(this.now());
    return generateSchedule({
      items: buildPlanItems(this.content, this.statuses()),
      hoursPerWeek: plan.hoursPerWeek,
      startDate: plan.startDate,
      today,
      spentHours: this.secondsSince(plan.startDate) / 3600,
      spentThisWeek: this.secondsSince(weekStart(today)) / 3600,
    });
  }

  // ---- Summaries ----------------------------------------------------------
  summaries(): LessonSummary[] {
    const statuses = this.statuses();
    const rows = this.db.prepare('SELECT lesson_id, need_review, come_back_later FROM lesson_progress').all() as any[];
    const flags = new Map(rows.map((r) => [r.lesson_id, r]));
    return this.content.lessons.map((l) => ({
      id: l.id,
      title: l.title,
      module: l.module,
      topic: l.topic,
      minutes: l.minutes,
      summary: l.summary,
      connectivity: l.connectivity,
      prerequisites: l.prerequisites,
      status: statuses[l.id] ?? 'not_started',
      locked: isLocked(l, statuses),
      needReview: !!flags.get(l.id)?.need_review,
      comeBackLater: !!flags.get(l.id)?.come_back_later,
    }));
  }

  today(online: boolean): Today {
    const summaries = this.summaries();
    const later = new Set(summaries.filter((s) => s.comeBackLater).map((s) => s.id));
    const { lesson, fallback } = pickNextLesson(summaries, this.statuses(), online, later);
    const schedule = this.schedule();
    return {
      planSet: !!schedule,
      reviewsDue: this.dueCards(true).totalDue,
      reviewsDoneToday: this.reviewsDoneToday(),
      reviewLimit: this.reviewLimit(),
      nextLesson: lesson,
      nextIsFallback: fallback,
      comeBackLater: summaries.filter((s) => s.comeBackLater && s.status !== 'completed' && s.status !== 'tested_out'),
      needReview: summaries.filter((s) => s.needReview),
      week: schedule?.thisWeek ?? null,
      behindHours: schedule?.behindHours ?? 0,
      finishDate: schedule?.finishDate ?? null,
      completedCount: summaries.filter((s) => s.status === 'completed' || s.status === 'tested_out').length,
      totalLessons: summaries.length,
    };
  }

  stats() {
    const lessons = this.content.lessons.map((l) => {
      const p = this.progress(l.id);
      const reqTasks = l.tasks.filter((t) => t.required);
      return {
        id: l.id,
        title: l.title,
        status: p.status,
        recallBest: p.recallBest,
        recallAttempts: p.recallAttempts,
        taskAttempts: p.tasks.reduce((s, t) => s + t.attempts, 0),
        tasksPassed: reqTasks.filter((t) => p.tasks.find((r) => r.taskId === t.id)?.passed).length,
        tasksTotal: reqTasks.length,
        minutes: Math.round(p.seconds / 60),
      };
    });

    const since = addDays(localDay(this.now()), -60);
    const again = this.db
      .prepare(`SELECT lesson_id, COUNT(*) AS n FROM card_reviews WHERE rating = 'again' AND day >= ? GROUP BY lesson_id`)
      .all(since) as { lesson_id: string; n: number }[];
    const failed = this.db
      .prepare(`SELECT lesson_id, COUNT(*) AS n FROM attempts WHERE passed = 0 AND kind IN ('recall', 'task') GROUP BY lesson_id`)
      .all() as { lesson_id: string; n: number }[];
    const score: Record<string, { forgot: number; failed: number }> = {};
    for (const r of again) (score[r.lesson_id] ??= { forgot: 0, failed: 0 }).forgot = r.n;
    for (const r of failed) (score[r.lesson_id] ??= { forgot: 0, failed: 0 }).failed = r.n;
    const weak = Object.entries(score)
      .map(([id, s]) => ({ id, title: this.lesson(id)?.title ?? id, ...s, weight: s.forgot * 2 + s.failed }))
      .filter((w) => this.lesson(w.id))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5);

    const totalSeconds = (this.db.prepare('SELECT COALESCE(SUM(seconds), 0) AS s FROM time_log').get() as { s: number }).s;
    const totalCards = (this.db.prepare('SELECT COUNT(*) AS n FROM cards').get() as { n: number }).n;
    const totalReviews = (this.db.prepare('SELECT COUNT(*) AS n FROM card_reviews').get() as { n: number }).n;
    return { lessons, weak, totalHours: Math.round((totalSeconds / 3600) * 10) / 10, totalCards, totalReviews, dueNow: this.dueCards(true).totalDue };
  }

  // ---- Backup and restore -------------------------------------------------
  exportAll() {
    const tables: Record<string, unknown[]> = {};
    for (const t of TABLES) tables[t] = this.db.prepare(`SELECT * FROM ${t}`).all();
    return { app: 'groundwork', schema: SCHEMA_VERSION, exportedAt: iso(this.now()), tables };
  }

  importAll(data: any) {
    if (data?.app !== 'groundwork' || typeof data.tables !== 'object') throw new Error('That file is not a Groundwork backup.');
    if (data.schema > SCHEMA_VERSION) throw new Error('That backup came from a newer version of Groundwork. Update the app first.');
    const columnsOf = (t: string) => new Set((this.db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name));
    this.db.exec('BEGIN');
    try {
      for (const t of TABLES) {
        this.db.exec(`DELETE FROM ${t}`);
        const known = columnsOf(t);
        for (const row of (data.tables[t] ?? []) as Record<string, any>[]) {
          const cols = Object.keys(row).filter((c) => known.has(c));
          this.db.prepare(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => row[c]));
        }
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    this.syncCards();
  }
}
