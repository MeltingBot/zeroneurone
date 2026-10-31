import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';

/**
 * Structural roles: who holds the network together.
 *
 * Shared by the graph worker and the main-thread fallback. The output is
 * structured facts (ids and sizes, no text): the worker has no i18n, and the
 * panel and the report each phrase them their own way.
 */

// ============================================================================
// COMMUNITIES (deterministic Louvain)
// ============================================================================

export interface CommunityCluster {
  id: number;
  elementIds: string[];
  size: number;
}

/** mulberry32: a small seeded generator, enough for Louvain's shuffles */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LOUVAIN_SEED = 0x5a17;

/**
 * Louvain communities of more than one element, the largest first.
 *
 * Louvain shuffles nodes at random, and its result also depends on the order
 * nodes were added in. A fixed seed on a graph rebuilt in id order makes the
 * grouping a function of the structure alone: the same dossier gives the same
 * groups, whatever the order of its elements (undo, sync, import).
 */
export function computeCommunities(graph: Graph): CommunityCluster[] {
  if (graph.order === 0) return [];
  const sorted = new Graph({ type: 'undirected', multi: true });
  for (const node of [...graph.nodes()].sort()) sorted.addNode(node);
  const edges = graph.edges().map((e) => {
    const [a, b] = [graph.source(e), graph.target(e)].sort();
    return { id: String(graph.getEdgeAttribute(e, 'id') ?? ''), a, b };
  });
  edges.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : x.a < y.a ? -1 : x.a > y.a ? 1 : x.b < y.b ? -1 : x.b > y.b ? 1 : 0));
  for (const e of edges) sorted.addEdge(e.a, e.b);

  let communities: Record<string, number>;
  try {
    communities = louvain(sorted, { rng: seededRandom(LOUVAIN_SEED) });
  } catch {
    return [];
  }
  const byCommunity = new Map<number, string[]>();
  for (const node of sorted.nodes()) {
    const c = communities[node];
    const members = byCommunity.get(c);
    if (members) members.push(node);
    else byCommunity.set(c, [node]);
  }
  return [...byCommunity.values()]
    .filter((members) => members.length > 1)
    .sort((x, y) => y.length - x.length || (x[0] < y[0] ? -1 : 1))
    .map((elementIds, id) => ({ id, elementIds, size: elementIds.length }));
}

// ============================================================================
// CUTS (Tarjan, with the sides each cut separates)
// ============================================================================

export interface CutBridge {
  parentId: string;
  childId: string;
  linkId: string;
}

export interface CutAnalysis {
  /** DFS preorder: a subtree is the slice [disc, disc + size) of it */
  order: string[];
  disc: Map<string, number>;
  size: Map<string, number>;
  rootOf: Map<string, string>;
  /** Articulation point → children whose subtree splits off when it goes */
  separations: Map<string, string[]>;
  /** Single links whose removal splits a component */
  bridges: CutBridge[];
}

/**
 * Articulation points with the sides they separate, and bridge links. One
 * iterative DFS, O(V + E).
 *
 * `neighbors()` merges parallel links: a second link to the DFS parent is a
 * way back, so two parallel links are never a bridge.
 */
export function analyzeCuts(graph: Graph): CutAnalysis {
  const order: string[] = [];
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const size = new Map<string, number>();
  const rootOf = new Map<string, string>();
  const separations = new Map<string, string[]>();
  const bridges: CutBridge[] = [];

  const visit = (node: string, from: string | null, root: string) => {
    parent.set(node, from);
    disc.set(node, order.length);
    low.set(node, order.length);
    size.set(node, 1);
    rootOf.set(node, root);
    order.push(node);
  };

  for (const root of graph.nodes()) {
    if (disc.has(root)) continue;
    visit(root, null, root);
    const stack: { node: string; neighbors: string[]; index: number }[] = [
      { node: root, neighbors: graph.neighbors(root), index: 0 },
    ];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const u = frame.node;
      if (frame.index < frame.neighbors.length) {
        const v = frame.neighbors[frame.index++];
        if (v === u) continue;
        if (!disc.has(v)) {
          visit(v, u, root);
          stack.push({ node: v, neighbors: graph.neighbors(v), index: 0 });
        } else if (v !== parent.get(u) || graph.edges(u, v).length > 1) {
          low.set(u, Math.min(low.get(u)!, disc.get(v)!));
        }
        continue;
      }
      stack.pop();
      const p = parent.get(u);
      if (p === null || p === undefined) continue;
      size.set(p, size.get(p)! + size.get(u)!);
      low.set(p, Math.min(low.get(p)!, low.get(u)!));
      if (low.get(u)! >= disc.get(p)!) {
        const children = separations.get(p);
        if (children) children.push(u);
        else separations.set(p, [u]);
      }
      if (low.get(u)! > disc.get(p)!) {
        const edge = graph.edges(p, u)[0];
        bridges.push({ parentId: p, childId: u, linkId: String(graph.getEdgeAttribute(edge, 'id') ?? edge) });
      }
    }
    // The DFS root splits the graph only with two child subtrees or more
    if ((separations.get(root)?.length ?? 0) < 2) separations.delete(root);
  }

  return { order, disc, size, rootOf, separations, bridges };
}

