// `npm run e2e`. Drives a real browser through the app against a running copy.
//   node scripts/e2e.mjs [--offline] [--screenshots=<folder>]
//
// Start the app first. For the offline run, start it with GROUNDWORK_FORCE_OFFLINE=1 too.
// Any request to an outside address is recorded and blocked, and fails the run.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { parse } from 'yaml';

const APP = 'http://localhost:4310';
const offline = process.argv.includes('--offline');
const shots = process.argv.find((a) => a.startsWith('--screenshots='))?.split('=')[1];
if (shots) mkdirSync(shots, { recursive: true });

const browserPath = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(existsSync);

// Outside addresses fail to resolve, so nothing outside can load. This is done with a
// browser flag, not request interception: interception would answer CORS preflights
// itself and hide the browser's real behavior from the CORS lesson.
const browser = await chromium.launch({
  executablePath: browserPath,
  headless: true,
  args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
const page = await context.newPage();

const outside = [];
const consoleErrors = [];
const isOutside = (href) => {
  const url = new URL(href);
  return !['localhost', '127.0.0.1'].includes(url.hostname) && !['data:', 'blob:'].includes(url.protocol);
};
context.on('request', (req) => {
  if (isOutside(req.url())) outside.push(req.url());
});
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

let step = 0;
const ok = (msg) => console.log(`  ok   ${msg}`);
const shot = async (name) => {
  if (shots) await page.screenshot({ path: join(shots, `${String(++step).padStart(2, '0')}-${name}.png`), fullPage: true });
};
const lessonFile = (folder, name) => {
  const text = readFileSync(join('content', folder, name), 'utf8').replace(/\r\n/g, '\n');
  return parse(text.match(/^---\n([\s\S]*?)\n---\n/)[1]);
};
// Course order: Stage 1's modules, then Stage 2's.
const MODULES = ['learning-with-ai', 'computers', 'git', 'reading-code', 'web-request', 'networks', 'apis', 'connecting-services'];
const lessons = MODULES.flatMap((folder) =>
  readdirSync(join('content', folder)).filter((f) => f.endsWith('.mdx')).sort().map((f) => lessonFile(folder, f)),
);
const lessonById = Object.fromEntries(lessons.map((l) => [l.id, l]));
const practice = process.env.GROUNDWORK_PRACTICE_DIR ?? join(homedir(), 'Groundwork-Practice');

const task = (id) => page.locator(`[data-task="${id}"]`);
const passed = (id) => task(id).locator('.tag-done').waitFor({ timeout: 45000 });
const step_ = (name) => page.getByRole('list', { name: 'Lesson steps' }).getByRole('button', { name }).click();

async function typeInEditor(locator, text) {
  await locator.locator('.cm-content').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  await page.keyboard.press('Control+V');
}

async function predict(lesson) {
  await page.goto(`${APP}/lessons/${lesson.id}`);
  await page.getByRole('heading', { name: 'Take a guess first' }).waitFor();
  await page.locator('.option').nth(0).click();
  await page.getByRole('button', { name: 'Lock in my guess' }).click();
  await page.getByRole('button', { name: /Continue to Learn/ }).click();
  await page.getByRole('button', { name: /Continue to Do/ }).waitFor();
}

async function recall(lesson) {
  await step_(/Recall/);
  for (const [i, q] of lesson.recall.entries()) {
    const block = page.locator('.question-block').nth(i);
    if (q.type === 'mcq') await block.locator('.option').nth(q.answer).click();
    if (q.type === 'short') await block.locator('input').fill(q.answerText);
    if (q.type === 'self') {
      await block.locator('textarea').fill('My honest answer from memory.');
      await block.getByRole('button', { name: /Compare with a model answer/ }).click();
      await block.getByRole('button', { name: 'Yes' }).click();
    }
  }
  await page.getByRole('button', { name: 'Check my answers' }).click();
  await page.getByRole('button', { name: /See your review schedule/ }).click();
  await page.getByRole('heading', { name: 'Lesson complete' }).waitFor();
}

// Like a learner at a terminal: an error message is still output to read, not a crash.
// Git gets its own settings file, so the run never touches this computer's Git setup.
const gitConfig = join(tmpdir(), `groundwork-e2e-gitconfig-${process.pid}`);
function ps(command) {
  try {
    return execFileSync('powershell', ['-NoProfile', '-Command', command], {
      encoding: 'utf8',
      cwd: practice,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_CONFIG_GLOBAL: gitConfig },
      timeout: 300000,
    });
  } catch (e) {
    return `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
}

const about = await (await fetch(`${APP}/api/about`)).json();

/**
 * Runs a terminal mission's own commands, as a learner would paste them, in one
 * PowerShell window. Steps that need a person (Notepad, a second window) are
 * swapped for what the person would do.
 */
// What a learner types into orders.js in the Stage 2 milestone, written by a small script
// because PowerShell would mangle the quotes.
const ordersFixer = join(tmpdir(), `groundwork-e2e-fix-orders-${process.pid}.cjs`);
writeFileSync(
  ordersFixer,
  `const fs = require("fs");
const done = ${JSON.stringify(`async function notifyBoard(order) {
  try {
    await fetch(BOARD_EVENTS, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "order.created", order: order }) });
  } catch (error) {
    console.log("Couldn't reach the board:", error.message);
  }
}`)};
const s = fs.readFileSync("orders.js", "utf8");
fs.writeFileSync("orders.js", s.replace(/async function notifyBoard\\(order\\) \\{[\\s\\S]*?\\n\\}/, done));
`,
);

function runTerminalTask(lessonId, t) {
  const lines = ['$started = @()'];
  for (const s of t.steps) {
    if (!s.command) continue;
    let c = s.command.replaceAll('{{nodeDir}}', about.nodeDir).replaceAll('$HOME\\Groundwork-Practice', practice);
    if (/^(explorer \.|cls|Get-Help )/.test(c)) continue;
    if (c === 'notepad index.html' && lessonId === 'conflicts') {
      c = `Set-Content index.html '<h1>Welcome to my homepage</h1>', '<p>Made by me.</p>', '<a href="about.html">About</a>'`;
    }
    if (c === 'notepad orders.js' && lessonId === 'milestone-live-app') c = `node "${ordersFixer}"`;
    if (c === 'npm.cmd run dev') {
      c = "$dev = Start-Process npm.cmd -ArgumentList 'run', 'dev' -PassThru -WindowStyle Hidden; Start-Sleep 4";
    }
    // A server that keeps its window busy runs in the background, as if in another window.
    c = c.replace(/(^|; )node (\w+\.js)$/, (_m, pre, file) => `${pre}$started += Start-Process node -ArgumentList '${file}' -PassThru -WindowStyle Hidden; Start-Sleep 2`);
    // Opening a page in the browser: connect to its live stream the way the page would.
    if (c === 'Start-Process http://localhost:4397') {
      c = "Start-Process curl.exe -ArgumentList '-s','-N','--max-time','4','-o','NUL','http://localhost:4397/stream' -WindowStyle Hidden; Start-Sleep 1";
    }
    if (c.startsWith('Start-Process ping')) c += '; Start-Sleep 1';
    lines.push(c);
  }
  if (t.id === 'own-server') lines.push('taskkill /PID $dev.Id /T /F | Out-Null');
  lines.push('Start-Sleep 1; $started | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }');
  return ps(lines.join('\n'));
}

const bestChoices = async (el, def) => {
  for (const [i, q] of def.questions.entries()) {
    const best = q.choices.findIndex((x) => x.score === Math.max(...q.choices.map((y) => y.score)));
    await el.locator('.question-block').nth(i).locator('.option').nth(best).click();
  }
};

/** Stage 1 lessons are driven straight from their lesson files, task by task. */
async function genericDo(lesson) {
  for (const t of lesson.tasks) {
    const el = task(t.id);
    const internetOnly = t.connectivity === 'needs-internet';
    if (internetOnly && (offline || lesson.id === 'publish-a-page')) {
      if (offline) await el.getByText("You're offline").first().waitFor();
      // Later Git lessons build on the first one's repository, and Git itself is
      // installed here, so its commands still run, as they would once online.
      if (t.type === 'terminal' && lesson.id === 'first-commits') runTerminalTask(lesson.id, t);
      continue;
    }
    switch (t.type) {
      case 'terminal': {
        if ((await el.getByText('{{nodeDir}}').count()) > 0) throw new Error(`${t.id}: {{nodeDir}} was not filled in`);
        runTerminalTask(lesson.id, t);
        await el.getByRole('button', { name: 'Check my work' }).click();
        break;
      }
      case 'case':
        await bestChoices(el, t);
        await el.getByRole('button', { name: /Submit/ }).click();
        break;
      case 'flaw':
        await el.locator('.code-line').nth(t.flawLines[0] - 1).click();
        break;
      case 'architecture':
        // Lay the design out exactly as the model answer does.
        for (const [part, zone] of Object.entries(t.model.placements)) {
          const partLabel = t.parts.find((p) => p.id === part).label;
          await el.locator('.palette').getByRole('button', { name: partLabel, exact: true }).click();
          await el.locator('.zone').nth(t.zones.findIndex((z) => z.id === zone)).locator('strong').click();
        }
        await el.getByRole('button', { name: 'Check my design' }).click();
        break;
      case 'explain':
        await el.getByLabel('Your explanation').fill(t.modelAnswer);
        await el.getByRole('button', { name: /I'm done/ }).click();
        for (const box of await el.locator('input[type=checkbox]').all()) await box.check();
        await el.getByRole('button', { name: /Submit my score/ }).click();
        break;
      case 'python':
      case 'javascript': {
        await page.waitForFunction((id) => {
          const b = [...document.querySelectorAll(`[data-task="${id}"] button`)].find((x) => x.textContent === 'Run and check');
          return b && !b.disabled;
        }, t.id, { timeout: 90000 });
        await typeInEditor(el, t.solution);
        await el.getByRole('button', { name: 'Run and check' }).click();
        break;
      }
      default:
        throw new Error(`no driver for ${t.type}`);
    }
    try {
      await passed(t.id);
    } catch {
      const text = await el.innerText().catch(() => '');
      throw new Error(`${lesson.id}/${t.id} did not pass. Task shows:\n${text.slice(-1500)}`);
    }
  }
  ok(`${lesson.tasks.length} task(s) done`);
}

const dos = {
  async 'javascript-basics'() {
    const el = task('shipping-js');
    await el.getByRole('button', { name: 'Run and check' }).click();
    await el.locator('.test-list .no').first().waitFor({ timeout: 15000 });
    ok('JavaScript runs in the browser, and the starter code fails its hidden tests');
    await typeInEditor(el, 'while (true) {}');
    await el.getByRole('button', { name: 'Run and check' }).click();
    await el.getByText(/ran for more than 5 seconds/).waitFor({ timeout: 15000 });
    ok('a JavaScript infinite loop gets stopped, and the page stays alive');
    await typeInEditor(el, 'const r = new XMLHttpRequest(); r.open("GET", "http://localhost:4314/hello", false); r.send();');
    await el.getByRole('button', { name: 'Run and check' }).click();
    await el.locator('.output.has-error').waitFor({ timeout: 15000 });
    ok('the JavaScript runner cannot reach the network');
    await genericDo(lessonById['javascript-basics']);
  },
  async 'the-trip'() {
    await page.locator('.next-card').waitFor();
    await task('first-request').getByRole('button', { name: 'Check my work' }).click();
    await task('first-request').getByText('Not yet.').waitFor();
    ok('"Check my work" says not yet with an empty folder');
    await shot('terminal-mission-not-yet');
    // The real commands from the lesson, run in a real PowerShell.
    for (const s of lessonById['the-trip'].tasks[0].steps) {
      if (!s.command || s.command.startsWith('cd ')) continue;
      ps(s.command);
    }
    await task('first-request').getByRole('button', { name: 'Check my work' }).click();
    await passed('first-request');
    ok('terminal mission passes after running the lesson\'s real commands');
  },
  async 'addresses-and-ports'() {
    ps('curl.exe -s http://localhost:4311/whoami; curl.exe -s http://localhost:4314/whoami');
    await passed('two-services');
    ok('the ports lab saw both requests');
  },
  async dns() {
    const lookup = (name) => ps(`nslookup ${name} 127.0.0.1 2>&1`);
    const first = lookup('shop.groundwork.test');
    if (!first.includes('10.0.0.42')) throw new Error(`nslookup didn't get the answer:\n${first}`);
    ok('Windows nslookup got a real answer from the practice DNS server');
    lookup('nothing.groundwork.test');
    await task('run-dns').getByLabel(/Move/).fill('10.0.0.99');
    await task('run-dns').getByRole('button', { name: 'Update record' }).click();
    await task('run-dns').getByRole('cell', { name: '10.0.0.99' }).waitFor();
    const second = lookup('shop.groundwork.test');
    if (!second.includes('10.0.0.99')) throw new Error(`nslookup didn't see the change:\n${second}`);
    await passed('run-dns');
    ok('the DNS record change shows up in a real lookup');
    await shot('dns-lab');
    const ex = task('explain-dns');
    await ex.getByLabel('Your explanation').fill('DNS is like the phone book of the internet. Nothing is broken; saved copies just take a while to expire.');
    await ex.getByRole('button', { name: /I'm done/ }).click();
    for (const box of await ex.locator('input[type=checkbox]').all()) await box.check();
    await ex.getByRole('button', { name: /Submit my score/ }).click();
    await passed('explain-dns');
    ok('explain-it-back passes on self-score');
    if (offline) {
      await task('real-dns').getByText("You're offline").waitFor();
      ok('offline: the real-DNS bonus task says to connect to the internet');
      await shot('offline-gate');
    }
  },
  async http() {
    const lab = task('status-codes');
    const send = async (label) => {
      await lab.getByRole('button', { name: label, exact: true }).click();
      await lab.getByRole('button', { name: 'Send', exact: true }).click();
    };
    await send('List orders');
    await lab.locator('.status-2').waitFor();
    await send('Order 999');
    await lab.locator('.status-4').waitFor();
    await send('New order, no key');
    await lab.getByText('HTTP 401').waitFor();
    await send('New order, with key');
    await lab.getByText('HTTP 201').waitFor();
    await passed('status-codes');
    ok('all four status codes earned from real requests');
    const py = task('parse-status');
    await py.getByRole('button', { name: 'Run and check' }).waitFor({ timeout: 60000 });
    await py.getByRole('button', { name: 'Run and check' }).click();
    await py.locator('.test-list .no').first().waitFor({ timeout: 30000 });
    ok('Python runs in the browser, and the starter code fails its hidden tests');
    await typeInEditor(py, 'while True:\n    pass\n');
    await py.getByRole('button', { name: 'Run and check' }).click();
    await py.getByText(/ran for more than 15 seconds/).waitFor({ timeout: 25000 });
    ok('an infinite loop gets stopped, and the page stays alive');
    await py.getByRole('button', { name: 'Run and check' }).waitFor({ timeout: 60000 });
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll('[data-task="parse-status"] button')].find((x) => x.textContent === 'Run and check');
      return b && !b.disabled;
    }, null, { timeout: 60000 });
    await typeInEditor(py, 'def status_code(line):\n    return int(line.split()[1])\n\ndef is_error(code):\n    return code >= 400\n');
    await py.getByRole('button', { name: 'Run and check' }).click();
    await passed('parse-status');
    ok('Python solution passes the hidden tests');
    await shot('python-task');
  },
  async https() {
    const t = task('spot-verify-false');
    await t.locator('.code-line').nth(2).click();
    await t.getByText('That line is fine.').waitFor();
    await t.locator('.code-line').nth(8).click();
    await passed('spot-verify-false');
    ok('find-the-flaw explains wrong picks and accepts the right line');
    await shot('find-the-flaw');
  },
  async apis() {
    const py = task('call-api');
    const solution = lessonById.apis.tasks.find((t) => t.id === 'call-api').solution;
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll('[data-task="call-api"] button')].find((x) => x.textContent === 'Run and check');
      return b && !b.disabled;
    }, null, { timeout: 60000 });
    await typeInEditor(py, solution);
    await py.getByRole('button', { name: 'Run and check' }).click();
    await passed('call-api');
    ok('Python `requests` calls the local practice API with no internet');
    const sq = task('join-sql');
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll('[data-task="join-sql"] button')].find((x) => x.textContent === 'Run and check');
      return b && !b.disabled;
    }, null, { timeout: 30000 });
    await sq.getByRole('button', { name: 'Run and check' }).click();
    await sq.getByText('Not yet.').waitFor();
    ok('SQL: the starter query is compared and rejected');
    await typeInEditor(sq, lessonById.apis.tasks.find((t) => t.id === 'join-sql').wrong);
    await sq.getByRole('button', { name: 'Run and check' }).click();
    await sq.locator('tbody tr').nth(4).waitFor();
    await sq.getByText('Not yet.').waitFor();
    await typeInEditor(sq, lessonById.apis.tasks.find((t) => t.id === 'join-sql').solution);
    await sq.getByRole('button', { name: 'Run and check' }).click();
    await passed('join-sql');
    ok('SQL solution passes against the expected result');
    await shot('sql-task');
  },
  async cors() {
    const lab = task('cors-lab');
    const site = lab.frameLocator('iframe.lab-frame');
    await site.getByRole('button', { name: 'Fetch the data' }).click();
    await site.getByText('Blocked by the browser.').waitFor();
    ok('REAL CORS failure: the browser blocked it');
    await lab.getByText(/Sent 200 OK with no CORS header/).first().waitFor();
    ok('and the API\'s own log shows it answered 200 OK');
    await shot('cors-blocked');
    await lab.getByLabel(/Value of the/).fill('*');
    await lab.getByRole('button', { name: 'Save' }).click();
    await lab.getByText('Now sending:').locator('code').filter({ hasText: '*' }).waitFor();
    await site.getByRole('button', { name: 'Fetch the data' }).click();
    await site.getByText(/Allowed/).waitFor();
    await lab.getByText(/allows any website/).waitFor();
    ok('a wildcard works, but the lab says it\'s too broad and doesn\'t pass it');
    await lab.getByLabel(/Value of the/).fill('http://localhost:4311');
    await lab.getByRole('button', { name: 'Save' }).click();
    await lab.getByText('Now sending:').locator('code').filter({ hasText: '4311' }).waitFor();
    await site.getByRole('button', { name: /Send JSON/ }).click();
    await site.getByText(/Allowed/).waitFor();
    await lab.getByText(/preflight/).first().waitFor();
    ok('a real preflight request was seen');
    await site.getByRole('button', { name: 'Fetch the data' }).click();
    await passed('cors-lab');
    ok('REAL CORS fix: the exact origin passes');
    await shot('cors-fixed');
    await task('spot-cors-flaw').locator('.code-line').nth(5).click();
    await passed('spot-cors-flaw');
    const c = task('cors-case');
    const def = lessonById.cors.tasks.find((t) => t.id === 'cors-case');
    for (const [i, q] of def.questions.entries()) {
      const best = q.choices.findIndex((x) => x.score === Math.max(...q.choices.map((y) => y.score)));
      await c.locator('.question-block').nth(i).locator('.option').nth(best).click();
    }
    await c.getByRole('button', { name: /Submit my recommendations/ }).click();
    await passed('cors-case');
    ok('consultant case scores and passes');
  },
  async 'live-updates'() {
    const lab = task('live-lab');
    await lab.getByRole('button', { name: 'Connect', exact: true }).click();
    await lab.getByText(/Connected\. The connection stays open/).waitFor();
    ok('REAL WebSocket connection opened');
    await lab.getByRole('button', { name: 'Send', exact: true }).click();
    await lab.getByText(/Server replied: "hello server"/).waitFor();
    await lab.getByRole('button', { name: 'Start polling' }).click();
    await passed('live-lab');
    ok('pushes, a two-way message and polling all seen by the lab server');
    await shot('live-lab');
    await lab.getByRole('button', { name: 'Stop polling' }).click();
    const c = task('choose-wisely');
    const def = lessonById['live-updates'].tasks.find((t) => t.id === 'choose-wisely');
    for (const [i, q] of def.questions.entries()) {
      const best = q.choices.findIndex((x) => x.score === Math.max(...q.choices.map((y) => y.score)));
      await c.locator('.question-block').nth(i).locator('.option').nth(best).click();
    }
    await c.getByRole('button', { name: /Submit my recommendations/ }).click();
    await passed('choose-wisely');
    const a = task('tracker-design');
    await a.getByRole('button', { name: 'Check my design' }).click();
    await a.getByText(/Not yet\. This design/).waitFor();
    const place = async (part, zone) => {
      await a.locator('.palette').getByRole('button', { name: part, exact: true }).click();
      await a.locator('.zone').filter({ hasText: zone }).click();
    };
    await place('Customer web page', "Customer's phone");
    await place('API server', 'Your servers');
    await place('WebSocket server', 'Your servers');
    await place('Database', 'Storage');
    await a.getByRole('button', { name: 'Check my design' }).click();
    await passed('tracker-design');
    await a.getByRole('button', { name: /Compare with the model answer/ }).click();
    await a.getByText('Model answer:').waitFor();
    ok('architecture builder checks the design, then compares with a model answer');
    await shot('architecture');
  },
};

