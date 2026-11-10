import { Suspense, lazy, useEffect, useMemo, useState, type ComponentType } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.ts';
import { RichInline } from '../components/Rich.tsx';
import { useApi } from '../hooks.ts';
import { ExternalLink } from '../online.tsx';
import { TaskCard } from '../exercises/TaskCard.tsx';
import { mdxComponents } from './mdx-components.tsx';
import { QuestionForm, type Answer } from './QuestionForm.tsx';
import { VideoClipBox } from './VideoClipBox.tsx';
import { ClarityCard, ConceptContext, PrerequisitePanel, RewrittenBanner, useConceptList, type LessonConcepts } from './LessonExtras.tsx';
import { STEPS, type ClarityFeedback, type Lesson, type LessonProgress, type PrerequisiteInfo, type StepName } from '../../shared/types.ts';
import { gradeQuestion } from '../../shared/questions.ts';

const lessonFiles = import.meta.glob<{ default: ComponentType<any> }>('../../content/**/*.mdx');

const STEP_LABEL: Record<StepName, string> = { predict: 'Predict', learn: 'Learn', do: 'Do', recall: 'Recall', review: 'Review later' };

interface LessonData {
  lesson: Lesson;
  moduleTitle: string;
  progress: LessonProgress;
  note: string;
  cards: { id: string; due: string }[];
  prerequisites: PrerequisiteInfo[];
  concepts: LessonConcepts;
  clarity: ClarityFeedback | null;
}

export function LessonPage() {
  const { id } = useParams();
  const { data, error, setData } = useApi<LessonData>(`/lessons/${id}`);
  const [step, setStep] = useState<StepName>('predict');
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const concepts = useConceptList();

  useEffect(() => {
    if (data && loadedFor !== data.lesson.id) {
      setStep(data.progress.step);
      setLoadedFor(data.lesson.id);
    }
  }, [data, loadedFor]);

  if (error) return <div className="card error-box">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;

  const { lesson, progress } = data;
  const update = (p: LessonProgress) => setData({ ...data, progress: p });
  const goTo = (s: StepName) => {
    setStep(s);
    window.scrollTo(0, 0);
    api<LessonProgress>(`/lessons/${lesson.id}/step`, { body: { step: s } }).then(update).catch(() => {});
  };

  const passed = new Set(progress.tasks.filter((t) => t.passed).map((t) => t.taskId));
  const doPassed = lesson.tasks.filter((t) => t.required).every((t) => passed.has(t.id));
  const isComplete = progress.status === 'completed' || progress.status === 'tested_out';

  const stepDone: Record<StepName, boolean> = {
    predict: progress.predictAnswer !== null,
    learn: progress.predictAnswer !== null && STEPS.indexOf(progress.step) > 1,
    do: doPassed,
    recall: progress.recallPassed,
    review: isComplete,
  };

  return (
    <ConceptContext.Provider value={concepts}>
    <div className="lesson">
      <p className="crumb">
        <Link to="/course">Course</Link> / <Link to={`/course/${data.lesson.module}`}>{data.moduleTitle}</Link>
      </p>
      <h1>{lesson.title}</h1>
      <p className="lede">{lesson.summary}</p>
      <p className="meta">
        About {lesson.minutes} minutes ·{' '}
        {lesson.connectivity === 'offline' ? (
          <span className="tag tag-off">works offline</span>
        ) : (
          <span className="tag tag-net">needs internet</span>
        )}
        {progress.status === 'tested_out' && <span className="tag tag-done">tested out</span>}
        {progress.status === 'completed' && <span className="tag tag-done">complete</span>}
      </p>

      {progress.rewritten && <RewrittenBanner lessonId={lesson.id} onDone={update} />}
      <PrerequisitePanel key={lesson.id} prerequisites={data.prerequisites} />

      <ol className="stepper" aria-label="Lesson steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              className={`${s === step ? 'current' : ''} ${stepDone[s] ? 'done' : ''}`}
              aria-current={s === step ? 'step' : undefined}
              onClick={() => goTo(s)}
            >
              <span className="num">{stepDone[s] ? '✓' : i + 1}</span> {STEP_LABEL[s]}
            </button>
          </li>
        ))}
      </ol>

      <div className="lesson-grid">
        <div className="lesson-main">
          {step === 'predict' && <PredictStep lesson={lesson} progress={progress} onDone={update} next={() => goTo('learn')} />}
          {step === 'learn' && <LearnStep lesson={lesson} next={() => goTo('do')} />}
          {step === 'do' && (
            <DoStep lesson={lesson} progress={progress} onProgress={update} doPassed={doPassed} next={() => goTo('recall')} />
          )}
          {step === 'recall' && (
            <RecallStep
              key={progress.recallAttempts}
              lesson={lesson}
              progress={progress}
              doPassed={doPassed}
              onDone={(p, cards) => setData({ ...data, progress: p, cards })}
              goTo={goTo}
            />
          )}
          {step === 'review' && <ReviewStep data={data} goTo={goTo} doPassed={doPassed} />}
        </div>
        <LessonTools
          data={data}
          update={update}
          hideNotes={step === 'recall'}
          rateClarity={() => {
            goTo('review');
            setTimeout(() => document.getElementById('clarity')?.scrollIntoView({ behavior: 'smooth' }), 50);
          }}
        />
      </div>
    </div>
    </ConceptContext.Provider>
  );
}

