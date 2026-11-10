// Turns the feedback files a learner sends into one readable summary.
//
//   1. Save each file they send you into the feedback/ folder (it's not committed to Git).
//   2. Run: npm run feedback-report            (or: npm run feedback-report -- path/to/file.json)
//   3. Read the summary, or hand it to Claude: "fix or add lessons for this".
//
// An item that was unmarked and sent again appears in two files. Only its newest version is kept.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadContent } from '../server/content.ts';
import { CONTENT_DIR } from '../server/paths.ts';
import type { FeedbackFile } from '../shared/types.ts';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-CA');

type Item = FeedbackFile['items'][number] & { file: string; learner: string };

const args = process.argv.slice(2);
const dir = resolve('feedback');
const files = args.length ? args.map((a) => resolve(a)) : existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f)) : [];
if (files.length === 0) {
  console.log('No feedback files found. Put the .json files you were sent in the feedback/ folder, then run this again.');
  process.exit(0);
}

const content = loadContent(CONTENT_DIR);
const lessonOrder = new Map(content.lessons.map((l, i) => [l.id, i]));
const lessonTitle = (id: string) => content.lessons.find((l) => l.id === id)?.title ?? id;

const loaded: FeedbackFile[] = [];
for (const f of files) {
  try {
    const data = JSON.parse(readFileSync(f, 'utf8'));
    if (data?.app !== 'groundwork-feedback') {
      console.warn(`Skipping ${f}: not a Groundwork feedback file.`);
      continue;
    }
    loaded.push(data);
  } catch (e) {
    console.warn(`Skipping ${f}: ${e instanceof Error ? e.message : e}`);
  }
}
loaded.sort((a, b) => a.exportedAt.localeCompare(b.exportedAt));

// Newest version of each item wins, keyed per learner.
const byKey = new Map<string, Item>();
for (const file of loaded) {
  for (const item of file.items) byKey.set(`${file.learner}:${item.key}`, { ...item, file: day(file.exportedAt), learner: file.learner });
}
const items = [...byKey.values()];

const out: string[] = [];
out.push('# Groundwork feedback report', '');
out.push('## Files', '');
for (const f of loaded) {
  out.push(`- **${f.learner || 'Unnamed learner'}**, sent ${day(f.exportedAt)}: covers ${f.period.from} to ${f.period.to}, ${f.items.length} item${f.items.length === 1 ? '' : 's'}`);
}
const latest = loaded[loaded.length - 1];
if (latest) {
  out.push('', `Latest progress: ${latest.context.lessonsCompleted.length} lessons finished. In progress: ${latest.context.lessonsInProgress.map(lessonTitle).join(', ') || 'none'}.`);
}

// Lessons by average clarity, lowest first.
const clarity = items.filter((i): i is Item & { kind: 'clarity' } => i.kind === 'clarity');
const perLesson = new Map<string, number[]>();
for (const c of clarity) if (c.clarity) (perLesson.get(c.lessonId) ?? perLesson.set(c.lessonId, []).get(c.lessonId)!).push(c.clarity);
if (perLesson.size) {
  out.push('', '## Least clear lessons', '', '| Lesson | Clarity (1–5) | Answers |', '| --- | --- | --- |');
  for (const [id, scores] of [...perLesson].sort((a, b) => avg(a[1]) - avg(b[1]))) {
    out.push(`| ${lessonTitle(id)} | ${avg(scores).toFixed(1)} | ${scores.length} |`);
  }
}

// Concepts ticked as unclear, most often first.
const conceptCount = new Map<string, Set<string>>();
for (const c of clarity) for (const name of c.unclearConcepts) (conceptCount.get(name) ?? conceptCount.set(name, new Set()).get(name)!).add(lessonTitle(c.lessonId));
if (conceptCount.size) {
  out.push('', '## Ideas ticked as unclear', '');
  for (const [name, lessons] of [...conceptCount].sort((a, b) => b[1].size - a[1].size)) out.push(`- **${name}** (${lessons.size}×): ${[...lessons].join(', ')}`);
}

// Everything written, grouped by lesson in course order.
const grouped = new Map<string, Item[]>();
for (const i of items) (grouped.get(i.lessonId) ?? grouped.set(i.lessonId, []).get(i.lessonId)!).push(i);
out.push('', '## What they wrote, by lesson', '');
for (const [id, list] of [...grouped].sort((a, b) => (lessonOrder.get(a[0]) ?? 999) - (lessonOrder.get(b[0]) ?? 999))) {
  out.push(`### ${lessonTitle(id)} (\`${id}\`)`, '');
  for (const i of list.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const when = day(i.createdAt);
    if (i.kind === 'problem') out.push(`- ${when}, note: ${i.message}`);
    else {
      const parts = [i.clarity ? `clarity ${i.clarity}/5` : null, i.unclearConcepts.length ? `unclear: ${i.unclearConcepts.join(', ')}` : null].filter(Boolean);
      out.push(`- ${when}, rating${parts.length ? ` (${parts.join('; ')})` : ''}`);
      if (i.assumed) out.push(`  - **Assumed they knew:** ${i.assumed}`);
      if (i.other) out.push(`  - Other: ${i.other}`);
    }
  }
  const failures = latest?.context.stepFailures[id];
  if (failures) out.push(`- Failed attempts so far: ${Object.entries(failures).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  out.push('');
}

console.log(out.join('\n'));

function avg(xs: number[]) {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}
