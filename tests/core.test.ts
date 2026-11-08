import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { Resolver } from 'node:dns';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApi } from '../server/app.ts';
import { Connectivity } from '../server/connectivity.ts';
import { loadContent } from '../server/content.ts';
import { openDatabase } from '../server/db.ts';
import { Labs } from '../server/labs/index.ts';
import { CONTENT_DIR } from '../server/paths.ts';
import { checkPractice } from '../server/practice.ts';
import { Store } from '../server/store.ts';
import { addDays, localDay, weekStart } from '../shared/dates.ts';
import { pickNextLesson } from '../shared/next-lesson.ts';
import { buildPlanItems, generateSchedule } from '../shared/plan.ts';
import type { Ports } from '../shared/ports.ts';
import { findCycles, validateContent } from '../shared/validate.ts';


const content = loadContent(CONTENT_DIR);
const TEST_PORTS: Ports = { app: 14310, site: 14311, corsApi: 14312, live: 14313, http: 14314, dns: 14315, dnsFallback: 14316 };
const HEADERS = { host: 'localhost:14310', 'content-type': 'application/json' };

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'groundwork-test-'));
}

function makeStore(now?: () => Date) {
  const dir = tempDir();
  const db = openDatabase(join(dir, 'progress.db'), join(dir, 'backups'));
  return { store: new Store(db, content, now), db, dir };
}

function passLesson(store: Store, id: string) {
  const lesson = store.lesson(id)!;
  for (const t of lesson.tasks) if (t.required) store.recordTask(id, t.id, true, 100);
  const responses: Record<string, any> = {};
  for (const q of lesson.recall) {
    if (q.type === 'mcq') responses[q.id] = { response: q.answer };
    if (q.type === 'short') responses[q.id] = { response: q.answerText };
    if (q.type === 'self') responses[q.id] = { response: 'x', selfCorrect: true };
  }
  return store.recordRecall(id, responses);
}

describe('course content', () => {
  it('is valid, with all nine exercise types present', () => {
    expect(validateContent(content)).toEqual([]);
    const types = new Set(content.lessons.flatMap((l) => l.tasks.map((t) => t.type)));
    expect([...types].sort()).toEqual(['architecture', 'case', 'explain', 'flaw', 'javascript', 'lab', 'python', 'sql', 'terminal']);
  });
  it('has the plan\'s 180 hours', () => {
    expect(content.curriculum.stages.map((s) => s.hours)).toEqual([25, 25, 45, 85]);
    for (const s of content.curriculum.stages) expect(s.topics.reduce((n, t) => n + t.hours, 0)).toBe(s.hours);
  });
  it('detects circular prerequisites', () => {
    expect(findCycles([{ id: 'a', prerequisites: ['b'] }, { id: 'b', prerequisites: ['a'] }])).toHaveLength(1);
  });
});

