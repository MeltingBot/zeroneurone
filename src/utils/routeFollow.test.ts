import { describe, it, expect } from 'vitest';
import type { Element, Link } from '../types';
import { brokenRoutes, canvasMoves, followedRoutes, routeOfCopy } from './routeFollow';

const el = (id: string, x: number, y: number, parentGroupId: string | null = null) =>
  ({ id, position: { x, y }, parentGroupId }) as unknown as Element;
const link = (id: string, fromId: string, toId: string, extra: Partial<Link> = {}) =>
  ({ id, fromId, toId, ...extra }) as unknown as Link;

const elements = [el('a', 0, 0), el('b', 400, 0), el('g', 1000, 0), el('c', 10, 10, 'g'), el('d', 50, 10, 'g')];
const route = { first: 'x' as const, positions: [100, 80, 300] };
const bends = [{ x: 200, y: 150 }];

describe('hand-drawn routes follow moves of both ends', () => {
  it('stay in place when one end moves', () => {
    const moveOf = canvasMoves(elements, new Map([['b', { x: 450, y: 60 }]]));
    expect(followedRoutes([link('l', 'a', 'b', { orthogonalRoute: route, bendPoints: bends })], moveOf)).toEqual([]);
  });

  it('move with both ends moved by the same amount: x and y in turn', () => {
    const moveOf = canvasMoves(elements, new Map([['a', { x: 30, y: 20 }], ['b', { x: 430, y: 20 }]]));
    expect(followedRoutes([link('l', 'a', 'b', { orthogonalRoute: route, bendPoints: bends })], moveOf)).toEqual([{
      id: 'l',
      changes: { orthogonalRoute: { first: 'x', positions: [130, 100, 330] }, bendPoints: [{ x: 230, y: 170 }] },
    }]);
    // A route starting with a y
    expect(followedRoutes([link('l', 'a', 'b', { orthogonalRoute: { first: 'y', positions: [50, 200] } })], moveOf)[0].changes)
      .toEqual({ orthogonalRoute: { first: 'y', positions: [70, 230] } });
  });

  it('move with a group moved, for links between its children', () => {
    const moveOf = canvasMoves(elements, new Map([['g', { x: 1100, y: 50 }]]));
    expect(followedRoutes([link('l', 'c', 'd', { bendPoints: bends })], moveOf)).toEqual([
      { id: 'l', changes: { bendPoints: [{ x: 300, y: 200 }] } },
    ]);
    // A link leaving the group: one end moved only
    expect(followedRoutes([link('l', 'c', 'a', { bendPoints: bends })], moveOf)).toEqual([]);
  });

  it('leave links without a hand-drawn route alone', () => {
    const moveOf = canvasMoves(elements, new Map([['a', { x: 30, y: 20 }], ['b', { x: 430, y: 20 }]]));
    expect(followedRoutes([link('l', 'a', 'b')], moveOf)).toEqual([]);
  });
});

describe('routes broken by an automatic layout', () => {
  it('are the hand-drawn routes of links whose ends moved by different amounts', () => {
    const moveOf = canvasMoves(elements, new Map([['a', { x: 30, y: 20 }], ['b', { x: 500, y: 90 }]]));
    const drawn = link('drawn', 'a', 'b', { bendPoints: bends });
    const plain = link('plain', 'a', 'b');
    expect(brokenRoutes([drawn, plain], moveOf).map((l) => l.id)).toEqual(['drawn']);
    // Both ends moved together: the route follows, nothing broken
    const together = canvasMoves(elements, new Map([['a', { x: 30, y: 20 }], ['b', { x: 430, y: 20 }]]));
    expect(brokenRoutes([drawn], together)).toEqual([]);
  });
});

describe('routes of copied links', () => {
  const at = (x: number, y: number, parentGroupId: string | null = null) => ({ position: { x, y }, parentGroupId });
  const drawn = { orthogonalRoute: route, bendPoints: bends };

  it('move with the copies when both ends moved alike', () => {
    expect(routeOfCopy(drawn, { original: at(0, 0), copy: at(40, 40) }, { original: at(400, 0), copy: at(440, 40) }))
      .toEqual({ orthogonalRoute: { first: 'x', positions: [140, 120, 340] }, bendPoints: [{ x: 240, y: 190 }] });
  });

  it('go back to automatic when the ends moved apart or sit in a group', () => {
    const cleared = { orthogonalRoute: null, bendPoints: null };
    expect(routeOfCopy(drawn, { original: at(0, 0), copy: at(40, 40) }, { original: at(400, 0), copy: at(400, 0) })).toEqual(cleared);
    expect(routeOfCopy(drawn, { original: at(0, 0, 'g'), copy: at(40, 40) }, { original: at(400, 0), copy: at(440, 40) })).toEqual(cleared);
  });

  it('add nothing to a link without a hand-drawn route', () => {
    expect(routeOfCopy({}, { original: at(0, 0), copy: at(9, 9) }, { original: at(1, 1), copy: at(5, 5) })).toEqual({});
  });
});
