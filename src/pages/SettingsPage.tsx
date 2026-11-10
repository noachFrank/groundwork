import { useRef, useState } from 'react';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import { ExternalLink, NeedsInternet } from '../online.tsx';
import type { ToolStatus } from '../../shared/types.ts';
import { FeedbackSection } from './FeedbackSection.tsx';

export function SettingsPage() {
  const { data: about } = useApi<{ version: string; practicePath: string; dataPath: string; labsUnavailable: string[] }>('/about');
  const { data: tools } = useApi<ToolStatus[]>('/tools');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const restore = async (file: File) => {
    if (!window.confirm('This replaces all your current progress with the backup file. Continue?')) return;
    try {
      const body = JSON.parse(await file.text());
      await api('/import', { body });
      setMessage({ ok: true, text: 'Your backup has been restored.' });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error && !(e instanceof SyntaxError) ? e.message : 'That file could not be read as a Groundwork backup.' });
    }
  };

  return (
    <div>
      <h1>Settings</h1>

      <FeedbackSection />

      <section className="card">
        <h2>Backup</h2>
        <p>Your progress lives only on this computer. A copy is also saved automatically each day (the last ten are kept). For real safety, download a backup now and then and keep it somewhere else, like a USB stick or your email.</p>
        <div className="row">
          <a className="btn" href="/api/export" download>Download a backup</a>
          <button className="btn ghost" onClick={() => fileInput.current?.click()}>Restore from a backup…</button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            aria-label="Backup file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void restore(f);
              e.target.value = '';
            }}
          />
        </div>
        {message && <div className={`feedback ${message.ok ? 'good' : 'bad'}`}>{message.text}</div>}
      </section>

      <section className="card">
        <h2>Tools for later lessons</h2>
        <p>You don't need these until a lesson asks for one. The lesson walks you through installing it. Connect to the internet first, and install it from here.</p>
        {!tools ? (
          <p className="muted">Checking…</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Tool</th><th>Status</th><th>Needed for</th><th>Download</th></tr></thead>
              <tbody>
                {tools.map((t) => (
                  <tr key={t.id}>
                    <td><strong>{t.name}</strong></td>
                    <td>{t.installed ? <span className="tag tag-done">✓ {t.version}</span> : <span className="tag">not installed</span>}</td>
                    <td className="small">{t.neededFor}</td>
                    <td className="small">{t.installed ? '–' : <><ExternalLink href={t.downloadUrl}>Get it</ExternalLink><br /><span className="muted">{t.downloadSize}</span></>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Getting new lessons</h2>
        <NeedsInternet what="download new lessons">
          <p>New lessons are downloaded by double-clicking <code>update.bat</code> in your Groundwork folder, after closing this app. Your progress is stored separately, so updates never erase it.</p>
        </NeedsInternet>
      </section>

      {about && (
        <section className="card">
          <h2>About this app</h2>
          <dl className="about">
            <dt>Version</dt><dd>{about.version}</dd>
            <dt>Practice folder</dt><dd><code>{about.practicePath}</code></dd>
            <dt>Progress is saved in</dt><dd><code>{about.dataPath}</code></dd>
          </dl>
          {about.labsUnavailable.length > 0 && (
            <div className="feedback bad">Some labs couldn't start ({about.labsUnavailable.join(', ')}) because another program is using their ports. Restarting your computer usually fixes this.</div>
          )}
        </section>
      )}
    </div>
  );
}
