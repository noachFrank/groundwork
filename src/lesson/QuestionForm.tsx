import { RichInline } from '../components/Rich.tsx';
import type { Question } from '../../shared/types.ts';

export interface Answer {
  response: string | number | null;
  selfCorrect?: boolean;
  showModel?: boolean;
}

interface Props {
  number: number;
  question: Question;
  answer: Answer | undefined;
  onChange: (a: Answer) => void;
  revealed: boolean;
  correct?: boolean;
  revealForSelf?: boolean;
}

export function QuestionForm({ number, question: q, answer, onChange, revealed, correct, revealForSelf }: Props) {
  const name = `q-${q.id}`;
  return (
    <div className="question-block">
      <p className="question">
        <span className="q-num">{number}.</span> <RichInline text={q.prompt} />
      </p>
      {q.type === 'mcq' && (
        <div className="options">
          {q.options.map((opt, i) => (
            <label key={i} className={`option ${revealed && i === q.answer ? 'right' : ''} ${revealed && i === answer?.response && i !== q.answer ? 'wrong' : ''}`}>
              <input type="radio" name={name} disabled={revealed} checked={answer?.response === i} onChange={() => onChange({ response: i })} />
              <span><RichInline text={opt} /></span>
            </label>
          ))}
        </div>
      )}
      {q.type === 'short' && (
        <input
          className="text-input"
          aria-label={`Answer to question ${number}`}
          disabled={revealed}
          value={String(answer?.response ?? '')}
          onChange={(e) => onChange({ response: e.target.value })}
          autoComplete="off"
          spellCheck={false}
        />
      )}
      {q.type === 'self' && (
        <>
          <textarea
            aria-label={`Answer to question ${number}`}
            rows={3}
            disabled={revealed}
            value={String(answer?.response ?? '')}
            onChange={(e) => onChange({ ...answer, response: e.target.value })}
          />
          {!revealed && !revealForSelf && (
            <button className="btn small ghost" disabled={!answer?.response} onClick={() => onChange({ ...answer!, showModel: true })}>
              Compare with a model answer
            </button>
          )}
          {(revealForSelf || revealed) && (
            <div className="model">
              <strong>Model answer:</strong> <RichInline text={q.modelAnswer} />
              {!revealed && (
                <div className="row">
                  <span>Did yours cover the same idea?</span>
                  <button className={`btn small ${answer?.selfCorrect === true ? '' : 'ghost'}`} onClick={() => onChange({ ...answer!, selfCorrect: true })}>Yes</button>
                  <button className={`btn small ${answer?.selfCorrect === false ? '' : 'ghost'}`} onClick={() => onChange({ ...answer!, selfCorrect: false })}>Not really</button>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {revealed && q.type !== 'self' && (
        <div className={`feedback ${correct ? 'good' : 'bad'}`}>
          <strong>{correct ? 'Correct.' : 'Not quite.'}</strong>{' '}
          {q.type === 'mcq' && <RichInline text={q.why} />}
          {q.type === 'short' && (
            <>
              Answer: <RichInline text={q.answerText} /> {q.why && <RichInline text={q.why} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}
