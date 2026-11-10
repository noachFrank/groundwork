import type { ArchitectureTask, Content, Lesson, Question, Task } from './types.ts';

function checkQuestion(q: Question, where: string, errors: string[]) {
  if (!q.id) errors.push(`${where}: question has no id`);
  if (!q.prompt) errors.push(`${where}: question has no prompt`);
  if (q.type === 'mcq') {
    if (!Array.isArray(q.options) || q.options.length < 2) errors.push(`${where}: needs at least 2 options`);
    else if (!(q.answer >= 0 && q.answer < q.options.length)) errors.push(`${where}: answer index out of range`);
    // YAML turns bare True, 42 or null into non-text values, so quote them.
    for (const o of q.options ?? []) if (typeof o !== 'string') errors.push(`${where}: option ${JSON.stringify(o)} must be text (put it in quotes)`);
    if (!q.why) errors.push(`${where}: multiple-choice question needs a "why"`);
  } else if (q.type === 'short') {
    if (!q.accept?.length) errors.push(`${where}: short answer needs accepted patterns`);
    for (const p of q.accept ?? []) {
      try {
        new RegExp(p);
      } catch {
        errors.push(`${where}: bad pattern ${p}`);
      }
    }
    if (typeof q.answerText !== 'string' || !q.answerText) errors.push(`${where}: short answer needs answerText as text`);
  } else if (q.type === 'self') {
    if (!q.modelAnswer) errors.push(`${where}: self-scored question needs a modelAnswer`);
  } else {
    errors.push(`${where}: unknown question type`);
  }
}

export function architectureFailures(task: ArchitectureTask, placements: Record<string, string>): string[] {
  return task.checklist
    .filter((c) => {
      const allOk = (c.all ?? []).every((a) => placements[a.part] === a.zone);
      const noneOk = (c.none ?? []).every((p) => !placements[p]);
      return !(allOk && noneOk);
    })
    .map((c) => c.text);
}

function checkTask(t: Task, where: string, errors: string[]) {
  if (!t.id || !t.title || !t.instructions) errors.push(`${where}: task needs id, title and instructions`);
  if (t.connectivity !== 'offline' && t.connectivity !== 'needs-internet') errors.push(`${where}: bad connectivity`);
  if (typeof t.required !== 'boolean') errors.push(`${where}: "required" must be true or false`);
  switch (t.type) {
    case 'terminal':
      if (!t.steps?.length || !t.checks?.length) errors.push(`${where}: terminal task needs steps and checks`);
      for (const c of t.checks ?? []) {
        if (c.path.includes('..') || /^[a-z]:|^[\\/]/i.test(c.path)) errors.push(`${where}: check path must stay in the practice folder`);
      }
      break;
    case 'lab':
      if (!['ports', 'http', 'cors', 'dns', 'real-dns', 'live'].includes(t.lab)) errors.push(`${where}: unknown lab ${t.lab}`);
      break;
    case 'python':
    case 'javascript':
      if (!t.tests?.length || !t.solution || !t.wrong) errors.push(`${where}: ${t.type} task needs tests, solution and wrong`);
      break;
    case 'sql':
      if (!t.dataset || !t.solution || !t.wrong) errors.push(`${where}: sql task needs dataset, solution and wrong`);
      break;
    case 'flaw': {
      const count = t.code.split('\n').length;
      if (!t.flawLines?.length) errors.push(`${where}: flaw task needs flawLines`);
      for (const n of t.flawLines ?? []) if (n < 1 || n > count) errors.push(`${where}: flaw line ${n} is outside the code`);
      if (!t.explanation) errors.push(`${where}: flaw task needs an explanation`);
      break;
    }
    case 'architecture': {
      const parts = new Set(t.parts.map((p) => p.id));
      const zones = new Set(t.zones.map((z) => z.id));
      for (const c of t.checklist) {
        for (const a of c.all ?? []) {
          if (!parts.has(a.part)) errors.push(`${where}: checklist uses unknown part ${a.part}`);
          if (!zones.has(a.zone)) errors.push(`${where}: checklist uses unknown zone ${a.zone}`);
        }
        for (const n of c.none ?? []) if (!parts.has(n)) errors.push(`${where}: checklist uses unknown part ${n}`);
      }
      for (const [p, z] of Object.entries(t.model.placements)) {
        if (!parts.has(p) || !zones.has(z)) errors.push(`${where}: model answer uses unknown ${p} -> ${z}`);
      }
      if (architectureFailures(t, t.model.placements).length > 0) errors.push(`${where}: the model answer fails its own checklist`);
      break;
    }
    case 'explain':
      if (!t.rubric?.length || !t.modelAnswer || !t.gradingPrompt) errors.push(`${where}: explain task needs rubric, modelAnswer and gradingPrompt`);
      if (t.minScore > (t.rubric?.length ?? 0)) errors.push(`${where}: minScore is higher than the rubric`);
      break;
    case 'case': {
      if (!t.questions?.length) errors.push(`${where}: case needs questions`);
      for (const q of t.questions ?? []) {
        if (typeof q.prompt !== 'string') errors.push(`${where}: case question prompt must be text`);
        for (const c of q.choices) if (typeof c.text !== 'string' || typeof c.why !== 'string') errors.push(`${where}: case choice ${JSON.stringify(c.text)} must have text and why as text`);
      }
      const best = (t.questions ?? []).reduce((s, q) => s + Math.max(...q.choices.map((c) => c.score)), 0);
      if (best < t.passScore) errors.push(`${where}: best possible score ${best} is below passScore ${t.passScore}`);
      break;
    }
    default:
      errors.push(`${where}: unknown task type`);
  }
}

