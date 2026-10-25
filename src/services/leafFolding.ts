/**
 * Leaves folded around the element they hang from.
 *
 * An element with a single link (a leaf) says nothing to a force layout but
 * its link: left to the forces, the leaves of a hub spread over the whole
 * graph and their links cross everything. The layouts take them out, lay the
 * rest out with each parent as a block holding its leaves, then put the
 * leaves back in tight rings around their parent.
 */
import type Graph from 'graphology';

export interface Box { w: number; h: number }

/** Leaves by the element they hang from; two linked leaves are left alone */
export function foldableLeaves(graph: Graph): Map<string, string[]> {
  const parentOf = new Map<string, string>();
  graph.forEachNode((node) => {
    const neighbours = graph.neighbors(node).filter((n) => n !== node);
    if (neighbours.length === 1) parentOf.set(node, neighbours[0]);
  });
  const byParent = new Map<string, string[]>();
  for (const [leaf, parent] of parentOf) {
    if (parentOf.get(parent) === leaf) continue; // an isolated pair: nothing to fold
    const list = byParent.get(parent);
    if (list) list.push(leaf); else byParent.set(parent, [leaf]);
  }
  return byParent;
}

export interface LeafRing {
  /** Leaf centre relative to the parent centre */
  offsets: Map<string, { dx: number; dy: number }>;
  /** Radius of the block (parent and leaves) around the parent centre */
  radius: number;
}

/**
 * Leaves around a parent: rings from the inside out, each as full as its
 * circumference allows. A few leaves (up to a third of the first ring) go on
 * an arc facing `outward` (radians), away from the rest of the graph.
 */
export function leafRing(parent: Box, leaves: { id: string; w: number; h: number }[], gap: number, outward: number | null): LeafRing {
  const offsets = new Map<string, { dx: number; dy: number }>();
  if (leaves.length === 0) return { offsets, radius: Math.hypot(parent.w, parent.h) / 2 };
  const cell = Math.max(...leaves.map((l) => Math.max(l.w, l.h))) + gap;
  let r = Math.hypot(parent.w, parent.h) / 2 + gap + cell / 2;
  let radius = 0;
  let i = 0;
  let first = true;
  while (i < leaves.length) {
    const capacity = Math.max(1, Math.floor((2 * Math.PI * r) / cell));
    const count = Math.min(capacity, leaves.length - i);
    const arc = first && outward !== null && count <= Math.max(1, Math.floor(capacity / 3));
    const step = arc ? cell / r : (2 * Math.PI) / count;
    const start = arc ? outward! - (step * (count - 1)) / 2 : -Math.PI / 2;
    for (let k = 0; k < count; k++, i++) {
      const a = start + k * step;
      const leaf = leaves[i];
      offsets.set(leaf.id, { dx: Math.cos(a) * r, dy: Math.sin(a) * r });
      radius = Math.max(radius, r + Math.max(leaf.w, leaf.h) / 2);
    }
    r += cell;
    first = false;
  }
  return { offsets, radius };
}

/** Where a laid-out graph keeps its node centres */
export type PositionMap = Map<string, { x: number; y: number }>;

/**
 * Put folded leaves back around their parent (laid out as a block): an arc
 * facing away from the parent's other neighbours when there are few, rings
 * otherwise.
 */
export function placeLeaves(
  positions: PositionMap,
  leaves: Map<string, string[]>,
  core: Graph,
  dims: (id: string) => Box,
  gap: number,
): void {
  for (const [parentId, list] of leaves) {
    const p = positions.get(parentId);
    if (!p) continue;
    let sx = 0, sy = 0, n = 0;
    if (core.hasNode(parentId)) {
      core.forEachNeighbor(parentId, (m) => {
        const q = positions.get(m);
        if (q) { sx += q.x; sy += q.y; n++; }
      });
    }
    const outward = n > 0 ? Math.atan2(p.y - sy / n, p.x - sx / n) : null;
    const { offsets } = leafRing(dims(parentId), list.map((l) => ({ id: l, ...dims(l) })), gap, outward);
    for (const [leafId, { dx, dy }] of offsets) positions.set(leafId, { x: p.x + dx, y: p.y + dy });
  }
}

/** Size of a parent laid out as a block holding its leaves */
export function blockBox(id: string, leaves: Map<string, string[]>, dims: (id: string) => Box, gap: number): Box {
  const d = dims(id);
  const list = leaves.get(id);
  if (!list) return d;
  const { radius } = leafRing(d, list.map((l) => ({ id: l, ...dims(l) })), gap, null);
  return { w: Math.max(d.w, radius * 2), h: Math.max(d.h, radius * 2) };
}

export interface FoldedTree {
  /** The graph left once every level of leaves is taken out */
  core: Graph;
  /** Size of an element as laid out: itself, or the block holding its leaves */
  block: (id: string) => Box;
  /** Put the leaves back, level by level, around their laid-out parents */
  place: (positions: PositionMap) => void;
  /** Move laid-out elements out of the folded blocks, along the radius */
  clear: (nodes: { id: string; x: number; y: number; w: number; h: number }[]) => void;
}

/**
 * Leaves taken out level by level: the leaves first, then the elements left
 * with a single link once their leaves are gone (a group hanging from a hub),
 * and so on. Each parent becomes a block holding its leaves; the core is laid
 * out with those blocks, then the levels are put back from the outermost in.
 */
export function foldTree(graph: Graph, dims: (id: string) => Box, gap: number): FoldedTree {
  const levels: Map<string, string[]>[] = [];
  let core = graph;
  for (;;) {
    const leaves = foldableLeaves(core);
    if (leaves.size === 0) break;
    if (core === graph) core = graph.copy();
    for (const list of leaves.values()) for (const id of list) core.dropNode(id);
    levels.push(leaves);
  }

  // Blocks from the inside out; a parent's box before each level is kept to
  // place that level's leaves around what it already holds
  const blocks = new Map<string, Box>();
  const block = (id: string) => blocks.get(id) ?? dims(id);
  const before: Map<string, Box>[] = [];
  for (const leaves of levels) {
    const boxes = new Map<string, Box>();
    for (const parent of leaves.keys()) boxes.set(parent, block(parent));
    before.push(boxes);
    for (const parent of leaves.keys()) blocks.set(parent, blockBox(parent, leaves, block, gap));
  }

  const place = (positions: PositionMap) => {
    for (let k = levels.length - 1; k >= 0; k--) {
      const boxes = before[k];
      placeLeaves(positions, levels[k], graph, (id) => boxes.get(id) ?? block(id), gap);
    }
  };
  // The overlap removal sees a block as a square and pushes along one axis,
  // throwing elements far off: first set them just outside the block's disc
  const clear = (nodes: { id: string; x: number; y: number; w: number; h: number }[]) => {
    const discs = nodes.filter((n) => blocks.has(n.id)).map((n) => ({ id: n.id, x: n.x, y: n.y, r: n.w / 2 }));
    for (const disc of discs) {
      for (const n of nodes) {
        // Only what is smaller moves: a small group never pushes the hub
        if (n.id === disc.id || Math.max(n.w, n.h) / 2 >= disc.r) continue;
        const reach = disc.r + Math.max(n.w, n.h) / 2 + gap;
        const dx = n.x - disc.x;
        const dy = n.y - disc.y;
        const d = Math.hypot(dx, dy);
        if (d >= reach) continue;
        const a = d > 0 ? Math.atan2(dy, dx) : Math.random() * 2 * Math.PI;
        n.x = disc.x + Math.cos(a) * reach;
        n.y = disc.y + Math.sin(a) * reach;
      }
    }
  };

  return { core, block, place, clear };
}