function PredictStep({ lesson, progress, onDone, next }: { lesson: Lesson; progress: LessonProgress; onDone: (p: LessonProgress) => void; next: () => void }) {
  const q = lesson.predict;
  const [choice, setChoice] = useState<number | null>(progress.predictAnswer);
  const [revealed, setRevealed] = useState(progress.predictAnswer !== null);
  return (
    <section className="card">
      <h2>Take a guess first</h2>
      <p className="muted">You haven't been taught this yet. Guessing wrong is fine, and it actually helps you remember.</p>
      <p className="question"><RichInline text={q.prompt} /></p>
      <div className="options">
        {q.options.map((opt, i) => (
          <label key={i} className={`option ${revealed && i === q.answer ? 'right' : ''} ${revealed && i === choice && i !== q.answer ? 'wrong' : ''}`}>
            <input type="radio" name="predict" disabled={revealed} checked={choice === i} onChange={() => setChoice(i)} />
            <span><RichInline text={opt} /></span>
          </label>
        ))}
      </div>
      {!revealed ? (
        <button
          className="btn"
          disabled={choice === null}
          onClick={async () => {
            onDone(await api(`/lessons/${lesson.id}/predict`, { body: { answer: choice } }));
            setRevealed(true);
          }}
        >
          Lock in my guess
        </button>
      ) : (
        <>
          <div className={`feedback ${choice === q.answer ? 'good' : 'neutral'}`}>
            <strong>{choice === q.answer ? 'Nice guess.' : 'Not quite, and that\'s the point of guessing first.'}</strong>{' '}
            <RichInline text={q.why} />
          </div>
          <button className="btn" onClick={next}>Continue to Learn →</button>
        </>
      )}
    </section>
  );
}

function LearnStep({ lesson, next }: { lesson: Lesson; next: () => void }) {
  const Body = useMemo(() => {
    const loader = lessonFiles[`../../content/${lesson.file}`];
    return loader ? lazy(loader) : null;
  }, [lesson.file]);
  return (
    <section className="card prose">
      <Suspense fallback={<p className="muted">Loading lesson…</p>}>
        {Body ? <Body components={mdxComponents} /> : <p className="error-box">This lesson's text wasn't found. Try closing Groundwork and starting it again.</p>}
      </Suspense>

      {lesson.videos.length > 0 && (
        <div className="extras">
          <h2>Optional video</h2>
          <p className="muted">Everything you need is in the reading above. No later step depends on this.</p>
          {lesson.videos.map((v) => (
            <VideoClipBox key={v.id} clip={v} />
          ))}
        </div>
      )}

      <div className="extras">
        <h2>Check the claims</h2>
        <p className="muted">These lessons were written by AI and can contain mistakes. Here are the official sources.</p>
        <ul>
          {lesson.docs.map((d) => (
            <li key={d.url}><ExternalLink href={d.url}>{d.title}</ExternalLink></li>
          ))}
        </ul>
      </div>
      <button className="btn" onClick={next}>Continue to Do →</button>
    </section>
  );
}

function DoStep({ lesson, progress, onProgress, doPassed, next }: { lesson: Lesson; progress: LessonProgress; onProgress: (p: LessonProgress) => void; doPassed: boolean; next: () => void }) {
  return (
    <section>
      <p className="muted do-intro">Reading isn't enough to finish a lesson. Each required task below gets checked.</p>
      {lesson.tasks.map((t, i) => (
        <TaskCard
          key={t.id}
          index={i + 1}
          lessonId={lesson.id}
          task={t}
          result={progress.tasks.find((r) => r.taskId === t.id)}
          onProgress={onProgress}
        />
      ))}
      <div className="card next-card">
        {doPassed ? (
          <>
            <strong>All required tasks passed.</strong>
            <button className="btn" onClick={next}>Continue to Recall →</button>
          </>
        ) : (
          <span className="muted">Finish the required tasks to move on to Recall.</span>
        )}
      </div>
    </section>
  );
}

