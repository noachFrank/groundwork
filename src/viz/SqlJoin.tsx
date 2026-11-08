import { useState } from 'react';

const CUSTOMERS = [
  { id: 1, name: 'Ada' },
  { id: 2, name: 'Grace' },
  { id: 3, name: 'Lin' },
];
const ORDERS = [
  { id: 101, customer_id: 1, item: 'Keyboard' },
  { id: 102, customer_id: 2, item: 'Monitor' },
  { id: 103, customer_id: 1, item: 'USB cable' },
];

type Mode = 'inner' | 'left';

/** Walks one customer at a time, so the way a join matches rows is visible. */
export function SqlJoin() {
  const [mode, setMode] = useState<Mode>('inner');
  const [i, setI] = useState(0);
  const current = CUSTOMERS[Math.min(i, CUSTOMERS.length - 1)];
  const finished = i >= CUSTOMERS.length;

  const rowsFor = (c: (typeof CUSTOMERS)[number]) => {
    const matches = ORDERS.filter((o) => o.customer_id === c.id);
    if (matches.length) return matches.map((o) => ({ name: c.name, item: o.item as string | null }));
    return mode === 'left' ? [{ name: c.name, item: null }] : [];
  };
  const result = CUSTOMERS.slice(0, Math.min(i + 1, CUSTOMERS.length)).flatMap(rowsFor);
  const matched = finished ? [] : ORDERS.filter((o) => o.customer_id === current.id).map((o) => o.id);
  const none = !finished && matched.length === 0;

  const sql = `SELECT customers.name, orders.item
FROM customers
${mode === 'inner' ? 'JOIN' : 'LEFT JOIN'} orders ON orders.customer_id = customers.id;`;

  return (
    <figure className="viz sql-join">
      <div className="row">
        <button className={`btn small ${mode === 'inner' ? '' : 'ghost'}`} aria-pressed={mode === 'inner'} onClick={() => { setMode('inner'); setI(0); }}>JOIN</button>
        <button className={`btn small ${mode === 'left' ? '' : 'ghost'}`} aria-pressed={mode === 'left'} onClick={() => { setMode('left'); setI(0); }}>LEFT JOIN</button>
      </div>
      <pre className="output">{sql}</pre>
      <div className="join-tables">
        <div>
          <h4>customers</h4>
          <table>
            <thead><tr><th>id</th><th>name</th></tr></thead>
            <tbody>{CUSTOMERS.map((c) => <tr key={c.id} className={!finished && c.id === current.id ? 'hl' : ''}><td>{c.id}</td><td>{c.name}</td></tr>)}</tbody>
          </table>
        </div>
        <div>
          <h4>orders</h4>
          <table>
            <thead><tr><th>id</th><th>customer_id</th><th>item</th></tr></thead>
            <tbody>{ORDERS.map((o) => <tr key={o.id} className={matched.includes(o.id) ? 'hl' : ''}><td>{o.id}</td><td>{o.customer_id}</td><td>{o.item}</td></tr>)}</tbody>
          </table>
        </div>
        <div>
          <h4>result so far</h4>
          <table>
            <thead><tr><th>name</th><th>item</th></tr></thead>
            <tbody>
              {result.map((r, n) => <tr key={n}><td>{r.name}</td><td>{r.item ?? <em>NULL</em>}</td></tr>)}
              {result.length === 0 && <tr><td colSpan={2} className="muted">no rows yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <figcaption aria-live="polite">
        {finished
          ? mode === 'inner'
            ? 'Done. Lin has no orders, so with JOIN Lin disappears from the result.'
            : 'Done. With LEFT JOIN, every customer stays, and Lin\'s missing order shows as NULL.'
          : none
            ? `${current.name} has no matching orders. ${mode === 'inner' ? 'JOIN only keeps matches, so there is no row for them.' : 'LEFT JOIN keeps them anyway, with NULL for the order.'}`
            : `${current.name} has customer id ${current.id}. Find every order with customer_id = ${current.id}, and make a row for each.`}
      </figcaption>
      <div className="viz-controls">
        <button className="btn small ghost" disabled={i === 0} onClick={() => setI(i - 1)}>← Back</button>
        <button className="btn small" disabled={finished} onClick={() => setI(i + 1)}>Next →</button>
      </div>
    </figure>
  );
}
