import { mkdirSync, readFileSync } from 'node:fs';
import { JS_WORKER_CSP, JS_WORKER_SOURCE } from '../shared/js-harness.ts';
import { join, relative } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { PORTS } from '../shared/ports.ts';
import { createApi } from './app.ts';
import { Connectivity } from './connectivity.ts';
import { loadContent } from './content.ts';
import { dailyBackup, openDatabase } from './db.ts';
import { hostGuard } from './guard.ts';
import { Labs } from './labs/index.ts';
import { APP_ROOT, CONTENT_DIR, dataDir, practiceDir } from './paths.ts';
import { Store } from './store.ts';

const version = JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8')).version as string;
const data = dataDir();
const backups = join(data, 'backups');
mkdirSync(backups, { recursive: true });

const practice = practiceDir();
mkdirSync(practice, { recursive: true });

const db = openDatabase(join(data, 'progress.db'), backups);
dailyBackup(db, backups);

const content = loadContent(CONTENT_DIR);
const store = new Store(db, content);
const labs = new Labs();
const connectivity = new Connectivity();

const L = (p: number) => `http://localhost:${p}`;
/**
 * This is what enforces "nothing loads from outside": the browser refuses anything
 * not listed here. The only outside address is the YouTube player, used when online.
 */
const CSP = [
  `default-src 'self'`,
  `script-src 'self' 'wasm-unsafe-eval'`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data:`,
  `font-src 'self' data:`,
  `worker-src 'self' blob:`,
  `connect-src 'self' ${L(PORTS.corsApi)} ${L(PORTS.http)} ${L(PORTS.live)} ws://localhost:${PORTS.live}`,
  `frame-src ${L(PORTS.site)} https://www.youtube-nocookie.com`,
  `object-src 'none'`,
  `base-uri 'self'`,
].join('; ');

const app = new Hono();
app.use(hostGuard);
app.use(async (c, next) => {
  await next();
  // The JavaScript exercise runner sets its own, stricter policy.
  if (!c.res.headers.has('Content-Security-Policy')) c.header('Content-Security-Policy', CSP);
  // YouTube's "Error 153" comes from a missing referrer, so the origin must be sent.
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-Content-Type-Options', 'nosniff');
});
app.route('/api', createApi({ store, content, connectivity, labs, practicePath: practice, dataPath: data, version }));

// Pyodide and sql.js come straight from the installed packages, so they work offline.
const relRoot = (p: string) => relative(process.cwd(), p).replace(/\\/g, '/') || '.';
const vendor = (prefix: string, folder: string) =>
  app.use(
    `${prefix}/*`,
    serveStatic({ root: relRoot(join(APP_ROOT, folder)), rewriteRequestPath: (p) => p.slice(prefix.length) }),
  );
vendor('/vendor/pyodide', 'node_modules/pyodide');
vendor('/vendor/sql.js', 'node_modules/sql.js/dist');

app.get('/js-runner.js', (c) => {
  c.header('Content-Type', 'text/javascript; charset=utf-8');
  c.header('Content-Security-Policy', JS_WORKER_CSP);
  c.header('Cache-Control', 'no-store');
  return c.body(JS_WORKER_SOURCE);
});

const distRoot = relRoot(join(APP_ROOT, 'dist'));
app.use('/*', serveStatic({ root: distRoot }));
// Any other address is a page inside the app (like /lessons/dns), so send the app itself.
app.get('*', serveStatic({ root: distRoot, path: 'index.html' }));

labs.start();

const server = serve({ fetch: app.fetch, port: PORTS.app, hostname: '127.0.0.1' }, () => {
  console.log(`\n  Groundwork is running at ${L(PORTS.app)}`);
  console.log('\n  Keep this window open while you study. Close it when you are done.\n');
});

server.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORTS.app} is already being used by another program. Restarting your computer usually clears this.\n`);
  } else {
    console.error(e);
  }
  process.exit(1);
});

const shutdown = () => {
  void labs.stop();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
