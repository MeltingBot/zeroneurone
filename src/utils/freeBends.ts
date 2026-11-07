/**
 * Straight links with bend points placed by hand (straight mode), as in i2 Analyst's Notebook.
 *
 * A link stores its bend points from the source side, on the canvas: moving one end leaves them in
 * place. When both ends move together, the store moves them with them (utils/routeFollow).
 */

export interface Point {
  x: number;
  y: number;
}

/** Bend points from a stored or received value, or null when absent, empty or malformed. */
export function plainBendPoints(value: unknown): Point[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const points: Point[] = [];
  for (const p of value) {
    if (!p || typeof p !== 'object') return null;
    const { x, y } = p as Partial<Point>;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    points.push({ x, y });
  }
  return points;
}

/** What a link stores of its bend points: none left is null. */
export function storedBendPoints(bends: Point[]): Point[] | null {
  return bends.length > 0 ? bends.map((p) => ({ x: p.x, y: p.y })) : null;
}

/**
 * Snaps a dragged bend point so the segments it shares with its neighbours turn horizontal or
 * vertical when they come within `tolerance`.
 */
export function snapBend(point: Point, previous: Point, next: Point, tolerance: number): Point {
  const snap = (value: number, a: number, b: number) => {
    const da = Math.abs(value - a);
    const db = Math.abs(value - b);
    if (da <= tolerance && da <= db) return a;
    if (db <= tolerance) return b;
    return value;
  };
  return { x: snap(point.x, previous.x, next.x), y: snap(point.y, previous.y, next.y) };
}
