import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import type { ClarityFeedback, LessonProgress, LessonStatus, PrerequisiteInfo } from '../../shared/types.ts';

export interface ConceptInfo {
  id: string;
  name: string;
  definition: string;
  taughtIn: { id: string; title: string } | null;
}
export interface LessonConcepts {
  teaches: ConceptInfo[];
  uses: ConceptInfo[];
}

/** Who feedback goes to, from groundwork.config.json. */
export function useDeveloperName(): string | null {
  const { data } = useApi<{ developerName: string | null }>('/about');
  return data?.developerName ?? null;
}

const STATUS_LABEL: Record<LessonStatus, string> = {
  completed: '✓ Done',
  tested_out: '✓ Tested out',
  in_progress: 'In progress',
  not_started: 'Not started',
};
const isDone = (s: LessonStatus) => s === 'completed' || s === 'tested_out';

/**
 * "Before this lesson": every prerequisite, how much it matters, and whether it's done.
 * Nothing is locked. This only tells the learner what the lesson builds on.
 */
export function PrerequisitePanel({ prerequisites }: { prerequisites: PrerequisiteInfo[] }) {
  const essentialDone = prerequisites.filter((p) => p.need === 'essential').every((p) => isDone(p.status));
  const allDone = prerequisites.every((p) => isDone(p.status));
  const [open, setOpen] = useState(!essentialDone);
  if (prerequisites.length === 0) return null;
  const missing = prerequisites.filter((p) => p.need === 'essential' && !isDone(p.status));

  // Essential ones first, then helpful.
  const sorted = [...prerequisites].sort((a, b) => (a.need === b.need ? 0 : a.need === 'essential' ? -1 : 1));

  return (
    <section className={`card prereqs ${essentialDone ? '' : 'prereqs-missing'}`} aria-label="Before this lesson">
      <button className="prereqs-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <strong>Before this lesson</strong>{' '}
        <span className="muted small">
          {allDone
            ? "You've done everything this lesson builds on ✓"
            : essentialDone
              ? 'You have what you need. Some helpful extras are still open.'
              : `${missing.length} needed lesson${missing.length === 1 ? '' : 's'} not done yet`}
        </span>
        <span className="prereqs-caret" aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <>
          {!essentialDone && (
            <p className="small">
              This lesson uses ideas from the lessons marked <strong>Needed</strong>. You can still read it, but it will make much more sense after those.
            </p>
          )}
          <ul className="prereq-list">
            {sorted.map((p) => (
              <li key={p.id} className={isDone(p.status) ? 'done' : ''}>
                <span className={`need need-${p.need}`}>{p.need === 'essential' ? 'Needed' : 'Helpful'}</span>
                <span className="prereq-main">
                  <Link to={`/lessons/${p.id}`}>{p.title}</Link>
                  {p.why && <span className="muted small prereq-why">{p.why}</span>}
                </span>
                <span className={`prereq-status status-${p.status}`}>{STATUS_LABEL[p.status]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Shown on a finished lesson that has been rewritten since. */
export function RewrittenBanner({ lessonId, onDone }: { lessonId: string; onDone: (p: LessonProgress) => void }) {
  return (
    <div className="feedback neutral rewritten">
      <strong>This lesson was rewritten since you finished it.</strong> It explains more now and may cover things the old version skipped. It's worth a re-read.
      <div className="row">
        <button className="btn small ghost" onClick={async () => onDone(await api(`/lessons/${lessonId}/reread`, { body: {} }))}>
          I've re-read it
        </button>
      </div>
    </div>
  );
}

/**
 * "How clear was this?" The answers go to the developer in the weekly feedback file.
 * It saves into one unsent answer per lesson. Once sent it's read-only until the learner
 * marks it as not sent in Settings.
 */
export function ClarityCard({ lessonId, concepts, initial }: { lessonId: string; concepts: LessonConcepts; initial: ClarityFeedback | null }) {
  const developer = useDeveloperName();
  const startFresh = !initial || !!initial.sentAt;
  const [clarity, setClarity] = useState<number | null>(startFresh ? null : initial!.clarity);
  const [unclear, setUnclear] = useState<string[]>(startFresh ? [] : initial!.unclearConcepts);
  const [assumed, setAssumed] = useState(startFresh ? '' : initial!.assumed);
  const [other, setOther] = useState(startFresh ? '' : initial!.other);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>(initial && !initial.sentAt ? 'saved' : 'idle');
  const [lastSent] = useState(initial?.sentAt ?? null);

  const all = [...concepts.teaches, ...concepts.uses];
  const empty = clarity === null && unclear.length === 0 && !assumed.trim() && !other.trim();

  const save = async () => {
    setState('saving');
    await api(`/lessons/${lessonId}/clarity`, { method: 'PUT', body: { clarity, unclearConcepts: unclear, assumed, other } });
    setState('saved');
  };
  const touch = () => setState('idle');
  const checkbox = (c: ConceptInfo) => (
    <label key={c.id} className="concept-check">
      <input
        type="checkbox"
        checked={unclear.includes(c.id)}
        onChange={(e) => { setUnclear(e.target.checked ? [...unclear, c.id] : unclear.filter((x) => x !== c.id)); touch(); }}
      />
      <span>{c.name}</span>
    </label>
  );

  return (
    <section className="card clarity" id="clarity">
      <h2>How clear was this lesson?</h2>
      <p className="muted small">
        Optional, and it really helps. This goes to {developer ?? 'whoever gave you Groundwork'} in your feedback file, so lessons that assumed too much
        get fixed or get new lessons added before them.
        {lastSent && <> You sent an answer for this lesson on {new Date(lastSent).toLocaleDateString()}. Anything you write here is a new answer.</>}
      </p>

      <fieldset className="clarity-scale">
        <legend>Overall</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={`scale-btn ${clarity === n ? 'on' : ''}`}>
            <input type="radio" name={`clarity-${lessonId}`} checked={clarity === n} onChange={() => { setClarity(n); touch(); }} />
            <span className="scale-num">{n}</span>
            <span className="scale-label small">{['Lost', 'Mostly confusing', 'OK', 'Mostly clear', 'Totally clear'][n - 1]}</span>
          </label>
        ))}
      </fieldset>

      {all.length > 0 && (
        <fieldset>
          <legend>Which of these weren't fully clear?</legend>
          <div className="concept-checks">{concepts.teaches.map(checkbox)}</div>
          {concepts.uses.length > 0 && (
            <details className="earlier-concepts" open={concepts.uses.some((c) => unclear.includes(c.id))}>
              <summary className="small">Ideas from earlier lessons this one relied on ({concepts.uses.length})</summary>
              <div className="concept-checks">{concepts.uses.map(checkbox)}</div>
            </details>
          )}
        </fieldset>
      )}

      <label className="block-label">
        Did the lesson assume you already knew something it never explained?
        <textarea rows={3} value={assumed} onChange={(e) => { setAssumed(e.target.value); touch(); }} placeholder='For example: "It said package.json but never said what that file is."' />
      </label>
      <label className="block-label">
        Anything else?
        <textarea rows={2} value={other} onChange={(e) => { setOther(e.target.value); touch(); }} />
      </label>
      <div className="row">
        <button className="btn" disabled={empty || state !== 'idle'} onClick={save}>
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved ✓' : 'Save'}
        </button>
        {state === 'saved' && <span className="muted small">Saved on this computer. It goes out in your next feedback file (Settings).</span>}
      </div>
    </section>
  );
}

/** Lets <Term id="…"> in lesson text find definitions without each lesson loading them. */
export const ConceptContext = createContext<Map<string, ConceptInfo> | null>(null);

export function useConceptList(): Map<string, ConceptInfo> | null {
  const [map, setMap] = useState<Map<string, ConceptInfo> | null>(null);
  useEffect(() => {
    api<ConceptInfo[]>('/concepts')
      .then((list) => setMap(new Map(list.map((c) => [c.id, c]))))
      .catch(() => setMap(new Map()));
  }, []);
  return map;
}

/** A word in lesson text with its definition one click away, and a link to where it's taught. */
export function Term({ id, children }: { id: string; children?: ReactNode }) {
  const concepts = useContext(ConceptContext);
  const [open, setOpen] = useState(false);
  const c = concepts?.get(id);
  if (!c) return <>{children ?? id}</>;
  return (
    <span className="term">
      <button className="term-word" aria-expanded={open} onClick={() => setOpen(!open)}>{children ?? c.name}</button>
      {open && (
        <span className="term-pop" role="note">
          <strong>{c.name}</strong>: {c.definition}
          {c.taughtIn && (
            <>
              {' '}
              <Link to={`/lessons/${c.taughtIn.id}`} onClick={() => setOpen(false)}>Taught in: {c.taughtIn.title}</Link>
            </>
          )}
        </span>
      )}
    </span>
  );
}
