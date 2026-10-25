/**
 * Spatial lookups for the canvas overview layer: which node lies under a
 * point, which nodes a selection rectangle touches, which nodes a viewport
 * shows. A uniform grid is enough here: nodes have similar sizes, and the few
 * large ones (groups, annotations) are kept in a separate list.
 *
 * Pure functions on the scene arrays, no DOM (unit-tested).
 */

import type { OverviewScene, SpatialGrid } from './overviewTypes';
import { NODE_GHOST, NODE_SELECTED, SHAPE_ANNOTATION, SHAPE_CIRCLE, SHAPE_DIAMOND, SHAPE_GROUP } from './overviewTypes';

/** Cell side, in flow units. A default node is 40 to 150 units wide. */
const CELL = 256;
/** A node wider or taller than this goes to the `large` list instead of the cells. */
const LARGE_SIZE = CELL * 4;

/** Half-diagonal of a square rotated 45°, relative to its side. */
export const DIAMOND_HALF_DIAGONAL = Math.SQRT1_2;

function cellKey(cx: number, cy: number): number {
  return (cx + 0x8000) * 0x10000 + (cy + 0x8000);
}

function cellOf(v: number): number {
  return Math.max(-0x7fff, Math.min(0x7fff, Math.floor(v / CELL)));
}

export function buildGrid(
  x: Float32Array, y: Float32Array, w: Float32Array, h: Float32Array,
  shape: Uint8Array, count: number,
): SpatialGrid {
  const cells = new Map<number, number[]>();
  const large: number[] = [];
  for (let i = 0; i < count; i++) {
    const s = shape[i];
    if (s === SHAPE_GROUP || s === SHAPE_ANNOTATION || w[i] > LARGE_SIZE || h[i] > LARGE_SIZE) {
      large.push(i);
      continue;
    }
    // A diamond's tips stick out of its box: index its real extent
    const pad = s === SHAPE_DIAMOND ? w[i] * (DIAMOND_HALF_DIAGONAL - 0.5) : 0;
    const cx0 = cellOf(x[i] - pad), cx1 = cellOf(x[i] + w[i] + pad);
    const cy0 = cellOf(y[i] - pad), cy1 = cellOf(y[i] + h[i] + pad);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const k = cellKey(cx, cy);
        let list = cells.get(k);
        if (!list) { list = []; cells.set(k, list); }
        list.push(i);
      }
    }
  }
  return { cells, large, stamp: new Uint32Array(count), stampValue: 0 };
}

function nextStamp(grid: SpatialGrid): number {
  grid.stampValue++;
  if (grid.stampValue === 0xffffffff) {
    grid.stamp.fill(0);
    grid.stampValue = 1;
  }
  return grid.stampValue;
}

/**
 * Indices of the gridded nodes (not the large ones) whose cells meet the
 * rectangle. Candidates only: callers test the exact geometry.
 */
export function queryCells(
  grid: SpatialGrid, minX: number, minY: number, maxX: number, maxY: number, out: number[],
): number[] {
  out.length = 0;
  const cx0 = cellOf(minX), cx1 = cellOf(maxX);
  const cy0 = cellOf(minY), cy1 = cellOf(maxY);
  // A viewport much larger than the graph: walking every listed cell is cheaper
  const span = (cx1 - cx0 + 1) * (cy1 - cy0 + 1);
  const stamp = nextStamp(grid);
  if (span > grid.cells.size) {
    for (const [k, list] of grid.cells) {
      const cx = Math.floor(k / 0x10000) - 0x8000;
      const cy = (k % 0x10000) - 0x8000;
      if (cx < cx0 || cx > cx1 || cy < cy0 || cy > cy1) continue;
      for (const i of list) {
        if (grid.stamp[i] !== stamp) { grid.stamp[i] = stamp; out.push(i); }
      }
    }
    return out;
  }
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cy = cy0; cy <= cy1; cy++) {
      const list = grid.cells.get(cellKey(cx, cy));
      if (!list) continue;
      for (const i of list) {
        if (grid.stamp[i] !== stamp) { grid.stamp[i] = stamp; out.push(i); }
      }
    }
  }
  return out;
}

