import { useEffect, useState } from 'react';
import { RichInline } from '../components/Rich.tsx';

export interface SceneNode {
  id: string;
  label: string;
  sub?: string;
  x: number;
  y: number;
}
export interface SceneStep {
  title: string;
  text: string;
  /** A message travelling between two nodes. */
  from?: string;
  to?: string;
  message?: string;
  /** Nodes to emphasise. */
  active?: string[];
  tone?: 'good' | 'bad';
}
export interface Scene {
  height: number;
  nodes: SceneNode[];
  steps: SceneStep[];
}

const W = 760;
const NODE_W = 130;
const NODE_H = 58;

/** A step-through animation: the learner controls the pace, and it can also play by itself. */
export function StepViz({ scene }: { scene: Scene }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const step = scene.steps[i];
  const last = scene.steps.length - 1;

  useEffect(() => {
    if (!playing) return;
    if (i >= last) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setI(i + 1), 2800);
    return () => clearTimeout(t);
  }, [playing, i, last]);

  const nodeOf = (id?: string) => scene.nodes.find((n) => n.id === id);
  const from = nodeOf(step.from);
  const to = nodeOf(step.to);

  return (
    <figure className="viz">
      <svg viewBox={`0 0 ${W} ${scene.height}`} role="img" aria-label={`Diagram, step ${i + 1} of ${scene.steps.length}: ${step.title}`}>
        <defs>
          <marker id="viz-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="context-stroke" />
          </marker>
        </defs>
        {from && to && (
          <g key={i} className={`viz-flow ${step.tone ?? ''}`}>
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} markerEnd="url(#viz-arrow)" />
            <circle r="8" className="viz-packet">
              <animateMotion dur="1.1s" repeatCount="1" fill="freeze" path={`M${from.x},${from.y} L${to.x},${to.y}`} />
            </circle>
            {step.message && (
              <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 12} textAnchor="middle" className="viz-message">{step.message}</text>
            )}
          </g>
        )}
        {scene.nodes.map((n) => {
          const on = n.id === step.from || n.id === step.to || step.active?.includes(n.id);
          return (
            <g key={n.id} className={`viz-node ${on ? 'on' : ''}`}>
              <rect x={n.x - NODE_W / 2} y={n.y - NODE_H / 2} width={NODE_W} height={NODE_H} rx="9" />
              <text x={n.x} y={n.sub ? n.y - 4 : n.y + 5} textAnchor="middle" className="viz-label">{n.label}</text>
              {n.sub && <text x={n.x} y={n.y + 15} textAnchor="middle" className="viz-sub">{n.sub}</text>}
            </g>
          );
        })}
      </svg>
      <figcaption aria-live="polite">
        <p className="viz-step-title"><span className="muted">Step {i + 1} of {scene.steps.length}:</span> <strong>{step.title}</strong></p>
        <p><RichInline text={step.text} /></p>
      </figcaption>
      <div className="viz-controls">
        <button className="btn small ghost" disabled={i === 0} onClick={() => { setPlaying(false); setI(i - 1); }}>← Back</button>
        <button className="btn small" disabled={i === last} onClick={() => { setPlaying(false); setI(i + 1); }}>Next →</button>
        <button className="btn small ghost" onClick={() => { if (i === last) setI(0); setPlaying(!playing); }}>{playing ? 'Pause' : i === last ? 'Replay' : 'Play'}</button>
      </div>
    </figure>
  );
}