export function validateLesson(l: Lesson): string[] {
  const errors: string[] = [];
  const where = `lesson ${l.id ?? l.file}`;
  for (const f of ['id', 'title', 'module', 'topic', 'summary'] as const) if (!l[f]) errors.push(`${where}: missing ${f}`);
  if (!(l.minutes > 0)) errors.push(`${where}: minutes must be positive`);
  if (l.connectivity !== 'offline' && l.connectivity !== 'needs-internet') errors.push(`${where}: bad connectivity`);
  if (!l.predict) errors.push(`${where}: missing predict`);
  else checkQuestion(l.predict, `${where} predict`, errors);
  if (!l.tasks?.length) errors.push(`${where}: needs at least one Do task`);
  if (!l.tasks?.some((t) => t.required)) errors.push(`${where}: needs at least one required task`);
  // The plan's promise: a lesson marked offline can be finished with no internet.
  if (l.connectivity === 'offline' && l.tasks?.some((t) => t.required && t.connectivity !== 'offline')) {
    errors.push(`${where}: marked offline but has a required task that needs the internet`);
  }
  for (const t of l.tasks ?? []) checkTask(t, `${where} task ${t.id}`, errors);
  if (!l.recall?.length) errors.push(`${where}: needs recall questions`);
  for (const q of l.recall ?? []) checkQuestion(q, `${where} recall`, errors);
  if (!l.cards?.length) errors.push(`${where}: needs review cards`);
  if (!l.testOut?.length) errors.push(`${where}: needs test-out questions`);
  for (const q of l.testOut ?? []) checkQuestion(q, `${where} testOut`, errors);
  if (!l.docs?.length) errors.push(`${where}: needs links to official docs`);
  const taskIds = (l.tasks ?? []).map((t) => t.id);
  if (new Set(taskIds).size !== taskIds.length) errors.push(`${where}: duplicate task ids`);
  const cardIds = (l.cards ?? []).map((c) => c.id);
  if (new Set(cardIds).size !== cardIds.length) errors.push(`${where}: duplicate card ids`);
  return errors;
}

