import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CONTENT_DIR = join(APP_ROOT, 'content');

/**
 * Progress lives outside the app folder, in the Windows per-computer AppData
 * folder. OneDrive doesn't sync it, and replacing the app folder (for example
 * re-downloading from GitHub) can't delete it.
 */
export function dataDir(): string {
  if (process.env.GROUNDWORK_DATA_DIR) return process.env.GROUNDWORK_DATA_DIR;
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) return join(process.env.LOCALAPPDATA, 'Groundwork');
  return join(homedir(), '.groundwork');
}

/** The one folder "Check my work" is ever allowed to look in. */
export function practiceDir(): string {
  return process.env.GROUNDWORK_PRACTICE_DIR ?? join(homedir(), 'Groundwork-Practice');
}
