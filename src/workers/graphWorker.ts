/**
 * Graph Worker
 *
 * Offloads heavy graph computations (insights, layout) from the main thread.
 * Bridges are articulation points (Tarjan, O(n+m), see graph/algorithms);
 * similar labels use a sorted sliding window (O(n log n)).
 */

import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';
import betweennessCentrality from 'graphology-metrics/centrality/betweenness';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { random } from 'graphology-layout';
import dagre from '@dagrejs/dagre';
import { computeElementDimensions } from '../utils/elementDimensions';
import type { ElementShape, ElementSize } from '../types';
import { findArticulationPoints, detectSimilarLabels } from '../services/graph/algorithms';
import { removeOverlaps } from '../utils/removeOverlaps';
import { packClusters } from '../utils/packClusters';
import { connectedComponents } from '../utils/connectedComponents';
import { foldTree } from '../services/leafFolding';

// ============================================================================
// TYPES
// ============================================================================

interface SerializedElement {
  id: string;
  label: string;
  isGroup?: boolean;
  position: { x: number; y: number };
  /** Visual props used to compute the real rendered footprint for layout. */
  shape?: ElementShape;
  size?: ElementSize;
  customWidth?: number;
  customHeight?: number;
  hasImage?: boolean;
}

interface SerializedLink {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
  direction?: string;
}

interface LayoutOptions {
  center?: { x: number; y: number };
  layoutType: 'force' | 'clusters' | 'circular' | 'grid' | 'random' | 'hierarchy';
  /** Locked elements as discs (canvas centre + radius): clusters are packed around them */
  obstacles?: { x: number; y: number; r: number }[];
}

interface InsightsData {
  clusters: { id: number; elementIds: string[]; size: number }[];
  centrality: { elementId: string; degree: number; betweenness: number; score: number }[];
  bridges: string[];
  isolated: string[];
  similarLabels: { elementId1: string; elementId2: string; similarity: number }[];
}

// Every request carries an id, echoed by its responses (progress included),
// so the main thread can tell a stale answer from the one it waits for.
type WorkerRequest = { requestId?: number } & (
  | { type: 'computeInsights'; elements: SerializedElement[]; links: SerializedLink[] }
  | { type: 'computeLayout'; elements: SerializedElement[]; links: SerializedLink[]; options: LayoutOptions }
);

type WorkerResponse = { requestId?: number } & (
  | { type: 'insightsResult'; data: InsightsData }
  | { type: 'layoutResult'; positions: Record<string, { x: number; y: number }> }
  | { type: 'progress'; percent: number; phase: string }
  | { type: 'error'; message: string }
);

/** Id of the request being computed, echoed by progress messages */
let currentRequestId: number | undefined;

// ============================================================================
// GRAPH BUILDING
// ============================================================================

function buildGraph(elements: SerializedElement[], links: SerializedLink[]): Graph {
  const graph = new Graph({ type: 'undirected', multi: true });

  for (const element of elements) {
    if (element.isGroup) continue;
    graph.addNode(element.id, { label: element.label, x: element.position.x, y: element.position.y });
  }

  for (const link of links) {
    if (graph.hasNode(link.fromId) && graph.hasNode(link.toId)) {
      graph.addEdge(link.fromId, link.toId, { id: link.id });
    }
  }

  return graph;
}

// ============================================================================
// INSIGHTS COMPUTATION
// ============================================================================