export function findCycles(lessons: { id: string; prerequisites: { id: string }[] }[]): string[] {
  const byId = new Map(lessons.map((l) => [l.id, l]));
  const state = new Map<string, 'visiting' | 'done'>();
  const errors: string[] = [];
  const visit = (id: string, path: string[]) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') {
      errors.push(`circular prerequisites: ${[...path, id].join(' -> ')}`);
      return;
    }
    state.set(id, 'visiting');
    for (const p of byId.get(id)?.prerequisites ?? []) visit(p.id, [...path, id]);
    state.set(id, 'done');
  };
  for (const l of lessons) visit(l.id, []);
  return errors;
}

export function validateContent(c: Content): string[] {
  const errors = c.lessons.flatMap(validateLesson);
  const lessonIds = new Set<string>();
  for (const l of c.lessons) {
    if (lessonIds.has(l.id)) errors.push(`duplicate lesson id ${l.id}`);
    lessonIds.add(l.id);
  }
  const topicIds = new Set(c.curriculum.stages.flatMap((s) => s.topics.map((t) => t.id)));
  const moduleIds = new Set(c.modules.map((m) => m.id));
  for (const l of c.lessons) {
    if (!topicIds.has(l.topic)) errors.push(`lesson ${l.id}: unknown topic ${l.topic}`);
    if (!moduleIds.has(l.module)) errors.push(`lesson ${l.id}: unknown module ${l.module}`);
    for (const p of l.prerequisites) {
      if (!lessonIds.has(p.id)) errors.push(`lesson ${l.id}: unknown prerequisite ${p.id}`);
      if (p.need !== 'essential' && p.need !== 'helpful') errors.push(`lesson ${l.id}: prerequisite ${p.id} needs "essential" or "helpful"`);
    }
  }
  errors.push(...findCycles(c.lessons));
  errors.push(...checkConceptOrder(c));
  return errors;
}

/**
 * The beginner rule: a lesson may only rely on ideas that an earlier lesson (in course
 * order) teaches, or that it teaches itself. Essential prerequisites must come earlier too.
 * Only runs once content/concepts.yaml exists.
 */
export function checkConceptOrder(c: Pick<Content, 'lessons' | 'concepts'>): string[] {
  if (!c.concepts?.length) return [];
  const errors: string[] = [];
  const known = new Set(c.concepts.map((k) => k.id));
  const position = new Map(c.lessons.map((l, i) => [l.id, i]));
  const taughtBy = new Map<string, string>();
  const taughtSoFar = new Set<string>();
  for (const l of c.lessons) {
    if (!l.teaches?.length) errors.push(`lesson ${l.id}: needs a "teaches" list (see content/STYLE.md)`);
    for (const id of [...(l.teaches ?? []), ...(l.uses ?? [])]) {
      if (!known.has(id)) errors.push(`lesson ${l.id}: unknown concept "${id}" (add it to concepts.yaml)`);
    }
    for (const id of l.teaches ?? []) {
      if (taughtBy.has(id)) errors.push(`lesson ${l.id}: teaches "${id}", but ${taughtBy.get(id)} already teaches it (use "uses" instead)`);
    }
    const here = new Set(l.teaches ?? []);
    for (const id of l.uses ?? []) {
      if (!taughtSoFar.has(id) && !here.has(id)) errors.push(`lesson ${l.id}: uses "${id}" but nothing before it teaches it`);
    }
    for (const p of l.prerequisites) {
      if (p.need === 'essential' && (position.get(p.id) ?? -1) > (position.get(l.id) ?? 0)) {
        errors.push(`lesson ${l.id}: essential prerequisite ${p.id} comes later in the course`);
      }
    }
    for (const id of here) {
      taughtSoFar.add(id);
      if (!taughtBy.has(id)) taughtBy.set(id, l.id);
    }
  }
  for (const k of c.concepts) if (!taughtBy.has(k.id)) errors.push(`concept "${k.id}" is in concepts.yaml but no lesson teaches it`);
  return errors;
}