// ============================================================================
// FACTS
// ============================================================================

/** One side of a cut: its main group (when it has one) and its best-linked member */
export interface RoleSide {
  /** Cluster holding at least half of the side, if any */
  clusterId: number | null;
  size: number;
  leadId: string;
}

export type StructuralFact =
  /** X alone links two groups or more */
  | { kind: 'soleConnector'; elementId: string; sides: RoleSide[]; others: number; weight: number }
  /** The link between X and Y is the only way between two groups */
  | { kind: 'bridgeLink'; linkId: string; fromId: string; toId: string; sides: [RoleSide, RoleSide]; weight: number }
  /** X alone gives access to `size` elements */
  | { kind: 'cutOff'; elementId: string; size: number; leadId: string; cutIds: string[]; weight: number }
  /** X sits between three groups or more, without being their only link */
  | { kind: 'broker'; elementId: string; clusterIds: number[]; betweenness: number; weight: number };

export interface StructuralRoles {
  facts: StructuralFact[];
  /** Best-linked member of each cluster: the cluster is named after it */
  clusterLeads: Record<number, string>;
}

export const MAX_FACTS = 200;
const MAX_BROKERS = 10;
/** Cuts described in full: ranking first needs the sizes only */
const CANDIDATES = 300;
const MAX_CUT_IDS = 500;

interface Part { start: number; end: number; skip?: [number, number][] }

/**
 * Who holds the network together, ranked by how much falls apart without
 * them: sole connectors between groups, bridge links, elements whose loss
 * cuts others off, then brokers between groups.
 */
