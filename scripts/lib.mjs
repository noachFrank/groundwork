// Runs before any packages are installed, so it may only use Node's built-in modules.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const APP_PORT = 4310;
export const APP_URL = `http://localhost:${APP_PORT}`;
const STAMP = join(ROOT, '.setup-stamp.json');
const NODE_DIR = dirname(process.execPath);

export const say = (text = '') => console.log(text ? `  ${text}` : '');

const childEnv = () => ({
  ...process.env,
  // Lifecycle scripts look for "node" on PATH: make sure they find this private copy.
  PATH: `${NODE_DIR}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
});

function readStamp() {
  try {
    return JSON.parse(readFileSync(STAMP, 'utf8'));
  } catch {
    return {};
  }
}

const sha = (text) => createHash('sha256').update(text).digest('hex');

function lockHash() {
  return sha(readFileSync(join(ROOT, 'package-lock.json')));
}

/** Changes whenever lesson or app source files change, meaning the web app needs rebuilding. */
function sourceHash() {
  const entries = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else entries.push(`${full.slice(ROOT.length)}:${st.size}:${Math.round(st.mtimeMs)}`);
    }
  };
  for (const dir of ['src', 'content', 'shared']) if (existsSync(join(ROOT, dir))) walk(join(ROOT, dir));
  for (const file of ['index.html', 'vite.config.ts']) {
    const st = statSync(join(ROOT, file));
    entries.push(`${file}:${st.size}:${Math.round(st.mtimeMs)}`);
  }
  return sha(entries.sort().join('\n'));
}

function npmCli() {
  const beside = join(NODE_DIR, 'node_modules', 'npm', 'bin', 'npm-cli.js');
  return existsSync(beside) ? beside : null;
}

/** Runs a Node program with no shell in between, so folder names with spaces are safe. */
function runNode(args, { quietNote } = {}) {
  return new Promise((done) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: 'inherit', env: childEnv() });
    const timer = quietNote ? setInterval(() => say(quietNote), 30000) : null;
    child.on('close', (code) => {
      if (timer) clearInterval(timer);
      done(code === 0);
    });
    child.on('error', () => {
      if (timer) clearInterval(timer);
      done(false);
    });
  });
}

async function installPackages() {
  const cli = npmCli();
  const args = ['ci', '--include=dev', '--no-audit', '--no-fund', '--loglevel=error', '--fetch-retries=5', '--fetch-retry-mintimeout=5000', '--fetch-timeout=120000'];
  if (cli) return runNode([cli, ...args], { quietNote: 'Still downloading... this is normal on slower Wi-Fi.' });
  // Developer machines that use a system-wide Node.
  return new Promise((done) => {
    const child = spawn('npm', args, { cwd: ROOT, stdio: 'inherit', shell: true, env: childEnv() });
    child.on('close', (code) => done(code === 0));
  });
}

// Raise this to give everyone the newest kind of shortcut on their next start.
const SHORTCUT_VERSION = 2;

/**
 * Adds a "Groundwork" shortcut, with its own icon, to the Desktop and the Start menu.
 * It runs start.bat through cmd.exe, because Windows won't pin a .bat file to the
 * taskbar, but will pin this. Made once per shortcut version, so deleting it sticks.
 */
export function makeShortcuts() {
  if (process.platform !== 'win32' || process.env.GROUNDWORK_NO_SHORTCUT === '1') return;
  if (readStamp().shortcut === SHORTCUT_VERSION) return;
  const q = (s) => s.replace(/'/g, "''");
  const script = `
    $shell = New-Object -ComObject WScript.Shell;
    $places = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'));
    foreach ($place in $places) {
      if (-not $place) { continue }
      $s = $shell.CreateShortcut((Join-Path $place 'Groundwork.lnk'));
      $s.TargetPath = (Join-Path $env:SystemRoot 'System32\\cmd.exe');
      $s.Arguments = '/c "${q(join(ROOT, 'start.bat'))}"';
      $s.WorkingDirectory = '${q(ROOT)}';
      $s.IconLocation = '${q(join(ROOT, 'scripts', 'groundwork.ico'))},0';
      $s.Description = 'Start Groundwork';
      $s.Save();
    }`;
  const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { stdio: 'ignore' });
  if (result.status === 0) {
    writeFileSync(STAMP, JSON.stringify({ ...readStamp(), shortcut: SHORTCUT_VERSION }));
    say('Added a "Groundwork" shortcut to your Desktop and Start menu.');
    say('To pin it to the taskbar: right-click it, then choose "Pin to taskbar" (on Windows 11, "Show more options" first).');
  }
}

/**
 * Makes sure packages are installed and the web app is built. On a normal start it
 * only compares a couple of hashes and uses no internet at all.
 * Returns false after printing a friendly message if something couldn't be done.
 */
export async function ensureReady() {
  const stamp = readStamp();
  const firstRun = !stamp.installed;
  const lock = lockHash();

  if (!existsSync(join(ROOT, 'node_modules')) || stamp.lock !== lock || !existsSync(join(ROOT, 'node_modules', 'tsx'))) {
    say();
    say(firstRun ? 'Step 2 of 3: downloading the parts the app is built from (about 100 MB).' : 'Downloading updated parts for the app...');
    say('This can take several minutes. Please stay connected to the internet.');
    say();
    const ok = await installPackages();
    if (!ok) {
      say();
      say('The download did not finish.');
      say('Check that you are connected to the internet, then double-click start.bat again.');
      say('Anything already downloaded is kept, so it will go faster next time.');
      return false;
    }
    writeFileSync(STAMP, JSON.stringify({ ...readStamp(), lock, installed: true, builtFrom: null }));
  }

  const current = readStamp();
  const source = sourceHash();
  if (current.builtFrom !== source || !existsSync(join(ROOT, 'dist', 'index.html'))) {
    say();
    say(firstRun ? 'Step 3 of 3: preparing your lessons (about a minute, no internet needed)...' : 'Preparing the latest lessons (about a minute, no internet needed)...');
    say();
    const ok = await runNode([join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--logLevel', 'warn']);
    if (!ok) {
      say();
      say('Preparing the lessons failed. Please send a photo of the messages above to whoever gave you Groundwork.');
      return false;
    }
    writeFileSync(STAMP, JSON.stringify({ ...readStamp(), builtFrom: source }));
  }

  makeShortcuts();
  return true;
}

export async function isRunning() {
  try {
    const res = await fetch(`${APP_URL}/api/health`, { signal: AbortSignal.timeout(1500) });
    return (await res.json()).app === 'groundwork';
  } catch {
    return false;
  }
}

export function openBrowser() {
  if (process.env.GROUNDWORK_NO_BROWSER === '1') return;
  if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', APP_URL], { stdio: 'ignore', detached: true }).unref();
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [APP_URL], { stdio: 'ignore', detached: true }).unref();
}

export function startServerProcess() {
  return spawn(
    process.execPath,
    ['--disable-warning=ExperimentalWarning', '--import', 'tsx', 'server/index.ts'],
    { cwd: ROOT, stdio: 'inherit', env: childEnv() },
  );
}