function computeInsights(elements: SerializedElement[], links: SerializedLink[]): InsightsData {
  const graph = buildGraph(elements, links);

  if (graph.order === 0) {
    return { clusters: [], centrality: [], bridges: [], isolated: [], similarLabels: [] };
  }

  // Report progress
  postProgress(10, 'clusters');

  // Clusters (Louvain)
  const clusters: InsightsData['clusters'] = [];
  try {
    const communities = louvain(graph);
    const clusterMap = new Map<number, string[]>();
    for (const [nodeId, communityId] of Object.entries(communities)) {
      const existing = clusterMap.get(communityId) || [];
      existing.push(nodeId);
      clusterMap.set(communityId, existing);
    }
    let id = 0;
    for (const [, elementIds] of clusterMap) {
      if (elementIds.length > 1) {
        clusters.push({ id: id++, elementIds, size: elementIds.length });
      }
    }
    clusters.sort((a, b) => b.size - a.size);
  } catch { /* empty */ }

  postProgress(25, 'centrality');

  // Betweenness centrality (normalized)
  let betweennessMap: Record<string, number> = {};
  try {
    betweennessMap = betweennessCentrality(graph, { normalized: true });
  } catch { /* empty — fails on graphs with <2 nodes */ }

  postProgress(40, 'centrality');

  // Centrality (degree + betweenness)
  const centrality: InsightsData['centrality'] = [];
  const maxDegree = Math.max(1, graph.order - 1);
  graph.forEachNode((nodeId) => {
    const degree = graph.degree(nodeId);
    if (degree > 0) {
      centrality.push({
        elementId: nodeId,
        degree,
        betweenness: betweennessMap[nodeId] ?? 0,
        score: degree / maxDegree,
      });
    }
  });
  // Whole list, as insightsService: the panel pages through it
  centrality.sort((a, b) => b.degree - a.degree);

  postProgress(50, 'bridges');

  // Bridges (Tarjan — O(V+E))
  const bridges = graph.order > 2 ? findArticulationPoints(graph) : [];

  postProgress(70, 'isolated');

  // Isolated nodes
  const isolated: string[] = [];
  graph.forEachNode((nodeId) => {
    if (graph.degree(nodeId) === 0) {
      isolated.push(nodeId);
    }
  });

  postProgress(85, 'similar labels');

  // Similar labels (sorted + sliding window)
  const similarLabels = detectSimilarLabels(elements);

  postProgress(100, 'done');

  return { clusters, centrality, bridges, isolated, similarLabels };
}

// ============================================================================
// LAYOUT COMPUTATION
// ============================================================================

function computeLayout(
  elements: SerializedElement[],
  links: SerializedLink[],
  options: LayoutOptions
): Record<string, { x: number; y: number }> {
  const filteredElements = elements.filter(el => !el.isGroup);
  if (filteredElements.length === 0) return {};

  const graph = new Graph();
  for (const el of filteredElements) {
    graph.addNode(el.id, { x: el.position.x, y: el.position.y });
  }
  for (const link of links) {
    if (graph.hasNode(link.fromId) && graph.hasNode(link.toId)) {
      try { graph.addEdge(link.fromId, link.toId); } catch { /* duplicate */ }
    }
  }

  const center = options.center ?? { x: 0, y: 0 };

  postProgress(10, 'layout');

  switch (options.layoutType) {
    case 'force':
      return applyForceLayout(graph, filteredElements, center);
    case 'clusters':
      return applyClustersLayout(graph, filteredElements, center, options.obstacles);
    case 'circular':
      return applyCircularLayout(graph, filteredElements, center);
    case 'grid':
      return applyGridLayout(graph, filteredElements, center);
    case 'random':
      return applyRandomLayout(graph, filteredElements, center);
    case 'hierarchy':
      return applyHierarchyLayout(graph, links, filteredElements, center, filteredElements.length);
    default:
      return {};
  }
}

