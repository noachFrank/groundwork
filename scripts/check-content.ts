// `npm run check-content`. Proves the course itself works: every lesson is valid, no
// prerequisites go in circles, and every exercise's reference solution passes while its
// deliberately wrong answer fails. It also compiles every lesson's text, so a stray { in
// prose fails here rather than at build time. Add --links to also confirm videos and docs still exist.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import initSqlJs from 'sql.js';
import { loadPyodide } from 'pyodide';
import { loadContent } from '../server/content.ts';
import { APP_ROOT, CONTENT_DIR } from '../server/paths.ts';
import { PORTS } from '../shared/ports.ts';
import { HARNESS, REQUESTS_SHIM, type PythonRunResult } from '../shared/python-harness.ts';
import { sameResult, type SqlResult } from '../shared/sql-compare.ts';
import { createContext, runInContext } from 'node:vm';
import { JS_HARNESS, type JsRunResult } from '../shared/js-harness.ts';
import type { JavascriptTask, PythonTask, SqlTask } from '../shared/types.ts';
import { validateContent } from '../shared/validate.ts';
import { compile as compileMdx } from '@mdx-js/mdx';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';

const checkLinks = process.argv.includes('--links');
const content = loadContent(CONTENT_DIR);
const problems: string[] = validateContent(content);
let passes = 0;
const pass = (msg: string) => {
  passes++;
  console.log(`  ok   ${msg}`);
};

// In the browser, Python's `requests` uses a synchronous XHR. Node has no such thing, so
// here each call runs in a small child process and waits. Slow, but only used for checks.
function httpViaChild(method: string, url: string, headersJson: string, body: string): string {
  const script = `
    const [method, url, headers, body] = process.argv.slice(1);
    fetch(url, { method, headers: JSON.parse(headers), body: body || undefined })
      .then(async (r) => console.log(JSON.stringify({ status: r.status, body: await r.text(), headers: Object.fromEntries(r.headers) })))
      .catch(() => console.log(JSON.stringify({ error: 'Could not connect to ' + url })));`;
  return execFileSync(process.execPath, ['-e', script, method, url, headersJson, body], { encoding: 'utf8', timeout: 15000 });
}

async function checkPython(tasks: { lesson: string; task: PythonTask }[]) {
  if (tasks.length === 0) return;
  console.log('Starting Python...');
  const pyodide: any = await loadPyodide();
  (globalThis as any).__gwHttp = httpViaChild;
  pyodide.FS.writeFile('/home/pyodide/requests.py', REQUESTS_SHIM);
  pyodide.runPython(HARNESS);
  const run = (code: string, tests: unknown): PythonRunResult => JSON.parse(pyodide.globals.get('__gw_run')(code, JSON.stringify(tests)));
  for (const { lesson, task } of tasks) {
    const name = `${lesson}/${task.id}`;
    const good = run(task.solution, task.tests);
    if (good.error || good.tests.some((t) => !t.passed)) {
      problems.push(`${name}: the reference solution fails: ${good.error ?? good.tests.filter((t) => !t.passed).map((t) => `${t.name}: ${t.message}`).join('; ')}`);
    } else pass(`${name}: the solution passes`);
    const bad = run(task.wrong, task.tests);
    if (!bad.error && bad.tests.every((t) => t.passed)) problems.push(`${name}: the wrong answer passes, so the tests are too weak`);
    else pass(`${name}: the wrong answer fails`);
    const starter = run(task.starter, task.tests);
    if (!starter.error && starter.tests.every((t) => t.passed)) problems.push(`${name}: the starter code already passes`);
    else pass(`${name}: the starter code doesn't pass yet`);
  }
}

function checkJavascript(tasks: { lesson: string; task: JavascriptTask }[]) {
  const run = (code: string, tests: unknown): JsRunResult => {
    const ctx = createContext({ __code: code, __tests: tests });
    try {
      return JSON.parse(runInContext(`${JS_HARNESS}
JSON.stringify(__gwRunJs(__code, __tests))`, ctx, { timeout: 5000 }));
    } catch (e) {
      return { output: '', error: String(e), tests: [] };
    }
  };
  const ok = (r: JsRunResult) => r.error === null && r.tests.length > 0 && r.tests.every((t) => t.passed);
  for (const { lesson, task } of tasks) {
    const name = `${lesson}/${task.id}`;
    const good = run(task.solution, task.tests);
    if (!ok(good)) problems.push(`${name}: the reference solution fails: ${good.error ?? good.tests.filter((t) => !t.passed).map((t) => `${t.name}: ${t.message}`).join('; ')}`);
    else pass(`${name}: the solution passes`);
    if (ok(run(task.wrong, task.tests))) problems.push(`${name}: the wrong answer passes, so the tests are too weak`);
    else pass(`${name}: the wrong answer fails`);
    if (ok(run(task.starter, task.tests))) problems.push(`${name}: the starter code already passes`);
    else pass(`${name}: the starter code doesn't pass yet`);
  }
}

