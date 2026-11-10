import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { CopyButton } from '../components/Rich.tsx';
import { useApi } from '../hooks.ts';
import { useDeveloperName } from '../lesson/LessonExtras.tsx';
import type { FeedbackFile, FeedbackItem, FeedbackStatus } from '../../shared/types.ts';

interface FeedbackData {
  items: FeedbackItem[];
  status: FeedbackStatus;
  learner: string;
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const CLARITY = ['', 'Lost', 'Mostly confusing', 'OK', 'Mostly clear', 'Totally clear'];

/** Plain-text version of a feedback file, for pasting straight into a message. */
export function feedbackAsText(file: FeedbackFile): string {
  const lines = [
    `Groundwork feedback${file.learner ? ` from ${file.learner}` : ''}`,
    `Covers ${file.period.from} to ${file.period.to}` + (file.previousSend ? ` (last sent ${new Date(file.previousSend).toLocaleDateString('en-CA')})` : ''),
    '',
  ];
  for (const i of file.items) {
    lines.push(`[${i.lessonTitle}] ${new Date(i.createdAt).toLocaleDateString('en-CA')}`);
    if (i.kind === 'problem') lines.push(`  Note: ${i.message}`);
    else {
      if (i.clarity) lines.push(`  Clarity: ${i.clarity}/5 (${CLARITY[i.clarity]})`);
      if (i.unclearConcepts.length) lines.push(`  Not clear: ${i.unclearConcepts.join(', ')}`);
      if (i.assumed) lines.push(`  Assumed I knew: ${i.assumed}`);
      if (i.other) lines.push(`  Other: ${i.other}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function download(file: FeedbackFile) {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // The learner's own date, not UTC, so an evening send isn't named after tomorrow.
  a.download = `groundwork-feedback-${new Date().toLocaleDateString('en-CA')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function FeedbackSection() {
  const developer = useDeveloperName();
  const who = developer ?? 'whoever gave you Groundwork';
  const { data, reload } = useApi<FeedbackData>('/feedback');
  const [learner, setLearner] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [lastText, setLastText] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [showSent, setShowSent] = useState(false);

  useEffect(() => {
    if (data) setLearner(data.learner);
  }, [data?.learner]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return null;
  const unsent = data.items.filter((i) => !i.sentAt);
  const sent = data.items.filter((i) => i.sentAt);
  const range = unsent.length
    ? { from: day(unsent.reduce((m, i) => (i.createdAt < m ? i.createdAt : m), unsent[0].createdAt)), to: day(unsent.reduce((m, i) => (i.updatedAt > m ? i.updatedAt : m), unsent[0].updatedAt)) }
    : null;

  const exportNow = async (asText: boolean) => {
    setMessage(null);
    try {
      if (learner.trim() !== data.learner) await api('/feedback/learner', { method: 'PUT', body: { name: learner } });
      const file = await api<FeedbackFile>('/feedback/export', { body: {} });
      if (asText) setLastText(feedbackAsText(file));
      else download(file);
      setMessage({
        ok: true,
        text: asText
          ? `Done. Copy the text below and send it to ${who}. Those ${file.items.length} items are now marked "Sent".`
          : `Saved the file to your Downloads folder. Send it to ${who} (on WhatsApp, attach it as a document). Those ${file.items.length} items are now marked "Sent".`,
      });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not make the file.' });
    }
    void reload();
  };

  const act = async (fn: () => Promise<unknown>) => {
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'That did not work.' });
    }
    void reload();
  };

  const key = (i: FeedbackItem) => `${i.kind}-${i.id}`;

  const renderItem = (i: FeedbackItem) => (
    <li key={key(i)}>
      <div className="fb-head">
        <Link to={`/lessons/${i.lessonId}`}><strong>{i.lessonTitle}</strong></Link>
        <span className="muted small">{i.kind === 'problem' ? 'Note' : 'How clear was it'} · {day(i.createdAt)}</span>
        {i.sentAt ? <span className="tag tag-sent">Sent to {developer ?? 'developer'} · {day(i.sentAt)}</span> : <span className="tag tag-unsent">Not sent yet</span>}
      </div>
      {editing === key(i) && i.kind === 'problem' ? (
        <>
          <textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Edit your note" />
          <div className="row">
            <button className="btn small" disabled={!draft.trim()} onClick={() => act(async () => { await api(`/feedback/problem/${i.id}`, { method: 'PUT', body: { message: draft } }); setEditing(null); })}>Save</button>
            <button className="btn small ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </>
      ) : i.kind === 'problem' ? (
        <div className="fb-body">{i.message}</div>
      ) : (
        <div className="fb-body small">
          {i.clarity && <div>Clarity: <strong>{i.clarity}/5</strong> ({CLARITY[i.clarity]})</div>}
          {i.unclearConcepts.length > 0 && <div>Not clear: {i.unclearConcepts.join(', ')}</div>}
          {i.assumed && <div>Assumed I knew: {i.assumed}</div>}
          {i.other && <div>Other: {i.other}</div>}
        </div>
      )}
      <div className="row">
        {i.sentAt ? (
          <button className="link-btn small" onClick={() => act(() => api(`/feedback/${i.kind}/${i.id}/unsend`, { body: {} }))}>
            Mark as not sent (to change it or send it again)
          </button>
        ) : (
          <>
            {i.kind === 'problem' && editing !== key(i) && (
              <button className="link-btn small" onClick={() => { setEditing(key(i)); setDraft(i.message); }}>Edit</button>
            )}
            {i.kind === 'clarity' && <Link className="small" to={`/lessons/${i.lessonId}`}>Change it on the lesson</Link>}
            <button
              className="link-btn small"
              onClick={() => { if (window.confirm('Delete this? It has not been sent yet.')) void act(() => api(`/feedback/${i.kind}/${i.id}`, { method: 'DELETE' })); }}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </li>
  );

  return (
    <section className="card" id="feedback">
      <h2>Send feedback to {who}</h2>
      <p>
        Every note you write on a lesson, and every "How clear was it?" answer, is saved here. About once a week, download them as one file and
        send it to {who}. That's how confusing lessons get fixed, and how new lessons get written for things that were skipped.
      </p>
      <p className="muted small">
        Each file only holds what's new since your last send, so nothing is sent twice. Sent something too early, or want to add to it? Click
        "Mark as not sent" on it, change it, and it goes out in the next file.
      </p>

      <label className="block-label">
        Your name (so {who} knows who it's from)
        <input className="text-input" value={learner} onChange={(e) => setLearner(e.target.value)} placeholder="Your first name" />
      </label>

      {unsent.length > 0 ? (
        <p><strong>{unsent.length} new item{unsent.length === 1 ? '' : 's'}</strong> to send, from {range!.from} to {range!.to}.</p>
      ) : (
        <p className="muted">
          Nothing new to send{data.status.lastSent ? ` since your last send on ${day(data.status.lastSent)}` : ''}. Write notes with "Something unclear or wrong?" on any lesson.
        </p>
      )}
      <div className="row">
        <button className="btn" disabled={unsent.length === 0} onClick={() => exportNow(false)}>Download feedback file</button>
        <button className="btn ghost" disabled={unsent.length === 0} onClick={() => exportNow(true)}>Send as text instead</button>
      </div>
      {message && <div className={`feedback ${message.ok ? 'good' : 'bad'}`}>{message.text}</div>}
      {lastText && (
        <div className="feedback neutral">
          <CopyButton text={lastText} label="Copy the text" />
          <pre className="small" style={{ whiteSpace: 'pre-wrap' }}>{lastText}</pre>
        </div>
      )}

      {unsent.length > 0 && (
        <>
          <h3>Not sent yet</h3>
          <ul className="feedback-list">{unsent.map(renderItem)}</ul>
        </>
      )}
      {sent.length > 0 && (
        <>
          <button className="link-btn" onClick={() => setShowSent(!showSent)}>
            {showSent ? 'Hide' : 'Show'} {sent.length} already sent
          </button>
          {showSent && <ul className="feedback-list">{sent.map(renderItem)}</ul>}
        </>
      )}
    </section>
  );
}