/** Whether a flow point is inside node `i`, its outline grown by `tol`. */
function containsPoint(scene: OverviewScene, i: number, fx: number, fy: number, tol: number): boolean {
  const { x, y, w, h, shape } = scene;
  const cx = x[i] + w[i] / 2;
  const cy = y[i] + h[i] / 2;
  const dx = Math.abs(fx - cx);
  const dy = Math.abs(fy - cy);
  switch (shape[i]) {
    case SHAPE_CIRCLE: {
      const rx = w[i] / 2 + tol;
      const ry = h[i] / 2 + tol;
      return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
    }
    case SHAPE_DIAMOND:
      return dx + dy <= w[i] * DIAMOND_HALF_DIAGONAL + tol;
    default:
      return dx <= w[i] / 2 + tol && dy <= h[i] / 2 + tol;
  }
}

const scratch: number[] = [];

/**
 * The node under a flow point, as React Flow would pick it: plain elements
 * above annotations above groups, and among elements the selected ones on top
 * (React Flow raises them), then the last drawn. Ghosts are not selectable.
 *
 * @param tol extra reach in flow units, so a node a few pixels wide stays clickable
 */
export function hitPoint(scene: OverviewScene, fx: number, fy: number, tol: number): number {
  const { flags, shape } = scene;
  let best = -1;
  let bestRank = -1;
  for (const i of queryCells(scene.grid, fx - tol, fy - tol, fx + tol, fy + tol, scratch)) {
    if (flags[i] & NODE_GHOST) continue;
    if (!containsPoint(scene, i, fx, fy, tol)) continue;
    // Rank: selected first, then draw order
    const rank = (flags[i] & NODE_SELECTED ? scene.nodeCount : 0) + i;
    if (rank > bestRank) { bestRank = rank; best = i; }
  }
  if (best >= 0) return best;

  // Large items: annotations sit above groups; later ones above earlier ones
  for (const wanted of [SHAPE_ANNOTATION, -1]) {
    for (let k = scene.grid.large.length - 1; k >= 0; k--) {
      const i = scene.grid.large[k];
      if (flags[i] & NODE_GHOST) continue;
      const isAnnotation = shape[i] === SHAPE_ANNOTATION;
      if ((wanted === SHAPE_ANNOTATION) !== isAnnotation) continue;
      if (containsPoint(scene, i, fx, fy, tol)) return i;
    }
  }
  return -1;
}

/**
 * Nodes touched by a flow rectangle, like React Flow's partial selection
 * mode: any overlap counts. Ghosts excluded.
 */
export function hitRect(
  scene: OverviewScene, minX: number, minY: number, maxX: number, maxY: number,
): number[] {
  const { x, y, w, h, flags } = scene;
  const result: number[] = [];
  const overlaps = (i: number) =>
    x[i] <= maxX && x[i] + w[i] >= minX && y[i] <= maxY && y[i] + h[i] >= minY;
  for (const i of queryCells(scene.grid, minX, minY, maxX, maxY, scratch)) {
    if (!(flags[i] & NODE_GHOST) && overlaps(i)) result.push(i);
  }
  for (const i of scene.grid.large) {
    if (!(flags[i] & NODE_GHOST) && overlaps(i)) result.push(i);
  }
  return result;
}

/** Links with an end among the given nodes (React Flow selects these with a box). */
export function linksTouching(scene: OverviewScene, nodeIndices: number[]): string[] {
  const picked = new Uint8Array(scene.nodeCount);
  for (const i of nodeIndices) picked[i] = 1;
  const ids: string[] = [];
  for (let l = 0; l < scene.linkCount; l++) {
    if (picked[scene.from[l]] || picked[scene.to[l]]) ids.push(scene.linkIds[l]);
  }
  return ids;
}
