import { useCallback, useEffect, useRef, useState } from 'react';
import { api as call } from '../api.ts';
import { CommandLine } from '../components/Rich.tsx';
import { PORTS } from '../../shared/ports.ts';
import type { LabName, LabState, LabTask } from '../../shared/types.ts';
import type { TaskApi } from './TaskCard.tsx';

function useLab(lab: LabName) {
  const [state, setState] = useState<LabState | null>(null);
  const refresh = useCallback(async () => {
    try {
      setState(await call<LabState>(`/labs/${lab}`));
    } catch {
      // The next tick will try again.
    }
  }, [lab]);
  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 1200);
    return () => clearInterval(t);
  }, [refresh]);
  const action = useCallback(
    async (body: unknown) => {
      setState(await call<LabState>(`/labs/${lab}/action`, { body }));
    },
    [lab],
  );
  return { state, action };
}

function Goals({ state, api }: { state: LabState; api: TaskApi }) {
  const allDone = state.goals.every((g) => g.done);
  const reported = useRef(api.alreadyPassed);
  useEffect(() => {
    if (allDone && !reported.current) {
      reported.current = true;
      void api.serverCheck();
    }
  }, [allDone, api]);
  return (
    <div className="goals">
      <h4>The lab server is watching for:</h4>
      <ul className="checklist">
        {state.goals.map((g) => (
          <li key={g.id} className={g.done ? 'yes' : ''}>{g.text}</li>
        ))}
      </ul>
      {(allDone || api.alreadyPassed) && <div className="feedback good"><strong>Passed.</strong> The lab server saw it all happen for real.</div>}
    </div>
  );
}

