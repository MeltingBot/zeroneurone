/** One table of the payload, as the diagram shows it */
export interface DiagramTable {
  key: string;
  name: string;
  count: number;
  /** Field holding the records' id, if any */
  idField?: string;
  /** Reference fields, the table each one points into, and the share of its values found there */
  refs: { field: string; target: string; matched: number }[];
  /** Other scalar fields that could become references */
  candidates: string[];
}

/**
 * Columns, left to right: a table sits one column left of the tables it points
 * into, so every arrow runs rightwards through the gap between columns. Inside
 * a column, tables are ordered by where their targets sit, to limit crossings.
 */
export function diagramColumns(tables: DiagramTable[]): DiagramTable[][] {
  const byKey = new Map(tables.map((t) => [t.key, t]));
  const level = new Map<string, number>();
  const visiting = new Set<string>();
  const levelOf = (key: string): number => {
    const known = level.get(key);
    if (known !== undefined) return known;
    if (visiting.has(key)) return 0; // cycle: cut it here
    visiting.add(key);
    let l = 0;
    for (const ref of byKey.get(key)?.refs ?? []) {
      if (ref.target !== key && byKey.has(ref.target)) l = Math.max(l, levelOf(ref.target) + 1);
    }
    visiting.delete(key);
    level.set(key, l);
    return l;
  };
  tables.forEach((t) => levelOf(t.key));
  const max = Math.max(0, ...level.values());
  const columns: DiagramTable[][] = Array.from({ length: max + 1 }, () => []);
  for (const t of tables) columns[max - level.get(t.key)!].push(t);

  // Barycentre ordering, from the rightmost column back
  const rank = new Map<string, number>();
  for (let c = columns.length - 1; c >= 0; c--) {
    const col = columns[c];
    const score = (t: DiagramTable) => {
      const ranks = t.refs.map((r) => rank.get(r.target)).filter((r): r is number => r !== undefined);
      return ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : Infinity;
    };
    if (c < columns.length - 1) {
      const order = new Map(col.map((t, i) => [t.key, i]));
      col.sort((a, b) => (score(a) - score(b)) || (order.get(a.key)! - order.get(b.key)!));
    }
    col.forEach((t, i) => rank.set(t.key, col.length > 1 ? i / (col.length - 1) : 0.5));
  }
  return columns.filter((col) => col.length > 0);
}
