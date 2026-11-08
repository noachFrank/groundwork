import { useState } from 'react';
import { Rich } from '../components/Rich.tsx';
import { architectureFailures } from '../../shared/validate.ts';
import type { ArchitectureTask } from '../../shared/types.ts';
import type { TaskApi } from './TaskCard.tsx';

/**
 * Parts can be dragged, or clicked and then placed, so this also works by keyboard
 * and on a touchpad where dragging is awkward.
 */
export function ArchitectureTaskView({ task, api }: { task: ArchitectureTask; api: TaskApi }) {
  const [placements, setPlacements] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [failures, setFailures] = useState<string[] | null>(null);
  const [showModel, setShowModel] = useState(false);

  const place = (part: string, zone: string | null) => {
    const next = { ...placements };
    if (zone) next[part] = zone;
    else delete next[part];
    setPlacements(next);
    setSelected(null);
    setFailures(null);
    setShowModel(false);
  };

  const partChip = (id: string) => {
    const part = task.parts.find((p) => p.id === id)!;
    return (
      <button
        key={id}
        className={`chip part ${selected === id ? 'selected' : ''}`}
        draggable
        title={part.hint}
        aria-pressed={selected === id}
        onDragStart={(e) => e.dataTransfer.setData('text/plain', id)}
        onClick={() => setSelected(selected === id ? null : id)}
      >
        {part.label}
      </button>
    );
  };

  const onDrop = (e: React.DragEvent, zone: string | null) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id) place(id, zone);
  };
  const dropProps = (zone: string | null) => ({
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => onDrop(e, zone),
  });

  const unplaced = task.parts.filter((p) => !placements[p.id]);

  return (
    <>
      <div className="scenario"><Rich text={task.scenario} /></div>
      <div className="palette" {...dropProps(null)}>
        <span className="small muted">Parts: drag one onto the design, or click it and then click where it goes. Not every part belongs.</span>
        <div className="chips">
          {unplaced.map((p) => partChip(p.id))}
          {unplaced.length === 0 && <span className="muted small">All parts placed.</span>}
        </div>
        {selected && placements[selected] && <button className="link-btn small" onClick={() => place(selected, null)}>Remove from the design</button>}
      </div>
      <div className="zones">
        {task.zones.map((z) => (
          <div key={z.id} className={`zone ${selected ? 'armed' : ''}`} {...dropProps(z.id)} onClick={() => selected && place(selected, z.id)}>
            <strong>{z.label}</strong>
            <span className="small muted">{z.hint}</span>
            <div className="chips" onClick={(e) => e.stopPropagation()}>
              {task.parts.filter((p) => placements[p.id] === z.id).map((p) => partChip(p.id))}
            </div>
          </div>
        ))}
      </div>
      <button
        className="btn"
        onClick={() => {
          const f = architectureFailures(task, placements);
          setFailures(f);
          void api.report(f.length === 0, Math.round(((task.checklist.length - f.length) / task.checklist.length) * 100), { placements });
        }}
      >
        Check my design
      </button>
      {failures && (
        <div className={`feedback ${failures.length === 0 ? 'good' : 'bad'}`}>
          {failures.length === 0 ? <strong>This meets the client's needs.</strong> : <strong>Not yet. This design doesn't:</strong>}
          <ul className="checklist">
            {task.checklist.map((c) => (
              <li key={c.text} className={failures.includes(c.text) ? 'no' : 'yes'}>{c.text}</li>
            ))}
          </ul>
          {failures.length === 0 && (
            <button className="btn small ghost" onClick={() => setShowModel(!showModel)}>{showModel ? 'Hide' : 'Compare with'} the model answer</button>
          )}
        </div>
      )}
      {showModel && (
        <div className="model">
          <strong>Model answer:</strong>
          <ul>
            {Object.entries(task.model.placements).map(([part, zone]) => (
              <li key={part}>{task.parts.find((p) => p.id === part)?.label} → {task.zones.find((z) => z.id === zone)?.label}</li>
            ))}
          </ul>
          <Rich text={task.model.explanation} />
        </div>
      )}
    </>
  );
}
