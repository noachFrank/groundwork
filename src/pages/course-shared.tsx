import { Link } from 'react-router-dom';
import type { Curriculum, LessonStatus, LessonSummary, Module } from '../../shared/types.ts';

export interface CourseData {
  curriculum: Curriculum;
  modules: Module[];
  lessons: LessonSummary[];
}

export const isDone = (s: LessonStatus) => s === 'completed' || s === 'tested_out';

export const STATUS_LABEL: Record<LessonStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Done',
  tested_out: 'Tested out',
};

export interface Stats {
  total: number;
  done: number;
  inProgress: number;
  percent: number;
  minutesLeft: number;
}

export function statsFor(lessons: LessonSummary[]): Stats {
  const done = lessons.filter((l) => isDone(l.status)).length;
  return {
    total: lessons.length,
    done,
    inProgress: lessons.filter((l) => l.status === 'in_progress').length,
    percent: lessons.length ? Math.round((done / lessons.length) * 100) : 0,
    minutesLeft: lessons.filter((l) => !isDone(l.status)).reduce((s, l) => s + l.minutes, 0),
  };
}

export const hoursText = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${h} hour${h === 1 ? '' : 's'}`;
};

export function ProgressBar({ percent, label, color }: { percent: number; label: string; color?: string }) {
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-fill" style={{ width: `${percent}%`, background: color }} />
    </div>
  );
}

export function StatusMark({ status }: { status: LessonStatus }) {
  const done = isDone(status);
  return (
    <span className={`status-mark ${done ? 'is-done' : status === 'in_progress' ? 'is-doing' : ''}`} aria-hidden="true">
      {done ? '✓' : status === 'in_progress' ? '◐' : '○'}
    </span>
  );
}

/** One lesson in a list: its status, title, time and any tags. */
export function LessonRow({ lesson, number }: { lesson: LessonSummary; number?: number }) {
  const done = isDone(lesson.status);
  return (
    <li className={`lesson-row ${done ? 'done' : ''}`}>
      <StatusMark status={lesson.status} />
      <div className="lesson-row-main">
        <Link to={`/lessons/${lesson.id}`}>
          {number !== undefined && <span className="lesson-num">{number}.</span>} {lesson.title}
        </Link>
        <div className="muted small">
          {lesson.minutes} min · <span className={`status-text status-${lesson.status}`}>{STATUS_LABEL[lesson.status]}</span>
          {lesson.locked && !done && <span className="tag">needed lessons not done yet</span>}
          {lesson.rewritten && <span className="tag tag-rewritten">rewritten: worth a re-read</span>}
          {lesson.connectivity === 'needs-internet' && <span className="tag tag-net">needs internet</span>}
          {lesson.needReview && <span className="tag">flagged to review</span>}
        </div>
      </div>
    </li>
  );
}

/** The lesson to do next in a list: the first unfinished one, preferring one already started. */
export function nextIn(lessons: LessonSummary[]): LessonSummary | null {
  return lessons.find((l) => l.status === 'in_progress') ?? lessons.find((l) => !isDone(l.status) && !l.locked) ?? lessons.find((l) => !isDone(l.status)) ?? null;
}
