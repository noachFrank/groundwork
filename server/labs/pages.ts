import type { Ports } from '../../shared/ports.ts';

const baseStyle = `
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0; padding: 16px; color: #172a33; background: #fff; }
  button { font: inherit; padding: 8px 14px; border-radius: 6px; border: 1px solid #0b5e73; background: #0b5e73; color: #fff; cursor: pointer; margin-right: 8px; }
  button.secondary { background: #fff; color: #0b5e73; }
  pre { background: #eef3f4; padding: 10px; border-radius: 6px; white-space: pre-wrap; word-break: break-word; }
  .tag { display: inline-block; font-size: 13px; background: #eef3f4; padding: 2px 8px; border-radius: 4px; }
  .bad { color: #b3261e; font-weight: 600; } .good { color: #1b7a43; font-weight: 600; }
`;

export const siteHomePage = (ports: Ports) => `<!doctype html><meta charset="utf-8"><title>Lab website</title><style>${baseStyle}</style>
<h1>Lab website</h1><p>This small site runs on your own computer, on port ${ports.site}. The lessons use it.</p>`;

/** A deliberately separate origin from the API, so the browser's real CORS rules apply. */
export const corsLabPage = (ports: Ports) => `<!doctype html><meta charset="utf-8"><title>CORS lab: the website</title><style>${baseStyle}</style>
<p><span class="tag">This page's origin: <b>http://localhost:${ports.site}</b></span></p>
<p>This page wants data from an API on a different origin: <b>http://localhost:${ports.corsApi}</b>.</p>
<button id="get">Fetch the data</button><button id="post" class="secondary">Send JSON (triggers a preflight)</button>
<p id="status"></p><pre id="out">Nothing fetched yet.</pre>
<script>
  const out = document.getElementById('out');
  const status = document.getElementById('status');
  const report = (ok, detail) => fetch('/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok, detail }) });
  async function run(options) {
    status.textContent = 'Working…'; status.className = '';
    try {
      const res = await fetch('http://localhost:${ports.corsApi}/data', options);
      const data = await res.json();
      status.textContent = 'Allowed: the browser let this page read the response.';
      status.className = 'good';
      out.textContent = JSON.stringify(data, null, 2);
      report(true);
    } catch (e) {
      status.textContent = 'Blocked by the browser.';
      status.className = 'bad';
      out.textContent = String(e) + '\\n\\nThis page can\\'t see why. Open the browser Console (press F12, then click Console) to read the full message from the browser.';
      report(false, String(e));
    }
  }
  document.getElementById('get').onclick = () => run({});
  document.getElementById('post').onclick = () => run({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"hello":"api"}' });
</script>`;
