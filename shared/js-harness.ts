/**
 * Runs a learner's JavaScript and the hidden checks against it. The same source runs
 * in the browser (inside a worker, see JS_WORKER_SOURCE) and in Node for
 * `npm run check-content`, so a solution is judged the same way in both.
 *
 * Tests can call `assert(condition, message)` and `__output()`, which returns
 * everything printed with console.log, and can use anything the learner's code declared.
 */
export const JS_HARNESS = String.raw`
function __gwRunJs(code, tests) {
  var lines = [];
  function fmt(v) {
    if (typeof v === 'string') return v;
    if (v === undefined) return 'undefined';
    if (typeof v === 'function') return '[Function ' + (v.name || 'anonymous') + ']';
    try { var j = JSON.stringify(v); return j === undefined ? String(v) : j; } catch (e) { return String(v); }
  }
  var log = function () { lines.push(Array.prototype.map.call(arguments, fmt).join(' ')); };
  var con = { log: log, error: log, warn: log, info: log, table: log };
  function assert(cond, msg) {
    if (!cond) { var e = new Error(msg || "This check didn't pass yet."); e.name = 'AssertionError'; throw e; }
  }
  function output() { return lines.join('\n'); }
  function describe(e) {
    if (!e || typeof e !== 'object' || !('message' in e)) return 'Uncaught ' + fmt(e);
    // new Function adds two lines before the learner's first line.
    var m = /<anonymous>:(\d+):\d+/.exec(String(e.stack || ''));
    var line = m ? Number(m[1]) - 2 : 0;
    return e.name + ': ' + e.message + (line > 0 ? ' (line ' + line + ')' : '');
  }
  var evaluate = null, error = null;
  try {
    var factory = new Function('console', 'assert', '__output', code + '\n;return function (__src) { return eval(__src); };');
    evaluate = factory(con, assert, output);
  } catch (e) {
    error = describe(e);
  }
  var printed = output();
  var results = tests.map(function (t) {
    if (error !== null) return { name: t.name, passed: false, message: 'Your script stopped with an error before this could be checked.' };
    try {
      evaluate(t.code);
      return { name: t.name, passed: true, message: '' };
    } catch (e) {
      return { name: t.name, passed: false, message: e && e.name === 'AssertionError' ? e.message : describe(e) };
    }
  });
  return { output: printed, error: error, tests: results };
}
`;

/**
 * Served at /js-runner.js with its own strict Content-Security-Policy: it may evaluate
 * code, but it can't load or contact anything. The page stops it if it runs too long.
 */
export const JS_WORKER_SOURCE = `${JS_HARNESS}
self.onmessage = function (e) {
  var r;
  try { r = __gwRunJs(e.data.code, e.data.tests); }
  catch (err) { r = { output: '', error: String(err), tests: [] }; }
  self.postMessage(r);
};
`;

export const JS_WORKER_CSP = "default-src 'none'; script-src 'unsafe-eval'";

export interface JsRunResult {
  output: string;
  error: string | null;
  tests: { name: string; passed: boolean; message: string }[];
}
