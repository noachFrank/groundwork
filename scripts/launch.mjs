// What start.bat runs after making sure Node is present.
import { ensureReady, isRunning, openBrowser, say, startServerProcess } from './lib.mjs';

const prepareOnly = process.argv.includes('--prepare-only');

if (!prepareOnly && (await isRunning())) {
  say();
  say('Groundwork is already running. Opening it in your browser...');
  openBrowser();
  process.exit(0);
}

if (!(await ensureReady())) process.exit(1);
if (prepareOnly) process.exit(0);

const server = startServerProcess();
server.on('exit', (code) => process.exit(code ?? 0));

// Open the browser once the server answers.
const deadline = Date.now() + 60000;
const timer = setInterval(async () => {
  if (await isRunning()) {
    clearInterval(timer);
    openBrowser();
  } else if (Date.now() > deadline) {
    clearInterval(timer);
    say('The app is taking a long time to start. If nothing happens, close this window and try again.');
  }
}, 500);