function applyForceLayout(graph: Graph, elements: SerializedElement[], center: { x: number; y: number }): Record<string, { x: number; y: number }> {
  // Per-node real dimensions for size-aware spacing
  const dimsMap = buildDimsMap(elements);

  // Several groups not linked to each other: lay each out and pack them
  // tightly, isolated elements in a grid, instead of letting them drift apart
  const components = connectedComponents(graph);
  if (components.length > 1) {
    return packGroupsLayout(
      graph,
      components.filter((c) => c.length >= 2),
      components.filter((c) => c.length === 1).map((c) => c[0]),
      dimsMap,
      center,
      [],
      true,
    );
  }

  // Leaves, level by level (a single link, then a group hanging from a hub),
  // are laid out around their parent afterwards; the parent counts as a block
  const leafGap = 24;
  const dims = (id: string) => dimsFor(dimsMap, id);
  const fold = foldTree(graph, dims, leafGap);
  const core = fold.core;

  // Random initial positions for nodes without coordinates
  core.forEachNode((node) => {
    if (!core.getNodeAttribute(node, 'x')) {
      core.setNodeAttribute(node, 'x', Math.random() * 1000 - 500);
      core.setNodeAttribute(node, 'y', Math.random() * 1000 - 500);
    }
  });

  postProgress(20, 'ForceAtlas2');

  // ForceAtlas2
  if (core.order > 1) {
    forceAtlas2.assign(core, {
      iterations: 500,
      settings: {
        gravity: 8,
        scalingRatio: 100,
        strongGravityMode: false,
        slowDown: 2,
        barnesHutOptimize: core.order > 100,
        barnesHutTheta: 0.5,
        // linLog measured worse on hub and community graphs: about ten times
        // more crossings, and communities mixed instead of apart
        linLogMode: false,
      },
    });
  }

  postProgress(60, 'normalization');

  // Extract raw positions and compute bounding box
  const rawPositions: { node: string; x: number; y: number }[] = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  core.forEachNode((node) => {
    const x = core.getNodeAttribute(node, 'x') as number;
    const y = core.getNodeAttribute(node, 'y') as number;
    rawPositions.push({ node, x, y });
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  });

  const nodeCount = core.order;
  const targetSize = nodeCount > 1 ? Math.max(1500, Math.sqrt(nodeCount) * 250) : 0;
  const currentWidth = maxX - minX || 1;
  const currentHeight = maxY - minY || 1;
  const scaleFactor = targetSize / Math.max(currentWidth, currentHeight);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  // Apply normalization, then overlap removal on final positions
  const nodeData: { id: string; x: number; y: number; w: number; h: number }[] = [];

  for (const { node, x, y } of rawPositions) {
    const d = fold.block(node);
    nodeData.push({
      id: node,
      x: (x - centerX) * scaleFactor + center.x,
      y: (y - centerY) * scaleFactor + center.y,
      w: d.w,
      h: d.h,
    });
  }

  postProgress(80, 'overlap removal');

  // AABB overlap removal on final positions. Dense clouds (many mostly
  // unlinked nodes) need many passes to converge; it stops as soon as clean.
  fold.clear(nodeData);
  removeOverlaps(nodeData, { gap: leafGap, passes: 200 });

  const placed = new Map<string, { x: number; y: number }>(nodeData.map((n) => [n.id, { x: n.x, y: n.y }]));
  fold.place(placed);
  const positions: Record<string, { x: number; y: number }> = Object.fromEntries(placed);

  postProgress(100, 'done');
  return positions;
}

function applyClustersLayout(
  graph: Graph,
  elements: SerializedElement[],
  center: { x: number; y: number },
  obstacles: { x: number; y: number; r: number }[] = [],
): Record<string, { x: number; y: number }> {
  const dimsMap = buildDimsMap(elements);

  postProgress(15, 'detecting communities');

  let communities: Record<string, number> = {};
  try {
    communities = louvain(graph);
  } catch {
    graph.forEachNode((n) => { communities[n] = 0; });
  }

  const clusterMap = new Map<number, string[]>();
  for (const [nodeId, cid] of Object.entries(communities)) {
    const arr = clusterMap.get(cid);
    if (arr) arr.push(nodeId);
    else clusterMap.set(cid, [nodeId]);
  }
  let unassignedId = -1;
  graph.forEachNode((n) => {
    if (!(n in communities)) clusterMap.set(unassignedId--, [n]);
  });

  const realClusters: string[][] = [];
  const singletons: string[] = [];
  for (const nodes of clusterMap.values()) {
    if (nodes.length >= 2) realClusters.push(nodes);
    else singletons.push(nodes[0]);
  }

  return packGroupsLayout(graph, realClusters, singletons, dimsMap, center, obstacles);
}

