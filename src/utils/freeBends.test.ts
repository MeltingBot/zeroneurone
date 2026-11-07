import { describe, it, expect } from 'vitest';
import { plainBendPoints, snapBend, storedBendPoints } from './freeBends';
import { computeEdgeRoute, type EdgeRouteInput } from './edgeRouting';

const input = (overrides: Partial<EdgeRouteInput> = {}): EdgeRouteInput => ({
  sourceX: 0, sourceY: 0, targetX: 400, targetY: 0,
  sourceHandleId: 'source-right', targetHandleId: 'target-left',
  curveMode: 'straight', parallelIndex: 0, parallelCount: 1,
  sourceSlot: 0, targetSlot: 0, offset: { x: 0, y: 0 },
  hasStartArrow: false, hasEndArrow: true,
  ...overrides,
});
const pathPoints = (path: string) =>
  [...path.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));

describe('straight links with bend points', () => {
  it('draws through the bend points, arrow along the last segment', () => {
    const route = computeEdgeRoute(input({ bendPoints: [{ x: 100, y: 150 }, { x: 300, y: 150 }] }));
    const points = pathPoints(route.path);
    expect(points.slice(0, 3)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 150 }, { x: 300, y: 150 }]);
    // Arrow tip on the target, coming from (300, 150): the line stops an arrow length before it
    expect(route.endAngle).toBeCloseTo(Math.atan2(-150, 100));
    expect(Math.hypot(400 - points[3].x, points[3].y)).toBeCloseTo(16);
    // Label halfway along the line, on the middle segment
    expect([route.labelX, route.labelY]).toEqual([200, 150]);
    expect(route.free?.points).toHaveLength(4);
  });

  it('gives the line of a link without bends, so a first bend can be added', () => {
    const route = computeEdgeRoute(input());
    expect(route.free).toEqual({ points: [{ x: 0, y: 0 }, { x: 400, y: 0 }] });
  });

  it('leaves bend points to straight mode', () => {
    const bent = computeEdgeRoute(input({ curveMode: 'orthogonal', bendPoints: [{ x: 0, y: 300 }] }));
    expect(bent.path).toBe(computeEdgeRoute(input({ curveMode: 'orthogonal' })).path);
  });
});

describe('editing bend points', () => {
  it('stores them on the canvas, none as null', () => {
    expect(storedBendPoints([{ x: 250, y: 40 }])).toEqual([{ x: 250, y: 40 }]);
    expect(storedBendPoints([])).toBeNull();
  });

  it('snaps level or plumb with a neighbour', () => {
    const previous = { x: 0, y: 0 };
    const next = { x: 400, y: 200 };
    expect(snapBend({ x: 5, y: 196 }, previous, next, 8)).toEqual({ x: 0, y: 200 });
    expect(snapBend({ x: 150, y: 90 }, previous, next, 8)).toEqual({ x: 150, y: 90 });
  });

  it('keeps well-formed bend points only', () => {
    expect(plainBendPoints([{ x: 1, y: 2 }])).toEqual([{ x: 1, y: 2 }]);
    expect(plainBendPoints([])).toBeNull();
    expect(plainBendPoints([{ x: 1, y: 'a' }])).toBeNull();
    expect(plainBendPoints({ x: 1, y: 2 })).toBeNull();
  });
});
