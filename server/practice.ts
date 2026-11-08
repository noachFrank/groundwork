import { lstatSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import type { PracticeCheck } from '../shared/types.ts';

const MAX_READ = 1024 * 1024;

export interface PracticeResult {
  passed: boolean;
  checks: { path: string; ok: boolean; hint: string }[];
}

const inside = (dir: string, target: string) => {
  const rel = relative(dir, target);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
};

/** PowerShell's `>` writes UTF-16, so a learner's file may not be plain UTF-8. */
function decode(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  return buf.toString('utf8');
}

/**
 * "Check my work". It only ever reads files inside the practice folder and never
 * runs anything. A shortcut (symlink) pointing elsewhere counts as a missing file.
 */
export function checkPractice(dir: string, checks: PracticeCheck[]): PracticeResult {
  mkdirSync(dir, { recursive: true });
  const root = realpathSync(dir);
  const results = checks.map((c) => {
    const target = resolve(root, c.path);
    const fail = { path: c.path, ok: false, hint: c.hint };
    try {
      if (!inside(root, target) || !inside(root, realpathSync(target))) return fail;
      const stat = lstatSync(target);
      if (stat.isSymbolicLink()) return fail;
      if (c.contains === undefined && c.notContains === undefined) return { path: c.path, ok: true, hint: '' };
      if (!stat.isFile() || stat.size > MAX_READ) return fail;
      const text = decode(readFileSync(target)).toLowerCase();
      if (c.contains !== undefined && !text.includes(c.contains.toLowerCase())) return fail;
      if (c.notContains !== undefined && text.includes(c.notContains.toLowerCase())) return fail;
      return { path: c.path, ok: true, hint: '' };
    } catch {
      return fail;
    }
  });
  return { passed: results.every((r) => r.ok), checks: results };
}