function LogView({ state, title = 'What the server saw' }: { state: LabState; title?: string }) {
  return (
    <div className="lab-log">
      <h4>{title}</h4>
      {state.log.length === 0 ? (
        <p className="muted small">Nothing yet.</p>
      ) : (
        <ul>
          {state.log.slice(0, 10).map((l, i) => (
            <li key={`${l.at}-${i}`}><span className="muted">{l.at}</span> {l.text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PortsLab({ task, api }: { task: LabTask; api: TaskApi }) {
  const { state } = useLab(task.lab);
  if (!state) return <p className="muted">Connecting to the lab…</p>;
  return (
    <>
      <p>Open PowerShell (press the Windows key, type <code>powershell</code>, press Enter) and run these one at a time. Same computer, different port:</p>
      <CommandLine command={`curl.exe http://localhost:${PORTS.site}/whoami`} />
      <CommandLine command={`curl.exe http://localhost:${PORTS.http}/whoami`} />
      <p className="muted small">Then try a port where nothing is listening, <code>curl.exe http://localhost:4399/whoami</code>. You'll get a "connection refused" kind of error. That's what a closed port looks like.</p>
      <Goals state={state} api={api} />
      <LogView state={state} />
    </>
  );
}

const SAMPLE_REQUESTS = [
  { label: 'List orders', method: 'GET', path: '/orders', key: false, body: '' },
  { label: 'Order 102', method: 'GET', path: '/orders/102', key: false, body: '' },
  { label: 'Order 999', method: 'GET', path: '/orders/999', key: false, body: '' },
  { label: 'New order, no key', method: 'POST', path: '/orders', key: false, body: '{\n  "customer": "Lin",\n  "item": "Mouse",\n  "total": 25\n}' },
  { label: 'New order, with key', method: 'POST', path: '/orders', key: true, body: '{\n  "customer": "Lin",\n  "item": "Mouse",\n  "total": 25\n}' },
];

function HttpLab({ task, api }: { task: LabTask; api: TaskApi }) {
  const { state } = useLab(task.lab);
  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState('/orders');
  const [useKey, setUseKey] = useState(false);
  const [body, setBody] = useState('');
  const [resp, setResp] = useState<{ status: number; statusText: string; headers: [string, string][]; body: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (useKey) headers['X-API-Key'] = 'practice-key';
      if (method !== 'GET' && body) headers['Content-Type'] = 'application/json';
      const safePath = path.startsWith('/') ? path : `/${path}`;
      const r = await fetch(`http://localhost:${PORTS.http}${safePath}`, { method, headers, body: method === 'GET' ? undefined : body });
      setResp({ status: r.status, statusText: r.statusText, headers: [...r.headers.entries()], body: await r.text() });
    } catch {
      setError('The request could not be sent. Is the Groundwork window still open?');
    }
  };

  if (!state) return <p className="muted">Connecting to the lab…</p>;
  return (
    <>
      <div className="chips samples">
        {SAMPLE_REQUESTS.map((s) => (
          <button key={s.label} className="chip" onClick={() => { setMethod(s.method); setPath(s.path); setUseKey(s.key); setBody(s.body); }}>{s.label}</button>
        ))}
      </div>
      <div className="request-line">
        <select aria-label="Method" value={method} onChange={(e) => setMethod(e.target.value)}>
          {['GET', 'POST', 'PUT', 'DELETE'].map((m) => <option key={m}>{m}</option>)}
        </select>
        <span className="host">localhost:{PORTS.http}</span>
        <input aria-label="Path" className="text-input" value={path} onChange={(e) => setPath(e.target.value)} spellCheck={false} />
        <button className="btn" onClick={send}>Send</button>
      </div>
      <label className="inline-check">
        <input type="checkbox" checked={useKey} onChange={(e) => setUseKey(e.target.checked)} /> Send the header <code>X-API-Key: practice-key</code>
      </label>
      {method !== 'GET' && <textarea aria-label="Request body" rows={5} className="mono" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Request body (JSON)" />}
      {error && <div className="feedback bad">{error}</div>}
      {resp && (
        <div className="http-response">
          <p className={`status status-${Math.floor(resp.status / 100)}`}>HTTP {resp.status} {resp.statusText}</p>
          <pre className="output">{resp.headers.map(([k, v]) => `${k}: ${v}`).join('\n')}{'\n\n'}{resp.body}</pre>
        </div>
      )}
      <Goals state={state} api={api} />
    </>
  );
}

function CorsLab({ task, api }: { task: LabTask; api: TaskApi }) {
  const { state, action } = useLab(task.lab);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!state) return <p className="muted">Connecting to the lab…</p>;
  const current = String(state.data.allowOrigin ?? '');
  const siteUrl = String(state.data.siteUrl);
  return (
    <>
      <div className="lab-split">
        <div>
          <h4>The website <span className="tag">localhost:{PORTS.site}</span></h4>
          <iframe className="lab-frame" title="CORS lab website" src={siteUrl} />
          <p className="small muted">Want to read the browser's real error? <a href={siteUrl} target="_blank" rel="noreferrer">Open this page in its own tab</a>, click Fetch, then press F12 and choose Console.</p>
        </div>
        <div>
          <h4>The API's settings <span className="tag">localhost:{PORTS.corsApi}</span></h4>
          <label className="small" htmlFor="acao">Value of the <code>Access-Control-Allow-Origin</code> response header:</label>
          <div className="row">
            <input id="acao" className="text-input mono" value={value} onChange={(e) => setValue(e.target.value)} placeholder="(leave empty for no header)" spellCheck={false} />
            <button
              className="btn"
              onClick={async () => {
                setError(null);
                try {
                  await action({ type: 'set-header', value });
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'That did not work.');
                }
              }}
            >
              Save
            </button>
          </div>
          <p className="small">Now sending: <code>{current ? `Access-Control-Allow-Origin: ${current}` : 'no CORS header at all'}</code></p>
          {error && <div className="feedback bad">{error}</div>}
          {!!state.data.tooBroad && !state.goals.find((g) => g.id === 'fixed')?.done && (
            <div className="feedback neutral">That worked, but it allows any website on the internet to read this API. Allow exactly one origin instead.</div>
          )}
          <LogView state={state} title="What happened" />
        </div>
      </div>
      <Goals state={state} api={api} />
      <button className="link-btn small" onClick={() => action({ type: 'reset' })}>Reset this lab</button>
    </>
  );
}

function DnsLookupBox({ action }: { action: (body: unknown) => Promise<void> }) {
  const [name, setName] = useState('shop.groundwork.test');
  return (
    <div className="row">
      <input aria-label="Name to look up" className="text-input mono" value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} />
      <button className="btn" onClick={() => action({ type: 'lookup', name }).catch(() => {})}>Look it up</button>
    </div>
  );
}

function DnsLab({ task, api }: { task: LabTask; api: TaskApi }) {
  const { state, action } = useLab(task.lab);
  const [ip, setIp] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!state) return <p className="muted">Connecting to the lab…</p>;
  const records = state.data.records as Record<string, string>;
  const onStandardPort = state.data.port === state.data.standardPort;
  return (
    <>
      {onStandardPort ? (
        <>
          <p>This is a real DNS server running on your computer. In PowerShell, ask it about a name:</p>
          <CommandLine command="nslookup shop.groundwork.test 127.0.0.1" />
          <p>Now ask about a name that doesn't exist. What does it say?</p>
          <CommandLine command="nslookup nothing.groundwork.test 127.0.0.1" />
          <p className="muted small">The first line may say <code>Server: practice-dns.groundwork.test</code>. That's this server introducing itself.</p>
        </>
      ) : (
        <>
          <div className="feedback neutral">
            Another program on this computer is using the standard DNS port, so <code>nslookup</code> can't reach the practice server right now. Use the box below instead. It sends real DNS packets to the same server.
          </div>
          <DnsLookupBox action={action} />
          <p className="muted small">Look up <code>shop.groundwork.test</code>, then a name that doesn't exist, like <code>nothing.groundwork.test</code>.</p>
        </>
      )}
      <h4>The server's records (its "zone")</h4>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Points to</th></tr></thead>
          <tbody>
            {Object.entries(records).map(([name, addr]) => (
              <tr key={name}><td>{name}</td><td>A</td><td>{addr}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="small" htmlFor="new-ip">Move <code>shop.groundwork.test</code> to a new address, as if the shop moved to a new server:</label>
      <div className="row">
        <input id="new-ip" className="text-input mono" value={ip} onChange={(e) => setIp(e.target.value)} placeholder="10.0.0.99" spellCheck={false} />
        <button
          className="btn"
          onClick={async () => {
            setError(null);
            try {
              await action({ type: 'set-record', name: 'shop.groundwork.test', ip });
            } catch (e) {
              setError(e instanceof Error ? e.message : 'That did not work.');
            }
          }}
        >
          Update record
        </button>
      </div>
      {error && <div className="feedback bad">{error}</div>}
      <p className="muted small">Then run the first lookup again and watch the answer change.</p>
      <Goals state={state} api={api} />
      <LogView state={state} />
      <button className="link-btn small" onClick={() => action({ type: 'reset' })}>Reset this lab</button>
    </>
  );
}

function RealDnsLab({ task, api }: { task: LabTask; api: TaskApi }) {
  const { state, action } = useLab(task.lab);
  const [name, setName] = useState('example.com');
  const [error, setError] = useState<string | null>(null);
  if (!state) return <p className="muted">Connecting to the lab…</p>;
  const answer = state.data.answer as string[] | null;
  return (
    <>
      <div className="row">
        <input aria-label="Domain name" className="text-input mono" value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} />
        <button
          className="btn"
          onClick={async () => {
            setError(null);
            try {
              await action({ type: 'lookup', name });
            } catch (e) {
              setError(e instanceof Error ? e.message : 'That did not work.');
            }
          }}
        >
          Look it up
        </button>
      </div>
      {error && <div className="feedback bad">{error}</div>}
      {answer && <p><code>{String(state.data.name)}</code> → <code>{answer.join(', ')}</code></p>}
      <p className="muted small">You can also run <code>nslookup example.com</code> in PowerShell, which asks your internet provider's DNS server.</p>
      <Goals state={state} api={api} />
    </>
  );
}

function LiveLab({ task, api }: { task: LabTask; api: TaskApi }) {
  const { state } = useLab(task.lab);
  const socket = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [wsLog, setWsLog] = useState<string[]>([]);
  const [message, setMessage] = useState('hello server');
  const [polling, setPolling] = useState(false);
  const [pollStats, setPollStats] = useState({ requests: 0, useful: 0, value: null as number | null });
  const lastTick = useRef(-1);

  useEffect(() => () => socket.current?.close(), []);
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(async () => {
      try {
        const r = await (await fetch(`http://localhost:${PORTS.live}/poll?since=${lastTick.current}`)).json();
        lastTick.current = r.tick;
        setPollStats((s) => ({ requests: s.requests + 1, useful: s.useful + (r.changed ? 1 : 0), value: r.value }));
      } catch {
        setPolling(false);
      }
    }, 500);
    return () => clearInterval(t);
  }, [polling]);

  const connect = () => {
    const ws = new WebSocket(`ws://localhost:${PORTS.live}`);
    socket.current = ws;
    ws.onopen = () => {
      setConnected(true);
      setWsLog((l) => ['Connected. The connection stays open now.', ...l]);
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      setWsLog((l) => [m.kind === 'echo' ? `Server replied: "${m.text}"` : `Server pushed update #${m.tick}: value ${m.value}`, ...l].slice(0, 8));
    };
    ws.onclose = () => {
      setConnected(false);
      setWsLog((l) => ['Connection closed.', ...l]);
    };
    ws.onerror = () => setWsLog((l) => ['Could not connect.', ...l]);
  };

  if (!state) return <p className="muted">Connecting to the lab…</p>;
  return (
    <>
      <div className="lab-split">
        <div>
          <h4>WebSocket</h4>
          <div className="row">
            {connected ? (
              <button className="btn ghost" onClick={() => socket.current?.close()}>Disconnect</button>
            ) : (
              <button className="btn" onClick={connect}>Connect</button>
            )}
          </div>
          <div className="row">
            <input aria-label="Message to send" className="text-input" value={message} onChange={(e) => setMessage(e.target.value)} disabled={!connected} />
            <button className="btn" disabled={!connected || !message} onClick={() => socket.current?.send(message)}>Send</button>
          </div>
          <pre className="output live-log">{wsLog.join('\n') || 'Not connected yet.'}</pre>
        </div>
        <div>
          <h4>Polling</h4>
          <div className="row">
            <button className={`btn ${polling ? 'ghost' : ''}`} onClick={() => setPolling(!polling)}>{polling ? 'Stop polling' : 'Start polling'}</button>
          </div>
          <p>Asking the server <strong>twice a second</strong>, "anything new?"</p>
          <dl className="stat-row">
            <div><dt>Requests sent</dt><dd>{pollStats.requests}</dd></div>
            <div><dt>Had news</dt><dd>{pollStats.useful}</dd></div>
            <div><dt>Wasted</dt><dd>{pollStats.requests - pollStats.useful}</dd></div>
          </dl>
          <p className="muted small">New data only appears every 2 seconds, so most of these requests come back with nothing.</p>
        </div>
      </div>
      <Goals state={state} api={api} />
    </>
  );
}

const LABS: Record<LabName, (p: { task: LabTask; api: TaskApi }) => React.ReactNode> = {
  ports: PortsLab,
  http: HttpLab,
  cors: CorsLab,
  dns: DnsLab,
  'real-dns': RealDnsLab,
  live: LiveLab,
};

export function LabTaskView({ task, api }: { task: LabTask; api: TaskApi }) {
  const Lab = LABS[task.lab];
  return <Lab task={task} api={api} />;
}
