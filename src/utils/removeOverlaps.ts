/**
 * Axis-aligned overlap removal for laid-out nodes (centre x/y, width/height).
 *
 * Each pass pushes every overlapping pair apart on the axis where they overlap
 * least, until a pass finds none or `passes` runs out. Pairs are looked up in a
 * uniform grid whose cells are as large as the largest node plus the gap: two
 * nodes can only overlap when they sit in the same or adjacent cells, so a pass
 * costs about O(n) instead of comparing every pair (O(n²): minutes on a few
 * thousand nodes).
 */

export interface OverlapNode {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RemoveOverlapsOptions {
  gap: number;
  passes: number;
  /**
   * Nodes sharing the same point have no direction to be pushed in.
   * 'positive' moves the second one by a random amount down-right, 'centered'
   * in any direction, 'none' leaves them (dagre never stacks nodes).
   */
  coincident?: 'positive' | 'centered' | 'none';
}

export function removeOverlaps(nodes: OverlapNode[], { gap, passes, coincident = 'positive' }: RemoveOverlapsOptions): void {
  if (nodes.length < 2) return;
  let maxW = 0, maxH = 0;
  for (const n of nodes) {
    if (n.w > maxW) maxW = n.w;
    if (n.h > maxH) maxH = n.h;
  }
  const cellW = maxW + gap || 1;
  const cellH = maxH + gap || 1;
  const cells = new Map<string, number[]>();

  for (let pass = 0; pass < passes; pass++) {
    let hasOverlap = false;

    cells.clear();
    const cx = new Int32Array(nodes.length);
    const cy = new Int32Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) {
      cx[i] = Math.floor(nodes[i].x / cellW);
      cy[i] = Math.floor(nodes[i].y / cellH);
      const key = `${cx[i]},${cy[i]}`;
      const bucket = cells.get(key);
      if (bucket) bucket.push(i); else cells.set(key, [i]);
    }

    for (let i = 0; i < nodes.length; i++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const bucket = cells.get(`${cx[i] + dx},${cy[i] + dy}`);
          if (!bucket) continue;
          for (const j of bucket) {
            if (j <= i) continue;
            const a = nodes[i];
            const b = nodes[j];
            const overlapX = (a.w / 2 + b.w / 2 + gap) - Math.abs(a.x - b.x);
            const overlapY = (a.h / 2 + b.h / 2 + gap) - Math.abs(a.y - b.y);
            if (overlapX > 0 && overlapY > 0) {
              hasOverlap = true;
              // Push apart on the axis with less overlap to preserve the shape
              if (overlapX < overlapY) {
                const push = overlapX / 2 + 1;
                if (a.x < b.x) { a.x -= push; b.x += push; } else { a.x += push; b.x -= push; }
              } else {
                const push = overlapY / 2 + 1;
                if (a.y < b.y) { a.y -= push; b.y += push; } else { a.y += push; b.y -= push; }
              }
            } else if (coincident !== 'none' && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1) {
              hasOverlap = true;
              const spread = coincident === 'centered' ? () => (Math.random() - 0.5) * 2 : Math.random;
              b.x += (a.w / 2 + b.w / 2 + gap) * spread();
              b.y += (a.h / 2 + b.h / 2 + gap) * spread();
            }
          }
        }
      }
    }
    if (!hasOverlap) break;
  }
}
