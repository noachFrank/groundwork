import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'yaml';
import { sortModules } from '../shared/plan.ts';
import type { Content, Curriculum, Lesson, Module, Task } from '../shared/types.ts';

function readFrontmatter(file: string): Record<string, any> {
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error(`${file} has no frontmatter`);
  try {
    return parse(match[1]);
  } catch (e) {
    throw new Error(`${file}: ${e instanceof Error ? e.message : e}`);
  }
}

/** Reads the course from disk. Lesson text itself is compiled into the web app at build time. */
export function loadContent(contentDir: string): Content {
  const curriculum = parse(readFileSync(join(contentDir, 'curriculum.yaml'), 'utf8')) as Curriculum;
  const modules: Module[] = [];
  const lessons: Lesson[] = [];

  for (const name of readdirSync(contentDir)) {
    const dir = join(contentDir, name);
    if (!statSync(dir).isDirectory() || !existsSync(join(dir, 'module.yaml'))) continue;
    const mod = parse(readFileSync(join(dir, 'module.yaml'), 'utf8')) as Module;
    modules.push(mod);
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.mdx')).sort()) {
      const data = readFrontmatter(join(dir, file));
      lessons.push({
        prerequisites: [],
        docs: [],
        videos: [],
        recallPassPercent: 70,
        connectivity: 'offline',
        ...data,
        tasks: (data.tasks ?? []).map((t: Partial<Task>) => ({ ...t, connectivity: t.connectivity ?? 'offline', required: t.required ?? true })),
        module: mod.id,
        file: relative(contentDir, join(dir, file)).replace(/\\/g, '/'),
      } as unknown as Lesson);
    }
  }

  const sorted = sortModules(modules, curriculum);
  const moduleOrder = new Map(sorted.map((m, i) => [m.id, i]));
  lessons.sort((a, b) => (moduleOrder.get(a.module) ?? 0) - (moduleOrder.get(b.module) ?? 0) || a.order - b.order);
  return { curriculum, modules: sorted, lessons };
}
