import { useCallback, useMemo, useState, type ComponentType } from 'react';
import { api } from '../api.ts';
import { Rich } from '../components/Rich.tsx';
import { NeedsInternet } from '../online.tsx';
import type { LessonProgress, Task, TaskResult } from '../../shared/types.ts';
import { ArchitectureTaskView } from './ArchitectureTask.tsx';
import { CaseTaskView } from './CaseTask.tsx';
import { ExplainTaskView } from './ExplainTask.tsx';
import { FlawTaskView } from './FlawTask.tsx';
import { LabTaskView } from './LabTask.tsx';
import { JavascriptTaskView } from './JavascriptTask.tsx';
import { PythonTaskView } from './PythonTask.tsx';
import { SqlTaskView } from './SqlTask.tsx';
import { TerminalTaskView } from './TerminalTask.tsx';

const TYPE_LABEL: Record<Task['type'], string> = {
  terminal: 'Terminal mission',
  lab: 'Live lab',
  python: 'Python task',
  javascript: 'JavaScript task',
  sql: 'SQL task',
  flaw: 'Find the flaw',
  architecture: 'Architecture builder',
  explain: 'Explain it back',
  case: 'Consultant case',
};

const VIEWS: Record<Task['type'], ComponentType<any>> = {
  terminal: TerminalTaskView,
  lab: LabTaskView,
  python: PythonTaskView,
  javascript: JavascriptTaskView,
  sql: SqlTaskView,
  flaw: FlawTaskView,
  architecture: ArchitectureTaskView,
  explain: ExplainTaskView,
  case: CaseTaskView,
};

/** What each exercise uses to record its outcome. */
export interface TaskApi {
  lessonId: string;
  report: (passed: boolean, score?: number, detail?: unknown) => Promise<void>;
  serverCheck: <R>() => Promise<R>;
  alreadyPassed: boolean;
}

export function TaskCard({ index, lessonId, task, result, onProgress }: { index: number; lessonId: string; task: Task; result?: TaskResult; onProgress: (p: LessonProgress) => void }) {
  const [error, setError] = useState<string | null>(null);
  const report = useCallback(
    async (passed: boolean, score?: number, detail?: unknown) => {
      try {
        onProgress(await api(`/lessons/${lessonId}/tasks/${task.id}/result`, { body: { passed, score, detail } }));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save your result.');
      }
    },
    [lessonId, task.id, onProgress],
  );
  const serverCheck = useCallback(async <R,>() => {
    const r = await api<{ result: R; progress: LessonProgress }>(`/lessons/${lessonId}/tasks/${task.id}/check`, { body: {} });
    onProgress(r.progress);
    return r.result;
  }, [lessonId, task.id, onProgress]);

  const taskApi = useMemo(
    () => ({ lessonId, report, serverCheck, alreadyPassed: !!result?.passed }),
    [lessonId, report, serverCheck, result?.passed],
  );

  const View = VIEWS[task.type];
  const body = (
    <>
      <Rich text={task.instructions} />
      <View task={task} api={taskApi} />
      {error && <div className="feedback bad">{error}</div>}
    </>
  );

  return (
    <article className={`card task ${result?.passed ? 'task-passed' : ''}`} data-task={task.id}>
      <header className="task-head">
        <div>
          <span className="eyebrow">{TYPE_LABEL[task.type]}{task.required ? '' : ' · Bonus'}</span>
          <h3>{index}. {task.title}</h3>
        </div>
        <div className="task-tags">
          {task.connectivity === 'needs-internet' && <span className="tag tag-net">needs internet</span>}
          {result?.passed && <span className="tag tag-done">✓ passed</span>}
        </div>
      </header>
      {task.connectivity === 'needs-internet' ? (
        <NeedsInternet what="do this task" canContinue={!task.required}>{body}</NeedsInternet>
      ) : (
        body
      )}
    </article>
  );
}
