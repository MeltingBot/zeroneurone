/**
 * Right-angle routes drawn by hand.
 *
 * A right-angle route is a run of segments, each horizontal or vertical in turn. It is kept as the
 * positions of its segments: the y of a horizontal one, the x of a vertical one. The first segment
 * leaves the source handle and the last one reaches the target handle, so their positions come
 * from the handles; the link stores the positions of the inner segments only (OrthogonalRoute),
 * relative to the middle of the link so the route follows when both ends move together.
 *
 * Whatever the handles become (auto anchors turn sides when nodes move), a stored route always
 * gives a valid right-angle line: a value that no longer fits is dropped, a missing one is added.
 */

import type { OrthogonalRoute } from '../types';

export interface Point {
  x: number;
  y: number;
}

/** Orientation of a segment: horizontal or vertical. */
export type SegmentAxis = 'h' | 'v';

/** Positions of every segment of a route, first and last included, from the source handle. */
export interface RoutePositions {
  positions: number[];
  /** Orientation of the first segment; the next ones alternate. */
  firstAxis: SegmentAxis;
}

const other = (axis: SegmentAxis): SegmentAxis => (axis === 'h' ? 'v' : 'h');

/** Orientation of segment `index` of a route whose first segment is `firstAxis`. */
export function segmentAxis(firstAxis: SegmentAxis, index: number): SegmentAxis {
  return index % 2 === 0 ? firstAxis : other(firstAxis);
}

/** A horizontal handle direction gives a horizontal end segment. */
const handleAxis = (dir: Point): SegmentAxis => (dir.x !== 0 ? 'h' : 'v');

/**
 * Positions of the whole route: the stored inner positions adapted to the handles, between the
 * positions of the two end segments. The inner segments next to the ends keep `minStub` of line
 * out of the node (room for an arrowhead), when the two ends leave room for it.
 */
export function resolveRoute(
  route: OrthogonalRoute,
  source: Point,
  sourceDir: Point,
  target: Point,
  targetDir: Point,
  origin: Point,
  minStub: number,
): RoutePositions {
  const firstAxis = handleAxis(sourceDir);
  const lastAxis = handleAxis(targetDir);
  // The segment after a horizontal one is vertical: its position is an x
  const expectedFirst = firstAxis === 'h' ? 'x' : 'y';

  let coordinate = route.first;
  let values = route.positions.map((value) => {
    const absolute = value + (coordinate === 'x' ? origin.x : origin.y);
    coordinate = coordinate === 'x' ? 'y' : 'x';
    return absolute;
  });
  if (route.first !== expectedFirst) values = values.slice(1);
  // Same orientation at both ends: an odd number of inner segments; otherwise even
  const wantOdd = firstAxis === lastAxis;
  if ((values.length % 2 === 1) !== wantOdd) {
    if (values.length > 0) values = values.slice(0, -1);
    else values = [expectedFirst === 'x' ? origin.x : origin.y];
  }

  if (values.length > 0) {
    // Along the first segment, out of the source; along the last one, out of the target
    const sourceAlong = firstAxis === 'h' ? source.x : source.y;
    const sourceSign = firstAxis === 'h' ? sourceDir.x : sourceDir.y;
    const targetAlong = lastAxis === 'h' ? target.x : target.y;
    const targetSign = lastAxis === 'h' ? targetDir.x : targetDir.y;
    const awayFromSource = (v: number) => ((v - sourceAlong) * sourceSign < minStub ? sourceAlong + sourceSign * minStub : v);
    const awayFromTarget = (v: number) => ((v - targetAlong) * targetSign < minStub ? targetAlong + targetSign * minStub : v);
    const last = values.length - 1;
    if (last === 0) {
      // One inner segment between two facing ends: only when both stubs fit
      const both = awayFromTarget(awayFromSource(values[0]));
      if ((both - sourceAlong) * sourceSign >= minStub - 1e-6) values[0] = both;
    } else {
      values[0] = awayFromSource(values[0]);
      values[last] = awayFromTarget(values[last]);
    }
  }

  return {
    positions: [firstAxis === 'h' ? source.y : source.x, ...values, lastAxis === 'h' ? target.y : target.x],
    firstAxis,
  };
}

/** Corners of a route, from the source side: where each segment meets the next one. */
export function routeCorners({ positions, firstAxis }: RoutePositions): Point[] {
  const corners: Point[] = [];
  for (let k = 0; k < positions.length - 1; k++) {
    corners.push(segmentAxis(firstAxis, k) === 'h'
      ? { x: positions[k + 1], y: positions[k] }
      : { x: positions[k], y: positions[k + 1] });
  }
  return corners;
}

/**
 * Positions of a right-angle polyline (source handle, corners, target handle). Empty segments are
 * skipped and segments in line are merged, so each position is a segment that can be seen.
 */
export function routeFromPolyline(points: Point[]): RoutePositions | null {
  const segments: { axis: SegmentAxis; position: number }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) continue;
    const axis: SegmentAxis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    if (segments.at(-1)?.axis === axis) continue;
    segments.push({ axis, position: axis === 'h' ? points[i].y : points[i].x });
  }
  if (segments.length === 0) return null;
  return { positions: segments.map((s) => s.position), firstAxis: segments[0].axis };
}

/** What a link stores of a route: its inner positions, relative to the middle of the link. */
export function storedRoute({ positions, firstAxis }: RoutePositions, origin: Point): OrthogonalRoute {
  const inner = positions.slice(1, -1);
  return {
    first: firstAxis === 'h' ? 'x' : 'y',
    positions: inner.map((value, i) => value - (segmentAxis(firstAxis, i + 1) === 'v' ? origin.x : origin.y)),
  };
}

/**
 * Cuts segment `index` in two at `at` (a coordinate along the segment): an empty step between the
 * two halves, each of which can then be moved on its own.
 */
export function splitSegment(positions: number[], index: number, at: number): number[] {
  return [...positions.slice(0, index + 1), at, positions[index], ...positions.slice(index + 1)];
}

/**
 * Merges the segments left in line: an inner segment of no length means its two neighbours are
 * one line. The end segments stay.
 */
export function mergeEmptySegments(positions: number[], tolerance = 0.5): number[] {
  const merged = [...positions];
  let changed = true;
  while (changed) {
    changed = false;
    for (let k = 1; k < merged.length - 1; k++) {
      if (Math.abs(merged[k - 1] - merged[k + 1]) > tolerance) continue;
      if (k + 1 < merged.length - 1) merged.splice(k, 2);
      else if (k - 1 > 0) merged.splice(k - 1, 2);
      else continue;
      changed = true;
      break;
    }
  }
  return merged;
}

/**
 * Snaps the position of segment `index` onto the parallel segments one corner away on each side
 * (lining them up merges them) when it comes within `tolerance`.
 */
export function snapPosition(positions: number[], index: number, value: number, tolerance: number): number {
  let best = value;
  let bestDistance = tolerance;
  for (const neighbour of [index - 2, index + 2]) {
    if (neighbour < 0 || neighbour >= positions.length) continue;
    const distance = Math.abs(positions[neighbour] - value);
    if (distance <= bestDistance) {
      best = positions[neighbour];
      bestDistance = distance;
    }
  }
  return best;
}
