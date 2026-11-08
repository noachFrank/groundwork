import { execFile } from 'node:child_process';
import type { ToolStatus } from '../shared/types.ts';

/** Tools some lessons ask the learner to install. Nothing here is needed to run the app. */
const TOOLS = [
  {
    id: 'git',
    name: 'Git',
    args: ['--version'],
    neededFor: 'The Git and GitHub lessons. The first one walks you through installing it',
    downloadSize: 'about 70 MB',
    downloadUrl: 'https://git-scm.com/download/win',
  },
  {
    id: 'python',
    name: 'Python',
    args: ['--version'],
    neededFor: 'Installing Python yourself, in "How computers run software". In-app Python exercises don\'t need it',
    downloadSize: 'about 30 MB',
    downloadUrl: 'https://www.python.org/downloads/windows/',
  },
  {
    id: 'docker',
    name: 'Docker Desktop',
    args: ['--version'],
    neededFor: 'The Deployment lessons and OWASP Juice Shop',
    downloadSize: 'about 600 MB, more once running. Use good Wi-Fi',
    downloadUrl: 'https://docs.docker.com/desktop/setup/install/windows-install/',
  },
];

const versionOf = (cmd: string, args: string[]) =>
  new Promise<string | null>((resolve) => {
    // A fixed list of "--version" calls with no shell: nothing the learner types is ever run.
    execFile(cmd, args, { timeout: 4000, windowsHide: true }, (err, stdout) => {
      resolve(err ? null : stdout.toString().trim().split('\n')[0] || null);
    });
  });

export async function toolStatuses(): Promise<ToolStatus[]> {
  return Promise.all(
    TOOLS.map(async (t) => {
      const version = await versionOf(t.id, t.args);
      return {
        id: t.id,
        name: t.name,
        installed: version !== null,
        version,
        neededFor: t.neededFor,
        downloadSize: t.downloadSize,
        downloadUrl: t.downloadUrl,
      };
    }),
  );
}