try {
  // First run: the welcome screen builds a plan.
  await page.goto(`${APP}/today`);
  await page.getByRole('heading', { name: 'Welcome to Groundwork' }).waitFor();
  await page.waitForTimeout(800);
  await shot('welcome');
  if (offline) {
    await page.locator('.pill-off').waitFor({ timeout: 10000 });
    ok('offline: the app says "Offline"');
  }
  await page.getByRole('button', { name: 'Build my plan' }).click();
  await page.getByRole('heading', { name: 'Today', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'AI as a tutor, not a ghostwriter' }).waitFor();
  ok('a plan is built and Today suggests the first Stage 1 lesson');
  await shot('today');

  for (const lesson of lessons) {
    console.log(`Lesson: ${lesson.title}`);
    await predict(lesson);
    if (lesson.id === 'the-trip') {
      await shot('lesson-learn');
      await page.getByRole('button', { name: 'Next →' }).click();
      await page.getByText('Ask for the address').waitFor();
      ok('step-through visualization works');
      if (offline) {
        await page.getByText("You're offline").first().waitFor();
        await page.locator('iframe').waitFor({ state: 'detached', timeout: 1000 }).catch(() => {});
        ok('offline: the video says to connect, and doesn\'t try to load');
        await page.getByText('needs internet').first().waitFor();
        ok('offline: outside links are labeled');
      }
    }
    await page.getByRole('button', { name: /Continue to Do/ }).click();
    await (dos[lesson.id] ?? genericDo)(lesson);
    if (lesson.id === 'publish-a-page' || (offline && lesson.connectivity === 'needs-internet')) {
      ok('left for later: it needs the internet');
      continue;
    }
    await recall(lesson);
    ok('lesson complete');
  }

  // Lessons that need the internet can't be finished in the offline run, and the
  // GitHub Pages milestone needs a real GitHub account in either run.
  await page.goto(`${APP}/today`);
  const leftTitle = offline ? 'Installing Python by hand' : 'Milestone: put your page on the internet';
  await page.getByRole('heading', { name: leftTitle }).waitFor();
  await shot('today-end');
  ok(`Today offers what's left: "${leftTitle}"`);
  for (const [path, name] of [['plan', 'plan'], ['course', 'course'], ['progress', 'progress'], ['settings', 'settings'], ['visualizations', 'visualizations']]) {
    await page.goto(`${APP}/${path}`);
    await page.locator('h1').waitFor();
    await page.waitForTimeout(500);
    await shot(name);
  }
  ok('all other pages open');

  // Phone width: no sideways page scroll.
  await page.setViewportSize({ width: 390, height: 800 });
  for (const path of ['today', 'lessons/cors', 'plan', 'course', 'course/computers', 'lessons', 'progress', 'settings', 'visualizations']) {
    await page.goto(`${APP}/${path}`);
    await page.locator('h1').waitFor();
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) throw new Error(`/${path} scrolls sideways by ${overflow}px at phone width`);
  }
  ok('no sideways scrolling at phone width');

  // The JavaScript runner's blocked request (tested on purpose) is expected too.
  const unexpectedErrors = consoleErrors.filter((e) => !/CORS|Access-Control|Failed to load resource|ERR_FAILED|directive: "default-src 'none'"/i.test(e));
  if (unexpectedErrors.length) {
    console.error('Browser errors:\n' + unexpectedErrors.join('\n'));
    process.exitCode = 1;
  } else ok('no unexpected browser errors');

  if (outside.length) {
    console.error('Requests to outside addresses:\n' + outside.join('\n'));
    process.exitCode = 1;
  } else ok('nothing tried to load from outside this computer');
} catch (e) {
  await page.screenshot({ path: join(shots ?? '.', 'e2e-failure.png'), fullPage: true }).catch(() => {});
  console.error('\nFAILED:', e);
  console.error('Browser errors so far:\n' + consoleErrors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