function RecallStep({ lesson, progress, doPassed, onDone, goTo }: { lesson: Lesson; progress: LessonProgress; doPassed: boolean; onDone: (p: LessonProgress, cards: LessonData['cards']) => void; goTo: (s: StepName) => void }) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState<{ percent: number; passed: boolean; results: { id: string; correct: boolean }[] } | null>(null);
  const [saved, setSaved] = useState<{ progress: LessonProgress; cards: LessonData['cards'] } | null>(null);

  const selfQs = lesson.recall.filter((q) => q.type === 'self');
  const allAnswered = lesson.recall.every((q) => {
    const a = answers[q.id];
    return a && a.response !== null && a.response !== '';
  });
  const allSelfScored = selfQs.every((q) => answers[q.id]?.selfCorrect !== undefined);

  const submit = async () => {
    const r = await api(`/lessons/${lesson.id}/recall`, { body: { responses: answers } });
    setResult(r);
    setSaved({ progress: r.progress, cards: r.cards });
    setRevealed(true);
  };

  return (
    <section className="card">
      <h2>From memory</h2>
      <p className="muted">No notes and no looking back. Struggling to remember is what makes it stick, so give each one a real try.</p>
      {!doPassed && <div className="feedback neutral">You can try these now, but the lesson only counts as complete once the Do tasks pass too.</div>}
      {progress.recallAttempts > 0 && !revealed && (
        <p className="muted">Attempt {progress.recallAttempts + 1}. Your best so far is {progress.recallBest}%.</p>
      )}
      {lesson.recall.map((q, i) => (
        <QuestionForm
          key={q.id}
          number={i + 1}
          question={q}
          answer={answers[q.id]}
          onChange={(a) => setAnswers({ ...answers, [q.id]: a })}
          revealed={revealed}
          correct={result?.results.find((r) => r.id === q.id)?.correct ?? (q.type === 'self' ? undefined : gradeQuestion(q, answers[q.id]?.response ?? null) ?? undefined)}
          revealForSelf={q.type === 'self' && !!answers[q.id]?.showModel}
        />
      ))}
      {!revealed && (
        <button className="btn" disabled={!allAnswered || !allSelfScored} onClick={submit}>
          Check my answers
        </button>
      )}
      {!revealed && (!allAnswered || !allSelfScored) && <p className="muted small">Answer every question to continue{selfQs.length > 0 ? ', and mark how you did on written ones' : ''}.</p>}
      {result && (
        <div className={`feedback ${result.passed ? 'good' : 'bad'}`}>
          <strong>{result.percent}%.</strong>{' '}
          {result.passed
            ? 'Passed.'
            : `You need ${lesson.recallPassPercent}%. That's not a failure: this topic will come back sooner, and that helps it stick. Reread the lesson, then try again.`}
          <div className="row">
            {result.passed ? (
              <button
                className="btn"
                onClick={() => {
                  if (saved) onDone(saved.progress, saved.cards);
                  goTo(doPassed ? 'review' : 'do');
                }}
              >
                {doPassed ? 'See your review schedule →' : 'Back to the Do tasks →'}
              </button>
            ) : (
              <>
                <button className="btn" onClick={() => { if (saved) onDone(saved.progress, saved.cards); goTo('learn'); }}>Reread the lesson</button>
                <button className="btn ghost" onClick={() => { if (saved) onDone(saved.progress, saved.cards); }}>Try again now</button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function ReviewStep({ data, goTo, doPassed }: { data: LessonData; goTo: (s: StepName) => void; doPassed: boolean }) {
  const { lesson, progress, cards } = data;
  const isComplete = progress.status === 'completed' || progress.status === 'tested_out';
  if (!isComplete) {
    return (
      <>
      <section className="card">
        <h2>Review later</h2>
        <p>Key ideas come back on a schedule once this lesson is complete. A lesson only counts as complete once Do and Recall both pass.</p>
        <ul className="checklist">
          <li className={doPassed ? 'yes' : ''}>Do tasks {doPassed ? 'passed' : 'not finished yet'}</li>
          <li className={progress.recallPassed ? 'yes' : ''}>Recall {progress.recallPassed ? 'passed' : 'not passed yet'}</li>
        </ul>
        <button className="btn" onClick={() => goTo(doPassed ? 'recall' : 'do')}>Go to {doPassed ? 'Recall' : 'Do'} →</button>
      </section>
      <ClarityCard key={lesson.id} lessonId={lesson.id} concepts={data.concepts} initial={data.clarity} />
      </>
    );
  }
  const soonest = cards[0]?.due;
  return (
    <>
    <ClarityCard key={lesson.id} lessonId={lesson.id} concepts={data.concepts} initial={data.clarity} />
    <section className="card">
      <h2>{progress.status === 'tested_out' ? 'Tested out' : 'Lesson complete'}</h2>
      <p>
        {cards.length} key ideas from this lesson joined your review schedule.
        {soonest && <> The first comes back on <strong>{new Date(soonest).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</strong>.</>}{' '}
        The better you remember something, the longer it waits. If you struggled, it returns sooner.
      </p>
      <h3>What you'll be asked</h3>
      <ul>{lesson.cards.map((c) => <li key={c.id}><RichInline text={c.front} /></li>)}</ul>
      <Link className="btn" to="/today">Back to Today →</Link>
    </section>
    </>
  );
}

function LessonTools({ data, update, hideNotes, rateClarity }: { data: LessonData; update: (p: LessonProgress) => void; hideNotes: boolean; rateClarity: () => void }) {
  const { lesson, progress } = data;
  const [note, setNote] = useState(data.note);
  const [noteState, setNoteState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [problem, setProblem] = useState('');
  const [problemOpen, setProblemOpen] = useState(false);
  const [problemSent, setProblemSent] = useState(false);

  useEffect(() => {
    if (note === data.note) return;
    setNoteState('saving');
    const timer = setTimeout(async () => {
      await api(`/lessons/${lesson.id}/note`, { method: 'PUT', body: { body: note } });
      data.note = note;
      setNoteState('saved');
    }, 700);
    return () => clearTimeout(timer);
  }, [note, lesson.id, data]);

  const flag = async (flags: { needReview?: boolean; comeBackLater?: boolean }) => {
    update(await api(`/lessons/${lesson.id}/flags`, { body: flags }));
  };

  return (
    <aside className="tools">
      <div className="card">
        <button className={`tool-toggle ${progress.needReview ? 'on' : ''}`} aria-pressed={progress.needReview} onClick={() => flag({ needReview: !progress.needReview })}>
          {progress.needReview ? '✓ ' : ''}Need to review
        </button>
        <button className={`tool-toggle ${progress.comeBackLater ? 'on' : ''}`} aria-pressed={progress.comeBackLater} onClick={() => flag({ comeBackLater: !progress.comeBackLater })}>
          {progress.comeBackLater ? '✓ ' : ''}Come back later
        </button>
      </div>
      <div className="card">
        <h3>My notes</h3>
        {hideNotes ? (
          <p className="muted small">Notes are hidden during Recall. They'll be back right after.</p>
        ) : (
          <>
            <textarea aria-label="My notes for this lesson" rows={6} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything you want to remember…" />
            <p className="muted small">{noteState === 'saving' ? 'Saving…' : noteState === 'saved' ? 'Saved on this computer.' : 'Saved on this computer.'}</p>
          </>
        )}
      </div>
      <div className="card">
        {problemSent ? (
          <>
            <p className="small">Saved, thank you. It goes out in your next feedback file (Settings → Send feedback).</p>
            <button className="link-btn small" onClick={() => { setProblem(''); setProblemSent(false); setProblemOpen(true); }}>Report something else</button>
          </>
        ) : problemOpen ? (
          <>
            <h3>Something unclear or wrong?</h3>
            <textarea
              aria-label="Describe what was unclear or wrong"
              rows={4}
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              placeholder='What was confusing, wrong, or assumed you already knew? For example: "What is npm?"'
            />
            <button
              className="btn small"
              disabled={!problem.trim()}
              onClick={async () => {
                await api(`/lessons/${lesson.id}/problem`, { body: { message: problem } });
                setProblemSent(true);
              }}
            >
              Save report
            </button>
          </>
        ) : (
          <>
            <h3>Something unclear or wrong?</h3>
            <p className="muted small">Tell us any time, even halfway through. It's saved here and sent in your weekly feedback file.</p>
            <button className="btn small ghost" onClick={() => setProblemOpen(true)}>Write a note about this lesson</button>
          </>
        )}
      </div>
      <div className="card">
        <h3>How clear was it?</h3>
        <p className="muted small">{data.clarity && !data.clarity.sentAt ? 'You rated this lesson. You can change it.' : "Rate the lesson and tick anything that wasn't clear."}</p>
        <button className="btn small ghost" onClick={rateClarity}>{data.clarity && !data.clarity.sentAt ? 'Change my answer' : 'Rate this lesson'}</button>
      </div>
    </aside>
  );
}
