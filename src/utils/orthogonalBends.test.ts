import { describe, it, expect } from 'vitest';
import {
  mergeEmptySegments, resolveRoute, routeCorners, routeFromPolyline, snapPosition, splitSegment, storedRoute,
  type Point,
} from './orthogonalBends';
import { computeEdgeRoute, ORTHOGONAL_MIN_STUB, type EdgeRouteInput } from './edgeRouting';

const RIGHT = { x: 1, y: 0 };
const LEFT = { x: -1, y: 0 };
const UP = { x: 0, y: -1 };
const DOWN = { x: 0, y: 1 };
const ORIGIN = { x: 200, y: 0 };
const STUB = 28;

/** Every step of the line is horizontal or vertical. */
function rightAngled(points: Point[]) {
  return points.every((p, i) => i === 0 || p.x === points[i - 1].x || p.y === points[i - 1].y);
}

const line = (source: Point, corners: Point[], target: Point) => [source, ...corners, target];

describe('resolveRoute', () => {
  it('draws the stored segments between the two handles', () => {
    // Out right at y 0, down at x 100, along y 80, up at x 300, into the target at y 0
    const r = resolveRoute({ first: 'x', positions: [-100, 80, 100] }, { x: 0, y: 0 }, RIGHT, { x: 400, y: 0 }, LEFT, ORIGIN, STUB);
    expect(r).toEqual({ positions: [0, 100, 80, 300, 0], firstAxis: 'h' });
    const points = line({ x: 0, y: 0 }, routeCorners(r), { x: 400, y: 0 });
    expect(points).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 300, y: 80 }, { x: 300, y: 0 }, { x: 400, y: 0 }]);
    expect(rightAngled(points)).toBe(true);
  });

  it('stays a right-angle line when the handles turn (auto anchors)', () => {
    const stored = { first: 'x' as const, positions: [-100, 80, 100] };
    // Source now leaves from the bottom: the first value (an x) no longer fits and is dropped
    const fromBottom = resolveRoute(stored, { x: 0, y: 0 }, DOWN, { x: 400, y: 0 }, LEFT, ORIGIN, STUB);
    expect(fromBottom.firstAxis).toBe('v');
    expect(rightAngled(line({ x: 0, y: 0 }, routeCorners(fromBottom), { x: 400, y: 0 }))).toBe(true);
    // Target now entered from the top: one value too many, the last one goes
    const intoTop = resolveRoute(stored, { x: 0, y: 0 }, RIGHT, { x: 400, y: 100 }, UP, ORIGIN, STUB);
    expect(intoTop.positions).toHaveLength(4);
    expect(rightAngled(line({ x: 0, y: 0 }, routeCorners(intoTop), { x: 400, y: 100 }))).toBe(true);
    // Nothing stored that fits two facing ends: one middle segment
    const empty = resolveRoute({ first: 'y', positions: [] }, { x: 0, y: 0 }, RIGHT, { x: 400, y: 50 }, LEFT, ORIGIN, STUB);
    expect(empty.positions).toEqual([0, 200, 50]);
  });

  it('keeps room for an arrowhead out of each node', () => {
    // Inner segments pushed against the nodes come back out by the stub length
    const r = resolveRoute({ first: 'x', positions: [-195, 80, 195] }, { x: 0, y: 0 }, RIGHT, { x: 400, y: 0 }, LEFT, ORIGIN, STUB);
    expect(r.positions).toEqual([0, STUB, 80, 400 - STUB, 0]);
    // Ends too close for both stubs: the stored value stays
    const tight = resolveRoute({ first: 'x', positions: [0] }, { x: 0, y: 0 }, RIGHT, { x: 40, y: 50 }, LEFT, { x: 20, y: 25 }, STUB);
    expect(tight.positions).toEqual([0, 20, 50]);
  });
});

