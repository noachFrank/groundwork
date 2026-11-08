import type { Question } from './types.ts';

/** True/false for machine-checkable questions, null when the learner scores themself. */
export function gradeQuestion(q: Question, response: string | number | null): boolean | null {
  if (q.type === 'mcq') return response === q.answer;
  if (q.type === 'short') {
    const text = String(response ?? '').trim();
    return q.accept.some((pattern) => new RegExp(pattern, 'i').test(text));
  }
  return null;
}
