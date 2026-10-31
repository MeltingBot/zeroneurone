import { describe, it, expect } from 'vitest';
import Graph from 'graphology';
import { findArticulationPoints } from './algorithms';

function graphOf(edges: [string, string][], isolated: string[] = []): Graph {
  const g = new Graph({ type: 'undirected', multi: false });
  for (const [a, b] of edges) {
    if (!g.hasNode(a)) g.addNode(a);
    if (!g.hasNode(b)) g.addNode(b);
    if (!g.hasEdge(a, b)) g.addEdge(a, b);
  }
  for (const n of isolated) if (!g.hasNode(n)) g.addNode(n);
  return g;
}

const sorted = (g: Graph) => findArticulationPoints(g).sort();

describe('findArticulationPoints', () => {
  it('finds the middle of a path', () => {
    expect(sorted(graphOf([['a', 'b'], ['b', 'c']]))).toEqual(['b']);
  });

  it('finds none in a cycle', () => {
    expect(sorted(graphOf([['a', 'b'], ['b', 'c'], ['c', 'a']]))).toEqual([]);
  });

  it('finds the node joining two triangles', () => {
    const g = graphOf([
      ['a', 'b'], ['b', 'c'], ['c', 'a'],
      ['c', 'd'],
      ['d', 'e'], ['e', 'f'], ['f', 'd'],
    ]);
    expect(sorted(g)).toEqual(['c', 'd']);
  });

  it('finds the centre of a star', () => {
    expect(sorted(graphOf([['c', 'a'], ['c', 'b'], ['c', 'd']]))).toEqual(['c']);
  });

  it('handles several disconnected components independently', () => {
    const g = graphOf([
      ['a', 'b'], ['b', 'c'],            // b is one
      ['x', 'y'], ['y', 'z'], ['z', 'x'], // cycle, none
    ]);
    expect(sorted(g)).toEqual(['b']);
  });

  it('returns nothing for isolated nodes or a single edge', () => {
    expect(sorted(graphOf([], ['a', 'b', 'c']))).toEqual([]);
    expect(sorted(graphOf([['a', 'b']]))).toEqual([]);
  });

  it('finds every internal node of a long chain', () => {
    const edges: [string, string][] = [];
    for (let i = 0; i < 50; i++) edges.push([`n${i}`, `n${i + 1}`]);

    // Every node except the two ends splits the chain.
    expect(sorted(graphOf(edges))).toHaveLength(50 - 1 + 1 - 1);
  });

  it('does not overflow the stack on a very long chain', () => {
    // A recursive DFS blows up somewhere around 10 000 frames; a genealogy or
    // timeline import produces chains of exactly this shape.
    const edges: [string, string][] = [];
    for (let i = 0; i < 50_000; i++) edges.push([`n${i}`, `n${i + 1}`]);

    expect(() => findArticulationPoints(graphOf(edges))).not.toThrow();
  });
});
