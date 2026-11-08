export interface SqlResult {
  columns: string[];
  rows: unknown[][];
}

const norm = (rows: unknown[][]) =>
  rows.map((r) => JSON.stringify(r.map((v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v))));

/** Compares row data. Column names are ignored so `SELECT name AS who` still counts. */
export function sameResult(a: SqlResult, b: SqlResult, ordered = false): boolean {
  if (a.columns.length !== b.columns.length || a.rows.length !== b.rows.length) return false;
  const left = norm(a.rows);
  const right = norm(b.rows);
  if (!ordered) {
    left.sort();
    right.sort();
  }
  return left.every((v, i) => v === right[i]);
}
