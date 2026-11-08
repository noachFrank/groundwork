// `npm run dev`: for working on the app itself. Restarts the server and hot-reloads the page.
import { spawn } from 'node:child_process';
import { ROOT } from './lib.mjs';

const run = (args) => spawn(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });

const server = run(['--disable-warning=ExperimentalWarning', 'node_modules/tsx/dist/cli.mjs', 'watch', 'server/index.ts']);
const vite = run(['node_modules/vite/bin/vite.js']);

const stop = () => {
  server.kill();
  vite.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
