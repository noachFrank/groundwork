// What update.bat runs: gets the newest lessons and app code, then re-prepares the app.
// Progress lives outside this folder (see server/paths.ts), so it isn't touched.
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isRunning, ROOT, say } from './lib.mjs';

// Never replaced by an update. Everything else in the app folder comes from the download.
const KEEP = new Set(['.runtime', 'node_modules', 'dist', '.setup-stamp.json', '.git']);

const fail = (...lines) => {
  say();
  lines.forEach((l) => say(l));
  say();
  process.exit(1);
};

say();
say('Updating Groundwork. Your progress is stored separately and will be kept.');
say();

if (await isRunning()) {
  fail('Groundwork is still running.', 'Close the other black Groundwork window, then double-click update.bat again.');
}

if (existsSync(join(ROOT, '.git'))) {
  say('Getting the newest version with Git...');
  const git = spawnSync('git', ['pull', '--ff-only'], { cwd: ROOT, stdio: 'inherit' });
  if (git.status !== 0) fail('Git could not update this folder. Check your internet connection and try again.');
} else {
  const config = JSON.parse(readFileSync(join(ROOT, 'groundwork.config.json'), 'utf8'));
  if (!process.env.GROUNDWORK_UPDATE_ZIP && config.githubRepo.startsWith('YOUR-GITHUB-USERNAME')) {
    fail('The update address has not been set yet.', 'Ask whoever gave you Groundwork to set "githubRepo" in groundwork.config.json.');
  }
  const url = process.env.GROUNDWORK_UPDATE_ZIP ?? `https://github.com/${config.githubRepo}/archive/refs/heads/${config.branch}.zip`;
  say('Downloading the newest version...');
  const work = join(tmpdir(), `groundwork-update-${Date.now()}`);
  mkdirSync(work, { recursive: true });
  try {
    const zip = join(work, 'update.zip');
    if (url.startsWith('http')) {
      let res;
      try {
        res = await fetch(url);
      } catch {
        fail('Could not reach GitHub.', 'Check that you are connected to the internet, then double-click update.bat again.');
      }
      if (!res.ok) {
        fail(`GitHub answered with an error (${res.status}).`, 'If the project is private, you may not be able to update this way. Ask whoever gave you Groundwork.');
      }
      writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
    } else {
      copyFileSync(url, zip);
    }

    const unpack = join(work, 'unpacked');
    mkdirSync(unpack);
    const tar = spawnSync('tar', ['-xf', zip, '-C', unpack], { stdio: 'inherit' });
    if (tar.status !== 0) fail('Could not unpack the update. Please try again.');

    // GitHub zips hold a single folder named like "groundwork-main".
    const top = readdirSync(unpack);
    const source = top.length === 1 ? join(unpack, top[0]) : unpack;
    if (!existsSync(join(source, 'package.json'))) fail('That download does not look like Groundwork.');

    // Replace rather than merge, so lessons removed upstream don't linger.
    for (const name of readdirSync(ROOT)) {
      if (KEEP.has(name) || name === 'update.bat') continue;
      rmSync(join(ROOT, name), { recursive: true, force: true });
    }
    for (const name of readdirSync(source)) {
      if (KEEP.has(name) || name === 'update.bat') continue;
      cpSync(join(source, name), join(ROOT, name), { recursive: true });
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

say('Installing anything new...');
const prepare = spawnSync(process.execPath, [join(ROOT, 'scripts', 'launch.mjs'), '--prepare-only'], { cwd: ROOT, stdio: 'inherit' });
if (prepare.status !== 0) process.exit(1);

say();
say('All done! Double-click your Groundwork shortcut to start studying.');
say();
