import { useState } from 'react';
import { Rich, RichInline } from '../components/Rich.tsx';
import type { CaseTask } from '../../shared/types.ts';
import type { TaskApi } from './TaskCard.tsx';

export function CaseTaskView({ task, api }: { task: CaseTask; api: TaskApi }) {
  const [choices, setChoices] = useState<Record<number, number>>({});
  const [done, setDone] = useState(false);
  const answered = Object.keys(choices).length;
  const score = Object.entries(choices).reduce((s, [q, c]) => s + task.questions[Number(q)].choices[c].score, 0);
  const max = task.questions.reduce((s, q) => s + Math.max(...q.choices.map((c) => c.score)), 0);
  const passed = score >= task.passScore;

  return (
    <>
      <div className="scenario"><Rich text={task.scenario} /></div>
      {task.questions.map((q, i) => (
        <div className="question-block" key={i}>
          <p className="question"><span className="q-num">{i + 1}.</span> <RichInline text={q.prompt} /></p>
          <div className="options">
            {q.choices.map((c, j) => {
              const best = Math.max(...q.choices.map((x) => x.score));
              return (
                <label key={j} className={`option ${done && c.score === best ? 'right' : ''} ${done && choices[i] === j && c.score !== best ? 'wrong' : ''}`}>
                  <input type="radio" name={`case-${task.id}-${i}`} disabled={done} checked={choices[i] === j} onChange={() => setChoices({ ...choices, [i]: j })} />
                  <span>
                    <RichInline text={c.text} />
                    {done && (choices[i] === j || c.score === best) && <span className="why"> <RichInline text={c.why} /> <em>({c.score} pts)</em></span>}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
      {!done ? (
        <button
          className="btn"
          disabled={answered < task.questions.length}
          onClick={() => {
            setDone(true);
            void api.report(passed, Math.round((score / max) * 100), { choices });
          }}
        >
          Submit my recommendations
        </button>
      ) : (
        <div className={`feedback ${passed ? 'good' : 'bad'}`}>
          <strong>{score} of {max} points.</strong> {passed ? 'A client would be well served by that.' : `You need ${task.passScore}. Read the reasoning, then try again.`}
          {!passed && (
            <div>
              <button className="btn small" onClick={() => { setDone(false); setChoices({}); }}>Try again</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
