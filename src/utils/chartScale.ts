/** Median distance between nearest neighbours once on the canvas, in px */
const TARGET_NEAREST = 180;

/**
 * i2 chart coordinates → canvas positions, for .anb and .anx alike.
 *
 * One uniform scale (no distortion) brings the median nearest-neighbour
 * distance to ~180 px, so a chart lands at the same density whatever wrote it:
 * i2, an older ZN export or a current one. Items without a position go on a
 * row below the others.
 */
export function normalizeChartPositions(
  points: ReadonlyArray<{ x: number | null; y: number | null }>,
): Array<{ x: number; y: number }> {
  const placed = points.filter((p) => p.x !== null && p.y !== null) as Array<{ x: number; y: number }>;
  let scale = 1;
  if (placed.length > 1) {
    const nearest = placed.map((a) => {
      let best = Infinity;
      for (const b of placed) {
        if (a === b) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 0 && d < best) best = d;
      }
      return best;
    }).filter(Number.isFinite).sort((p, q) => p - q);
    const median = nearest[Math.floor(nearest.length / 2)];
    if (median) scale = Math.min(4, Math.max(0.2, TARGET_NEAREST / median));
  }
  const minX = Math.min(...placed.map((p) => p.x));
  const minY = Math.min(...placed.map((p) => p.y));
  const maxY = Math.max(...placed.map((p) => p.y));

  let orphan = 0;
  return points.map((p) => {
    if (p.x !== null && p.y !== null) {
      return { x: 200 + (p.x - minX) * scale, y: 200 + (p.y - minY) * scale };
    }
    const base = placed.length > 0 ? 200 + (maxY - minY) * scale + 300 : 200;
    return { x: 200 + (orphan++) * 220, y: base };
  });
}