describe('progress tracking', () => {
  it('only completes a lesson once both Do and Recall pass', () => {
    const { store } = makeStore();
    const lesson = store.lesson('the-trip')!;
    const right = { r1: { response: 1 }, r2: { response: 'DNS' }, r3: { response: 'x', selfCorrect: true } };
    expect(store.recordRecall(lesson.id, right).passed).toBe(true);
    expect(store.progress(lesson.id).status).toBe('in_progress');
    store.recordTask(lesson.id, lesson.tasks[0].id, true);
    expect(store.progress(lesson.id).status).toBe('completed');
    expect(store.cardsForLesson(lesson.id)).toHaveLength(lesson.cards.length);
  });

  it('does not count a failed recall', () => {
    const { store } = makeStore();
    const r = store.recordRecall('the-trip', { r1: { response: 0 }, r2: { response: 'no idea' }, r3: { response: 'x', selfCorrect: false } });
    expect(r.passed).toBe(false);
    expect(store.progress('the-trip').recallPassed).toBe(false);
  });

  it('a passed task stays passed after a later failure', () => {
    const { store } = makeStore();
    store.recordTask('the-trip', 'first-request', true);
    store.recordTask('the-trip', 'first-request', false);
    const t = store.progress('the-trip').tasks[0];
    expect(t.passed).toBe(true);
    expect(t.attempts).toBe(2);
  });

  it('keeps progress after the database is closed and reopened', () => {
    const { store, db, dir } = makeStore();
    passLesson(store, 'the-trip');
    store.setNote('the-trip', 'remember this');
    db.close();
    const db2 = openDatabase(join(dir, 'progress.db'), join(dir, 'backups'));
    const again = new Store(db2, content);
    expect(again.progress('the-trip').status).toBe('completed');
    expect(again.getNote('the-trip')).toBe('remember this');
    db2.close();
  });

  it('round-trips a backup into an empty database', () => {
    const { store } = makeStore();
    passLesson(store, 'the-trip');
    store.addTime('the-trip', 60);
    const backup = JSON.parse(JSON.stringify(store.exportAll()));
    const { store: fresh } = makeStore();
    fresh.importAll(backup);
    expect(fresh.progress('the-trip').status).toBe('completed');
    expect(fresh.progress('the-trip').seconds).toBe(60);
    expect(fresh.cardsForLesson('the-trip')).toHaveLength(3);
    expect(() => fresh.importAll({ hello: 'world' })).toThrow(/not a Groundwork backup/);
  });

  it('test-out needs every question right', () => {
    const { store } = makeStore();
    const lesson = store.lesson('the-trip')!;
    const all = Object.fromEntries(lesson.testOut.map((q) => [q.id, q.answer]));
    const oneWrong = { ...all, [lesson.testOut[0].id]: lesson.testOut[0].answer + 1 };
    expect(store.submitTestOut([lesson.id], { [lesson.id]: oneWrong }).results[0].passed).toBe(false);
    expect(store.progress(lesson.id).status).toBe('not_started');
    expect(store.submitTestOut([lesson.id], { [lesson.id]: all }).results[0].passed).toBe(true);
    expect(store.progress(lesson.id).status).toBe('tested_out');
  });

  it('caps time from a single report', () => {
    const { store } = makeStore();
    store.addTime('the-trip', 99999);
    expect(store.progress('the-trip').seconds).toBe(120);
  });
});

describe('review scheduling', () => {
  it('brings cards back sooner after a struggle', () => {
    const now = new Date('2026-06-01T12:00:00');
    const { store: smooth } = makeStore(() => now);
    passLesson(smooth, 'the-trip');
    const { store: rough } = makeStore(() => now);
    rough.recordRecall('the-trip', { r1: { response: 0 }, r2: { response: 'x' }, r3: { response: 'x', selfCorrect: false } });
    passLesson(rough, 'the-trip');
    expect(new Date(rough.cardsForLesson('the-trip')[0].due).getTime()).toBeLessThan(new Date(smooth.cardsForLesson('the-trip')[0].due).getTime());
  });

  it('cards become due later, and a good review pushes them further out', () => {
    let now = new Date('2026-06-01T12:00:00');
    const { store } = makeStore(() => now);
    passLesson(store, 'the-trip');
    expect(store.dueCards().cards).toHaveLength(0);
    now = new Date('2026-07-01T12:00:00');
    const due = store.dueCards().cards;
    expect(due).toHaveLength(3);
    const next = store.rateCard(due[0].id, 'good')!;
    expect(new Date(next.due).getTime()).toBeGreaterThan(now.getTime());
    expect(store.dueCards().cards).toHaveLength(2);
  });

  it('"Need to review" brings cards back today, first in line', () => {
    const now = new Date('2026-06-01T12:00:00');
    const { store } = makeStore(() => now);
    passLesson(store, 'the-trip');
    store.setFlags('the-trip', { needReview: true });
    expect(store.dueCards().cards).toHaveLength(3);
    for (const c of store.dueCards().cards) store.rateCard(c.id, 'good');
    expect(store.progress('the-trip').needReview).toBe(false);
  });

  it('respects the daily limit unless asked to continue', () => {
    let now = new Date('2026-06-01T12:00:00');
    const { store } = makeStore(() => now);
    store.savePlan({ hoursPerWeek: 10, dailyReviewLimit: 2 });
    passLesson(store, 'the-trip');
    now = new Date('2026-08-01T12:00:00');
    expect(store.dueCards().cards).toHaveLength(2);
    expect(store.dueCards(true).cards).toHaveLength(3);
  });
});