describe('editing a route', () => {
  it('splits a segment into two halves with an empty step between them', () => {
    expect(splitSegment([0, 200, 50], 1, 25)).toEqual([0, 200, 25, 200, 50]);
    // An end segment: the far half becomes an inner segment that can be moved
    expect(splitSegment([0, 200, 50], 0, 100)).toEqual([0, 100, 0, 200, 50]);
    expect(splitSegment([0, 200, 50], 2, 300)).toEqual([0, 200, 50, 300, 50]);
  });

  it('merges segments put back in line', () => {
    // The step at x 100 has no length any more: one horizontal line at y 0
    expect(mergeEmptySegments([0, 100, 0, 200, 50])).toEqual([0, 200, 50]);
    // Lined up with the target end: merged into it
    expect(mergeEmptySegments([0, 200, 50, 300, 50])).toEqual([0, 200, 50]);
    // Nothing in line
    expect(mergeEmptySegments([0, 100, 80, 300, 0])).toEqual([0, 100, 80, 300, 0]);
  });

  it('snaps onto the parallel segment one corner away', () => {
    expect(snapPosition([0, 100, 80, 300, 0], 2, 5, 8)).toBe(0);
    expect(snapPosition([0, 100, 80, 300, 0], 2, 30, 8)).toBe(30);
  });

  it('stores positions relative to the middle of the link and reads them back', () => {
    const route = { positions: [0, 100, 80, 300, 0], firstAxis: 'h' as const };
    const stored = storedRoute(route, ORIGIN);
    expect(stored).toEqual({ first: 'x', positions: [-100, 80, 100] });
    expect(resolveRoute(stored, { x: 0, y: 0 }, RIGHT, { x: 400, y: 0 }, LEFT, ORIGIN, STUB)).toEqual(route);
  });

  it('reads the segments of a polyline, empty and aligned steps left out', () => {
    expect(routeFromPolyline([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 200, y: 60 }]))
      .toEqual({ positions: [0, 100, 60], firstAxis: 'h' });
  });
});

describe('computeEdgeRoute with a hand-drawn route', () => {
  const input = (overrides: Partial<EdgeRouteInput> = {}): EdgeRouteInput => ({
    sourceX: 0, sourceY: 0, targetX: 400, targetY: 0,
    sourceHandleId: 'source-right', targetHandleId: 'target-left',
    curveMode: 'orthogonal', parallelIndex: 0, parallelCount: 1,
    sourceSlot: 0, targetSlot: 0, offset: { x: 0, y: 0 },
    hasStartArrow: false, hasEndArrow: true,
    ...overrides,
  });
  const pathPoints = (path: string) =>
    [...path.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));

  it('draws through the stored segments, arrow on the last one', () => {
    const route = computeEdgeRoute(input({ bends: { first: 'x', positions: [-100, 80, 100] } }));
    expect(pathPoints(route.path)).toEqual([
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 300, y: 80 }, { x: 300, y: 0 }, { x: 400 - 16, y: 0 },
    ]);
    expect(route.endAngle).toBe(0);
    expect(route.orthogonal?.route.positions).toEqual([0, 100, 80, 300, 0]);
    // Label on the middle segment
    expect([route.labelX, route.labelY]).toEqual([200, 80]);
  });

  it('gives the segments of the automatic route, so a first drag starts from what is drawn', () => {
    // Target lower and to the right: automatic route with a vertical middle segment
    const auto = computeEdgeRoute(input({ targetY: 120 }));
    const geometry = auto.orthogonal!;
    expect(geometry.route.firstAxis).toBe('h');
    // Stored as is and drawn again: the same line
    const again = computeEdgeRoute(input({ targetY: 120, bends: storedRoute(geometry.route, geometry.origin) }));
    expect(again.path).toBe(auto.path);
  });

  it('keeps the arrowhead out of the node when a corner is pushed against it', () => {
    const route = computeEdgeRoute(input({ bends: { first: 'x', positions: [-200, 80, 200] } }));
    const points = pathPoints(route.path);
    expect(points[1].x).toBe(ORTHOGONAL_MIN_STUB);
    expect(points.at(-2)!.x).toBe(400 - ORTHOGONAL_MIN_STUB);
  });
});
