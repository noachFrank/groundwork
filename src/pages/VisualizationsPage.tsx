import { VIZ_LIST, Viz } from '../viz/index.tsx';

export function VisualizationsPage() {
  return (
    <div>
      <h1>Visualizations</h1>
      <p className="lede">Step through how things really work, at your own pace. All of these work offline.</p>
      {VIZ_LIST.map((v) => (
        <section key={v.name} className="card">
          <h2>{v.title}</h2>
          <Viz name={v.name} />
        </section>
      ))}
    </div>
  );
}
