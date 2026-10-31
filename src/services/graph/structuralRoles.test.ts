import { describe, it, expect } from 'vitest';
import Graph from 'graphology';
import betweennessCentrality from 'graphology-metrics/centrality/betweenness';
import { analyzeCuts, computeCommunities, computeStructuralRoles, type StructuralFact } from './structuralRoles';

/** Multi graph as the app builds it: one edge per link, its id in `id` */
function graphOf(edges: [string, string, string?][], isolated: string[] = []): Graph {
  const g = new Graph({ type: 'undirected', multi: true });
  edges.forEach(([a, b, id], i) => {
    if (!g.hasNode(a)) g.addNode(a);
    if (!g.hasNode(b)) g.addNode(b);
    g.addEdge(a, b, { id: id ?? `l${i}` });
  });
  for (const n of isolated) if (!g.hasNode(n)) g.addNode(n);
  return g;
}

const clique = (prefix: string, n: number): [string, string][] => {
  const edges: [string, string][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) edges.push([`${prefix}${i}`, `${prefix}${j}`]);
  return edges;
};

const roles = (g: Graph) => {
  const clusters = computeCommunities(g);
  return { clusters, ...computeStructuralRoles(g, clusters, betweennessCentrality(g, { normalized: true })) };
};
const kinds = (facts: StructuralFact[]) => facts.map((f) => f.kind);

describe('analyzeCuts', () => {
  it('finds the sides an articulation point separates', () => {
    const g = graphOf([['a', 'b'], ['b', 'c'], ['c', 'd'], ['c', 'e']]);
    const cuts = analyzeCuts(g);
    expect([...cuts.separations.keys()].sort()).toEqual(['b', 'c']);
    expect(cuts.bridges).toHaveLength(4);
  });

  it('never takes two parallel links for a bridge', () => {
    const g = graphOf([['a', 'b'], ['a', 'b'], ['b', 'c']]);
    const cuts = analyzeCuts(g);
    expect(cuts.bridges.map((b) => b.linkId)).toEqual(['l2']);
  });

  it('runs on a long chain without overflowing', () => {
    const edges: [string, string][] = Array.from({ length: 19999 }, (_, i) => [`n${i}`, `n${i + 1}`]);
    expect(analyzeCuts(graphOf(edges)).separations.size).toBe(19998);
  });
});

describe('computeCommunities', () => {
  it('gives the same groups whatever the order of the elements', () => {
    const edges: [string, string][] = [...clique('a', 5), ...clique('b', 5), ['a0', 'b0'], ['a1', 'x'], ['x', 'b1']];
    const shuffled = [...edges].reverse();
    const one = computeCommunities(graphOf(edges)).map((c) => [...c.elementIds].sort());
    const two = computeCommunities(graphOf(shuffled)).map((c) => [...c.elementIds].sort());
    expect(two).toEqual(one);
    expect(computeCommunities(graphOf(edges))).toEqual(computeCommunities(graphOf(edges)));
  });
});

describe('computeStructuralRoles', () => {
  it('names the element that alone links two groups', () => {
    const g = graphOf([...clique('a', 4), ...clique('b', 4), ['a0', 'x'], ['x', 'b0']]);
    const { facts, clusters } = roles(g);
    const sole = facts.find((f) => f.kind === 'soleConnector');
    expect(sole).toMatchObject({ elementId: expect.stringMatching(/^(x|a0|b0)$/) });
    expect(sole!.kind === 'soleConnector' && sole!.sides.map((s) => s.clusterId).sort())
      .toEqual(clusters.filter((c) => c.size >= 4).map((c) => c.id).sort());
  });

  it('names the single link between two groups', () => {
    const g = graphOf([...clique('a', 4), ...clique('b', 4), ['a0', 'b0', 'pont']]);
    const { facts } = roles(g);
    const bridge = facts.find((f) => f.kind === 'bridgeLink');
    expect(bridge).toMatchObject({ linkId: 'pont' });
    // Its ends' "sole connector" sentences say the same thing: dropped
    expect(kinds(facts)).not.toContain('soleConnector');
  });

  it('two parallel links between two groups make no bridge', () => {
    const g = graphOf([...clique('a', 4), ...clique('b', 4), ['a0', 'b0'], ['a0', 'b0']]);
    expect(kinds(roles(g).facts)).not.toContain('bridgeLink');
  });

  it('counts what falls off a hub', () => {
    const g = graphOf(['l1', 'l2', 'l3', 'l4', 'l5'].map((l) => ['hub', l] as [string, string]));
    const { facts } = roles(g);
    expect(facts).toEqual([expect.objectContaining({ kind: 'cutOff', elementId: 'hub', size: 4 })]);
  });

  it('finds a broker between three groups', () => {
    // Three groups, each tied to the broker and to the next group
    const edges: [string, string][] = [
      ...clique('a', 5), ...clique('b', 5), ...clique('c', 5),
      ['k', 'a0'], ['k', 'b0'], ['k', 'c0'],
      ['a1', 'b1'], ['b2', 'c2'], ['c3', 'a3'],
    ];
    const { facts } = roles(graphOf(edges));
    expect(facts).toContainEqual(expect.objectContaining({ kind: 'broker', elementId: 'k' }));
  });

  it('says nothing about a graph without structure', () => {
    expect(roles(graphOf(clique('a', 6))).facts).toEqual([]);
    expect(roles(graphOf([], ['a', 'b'])).facts).toEqual([]);
  });

  it('stays fast on a long chain', () => {
    const edges: [string, string][] = Array.from({ length: 4999 }, (_, i) => [`n${i}`, `n${i + 1}`]);
    const g = graphOf(edges);
    const t0 = performance.now();
    const { facts } = computeStructuralRoles(g, computeCommunities(g), {});
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(facts.length).toBeGreaterThan(0);
  });
});
