import { describe, it, expect } from 'vitest';
import Graph from 'graphology';
import { foldableLeaves, leafRing } from './leafFolding';

const graphOf = (edges: [string, string][]) => {
  const g = new Graph();
  for (const [a, b] of edges) {
    if (!g.hasNode(a)) g.addNode(a);
    if (!g.hasNode(b)) g.addNode(b);
    g.addEdge(a, b);
  }
  return g;
};

describe('foldableLeaves', () => {
  it('groups the elements with a single link by the one they hang from', () => {
    const g = graphOf([['h', 'a'], ['h', 'b'], ['h', 'c'], ['c', 'd'], ['d', 'h']]);
    expect(Object.fromEntries(foldableLeaves(g))).toEqual({ h: ['a', 'b'] });
  });

  it('leaves an isolated pair alone', () => {
    expect(foldableLeaves(graphOf([['a', 'b']])).size).toBe(0);
  });
});

describe('leafRing', () => {
  const box = { w: 60, h: 60 };
  const leaves = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `l${i}`, w: 60, h: 60 }));

  it('fills rings without two leaves overlapping, and none on the parent', () => {
    const { offsets, radius } = leafRing(box, leaves(60), 24, null);
    const pts = [...offsets.values()];
    expect(pts).toHaveLength(60);
    for (let i = 0; i < pts.length; i++) {
      expect(Math.hypot(pts[i].dx, pts[i].dy)).toBeGreaterThanOrEqual(60);
      for (let j = i + 1; j < pts.length; j++) {
        expect(Math.hypot(pts[i].dx - pts[j].dx, pts[i].dy - pts[j].dy)).toBeGreaterThanOrEqual(60);
      }
    }
    expect(radius).toBeLessThan(500);
  });

  it('puts a few leaves on an arc facing outward', () => {
    const { offsets } = leafRing(box, leaves(2), 24, 0);
    for (const { dx } of offsets.values()) expect(dx).toBeGreaterThan(0);
  });
});