/**
 * Lay each group out on its own (ForceAtlas2 on its induced sub-graph, sized
 * to its node area), gather the singletons in a grid, then pack the groups
 * tightly around the centre. Shared by the clusters layout (groups =
 * communities) and the force layout (groups = connected components).
 */
function packGroupsLayout(
  graph: Graph,
  realClusters: string[][],
  singletons: string[],
  dimsMap: ReturnType<typeof buildDimsMap>,
  center: { x: number; y: number },
  obstacles: { x: number; y: number; r: number }[],
  /** Leaves around their parent (force). Not for clusters: measured longer
   *  links there, communities being packed regardless of what links them */
  foldLeaves = false,
): Record<string, { x: number; y: number }> {
  type ClusterLayout = {
    nodes: { id: string; x: number; y: number; w: number; h: number }[];
    radius: number;
    cx: number;
    cy: number;
  };
  const layouts: ClusterLayout[] = [];

  postProgress(35, 'laying out sub-clusters');

  const GAP = 32;

  const realDims = (id: string) => dimsFor(dimsMap, id);
  for (const nodes of realClusters) {
    const full = new Graph();
    for (const n of nodes) full.addNode(n);
    for (const n of nodes) {
      graph.forEachNeighbor(n, (m) => {
        if (full.hasNode(m) && !full.hasEdge(n, m)) {
          try { full.addEdge(n, m); } catch { /* dup */ }
        }
      });
    }

    // Leaves, level by level, back around their parent afterwards (force
    // only); the parent is laid out as a block holding them
    const fold = foldLeaves ? foldTree(full, realDims, GAP) : null;
    const sub = fold ? fold.core : full;

    const dims = new Map<string, { w: number; h: number }>();
    let totalArea = 0;
    let maxNodeSize = 0;
    sub.forEachNode((n) => {
      const { w, h } = fold ? fold.block(n) : realDims(n);
      dims.set(n, { w, h });
      // Spacing from the elements' own size: a block (a hub with its leaves)
      // gets its room from the overlap removal, not by spreading everything
      const own = realDims(n);
      totalArea += (own.w + GAP) * (own.h + GAP);
      maxNodeSize = Math.max(maxNodeSize, Math.max(own.w, own.h));
      sub.mergeNodeAttributes(n, {
        x: Math.random() * 200 - 100,
        y: Math.random() * 200 - 100,
        // The element's own size, not its block: a hub's block would push its
        // other neighbours far away; overlap removal makes room for the block
        size: Math.max(...Object.values(realDims(n))) / 2,
      });
    });

    forceAtlas2.assign(sub, {
      iterations: 400,
      settings: {
        gravity: 3,
        scalingRatio: 120,
        strongGravityMode: true,
        slowDown: 2,
        barnesHutOptimize: sub.order > 100,
        barnesHutTheta: 0.5,
        linLogMode: false,
        adjustSizes: true,
      },
    });

    const nodeArr: { id: string; x: number; y: number; w: number; h: number }[] = [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    sub.forEachNode((id) => {
      const x = sub.getNodeAttribute(id, 'x') as number;
      const y = sub.getNodeAttribute(id, 'y') as number;
      const d = dims.get(id)!;
      nodeArr.push({ id, x, y, w: d.w, h: d.h });
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    });

    const minDiameter = Math.sqrt(totalArea / Math.PI) * 2 * 1.4;
    const targetSize = Math.max(minDiameter, maxNodeSize * 2);
    const sw = (maxX - minX) || 1;
    const sh = (maxY - minY) || 1;
    const scale = targetSize / Math.max(sw, sh);
    const subCx = (minX + maxX) / 2;
    const subCy = (minY + maxY) / 2;
    for (const n of nodeArr) {
      n.x = (n.x - subCx) * scale;
      n.y = (n.y - subCy) * scale;
    }

    fold?.clear(nodeArr);
    removeOverlaps(nodeArr, { gap: GAP, passes: 60, coincident: 'centered' });

    // Leaves back around their parent; parents back to their own size
    if (fold && sub !== full) {
      const local = new Map<string, { x: number; y: number }>(nodeArr.map((n) => [n.id, { x: n.x, y: n.y }]));
      fold.place(local);
      for (const n of nodeArr) Object.assign(n, realDims(n.id));
      full.forEachNode((id) => {
        if (sub.hasNode(id)) return;
        const p = local.get(id);
        if (p) nodeArr.push({ id, x: p.x, y: p.y, ...realDims(id) });
      });
    }

    let radius = 0;
    for (const n of nodeArr) {
      const corner = Math.hypot(Math.abs(n.x) + n.w / 2, Math.abs(n.y) + n.h / 2);
      if (corner > radius) radius = corner;
    }
    layouts.push({ nodes: nodeArr, radius, cx: 0, cy: 0 });
  }

  if (singletons.length > 0) {
    // Cell sized to the largest singleton footprint to avoid inter-cell overlap
    let maxW = 0, maxH = 0;
    for (const id of singletons) {
      const d = dimsFor(dimsMap, id);
      maxW = Math.max(maxW, d.w);
      maxH = Math.max(maxH, d.h);
    }
    const cellW = maxW + GAP;
    const cellH = maxH + GAP;
    const cols = Math.max(1, Math.ceil(Math.sqrt(singletons.length)));
    const rows = Math.ceil(singletons.length / cols);
    const offX = ((cols - 1) * cellW) / 2;
    const offY = ((rows - 1) * cellH) / 2;
    const nodeArr: { id: string; x: number; y: number; w: number; h: number }[] = [];
    singletons.forEach((id, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const d = dimsFor(dimsMap, id);
      nodeArr.push({
        id,
        x: col * cellW - offX,
        y: row * cellH - offY,
        w: d.w,
        h: d.h,
      });
    });
    let radius = 0;
    for (const n of nodeArr) {
      const corner = Math.hypot(Math.abs(n.x) + n.w / 2, Math.abs(n.y) + n.h / 2);
      if (corner > radius) radius = corner;
    }
    layouts.push({ nodes: nodeArr, radius, cx: 0, cy: 0 });
  }

  postProgress(80, 'packing clusters');

  layouts.sort((a, b) => b.radius - a.radius);
  // Locked elements, in the packing frame (origin = requested centre)
  packClusters(layouts, obstacles.map((o) => ({ cx: o.x - center.x, cy: o.y - center.y, r: o.r })));

  let gMinX = Infinity, gMaxX = -Infinity, gMinY = Infinity, gMaxY = -Infinity;
  for (const L of layouts) {
    for (const n of L.nodes) {
      const x = n.x + L.cx;
      const y = n.y + L.cy;
      gMinX = Math.min(gMinX, x); gMaxX = Math.max(gMaxX, x);
      gMinY = Math.min(gMinY, y); gMaxY = Math.max(gMaxY, y);
    }
  }
  // Recentre on the requested centre, unless clusters were packed around
  // locked elements: they must stay where the packing put them
  const recentre = obstacles.length === 0 && Number.isFinite(gMinX);
  const gCx = recentre ? (gMinX + gMaxX) / 2 : 0;
  const gCy = recentre ? (gMinY + gMaxY) / 2 : 0;

  const positions: Record<string, { x: number; y: number }> = {};
  for (const L of layouts) {
    for (const n of L.nodes) {
      positions[n.id] = {
        x: n.x + L.cx - gCx + center.x,
        y: n.y + L.cy - gCy + center.y,
      };
    }
  }

  postProgress(100, 'done');
  return positions;
}

function applyCircularLayout(graph: Graph, elements: SerializedElement[], center: { x: number; y: number }): Record<string, { x: number; y: number }> {
  const dimsMap = buildDimsMap(elements);
  const nodes = graph.nodes();
  const n = nodes.length;
  const gap = 24;

  // Radius large enough that the arc between adjacent nodes fits the widest
  // node footprint — guarantees no overlap on the ring.
  let maxStep = 0;
  for (const id of nodes) {
    const d = dimsFor(dimsMap, id);
    maxStep = Math.max(maxStep, Math.max(d.w, d.h) + gap);
  }
  const radius = Math.max(300, (n * maxStep) / (2 * Math.PI));

  const positions: Record<string, { x: number; y: number }> = {};
  nodes.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / n;
    positions[id] = {
      x: Math.cos(angle) * radius + center.x,
      y: Math.sin(angle) * radius + center.y,
    };
  });

  postProgress(100, 'done');
  return positions;
}