async function checkSql(tasks: { lesson: string; task: SqlTask }[]) {
  if (tasks.length === 0) return;
  const SQL = await initSqlJs();
  for (const { lesson, task } of tasks) {
    const name = `${lesson}/${task.id}`;
    const seed = readFileSync(join(CONTENT_DIR, 'datasets', `${task.dataset}.sql`), 'utf8');
    const query = (sql: string): SqlResult => {
      const db = new SQL.Database();
      try {
        db.run(seed);
        const results = db.exec(sql);
        const last = results[results.length - 1];
        return last ? { columns: last.columns, rows: last.values as unknown[][] } : { columns: [], rows: [] };
      } finally {
        db.close();
      }
    };
    try {
      const expected = query(task.solution);
      if (expected.rows.length === 0) problems.push(`${name}: the solution returns no rows`);
      if (sameResult(query(task.wrong), expected, task.ordered)) problems.push(`${name}: the wrong answer gives the expected result`);
      else pass(`${name}: the wrong answer fails`);
      if (sameResult(query(task.starter), expected, task.ordered)) problems.push(`${name}: the starter query already passes`);
      else pass(`${name}: the solution differs from the starter`);
    } catch (e) {
      problems.push(`${name}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

async function checkAllLinks() {
  console.log('Checking links and videos (needs internet)...');
  for (const lesson of content.lessons) {
    for (const d of lesson.docs) {
      try {
        const res = await fetch(d.url, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0 (Groundwork link check)' } });
        if (res.ok) pass(`link: ${d.url}`);
        else problems.push(`${lesson.id}: ${d.url} answered ${res.status}`);
      } catch (e) {
        problems.push(`${lesson.id}: couldn't reach ${d.url}`);
      }
    }
    for (const v of lesson.videos) {
      const res = await fetch(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${v.id}`, { signal: AbortSignal.timeout(15000) }).catch(() => null);
      if (res?.ok) {
        const info = (await res.json()) as { title: string; author_name: string };
        if (info.author_name === v.channel) pass(`video: ${v.title}`);
        else problems.push(`${lesson.id}: video ${v.id} is by "${info.author_name}", not "${v.channel}"`);
      } else problems.push(`${lesson.id}: video ${v.id} (${v.title}) can't be found`);
    }
  }
}

const python = content.lessons.flatMap((l) => l.tasks.filter((t): t is PythonTask => t.type === 'python').map((task) => ({ lesson: l.id, task })));
const js = content.lessons.flatMap((l) => l.tasks.filter((t): t is JavascriptTask => t.type === 'javascript').map((task) => ({ lesson: l.id, task })));
const sql = content.lessons.flatMap((l) => l.tasks.filter((t): t is SqlTask => t.type === 'sql').map((task) => ({ lesson: l.id, task })));

// Python exercises talk to the practice API. The lab runs in its own process, because the
// synchronous calls above would otherwise block the server that has to answer them. If
// the app is already running, its copy of the lab answers just as well.
const labProcess = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--import', 'tsx', 'scripts/lab-only.ts'], {
  cwd: APP_ROOT,
  stdio: 'ignore',
});
const labUp = async () => {
  for (let i = 0; i < 100; i++) {
    const res = await fetch(`http://localhost:${PORTS.http}/hello`).catch(() => null);
    if (res?.ok) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};
if (!(await labUp())) problems.push('The practice lab server did not start, so Python tasks could not be checked.');
else await checkPython(python);
checkJavascript(js);
await checkSql(sql);
if (checkLinks) await checkAllLinks();
labProcess.kill();

// The same MDX settings as vite.config.ts.
for (const lesson of content.lessons) {
  try {
    await compileMdx(readFileSync(join(CONTENT_DIR, lesson.file), 'utf8'), { remarkPlugins: [remarkFrontmatter, remarkGfm] });
    pass(`${lesson.id}: the lesson text compiles`);
  } catch (e: any) {
    problems.push(`${lesson.file}:${e.line ?? '?'}:${e.column ?? '?'} ${e.reason ?? e.message} (a { or < in plain text? Put it in backticks)`);
  }
}

console.log(`\n${content.lessons.length} lessons, ${content.lessons.reduce((s, l) => s + l.tasks.length, 0)} tasks. ${passes} checks passed.`);
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  FAIL ${p}`);
  process.exit(1);
}
console.log('All content is good.');
process.exit(0);