describe('study plan', () => {
  const items = buildPlanItems(content, {});

  it('covers the whole course, with written lessons first', () => {
    expect(items.reduce((s, i) => s + i.hours, 0)).toBeCloseTo(180, 0);
    const firstUnwritten = items.findIndex((i) => !i.written);
    expect(firstUnwritten).toBeGreaterThan(0);
    expect(items.slice(firstUnwritten).every((i) => !i.written)).toBe(true);
    expect(items[0].title).toBe('Learning with AI');
  });

  it('takes about 4 months at 10 hours a week and 2 at 20', () => {
    const base = { items, startDate: '2026-06-01', today: '2026-06-01', spentHours: 0, spentThisWeek: 0 };
    expect(generateSchedule({ ...base, hoursPerWeek: 10 }).weeks).toHaveLength(18);
    expect(generateSchedule({ ...base, hoursPerWeek: 20 }).weeks).toHaveLength(9);
  });

  it('never overfills a week', () => {
    const s = generateSchedule({ items, hoursPerWeek: 7, startDate: '2026-06-01', today: '2026-06-01', spentHours: 0, spentThisWeek: 0 });
    for (const w of s.weeks) expect(w.hours).toBeLessThanOrEqual(7.1);
  });

  it('reschedules after falling behind', () => {
    const onTime = generateSchedule({ items, hoursPerWeek: 10, startDate: '2026-06-01', today: '2026-06-01', spentHours: 0, spentThisWeek: 0 });
    const late = generateSchedule({ items, hoursPerWeek: 10, startDate: '2026-06-01', today: '2026-06-29', spentHours: 0, spentThisWeek: 0 });
    expect(late.behindHours).toBe(40);
    expect(late.finishDate! > onTime.finishDate!).toBe(true);
    expect(late.weeks[0].weekStart).toBe('2026-06-29');
  });

  it('counts this week\'s hours against this week', () => {
    const s = generateSchedule({ items, hoursPerWeek: 10, startDate: '2026-06-01', today: '2026-06-03', spentHours: 8, spentThisWeek: 8 });
    expect(s.thisWeek.left).toBe(2);
    expect(s.weeks[0].hours).toBeCloseTo(2, 1);
  });

  it('removes finished lessons from what\'s left', () => {
    const statuses = Object.fromEntries(content.lessons.map((l) => [l.id, 'completed' as const]));
    const left = buildPlanItems(content, statuses);
    expect(left.some((i) => i.written)).toBe(false);
  });

  it('uses local dates and Monday weeks', () => {
    expect(weekStart('2026-11-08')).toBe('2026-11-02');
    expect(weekStart('2026-11-09')).toBe('2026-11-09');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(localDay(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});

describe('choosing the next lesson', () => {
  const L = (id: string, connectivity: 'offline' | 'needs-internet', prerequisites: string[] = []) => ({ id, connectivity, prerequisites });
  const lessons = [L('a', 'offline'), L('b', 'needs-internet', ['a']), L('c', 'offline', ['a'])];

  it('respects prerequisites', () => {
    expect(pickNextLesson(lessons, {}, true).lesson?.id).toBe('a');
  });
  it('online takes the next in order, even if it needs internet', () => {
    expect(pickNextLesson(lessons, { a: 'completed' }, true).lesson?.id).toBe('b');
  });
  it('offline skips to one that works offline, and says so', () => {
    expect(pickNextLesson(lessons, { a: 'completed' }, false)).toMatchObject({ lesson: { id: 'c' }, fallback: true });
  });
  it('offline with only internet lessons left still says what\'s next', () => {
    expect(pickNextLesson(lessons, { a: 'completed', c: 'completed' }, false)).toMatchObject({ lesson: { id: 'b' }, fallback: false });
  });
  it('skips "come back later"', () => {
    expect(pickNextLesson(lessons, { a: 'completed' }, true, new Set(['b'])).lesson?.id).toBe('c');
  });
});

describe('connectivity', () => {
  it('reports online when a probe succeeds, offline when all fail', async () => {
    expect(await new Connectivity(async () => true, false).check()).toBe(true);
    expect(await new Connectivity(async () => false, false).check()).toBe(false);
    expect(await new Connectivity(async () => { throw new Error('no network'); }, false).check()).toBe(false);
  });
  it('can be forced offline for testing', async () => {
    expect(await new Connectivity(async () => true, true).check()).toBe(false);
  });
});

describe('check my work', () => {
  const dir = tempDir();
  const outside = tempDir();
  writeFileSync(join(dir, 'good.txt'), 'Hello from the lab');
  writeFileSync(join(dir, 'utf16.txt'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Hello', 'utf16le')]));
  writeFileSync(join(outside, 'secret.txt'), 'top secret');
  mkdirSync(join(dir, 'sub'));

  it('passes matching files, including PowerShell\'s UTF-16 output', () => {
    expect(checkPractice(dir, [{ path: 'good.txt', contains: 'hello FROM', hint: '' }, { path: 'utf16.txt', contains: 'hello', hint: '' }]).passed).toBe(true);
  });
  it('fails on missing files and wrong content, with the hint', () => {
    const r = checkPractice(dir, [{ path: 'nope.txt', hint: 'make it' }, { path: 'good.txt', contains: 'zebra', hint: 'edit it' }]);
    expect(r.passed).toBe(false);
    expect(r.checks.map((c) => c.hint)).toEqual(['make it', 'edit it']);
  });
  it('refuses to look outside the practice folder', () => {
    expect(checkPractice(dir, [{ path: join('..', outside.split(/[\\/]/).pop()!, 'secret.txt'), hint: '' }]).passed).toBe(false);
    expect(checkPractice(dir, [{ path: join(outside, 'secret.txt'), hint: '' }]).passed).toBe(false);
  });
  it('refuses a shortcut that points outside', () => {
    let linked = false;
    try {
      symlinkSync(join(outside, 'secret.txt'), join(dir, 'link.txt'));
      linked = true;
    } catch {
      // Creating symlinks needs special permission on Windows. Nothing to test then.
    }
    if (linked) expect(checkPractice(dir, [{ path: 'link.txt', contains: 'secret', hint: '' }]).passed).toBe(false);
  });
});

describe('API and labs', () => {
  const labs = new Labs(TEST_PORTS);
  const { store, dir } = makeStore();
  const practice = join(dir, 'practice');
  const api = createApi({ store, content, connectivity: new Connectivity(async () => false, false), labs, practicePath: practice, dataPath: dir, version: 'test' });
  const call = (path: string, init?: RequestInit) => api.request(path, { ...init, headers: { ...HEADERS, ...(init?.headers as object) } });
  const url = (port: number, path: string) => `http://localhost:${port}${path}`;

  beforeAll(() => {
    labs.start();
    return new Promise((r) => setTimeout(r, 200));
  });
  afterAll(() => labs.stop());

  it('blocks requests that aren\'t from this computer', async () => {
    const res = await api.request('/health', { headers: { host: 'evil.example' } });
    expect(res.status).toBe(403);
  });
  it('blocks other websites from changing progress', async () => {
    const res = await call('/lessons/the-trip/note', { method: 'PUT', headers: { origin: 'https://evil.example' }, body: JSON.stringify({ body: 'x' }) });
    expect(res.status).toBe(403);
    expect(store.getNote('the-trip')).toBe('');
  });
  it('allows the app itself', async () => {
    const res = await call('/lessons/the-trip/note', { method: 'PUT', headers: { origin: 'http://localhost:14310' }, body: JSON.stringify({ body: 'mine' }) });
    expect(res.status).toBe(200);
    expect(store.getNote('the-trip')).toBe('mine');
  });
  it('returns 404 for an unknown lesson', async () => {
    expect((await call('/lessons/nope')).status).toBe(404);
  });
  it('rejects a silly plan', async () => {
    expect((await call('/plan', { method: 'PUT', body: JSON.stringify({ hoursPerWeek: 0 }) })).status).toBe(400);
    expect((await call('/plan', { method: 'PUT', body: JSON.stringify({ hoursPerWeek: 10 }) })).status).toBe(200);
  });
  it('checks a terminal mission through the practice folder', async () => {
    mkdirSync(practice, { recursive: true });
    let r = await (await call('/lessons/the-trip/tasks/first-request/check', { method: 'POST', body: '{}' })).json();
    expect(r.result.passed).toBe(false);
    writeFileSync(join(practice, 'hello.txt'), 'Hello from the Groundwork lab');
    writeFileSync(join(practice, 'fetch.bat'), 'curl.exe ...');
    writeFileSync(join(practice, 'from-bat.txt'), 'Hello from the Groundwork lab');
    r = await (await call('/lessons/the-trip/tasks/first-request/check', { method: 'POST', body: '{}' })).json();
    expect(r.result.passed).toBe(true);
    expect(r.progress.tasks[0].passed).toBe(true);
  });

  it('the HTTP lab returns real status codes and tracks the goals', async () => {
    const http = TEST_PORTS.http;
    expect((await fetch(url(http, '/orders'))).status).toBe(200);
    expect((await fetch(url(http, '/orders/999'))).status).toBe(404);
    const body = JSON.stringify({ customer: 'Lin', item: 'Mouse', total: 25 });
    expect((await fetch(url(http, '/orders'), { method: 'POST', body })).status).toBe(401);
    expect((await fetch(url(http, '/orders'), { method: 'POST', body, headers: { 'X-API-Key': 'practice-key' } })).status).toBe(201);
    expect(labs.goalsDone('http')).toBe(true);
  });

  it('the CORS lab sends the header only once configured', async () => {
    const origin = `http://localhost:${TEST_PORTS.site}`;
    let res = await fetch(url(TEST_PORTS.corsApi, '/data'), { headers: { Origin: origin } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    await fetch(url(TEST_PORTS.site, '/report'), { method: 'POST', body: JSON.stringify({ ok: false }) });
    await labs.action('cors', { type: 'set-header', value: '*' });
    await fetch(url(TEST_PORTS.site, '/report'), { method: 'POST', body: JSON.stringify({ ok: true }) });
    expect(labs.goalsDone('cors')).toBe(false); // A wildcard isn't the fix.
    await labs.action('cors', { type: 'set-header', value: origin });
    res = await fetch(url(TEST_PORTS.corsApi, '/data'));
    expect(res.headers.get('access-control-allow-origin')).toBe(origin);
    await fetch(url(TEST_PORTS.site, '/report'), { method: 'POST', body: JSON.stringify({ ok: true }) });
    expect(labs.goalsDone('cors')).toBe(true);
    await expect(labs.action('cors', { type: 'set-header', value: 'a\r\nb' })).rejects.toThrow();
  });

  it('the DNS lab answers real DNS queries', async () => {
    const resolver = new Resolver();
    resolver.setServers([`127.0.0.1:${TEST_PORTS.dns}`]);
    const lookup = (name: string) =>
      new Promise<string[]>((resolve, reject) => resolver.resolve4(name, (e, a) => (e ? reject(e) : resolve(a))));
    expect(await lookup('shop.groundwork.test')).toEqual(['10.0.0.42']);
    await expect(lookup('nothing.groundwork.test')).rejects.toMatchObject({ code: 'ENOTFOUND' });
    await labs.action('dns', { type: 'set-record', name: 'shop.groundwork.test', ip: '10.0.0.99' });
    expect(await lookup('shop.groundwork.test')).toEqual(['10.0.0.99']);
    expect(labs.goalsDone('dns')).toBe(true);
    await expect(labs.action('dns', { type: 'set-record', name: 'shop.groundwork.test', ip: '999.1.1.1' })).rejects.toThrow();
  });

  it('the live lab connects a real WebSocket and counts polls', async () => {
    const ws = new WebSocket(`ws://localhost:${TEST_PORTS.live}`);
    const echoed = new Promise<string>((resolve) => {
      ws.addEventListener('message', (e) => {
        const m = JSON.parse(String(e.data));
        if (m.kind === 'echo') resolve(m.text);
      });
    });
    await new Promise((r) => ws.addEventListener('open', r));
    ws.send('hello');
    expect(await echoed).toBe('hello');
    for (let i = 0; i < 5; i++) await fetch(url(TEST_PORTS.live, '/poll?since=-1'));
    const goals = labs.state('live').goals;
    expect(goals.find((g) => g.id === 'connected')?.done).toBe(true);
    expect(goals.find((g) => g.id === 'sent')?.done).toBe(true);
    expect(goals.find((g) => g.id === 'polled')?.done).toBe(true);
    ws.close();
  });

  it('labs refuse a request with a foreign Host header', async () => {
    const app = labs as unknown as { buildHttp(): { request: (p: string, i?: RequestInit) => Promise<Response> } };
    const res = await app.buildHttp().request('/orders', { headers: { host: 'evil.example' } });
    expect(res.status).toBe(403);
  });
});


describe('Stage 1 additions', () => {
  it('orders the course by stage, so Stage 1 comes before Stage 2', () => {
    const stages = content.modules.map((m) => m.stage);
    expect(stages.indexOf('stage-2')).toBeGreaterThan(stages.lastIndexOf('stage-1'));
    expect(content.lessons[0].module).toBe('learning-with-ai');
    expect(content.lessons.at(-1)!.module).toBe('web-request');
  });

  it('can require that a file does NOT contain something, like leftover conflict markers', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'clean.html'), '<h1>Welcome</h1>');
    writeFileSync(join(dir, 'conflict.html'), '<<<<<<< HEAD\n<h1>A</h1>\n=======\n<h1>B</h1>\n>>>>>>> other');
    const check = (path: string) => checkPractice(dir, [{ path, contains: '<h1>', notContains: '<<<<<<<', hint: '' }]).passed;
    expect(check('clean.html')).toBe(true);
    expect(check('conflict.html')).toBe(false);
  });

  it('runs JavaScript exercises: output, declarations, assertions and errors', async () => {
    const { createContext, runInContext } = await import('node:vm');
    const { JS_HARNESS } = await import('../shared/js-harness.ts');
    const run = (code: string, tests: { name: string; code: string }[]) =>
      JSON.parse(runInContext(`${JS_HARNESS}\nJSON.stringify(__gwRunJs(__code, __tests))`, createContext({ __code: code, __tests: tests }), { timeout: 2000 }));
    const good = run('const x = 2;\nfunction double(n) { return n * 2; }\nconsole.log("hi", [1, 2]);', [
      { name: 'reads declarations', code: 'assert(double(x) === 4, "nope")' },
      { name: 'sees output', code: 'assert(__output() === "hi [1,2]", __output())' },
    ]);
    expect(good.error).toBeNull();
    expect(good.tests.every((t: { passed: boolean }) => t.passed)).toBe(true);
    const failing = run('function double(n) { return n + 2; }', [{ name: 'double', code: 'assert(double(5) === 10, "double(5) should be 10")' }]);
    expect(failing.tests[0]).toMatchObject({ passed: false, message: 'double(5) should be 10' });
    const crashing = run('let a = 1;\nnull.x;', [{ name: 'anything', code: 'assert(true)' }]);
    expect(crashing.error).toMatch(/TypeError.*line 2/);
    expect(crashing.tests[0].passed).toBe(false);
  });

  it('serves the JavaScript runner with a policy that blocks all network access', async () => {
    const { JS_WORKER_CSP } = await import('../shared/js-harness.ts');
    expect(JS_WORKER_CSP).toContain("default-src 'none'");
    expect(JS_WORKER_CSP).not.toMatch(/connect-src|'self'/);
  });
});