function applyGridLayout(graph: Graph, elements: SerializedElement[], center: { x: number; y: number }): Record<string, { x: number; y: number }> {
  const dimsMap = buildDimsMap(elements);
  const nodes = graph.nodes();
  const gap = 32;

  // Uniform cell sized to the largest footprint so no two cells overlap.
  let maxW = 0, maxH = 0;
  for (const id of nodes) {
    const d = dimsFor(dimsMap, id);
    maxW = Math.max(maxW, d.w);
    maxH = Math.max(maxH, d.h);
  }
  const cellW = maxW + gap;
  const cellH = maxH + gap;

  const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  const rows = Math.ceil(nodes.length / cols);
  const offsetX = ((cols - 1) * cellW) / 2;
  const offsetY = ((rows - 1) * cellH) / 2;

  const positions: Record<string, { x: number; y: number }> = {};
  nodes.forEach((id, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    positions[id] = {
      x: col * cellW - offsetX + center.x,
      y: row * cellH - offsetY + center.y,
    };
  });

  postProgress(100, 'done');
  return positions;
}

function applyRandomLayout(graph: Graph, elements: SerializedElement[], center: { x: number; y: number }): Record<string, { x: number; y: number }> {
  const dimsMap = buildDimsMap(elements);
  const nodeCount = graph.order;
  const scale = Math.max(400, Math.sqrt(nodeCount) * 100);
  random.assign(graph, { scale });

  // Collect scattered positions with real dimensions, then resolve overlaps.
  const nodeData: { id: string; x: number; y: number; w: number; h: number }[] = [];
  graph.forEachNode((node) => {
    const d = dimsFor(dimsMap, node);
    nodeData.push({
      id: node,
      x: (graph.getNodeAttribute(node, 'x') as number) - scale / 2,
      y: (graph.getNodeAttribute(node, 'y') as number) - scale / 2,
      w: d.w,
      h: d.h,
    });
  });

  removeOverlaps(nodeData, { gap: 24, passes: 20 });

  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of nodeData) {
    positions[n.id] = { x: n.x + center.x, y: n.y + center.y };
  }

  postProgress(100, 'done');
  return positions;
}

