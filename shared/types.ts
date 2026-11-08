export type Connectivity = 'offline' | 'needs-internet';

export type McqQuestion = { id: string; type: 'mcq'; prompt: string; options: string[]; answer: number; why: string };
export type Question =
  | McqQuestion
  | { id: string; type: 'short'; prompt: string; accept: string[]; answerText: string; why?: string }
  | { id: string; type: 'self'; prompt: string; modelAnswer: string };

interface TaskBase {
  id: string;
  title: string;
  instructions: string;
  connectivity: Connectivity;
  /** When false the task is a bonus and does not hold back completion. */
  required: boolean;
}

export interface PracticeCheck {
  path: string;
  /** Text the file must contain (case-insensitive). Omit to only require the file exists. */
  contains?: string;
  /** Text the file must NOT contain (case-insensitive), such as leftover conflict markers. */
  notContains?: string;
  hint: string;
}

export interface TerminalTask extends TaskBase {
  type: 'terminal';
  steps: { text: string; command?: string }[];
  checks: PracticeCheck[];
}
export type LabName = 'ports' | 'http' | 'cors' | 'dns' | 'real-dns' | 'live';
export interface LabTask extends TaskBase {
  type: 'lab';
  lab: LabName;
}
export interface PythonTask extends TaskBase {
  type: 'python';
  starter: string;
  tests: { name: string; code: string }[];
  solution: string;
  wrong: string;
}
/** Runs in the browser in a locked-down worker, and in Node for `check-content`. */
export interface JavascriptTask extends TaskBase {
  type: 'javascript';
  starter: string;
  tests: { name: string; code: string }[];
  solution: string;
  wrong: string;
}
export interface SqlTask extends TaskBase {
  type: 'sql';
  dataset: string;
  starter: string;
  solution: string;
  wrong: string;
  ordered?: boolean;
}
export interface FlawTask extends TaskBase {
  type: 'flaw';
  language: string;
  code: string;
  flawLines: number[];
  lineNotes: Record<string, string>;
  explanation: string;
}
export interface ArchitectureTask extends TaskBase {
  type: 'architecture';
  scenario: string;
  parts: { id: string; label: string; hint: string }[];
  zones: { id: string; label: string; hint: string }[];
  checklist: { text: string; all?: { part: string; zone: string }[]; none?: string[] }[];
  model: { placements: Record<string, string>; explanation: string };
}
export interface ExplainTask extends TaskBase {
  type: 'explain';
  prompt: string;
  rubric: string[];
  minScore: number;
  modelAnswer: string;
  gradingPrompt: string;
}
export interface CaseTask extends TaskBase {
  type: 'case';
  scenario: string;
  questions: { prompt: string; choices: { text: string; score: number; why: string }[] }[];
  passScore: number;
}
export type Task =
  | TerminalTask
  | LabTask
  | PythonTask
  | JavascriptTask
  | SqlTask
  | FlawTask
  | ArchitectureTask
  | ExplainTask
  | CaseTask;

export interface VideoClip {
  id: string;
  title: string;
  channel: string;
  start?: number;
  end?: number;
  note?: string;
}

export interface Lesson {
  id: string;
  title: string;
  module: string;
  topic: string;
  order: number;
  minutes: number;
  summary: string;
  connectivity: Connectivity;
  prerequisites: string[];
  predict: McqQuestion;
  tasks: Task[];
  recall: Question[];
  recallPassPercent: number;
  cards: { id: string; front: string; back: string }[];
  testOut: McqQuestion[];
  docs: { title: string; url: string }[];
  videos: VideoClip[];
  /** Path of the MDX file, relative to the content folder. */
  file: string;
}

export interface Topic {
  id: string;
  title: string;
  hours: number;
  summary: string;
}
export interface Stage {
  id: string;
  title: string;
  hours: number;
  color: string;
  note?: string;
  milestone?: string;
  topics: Topic[];
}
export interface Curriculum {
  stages: Stage[];
  optionalBranch: { title: string; hours: string; summary: string };
}
export interface Module {
  id: string;
  title: string;
  summary: string;
  stage: string;
  order: number;
}
export interface Content {
  curriculum: Curriculum;
  modules: Module[];
  lessons: Lesson[];
}

export type LessonStatus = 'not_started' | 'in_progress' | 'completed' | 'tested_out';
export type StepName = 'predict' | 'learn' | 'do' | 'recall' | 'review';
export const STEPS: StepName[] = ['predict', 'learn', 'do', 'recall', 'review'];

export interface TaskResult {
  taskId: string;
  passed: boolean;
  bestScore: number | null;
  attempts: number;
}

export interface LessonProgress {
  lessonId: string;
  status: LessonStatus;
  step: StepName;
  predictAnswer: number | null;
  recallPassed: boolean;
  recallAttempts: number;
  recallBest: number | null;
  needReview: boolean;
  comeBackLater: boolean;
  startedAt: string | null;
  completedAt: string | null;
  seconds: number;
  tasks: TaskResult[];
}

export interface PlanSettings {
  hoursPerWeek: number;
  startDate: string;
  /** The finish date from the first plan, kept so slipping can be shown honestly. */
  originalFinish: string | null;
  dailyReviewLimit: number;
}

export interface PlanItem {
  id: string;
  title: string;
  stageId: string;
  hours: number;
  written: boolean;
}
export interface PlanWeek {
  weekStart: string;
  hours: number;
  items: PlanItem[];
}
export interface Schedule {
  weeks: PlanWeek[];
  finishDate: string | null;
  remainingHours: number;
  expectedHours: number;
  spentHours: number;
  behindHours: number;
  thisWeek: { planned: number; spent: number; left: number };
}

export interface ReviewCard {
  id: string;
  lessonId: string;
  lessonTitle: string;
  front: string;
  back: string;
  due: string;
}
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

export interface LessonSummary {
  id: string;
  title: string;
  module: string;
  topic: string;
  minutes: number;
  summary: string;
  connectivity: Connectivity;
  prerequisites: string[];
  status: LessonStatus;
  locked: boolean;
  needReview: boolean;
  comeBackLater: boolean;
}

export interface Today {
  planSet: boolean;
  reviewsDue: number;
  reviewsDoneToday: number;
  reviewLimit: number;
  nextLesson: LessonSummary | null;
  nextIsFallback: boolean;
  comeBackLater: LessonSummary[];
  needReview: LessonSummary[];
  week: Schedule['thisWeek'] | null;
  behindHours: number;
  finishDate: string | null;
  completedCount: number;
  totalLessons: number;
}

export interface ToolStatus {
  id: string;
  name: string;
  installed: boolean;
  version: string | null;
  neededFor: string;
  downloadSize: string;
  downloadUrl: string;
}

export interface LabGoal {
  id: string;
  text: string;
  done: boolean;
}
export interface LabState {
  lab: LabName;
  goals: LabGoal[];
  log: { at: string; text: string }[];
  data: Record<string, unknown>;
}
