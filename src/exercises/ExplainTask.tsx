import { useState } from 'react';
import { CopyButton, Rich, RichInline } from '../components/Rich.tsx';
import { ExternalLink, NeedsInternet } from '../online.tsx';
import type { ExplainTask } from '../../shared/types.ts';
import type { TaskApi } from './TaskCard.tsx';

export function ExplainTaskView({ task, api }: { task: ExplainTask; api: TaskApi }) {
  const [text, setText] = useState('');
  const [scoring, setScoring] = useState(false);
  const [ticks, setTicks] = useState<boolean[]>(task.rubric.map(() => false));
  const [submitted, setSubmitted] = useState<boolean | null>(null);
  const score = ticks.filter(Boolean).length;
  const grading = task.gradingPrompt.replace('{{ANSWER}}', text);

  return (
    <>
      <div className="scenario"><Rich text={task.prompt} /></div>
      <textarea
        aria-label="Your explanation"
        rows={6}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSubmitted(null);
        }}
        placeholder="Write it the way you'd say it out loud to a client…"
      />
      {!scoring ? (
        <button className="btn" disabled={text.trim().length < 40} onClick={() => setScoring(true)}>I'm done, score it</button>
      ) : (
        <>
          <h4>Be honest: did your explanation…</h4>
          <div className="options">
            {task.rubric.map((r, i) => (
              <label key={r} className="option">
                <input
                  type="checkbox"
                  checked={ticks[i]}
                  onChange={() => {
                    setTicks(ticks.map((t, j) => (j === i ? !t : t)));
                    setSubmitted(null);
                  }}
                />
                <span><RichInline text={r} /></span>
              </label>
            ))}
          </div>
          <button
            className="btn"
            onClick={() => {
              const passed = score >= task.minScore;
              setSubmitted(passed);
              void api.report(passed, Math.round((score / task.rubric.length) * 100), { text, score });
            }}
          >
            Submit my score ({score}/{task.rubric.length})
          </button>
          {submitted !== null && (
            <div className={`feedback ${submitted ? 'good' : 'bad'}`}>
              <strong>{submitted ? 'Passed.' : `You need ${task.minScore} of ${task.rubric.length}. Improve your explanation, then rescore it.`}</strong>
              <div className="model"><strong>A model answer:</strong> <Rich text={task.modelAnswer} /></div>
            </div>
          )}
          <details className="grading">
            <summary>Want a second opinion from Claude? <span className="tag tag-net">needs internet</span></summary>
            <NeedsInternet what="get feedback from Claude">
              <p className="small">Copy this prompt, then paste it into <ExternalLink href="https://claude.ai">Claude</ExternalLink>. Your self-score above is enough to pass.</p>
              <pre className="output">{grading}</pre>
              <CopyButton text={grading} label="Copy prompt" />
            </NeedsInternet>
          </details>
        </>
      )}
    </>
  );
}