/**
 * Real rendered footprint of a node, derived from its visual props.
 * Shares ElementNode's dimension logic so anti-collision spacing matches what
 * is actually drawn (circles, squares, diamonds, images are far larger than a
 * label-width estimate). Falls back to sane defaults when props are missing.
 */
function nodeDimensions(el: SerializedElement): { w: number; h: number } {
  const { width, height } = computeElementDimensions(
    {
      shape: el.shape ?? 'circle',
      size: el.size ?? 'medium',
      customWidth: el.customWidth,
      customHeight: el.customHeight,
    },
    el.label || '',
    Boolean(el.hasImage),
  );
  return { w: width, h: height };
}

/** Build an id → {w,h} lookup for a set of elements. */
function buildDimsMap(elements: SerializedElement[]): Map<string, { w: number; h: number }> {
  const map = new Map<string, { w: number; h: number }>();
  for (const el of elements) map.set(el.id, nodeDimensions(el));
  return map;
}

/** Resolve dimensions for a node id, with a default if absent. */
function dimsFor(map: Map<string, { w: number; h: number }>, id: string): { w: number; h: number } {
  return map.get(id) ?? { w: 120, h: 40 };
}

function applyHierarchyLayout(graph: Graph, links: SerializedLink[], elements: SerializedElement[], center: { x: number; y: number }, nodeCount: number): Record<string, { x: number; y: number }> {
  // Adaptive separation based on node count (denser graphs pack tighter)
  let nodesep: number, ranksep: number;
  if (nodeCount >= 1500) {
    nodesep = 4; ranksep = 65;
  } else if (nodeCount >= 500) {
    nodesep = 8; ranksep = 80;
  } else if (nodeCount >= 100) {
    nodesep = 12; ranksep = 100;
  } else {
    nodesep = 20; ranksep = 120;
  }

  // Per-node real dimensions (dagre reserves space per node)
  const dimsMap = buildDimsMap(elements);

  postProgress(20, 'building dagre graph');

  // Build dagre graph
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'TB',
    nodesep,
    ranksep,
    edgesep: 10,
    acyclicer: 'greedy',
    // network-simplex gives the tightest ranks but grows steeply: ~2 s at
    // 1,500 nodes, over a minute at 5,000. tight-tree stays around 2 s there.
    ranker: nodeCount >= 1500 ? 'tight-tree' : 'network-simplex',
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes with their real rendered footprint
  graph.forEachNode((node) => {
    const { w, h } = dimsFor(dimsMap, node);
    g.setNode(node, { width: w, height: h });
  });

  postProgress(40, 'adding edges');

  // Build direction lookup from links
  const linkDirectionMap = new Map<string, string>();
  for (const link of links) {
    linkDirectionMap.set(`${link.fromId}->${link.toId}`, link.direction || 'forward');
  }

  // Add edges respecting direction
  graph.forEachEdge((_edge, _attrs, source, target) => {
    const dir = linkDirectionMap.get(`${source}->${target}`)
             || linkDirectionMap.get(`${target}->${source}`);

    if (dir === 'backward') {
      g.setEdge(target, source);
    } else {
      g.setEdge(source, target);
    }
  });

  postProgress(60, 'computing layout');

  // Run dagre layout
  dagre.layout(g);

  postProgress(80, 'positioning');

  // Extract positions and node widths for overlap check
  const nodeData: { id: string; x: number; y: number; w: number; h: number }[] = [];

  g.nodes().forEach((nodeId) => {
    const node = g.node(nodeId);
    if (node) {
      nodeData.push({ id: nodeId, x: node.x, y: node.y, w: node.width, h: node.height });
    }
  });

  // Post-process: resolve remaining overlaps (axis-aligned bounding box check)
  const gap = 24;
  removeOverlaps(nodeData, { gap: gap, passes: 15, coincident: 'none' });

  // Center around target center
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of nodeData) {
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
  }

  const graphCenterX = (minX + maxX) / 2;
  const graphCenterY = (minY + maxY) / 2;

  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of nodeData) {
    positions[n.id] = {
      x: n.x - graphCenterX + center.x,
      y: n.y - graphCenterY + center.y,
    };
  }

  postProgress(100, 'done');
  return positions;
}

// ============================================================================
// PROGRESS REPORTING
// ============================================================================

function postProgress(percent: number, phase: string) {
  self.postMessage({ type: 'progress', percent, phase, requestId: currentRequestId } satisfies WorkerResponse);
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const requestId = request.requestId;
  currentRequestId = requestId;

  try {
    switch (request.type) {
      case 'computeInsights': {
        const data = computeInsights(request.elements, request.links);
        self.postMessage({ type: 'insightsResult', data, requestId } satisfies WorkerResponse);
        break;
      }
      case 'computeLayout': {
        const positions = computeLayout(request.elements, request.links, request.options);
        self.postMessage({ type: 'layoutResult', positions, requestId } satisfies WorkerResponse);
        break;
      }
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: (err as Error).message, requestId } satisfies WorkerResponse);
  }
};
