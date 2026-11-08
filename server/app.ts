import { dirname } from 'node:path';
import { Hono } from 'hono';
import { STEPS, type Content, type LabName, type ReviewRating, type StepName, type TerminalTask } from '../shared/types.ts';
import type { Connectivity } from './connectivity.ts';
import { hostGuard, sameAppOnly } from './guard.ts';
import type { Labs } from './labs/index.ts';
import { checkPractice } from './practice.ts';
import type { Store } from './store.ts';
import { toolStatuses } from './tools.ts';

const LABS: LabName[] = ['ports', 'http', 'cors', 'dns', 'real-dns', 'live'];
const RATINGS: ReviewRating[] = ['again', 'hard', 'good', 'easy'];

export interface AppDeps {
  store: Store;
  content: Content;
  connectivity: Connectivity;
  labs: Labs;
  practicePath: string;
  dataPath: string;
  version: string;
}

export function createApi({ store, content, connectivity, labs, practicePath, dataPath, version }: AppDeps): Hono {
  const api = new Hono();
  api.use(hostGuard);
  api.use(sameAppOnly(labs.appOrigins));
  api.onError((err, c) => {
    console.error(err);
    return c.json({ error: err.message || 'Something went wrong' }, 500);
  });

  api.get('/health', (c) => c.json({ app: 'groundwork', version }));
  api.get('/connectivity', async (c) => c.json({ online: await connectivity.check(c.req.query('force') === '1') }));

  // nodeDir is the folder of the Node that runs Groundwork, so lessons can use it with no install.
  api.get('/about', (c) => c.json({ version, practicePath, dataPath, nodeDir: dirname(process.execPath), labsUnavailable: labs.unavailable }));
  api.get('/curriculum', (c) =>
    c.json({ curriculum: content.curriculum, modules: content.modules, lessons: store.summaries() }),
  );
  api.get('/today', async (c) => c.json(store.today(await connectivity.check())));
  api.get('/tools', async (c) => c.json(await toolStatuses()));
  api.get('/stats', (c) => c.json(store.stats()));

  // Lessons
  const withLesson = (handler: (c: any, id: string) => any) => (c: any) => {
    const id = c.req.param('id');
    if (!store.lesson(id)) return c.json({ error: 'No such lesson' }, 404);
    return handler(c, id);
  };

  api.get('/lessons/:id', withLesson((c, id) =>
    c.json({
      lesson: store.lesson(id),
      moduleTitle: content.modules.find((m) => m.id === store.lesson(id)!.module)?.title ?? '',
      progress: store.progress(id),
      note: store.getNote(id),
      cards: store.cardsForLesson(id),
    }),
  ));
  api.post('/lessons/:id/step', withLesson(async (c, id) => {
    const { step } = (await c.req.json()) as { step: StepName };
    if (!STEPS.includes(step)) return c.json({ error: 'Unknown step' }, 400);
    store.setStep(id, step);
    return c.json(store.progress(id));
  }));
  api.post('/lessons/:id/predict', withLesson(async (c, id) => {
    const { answer } = (await c.req.json()) as { answer: number };
    store.recordPredict(id, answer);
    return c.json(store.progress(id));
  }));
  api.post('/lessons/:id/recall', withLesson(async (c, id) => {
    const { responses } = await c.req.json();
    return c.json({ ...store.recordRecall(id, responses ?? {}), cards: store.cardsForLesson(id) });
  }));
  api.post('/lessons/:id/flags', withLesson(async (c, id) => c.json(store.setFlags(id, await c.req.json()))));
  api.put('/lessons/:id/note', withLesson(async (c, id) => {
    const { body } = (await c.req.json()) as { body: string };
    store.setNote(id, String(body ?? '').slice(0, 50000));
    return c.json({ ok: true });
  }));
  api.post('/lessons/:id/problem', withLesson(async (c, id) => {
    const { message } = (await c.req.json()) as { message: string };
    const text = String(message ?? '').trim();
    if (!text) return c.json({ error: 'Please describe the problem first.' }, 400);
    store.addProblem(id, text.slice(0, 5000));
    return c.json({ ok: true });
  }));

  // Results worked out in the browser: Python, SQL, flaw, architecture, explain, case.
  api.post('/lessons/:id/tasks/:taskId/result', withLesson(async (c, id) => {
    const taskId = c.req.param('taskId');
    if (!store.lesson(id)!.tasks.some((t) => t.id === taskId)) return c.json({ error: 'No such task' }, 404);
    const { passed, score, detail } = await c.req.json();
    return c.json(store.recordTask(id, taskId, !!passed, typeof score === 'number' ? score : null, detail));
  }));

  // Results only the server can see: the practice folder and the lab servers.
  api.post('/lessons/:id/tasks/:taskId/check', withLesson(async (c, id) => {
    const taskId = c.req.param('taskId');
    const task = store.lesson(id)!.tasks.find((t) => t.id === taskId);
    if (!task) return c.json({ error: 'No such task' }, 404);
    if (task.type === 'terminal') {
      const result = checkPractice(practicePath, (task as TerminalTask).checks);
      return c.json({ result, progress: store.recordTask(id, taskId, result.passed, null, result) });
    }
    if (task.type === 'lab') {
      const state = labs.state(task.lab);
      const passed = labs.goalsDone(task.lab);
      return c.json({ result: { passed, goals: state.goals }, progress: store.recordTask(id, taskId, passed, null, state.goals) });
    }
    return c.json({ error: 'This task is not checked by the server.' }, 400);
  }));

  // Reviews
  api.get('/reviews', (c) => c.json(store.dueCards(c.req.query('all') === '1')));
  api.post('/reviews/:cardId', async (c) => {
    const { rating } = await c.req.json<{ rating: ReviewRating }>();
    if (!RATINGS.includes(rating)) return c.json({ error: 'Unknown rating' }, 400);
    const result = store.rateCard(decodeURIComponent(c.req.param('cardId')), rating);
    return result ? c.json(result) : c.json({ error: 'No such card' }, 404);
  });

  // Test out
  api.get('/testout', (c) => c.json(store.testOutQuestions()));
  api.post('/testout', async (c) => {
    const { lessonIds, answers } = await c.req.json();
    const known = (lessonIds as string[]).filter((id) => store.lesson(id));
    return c.json(store.submitTestOut(known, answers ?? {}));
  });

  // Time and study plan
  api.post('/time', async (c) => {
    const { lessonId, seconds } = await c.req.json();
    store.addTime(lessonId && store.lesson(lessonId) ? lessonId : null, Number(seconds) || 0);
    return c.json({ ok: true });
  });
  api.get('/plan', (c) => c.json({ settings: store.planSettings(), schedule: store.schedule() }));
  api.put('/plan', async (c) => {
    const { hoursPerWeek, dailyReviewLimit } = await c.req.json();
    const hours = Number(hoursPerWeek);
    if (!(hours >= 0.5 && hours <= 80)) return c.json({ error: 'Choose between 0.5 and 80 hours a week.' }, 400);
    const limit = dailyReviewLimit === undefined ? undefined : Math.min(500, Math.max(1, Number(dailyReviewLimit) || 30));
    const schedule = store.savePlan({ hoursPerWeek: hours, dailyReviewLimit: limit });
    return c.json({ settings: store.planSettings(), schedule });
  });

  // Problem reports
  api.get('/problems', (c) => c.json(store.listProblems()));
  api.post('/problems/:id/resolve', async (c) => {
    const { resolved } = await c.req.json();
    store.resolveProblem(Number(c.req.param('id')), !!resolved);
    return c.json({ ok: true });
  });

  // Backup
  api.get('/export', (c) => {
    c.header('Content-Disposition', `attachment; filename="groundwork-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    return c.json(store.exportAll());
  });
  api.post('/import', async (c) => {
    try {
      store.importAll(await c.req.json());
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : 'Could not read that file.' }, 400);
    }
  });

  // Labs
  api.get('/labs/:lab', (c) => {
    const lab = c.req.param('lab') as LabName;
    if (!LABS.includes(lab)) return c.json({ error: 'No such lab' }, 404);
    return c.json(labs.state(lab));
  });
  api.post('/labs/:lab/action', async (c) => {
    const lab = c.req.param('lab') as LabName;
    if (!LABS.includes(lab)) return c.json({ error: 'No such lab' }, 404);
    try {
      await labs.action(lab, await c.req.json());
      return c.json(labs.state(lab));
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : 'That did not work.' }, 400);
    }
  });

  return api;
}
