import { useEffect, useRef } from 'react';
import { basicSetup, EditorView } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';

interface Props {
  language: 'python' | 'sql' | 'javascript';
  value: string;
  onChange: (value: string) => void;
  onRun?: () => void;
  label: string;
}

/** CodeMirror is bundled into the app, so the editor works with no internet. */
export function CodeEditor({ language, value, onChange, onRun, label }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const change = useRef(onChange);
  const run = useRef(onRun);
  change.current = onChange;
  run.current = onRun;

  useEffect(() => {
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          keymap.of([
            {
              key: 'Ctrl-Enter',
              run: () => {
                run.current?.();
                return true;
              },
            },
          ]),
          basicSetup,
          language === 'python' ? python() : language === 'javascript' ? javascript() : sql(),
          EditorView.contentAttributes.of({ 'aria-label': label }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) change.current(u.state.doc.toString());
          }),
        ],
      }),
      parent: host.current!,
    });
    return () => view.destroy();
    // The editor keeps its own text after it mounts; only the language rebuilds it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  return <div className="editor" ref={host} />;
}
