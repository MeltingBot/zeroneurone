import { describe, it, expect } from 'vitest';
import { computeEdgeRoute, computeHandleSlots, type EdgeCurveMode, type EdgeRouteInput } from './edgeRouting';

const ZERO = { x: 0, y: 0 };

function route(overrides: Partial<EdgeRouteInput> = {}) {
  return computeEdgeRoute({
    sourceX: 0, sourceY: 0, targetX: 400, targetY: 0,
    sourceHandleId: 'source-right', targetHandleId: 'target-left',
    curveMode: 'orthogonal', parallelIndex: 0, parallelCount: 1,
    sourceSlot: 0, targetSlot: 0, offset: ZERO,
    hasStartArrow: false, hasEndArrow: true,
    ...overrides,
  });
}

/** Points of a polyline path (M/L commands) */
function pathPoints(path: string) {
  return [...path.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map(m => ({ x: Number(m[1]), y: Number(m[2]) }));
}

describe('computeHandleSlots', () => {
  const positions = new Map([
    ['hub', { x: 0, y: 0 }],
    ['above', { x: 300, y: -200 }],
    ['level', { x: 300, y: 0 }],
    ['below', { x: 300, y: 200 }],
  ]);
  const link = (id: string, toId: string, tie = 0) =>
    ({ id, fromId: 'hub', toId, sourceHandle: 'source-right', targetHandle: 'target-left', tie });

  it('spreads links sharing a side in the order of their other end', () => {
    const slots = computeHandleSlots([link('b', 'below'), link('a', 'above'), link('l', 'level')], positions);
    expect([slots.get('a')!.source, slots.get('l')!.source, slots.get('b')!.source]).toEqual([-12, 0, 12]);
  });

  it('keeps parallel links in their rank order at both ends', () => {
    const slots = computeHandleSlots([link('p1', 'level', 1), link('p0', 'level', 0)], positions);
    expect(slots.get('p0')!.source).toBeLessThan(slots.get('p1')!.source);
    expect(slots.get('p0')!.target).toBeLessThan(slots.get('p1')!.target);
  });

  it('leaves a link alone on its side at the handle centre', () => {
    expect(computeHandleSlots([link('a', 'above')], positions).get('a')).toBeUndefined();
  });
});

describe('computeEdgeRoute', () => {
  it('ends every mode on the slot-shifted handle, along the node side', () => {
    for (const curveMode of ['straight', 'curved', 'orthogonal'] as EdgeCurveMode[]) {
      const r = route({ curveMode, sourceSlot: -12, targetSlot: 6 });
      expect(r.sourcePoint).toEqual({ x: 0, y: -12 });
      expect(r.targetPoint).toEqual({ x: 400, y: 6 });
    }
  });

  it('runs orthogonal lanes in slot order, wider than the slots', () => {
    const lanes = [-12, 0, 12].map((slot, i) => {
      const points = pathPoints(route({ sourceSlot: slot, targetSlot: slot, parallelIndex: i, parallelCount: 3 }).path);
      return points[2].y; // run after the source stub
    });
    expect(lanes).toEqual([-30, 0, 30]);
  });

  it('shrinks lanes when the nodes are close, keeping their order', () => {
    const far = pathPoints(route({ sourceSlot: 12, targetSlot: 12 }).path)[2].y;
    const close = pathPoints(route({ targetX: 70, sourceSlot: 12, targetSlot: 12 }).path);
    const closeRun = close.length > 3 ? close[2].y : 12;
    expect(closeRun).toBeGreaterThanOrEqual(12);
    expect(closeRun).toBeLessThan(far);
  });

  it('moves the middle segment and the runs of an orthogonal route by its offset', () => {
    const base = pathPoints(route().path);
    const moved = pathPoints(route({ offset: { x: 40, y: -50 } }).path);
    expect(base.every(p => p.y === 0)).toBe(true);
    expect(moved.some(p => p.y === -50)).toBe(true);
    expect(route({ offset: { x: 40, y: -50 } }).adjustable).toBe(true);
  });

  it('keeps the whole arrowhead on a straight part before the corner', () => {
    const points = pathPoints(route({ sourceSlot: 12, targetSlot: 12 }).path);
    const end = points[points.length - 1]; // line end, where the arrowhead starts
    const corner = points[points.length - 2];
    expect(end).toEqual({ x: 384, y: 12 }); // 16 px arrow before the target handle
    expect(corner.y).toBe(end.y);
    expect(400 - corner.x).toBeGreaterThanOrEqual(28); // arrow + 12 px of line
  });
});
