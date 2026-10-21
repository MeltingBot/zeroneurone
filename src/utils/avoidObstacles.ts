/**
 * Shift for a freshly laid-out block so it does not cover fixed rectangles
 * (locked elements). The block moves as a whole, keeping its shape: candidate
 * offsets are tried on a square spiral around the original spot, nearest
 * first, until no node overlaps an obstacle.
 */
import type { Position } from '../types';
import type { Rect } from './layoutScope';

const GAP = 40;

export function avoidObstacles(nodes: Rect[], obstacles: Rect[]): Position {
  if (nodes.length === 0 || obstacles.length === 0) return { x: 0, y: 0 };

  // Spatial hash of the obstacles (inflated by the gap)
  const cell = Math.max(200, ...obstacles.map((o) => Math.max(o.width, o.height) + GAP));
  const grid = new Map<string, Rect[]>();
  for (const o of obstacles) {
    const r = { x: o.x - GAP, y: o.y - GAP, width: o.width + 2 * GAP, height: o.height + 2 * GAP };
    for (let cx = Math.floor(r.x / cell); cx <= Math.floor((r.x + r.width) / cell); cx++) {
      for (let cy = Math.floor(r.y / cell); cy <= Math.floor((r.y + r.height) / cell); cy++) {
        const key = `${cx},${cy}`;
        const list = grid.get(key);
        if (list) list.push(r); else grid.set(key, [r]);
      }
    }
  }

  const collides = (dx: number, dy: number): boolean => {
    for (const n of nodes) {
      const x = n.x + dx, y = n.y + dy;
      for (let cx = Math.floor(x / cell); cx <= Math.floor((x + n.width) / cell); cx++) {
        for (let cy = Math.floor(y / cell); cy <= Math.floor((y + n.height) / cell); cy++) {
          for (const o of grid.get(`${cx},${cy}`) ?? []) {
            if (x < o.x + o.width && x + n.width > o.x && y < o.y + o.height && y + n.height > o.y) return true;
          }
        }
      }
    }
    return false;
  };

  if (!collides(0, 0)) return { x: 0, y: 0 };

  // Square spiral of offsets, step proportional to the block size
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width); maxY = Math.max(maxY, n.y + n.height);
  }
  const step = Math.max(100, Math.max(maxX - minX, maxY - minY) / 10);
  for (let ring = 1; ring <= 200; ring++) {
    const candidates: Position[] = [];
    for (let i = -ring; i <= ring; i++) {
      candidates.push({ x: i, y: -ring }, { x: i, y: ring });
      if (i !== -ring && i !== ring) candidates.push({ x: -ring, y: i }, { x: ring, y: i });
    }
    candidates.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
    for (const c of candidates) {
      if (!collides(c.x * step, c.y * step)) return { x: c.x * step, y: c.y * step };
    }
  }
  return { x: 0, y: 0 };
}
