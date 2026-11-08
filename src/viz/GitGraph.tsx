import { useState } from 'react';
import { RichInline } from '../components/Rich.tsx';

interface Commit {
  id: string;
  x: number;
  lane: number;
  parents: string[];
}
interface Step {
  title: string;
  text: string;
  commits: Commit[];
  main: string;
  feature?: string;
  head: 'main' | 'feature';
}

const c = (id: string, x: number, lane: number, ...parents: string[]): Commit => ({ id, x, lane, parents });
const A = c('A', 1, 0);
const B = c('B', 2, 0, 'A');
const C = c('C', 3, 1, 'B');
const D = c('D', 3, 0, 'B');
const E = c('E', 4, 1, 'C');
const M = c('M', 5, 0, 'D', 'E');

const STEPS: Step[] = [
  { title: 'Two commits on main', text: 'Each commit is a saved snapshot pointing back at its parent. `main` is just a label on the latest one.', commits: [A, B], main: 'B', head: 'main' },
  { title: 'Make a branch', text: '`git switch -c feature` adds a new label on the same commit. Nothing is copied, which is why branches are so cheap.', commits: [A, B], main: 'B', feature: 'B', head: 'feature' },
  { title: 'Commit on the branch', text: 'New work moves the `feature` label forward. `main` stays where it was, so experiments can\'t hurt it.', commits: [A, B, C], main: 'B', feature: 'C', head: 'feature' },
  { title: 'Main moves too', text: 'Someone else commits to `main`. History has now split into two lines.', commits: [A, B, C, D], main: 'D', feature: 'C', head: 'main' },
  { title: 'Another feature commit', text: 'Both lines can keep growing independently.', commits: [A, B, C, D, E], main: 'D', feature: 'E', head: 'feature' },
  { title: 'Merge', text: '`git merge feature` from `main` creates a commit with two parents, joining the lines. If both changed the same lines, Git asks you to resolve a conflict first.', commits: [A, B, C, D, E, M], main: 'M', feature: 'E', head: 'main' },
];

const X = (n: number) => 40 + n * 110;
const Y = (lane: number) => 70 + lane * 80;

export function GitGraph() {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const byId = new Map(step.commits.map((x) => [x.id, x]));
  const label = (commitId: string, text: string, above: boolean, isHead: boolean) => {
    const commit = byId.get(commitId)!;
    return (
      <g className={`git-label ${isHead ? 'head' : ''}`}>
        <text x={X(commit.x)} y={Y(commit.lane) + (above ? -26 : 38)} textAnchor="middle">{isHead ? `HEAD → ${text}` : text}</text>
      </g>
    );
  };
  return (
    <figure className="viz">
      <svg viewBox="0 0 700 200" role="img" aria-label={`Git history, step ${i + 1}: ${step.title}`}>
        {step.commits.flatMap((commit) =>
          commit.parents.map((p) => {
            const parent = byId.get(p)!;
            return <line key={`${p}-${commit.id}`} className="git-edge" x1={X(parent.x)} y1={Y(parent.lane)} x2={X(commit.x)} y2={Y(commit.lane)} />;
          }),
        )}
        {step.commits.map((commit) => (
          <g key={commit.id} className="git-commit">
            <circle cx={X(commit.x)} cy={Y(commit.lane)} r="17" />
            <text x={X(commit.x)} y={Y(commit.lane) + 5} textAnchor="middle">{commit.id}</text>
          </g>
        ))}
        {label(step.main, 'main', true, step.head === 'main')}
        {step.feature && label(step.feature, 'feature', false, step.head === 'feature')}
      </svg>
      <figcaption aria-live="polite">
        <p className="viz-step-title"><span className="muted">Step {i + 1} of {STEPS.length}:</span> <strong>{step.title}</strong></p>
        <p><RichInline text={step.text} /></p>
      </figcaption>
      <div className="viz-controls">
        <button className="btn small ghost" disabled={i === 0} onClick={() => setI(i - 1)}>← Back</button>
        <button className="btn small" disabled={i === STEPS.length - 1} onClick={() => setI(i + 1)}>Next →</button>
      </div>
    </figure>
  );
}
