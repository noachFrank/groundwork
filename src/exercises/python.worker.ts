/// <reference lib="webworker" />
import { HARNESS, REQUESTS_SHIM } from '../../shared/python-harness.ts';

/**
 * Python runs in a background worker so an infinite loop can be stopped instead of
 * freezing the page. Pyodide is served from this computer, so no internet is needed.
 */
declare const self: DedicatedWorkerGlobalScope & { __gwHttp?: unknown };

// Synchronous, because `requests.get()` in Python isn't async. Only possible in a worker.
self.__gwHttp = (method: string, url: string, headersJson: string, body: string, timeoutMs = 0) => {
  const started = Date.now();
  try {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, false);
    if (timeoutMs > 0) xhr.timeout = timeoutMs;
    for (const [k, v] of Object.entries(JSON.parse(headersJson) as Record<string, string>)) xhr.setRequestHeader(k, v);
    xhr.send(body || undefined);
    const headers: Record<string, string> = {};
    for (const line of xhr.getAllResponseHeaders().trim().split(/\r?\n/)) {
      const at = line.indexOf(':');
      if (at > 0) headers[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
    }
    return JSON.stringify({ status: xhr.status, body: xhr.responseText, headers });
  } catch (e) {
    const timedOut = (e instanceof DOMException && e.name === 'TimeoutError') || (timeoutMs > 0 && Date.now() - started >= timeoutMs);
    if (timedOut) return JSON.stringify({ timeout: true });
    return JSON.stringify({ error: `Could not connect to ${url}` });
  }
};

let ready: Promise<any> | null = null;

function load() {
  ready ??= (async () => {
    const url = '/vendor/pyodide/pyodide.mjs';
    const { loadPyodide } = await import(/* @vite-ignore */ url);
    const pyodide = await loadPyodide({ indexURL: '/vendor/pyodide/' });
    pyodide.FS.writeFile('/home/pyodide/requests.py', REQUESTS_SHIM);
    pyodide.runPython(HARNESS);
    return pyodide;
  })();
  return ready;
}

self.onmessage = async (e: MessageEvent<{ id: number; type: 'load' | 'run'; code?: string; tests?: unknown }>) => {
  const { id, type, code, tests } = e.data;
  try {
    const pyodide = await load();
    if (type === 'load') {
      self.postMessage({ id, type: 'loaded' });
      return;
    }
    const run = pyodide.globals.get('__gw_run');
    const output = run(code, JSON.stringify(tests ?? []));
    run.destroy();
    self.postMessage({ id, type: 'result', result: JSON.parse(output) });
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