export function computeStructuralRoles(
  graph: Graph,
  clusters: readonly CommunityCluster[],
  betweenness: Readonly<Record<string, number>>,
): StructuralRoles {
  const clusterOf = new Map<string, number>();
  const clusterLeads: Record<number, string> = {};
  const degree = (n: string) => graph.degree(n);
  const better = (a: string, b: string) => degree(a) > degree(b) || (degree(a) === degree(b) && a < b);
  for (const c of clusters) {
    let lead = c.elementIds[0];
    for (const id of c.elementIds) {
      clusterOf.set(id, c.id);
      if (better(id, lead)) lead = id;
    }
    clusterLeads[c.id] = lead;
  }
  if (graph.order < 3) return { facts: [], clusterLeads };

  const cuts = analyzeCuts(graph);
  const { order, disc, size, rootOf } = cuts;

  const partSize = (p: Part) =>
    p.end - p.start - (p.skip ?? []).reduce((sum, [s, e]) => sum + e - s, 0);
  const partNodes = function* (p: Part) {
    const skip = p.skip ?? [];
    let k = 0;
    for (let i = p.start; i < p.end; i++) {
      while (k < skip.length && skip[k][1] <= i) k++;
      if (k < skip.length && i >= skip[k][0]) { i = skip[k][1] - 1; continue; }
      yield order[i];
    }
  };
  const describe = (p: Part): RoleSide => {
    const counts = new Map<number, number>();
    let lead: string | null = null;
    let n = 0;
    for (const id of partNodes(p)) {
      n++;
      const c = clusterOf.get(id);
      if (c !== undefined) counts.set(c, (counts.get(c) ?? 0) + 1);
      if (lead === null || better(id, lead)) lead = id;
    }
    let clusterId: number | null = null;
    let best = 0;
    for (const [c, count] of counts) {
      if (count > best || (count === best && clusterId !== null && c < clusterId)) { clusterId = c; best = count; }
    }
    return { clusterId: best * 2 >= n && n >= 2 ? clusterId : null, size: n, leadId: lead! };
  };
  const subtree = (v: string): Part => ({ start: disc.get(v)!, end: disc.get(v)! + size.get(v)! });

  // Articulation points: the parts left once the point is gone
  const articulations = [...cuts.separations].map(([u, children]) => {
    const parts = children.map(subtree);
    const root = rootOf.get(u)!;
    if (root !== u) {
      const at = disc.get(u)!;
      const skip = [[at, at + 1] as [number, number], ...parts.map((p) => [p.start, p.end] as [number, number])]
        .sort((a, b) => a[0] - b[0]);
      parts.push({ start: disc.get(root)!, end: disc.get(root)! + size.get(root)!, skip });
    }
    const sizes = parts.map(partSize);
    const largest = Math.max(...sizes);
    return { u, parts, weight: sizes.reduce((s, x) => s + x, 0) - largest };
  });
  articulations.sort((a, b) => b.weight - a.weight || (betweenness[b.u] ?? 0) - (betweenness[a.u] ?? 0) || (a.u < b.u ? -1 : 1));

  const facts: StructuralFact[] = [];
  const taken = new Set<string>();
  for (const { u, parts, weight } of articulations.slice(0, CANDIDATES)) {
    const sides = parts.map((p) => ({ part: p, side: describe(p) })).sort((a, b) => b.side.size - a.side.size);
    const named = new Map<number, RoleSide>();
    for (const { side } of sides) {
      if (side.clusterId !== null && !named.has(side.clusterId)) named.set(side.clusterId, side);
    }
    if (named.size >= 2) {
      const shown = [...named.values()];
      const others = sides.reduce((s, { side }) => s + side.size, 0) - shown.reduce((s, x) => s + x.size, 0);
      facts.push({ kind: 'soleConnector', elementId: u, sides: shown, others, weight });
      taken.add(u);
    } else if (weight >= 2) {
      const cut = sides.slice(1);
      const cutIds: string[] = [];
      for (const { part } of cut) {
        for (const id of partNodes(part)) {
          if (cutIds.length >= MAX_CUT_IDS) break;
          cutIds.push(id);
        }
      }
      facts.push({ kind: 'cutOff', elementId: u, size: weight, leadId: cut[0].side.leadId, cutIds, weight });
      taken.add(u);
    }
  }

  // Bridge links between two named groups; leaf links say nothing
  const bridges = cuts.bridges
    .map((b) => {
      const root = rootOf.get(b.childId)!;
      const inner = subtree(b.childId);
      const outer: Part = { start: disc.get(root)!, end: disc.get(root)! + size.get(root)!, skip: [[inner.start, inner.end]] };
      return { b, inner, outer, weight: Math.min(partSize(inner), partSize(outer)) };
    })
    .filter((x) => x.weight >= 2)
    .sort((a, b) => b.weight - a.weight || (a.b.linkId < b.b.linkId ? -1 : 1));
  for (const { b, inner, outer, weight } of bridges.slice(0, CANDIDATES)) {
    const a = describe(outer);
    const c = describe(inner);
    if (a.clusterId === null || c.clusterId === null || a.clusterId === c.clusterId) continue;
    facts.push({ kind: 'bridgeLink', linkId: b.linkId, fromId: b.parentId, toId: b.childId, sides: [a, c], weight });
    taken.add(b.parentId);
    taken.add(b.childId);
  }

  // One sentence per pair of groups: along a chain A - x - y - B, every
  // element and link is "the only way" between A and B. Keep the cut that
  // weighs most; on a tie, the element (the plainer sentence).
  const pairOf = (f: StructuralFact) =>
    (f.kind === 'soleConnector' && f.sides.length === 2) || f.kind === 'bridgeLink'
      ? [f.sides[0].clusterId, f.sides[1].clusterId].sort().join('|')
      : null;
  const bestOfPair = new Map<string, StructuralFact>();
  for (const f of facts) {
    const key = pairOf(f);
    if (key === null) continue;
    const seen = bestOfPair.get(key);
    if (!seen || f.weight > seen.weight || (f.weight === seen.weight && f.kind === 'soleConnector' && seen.kind !== 'soleConnector')) {
      bestOfPair.set(key, f);
    }
  }
  const kept = facts.filter((f) => {
    const key = pairOf(f);
    return key === null || bestOfPair.get(key) === f;
  });

  kept.sort((a, b) => b.weight - a.weight);

  // Brokers: among the highest betweenness, those reaching three groups
  const topCount = Math.max(10, Math.ceil(graph.order * 0.05));
  const candidates = Object.entries(betweenness)
    .filter(([id, value]) => value > 0 && graph.hasNode(id) && !taken.has(id))
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, topCount);
  const brokers: StructuralFact[] = [];
  for (const [id, value] of candidates) {
    if (brokers.length >= MAX_BROKERS) break;
    const reached = new Set<number>();
    for (const n of graph.neighbors(id)) {
      const c = clusterOf.get(n);
      if (c !== undefined) reached.add(c);
    }
    const own = clusterOf.get(id);
    if (own !== undefined) reached.add(own);
    if (reached.size < 3) continue;
    brokers.push({ kind: 'broker', elementId: id, clusterIds: [...reached].sort((a, b) => a - b), betweenness: value, weight: 0 });
  }

  // Cuts first; the brokers found keep their place at the end
  return { facts: [...kept.slice(0, MAX_FACTS - brokers.length), ...brokers], clusterLeads };
}
