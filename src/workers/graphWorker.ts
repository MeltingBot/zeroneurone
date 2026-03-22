/**
 * Graph Worker
 *
 * Offloads heavy graph computations (insights, layout) from the main thread.
 * Uses Tarjan's algorithm for bridge detection (O(n+m) vs previous O(n²*(n+m))).
 * Uses sorted + sliding window for similar labels (O(n log n) vs previous O(n²)).
 */

import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';
import { bidirectional } from 'graphology-shortest-path';
import betweennessCentrality from 'graphology-metrics/centrality/betweenness';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { circular, random } from 'graphology-layout';
import dagre from '@dagrejs/dagre';

// ============================================================================
// TYPES
// ============================================================================

interface SerializedElement {
  id: string;
  label: string;
  isGroup?: boolean;
  position: { x: number; y: number };
  properties?: { key: string; value: unknown }[];
}

interface SerializedLink {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
  confidence?: number | null;
  direction?: string;
}

interface LayoutOptions {
  padding?: number;
  center?: { x: number; y: number };
  scale?: number;
  layoutType: 'force' | 'circular' | 'grid' | 'random' | 'hierarchy';
}

interface InsightsData {
  clusters: { id: number; elementIds: string[]; size: number }[];
  centrality: { elementId: string; degree: number; betweenness: number; score: number }[];
  bridges: string[];
  isolated: string[];
  similarLabels: { elementId1: string; elementId2: string; similarity: number }[];
}

type WorkerRequest =
  | { type: 'computeInsights'; elements: SerializedElement[]; links: SerializedLink[] }
  | { type: 'computeLayout'; elements: SerializedElement[]; links: SerializedLink[]; options: LayoutOptions }
  | { type: 'findPaths'; elements: SerializedElement[]; links: SerializedLink[]; fromId: string; toId: string }
  | { type: 'cancel' };

type WorkerResponse =
  | { type: 'insightsResult'; data: InsightsData }
  | { type: 'layoutResult'; positions: Record<string, { x: number; y: number }> }
  | { type: 'pathResult'; paths: { path: string[]; length: number }[] }
  | { type: 'progress'; percent: number; phase: string }
  | { type: 'error'; message: string };

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
// BRIDGE DETECTION — Tarjan's Algorithm O(V+E)
// ============================================================================

function findBridgeNodes(graph: Graph): string[] {
  const visited = new Set<string>();
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const articulationPoints = new Set<string>();
  let timer = 0;

  function dfs(u: string) {
    visited.add(u);
    disc.set(u, timer);
    low.set(u, timer);
    timer++;
    let children = 0;

    graph.forEachNeighbor(u, (v) => {
      if (!visited.has(v)) {
        children++;
        parent.set(v, u);
        dfs(v);
        low.set(u, Math.min(low.get(u)!, low.get(v)!));

        // u is articulation point if:
        // 1) u is root of DFS tree and has two or more children
        if (parent.get(u) === null && children > 1) {
          articulationPoints.add(u);
        }
        // 2) u is not root and low value of one of its child is >= discovery value of u
        if (parent.get(u) !== null && low.get(v)! >= disc.get(u)!) {
          articulationPoints.add(u);
        }
      } else if (v !== parent.get(u)) {
        low.set(u, Math.min(low.get(u)!, disc.get(v)!));
      }
    });
  }

  graph.forEachNode((node) => {
    if (!visited.has(node)) {
      parent.set(node, null);
      dfs(node);
    }
  });

  return Array.from(articulationPoints);
}

// ============================================================================
// SIMILAR LABELS — Sorted + Sliding Window O(n log n * L)
// ============================================================================

function detectSimilarLabels(
  elements: SerializedElement[],
  threshold: number = 0.7,
  windowSize: number = 5,
  maxResults: number = 20
): { elementId1: string; elementId2: string; similarity: number }[] {
  // Filter elements with non-empty labels
  const labeled = elements
    .filter(el => el.label && el.label.trim().length > 0 && !el.isGroup)
    .map(el => ({ id: el.id, normalized: el.label.toLowerCase().trim() }));

  if (labeled.length < 2) return [];

  // Sort by normalized label
  labeled.sort((a, b) => a.normalized.localeCompare(b.normalized));

  const pairs: { elementId1: string; elementId2: string; similarity: number }[] = [];

  // Compare each element with the next `windowSize` elements in sorted order
  for (let i = 0; i < labeled.length; i++) {
    const limit = Math.min(i + windowSize + 1, labeled.length);
    for (let j = i + 1; j < limit; j++) {
      const similarity = calculateSimilarity(labeled[i].normalized, labeled[j].normalized);
      if (similarity >= threshold) {
        pairs.push({
          elementId1: labeled[i].id,
          elementId2: labeled[j].id,
          similarity,
        });
      }
    }
  }

  // Sort by similarity descending and limit results
  return pairs.sort((a, b) => b.similarity - a.similarity).slice(0, maxResults);
}

function calculateSimilarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(s1: string, s2: string): number {
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) {
      costs[s2.length] = lastValue;
    }
  }
  return costs[s2.length];
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
  let clusters: InsightsData['clusters'] = [];
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
  centrality.sort((a, b) => b.degree - a.degree);
  centrality.splice(10);

  postProgress(50, 'bridges');

  // Bridges (Tarjan — O(V+E))
  const bridges = graph.order > 2 ? findBridgeNodes(graph) : [];

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
    case 'circular':
      return applyCircularLayout(graph, center, filteredElements.length);
    case 'grid':
      return applyGridLayout(graph, center);
    case 'random':
      return applyRandomLayout(graph, center, filteredElements.length);
    case 'hierarchy':
      return applyHierarchyLayout(graph, links, filteredElements, center, filteredElements.length);
    default:
      return {};
  }
}

function applyForceLayout(graph: Graph, elements: SerializedElement[], center: { x: number; y: number }): Record<string, { x: number; y: number }> {
  // Build label lookup for per-node width estimation
  const labelMap = new Map<string, string>();
  for (const el of elements) {
    labelMap.set(el.id, el.label || '');
  }

  // Random initial positions for nodes without coordinates
  graph.forEachNode((node) => {
    if (!graph.getNodeAttribute(node, 'x')) {
      graph.setNodeAttribute(node, 'x', Math.random() * 1000 - 500);
      graph.setNodeAttribute(node, 'y', Math.random() * 1000 - 500);
    }
  });

  postProgress(20, 'ForceAtlas2');

  // ForceAtlas2
  forceAtlas2.assign(graph, {
    iterations: 500,
    settings: {
      gravity: 8,
      scalingRatio: 100,
      strongGravityMode: false,
      slowDown: 2,
      barnesHutOptimize: graph.order > 100,
      barnesHutTheta: 0.5,
      linLogMode: true,
    },
  });

  postProgress(60, 'normalization');

  // Extract raw positions and compute bounding box
  const rawPositions: { node: string; x: number; y: number }[] = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  graph.forEachNode((node) => {
    const x = graph.getNodeAttribute(node, 'x') as number;
    const y = graph.getNodeAttribute(node, 'y') as number;
    rawPositions.push({ node, x, y });
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  });

  const nodeCount = graph.order;
  const targetSize = Math.max(1500, Math.sqrt(nodeCount) * 250);
  const currentWidth = maxX - minX || 1;
  const currentHeight = maxY - minY || 1;
  const scaleFactor = targetSize / Math.max(currentWidth, currentHeight);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  // Apply normalization, then overlap removal on final positions
  const nodeData: { id: string; x: number; y: number; w: number; h: number }[] = [];

  for (const { node, x, y } of rawPositions) {
    const label = labelMap.get(node) || '';
    const w = estimateNodeWidth(label, 120);
    nodeData.push({
      id: node,
      x: (x - centerX) * scaleFactor + center.x,
      y: (y - centerY) * scaleFactor + center.y,
      w,
      h: ESTIMATED_NODE_HEIGHT,
    });
  }

  postProgress(80, 'overlap removal');

  // AABB overlap removal on final positions
  const gap = 24;
  for (let pass = 0; pass < 15; pass++) {
    let hasOverlap = false;
    for (let i = 0; i < nodeData.length; i++) {
      for (let j = i + 1; j < nodeData.length; j++) {
        const a = nodeData[i];
        const b = nodeData[j];
        const overlapX = (a.w / 2 + b.w / 2 + gap) - Math.abs(a.x - b.x);
        const overlapY = (a.h / 2 + b.h / 2 + gap) - Math.abs(a.y - b.y);

        if (overlapX > 0 && overlapY > 0) {
          hasOverlap = true;
          if (overlapX < overlapY) {
            const push = overlapX / 2 + 1;
            if (a.x < b.x) { a.x -= push; b.x += push; }
            else { a.x += push; b.x -= push; }
          } else {
            const push = overlapY / 2 + 1;
            if (a.y < b.y) { a.y -= push; b.y += push; }
            else { a.y += push; b.y -= push; }
          }
        } else if (Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1) {
          hasOverlap = true;
          b.x += (a.w / 2 + b.w / 2 + gap) * Math.random();
          b.y += ESTIMATED_NODE_HEIGHT * Math.random();
        }
      }
    }
    if (!hasOverlap) break;
  }

  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of nodeData) {
    positions[n.id] = { x: n.x, y: n.y };
  }

  postProgress(100, 'done');
  return positions;
}

function applyCircularLayout(graph: Graph, center: { x: number; y: number }, nodeCount: number): Record<string, { x: number; y: number }> {
  const scale = Math.max(300, nodeCount * 50);
  circular.assign(graph, { scale });

  const positions: Record<string, { x: number; y: number }> = {};
  graph.forEachNode((node) => {
    positions[node] = {
      x: (graph.getNodeAttribute(node, 'x') as number) + center.x,
      y: (graph.getNodeAttribute(node, 'y') as number) + center.y,
    };
  });

  postProgress(100, 'done');
  return positions;
}

function applyGridLayout(graph: Graph, center: { x: number; y: number }): Record<string, { x: number; y: number }> {
  const scale = 120;
  const nodeCount = graph.order;
  const cols = Math.ceil(Math.sqrt(nodeCount));
  const rows = Math.ceil(nodeCount / cols);
  const offsetX = ((cols - 1) * scale) / 2;
  const offsetY = ((rows - 1) * scale) / 2;

  const positions: Record<string, { x: number; y: number }> = {};
  let index = 0;
  graph.forEachNode((node) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    positions[node] = {
      x: col * scale - offsetX + center.x,
      y: row * scale - offsetY + center.y,
    };
    index++;
  });

  postProgress(100, 'done');
  return positions;
}

function applyRandomLayout(graph: Graph, center: { x: number; y: number }, nodeCount: number): Record<string, { x: number; y: number }> {
  const scale = Math.max(400, Math.sqrt(nodeCount) * 100);
  random.assign(graph, { scale });

  const positions: Record<string, { x: number; y: number }> = {};
  graph.forEachNode((node) => {
    positions[node] = {
      x: (graph.getNodeAttribute(node, 'x') as number) + center.x - scale / 2,
      y: (graph.getNodeAttribute(node, 'y') as number) + center.y - scale / 2,
    };
  });

  postProgress(100, 'done');
  return positions;
}

/**
 * Estimate visual width of a node based on its label length.
 * Mirrors ElementNode.getDefaultDimensions() for rectangles:
 *   estimatedTextWidth = labelLength * 7 + 24
 *   width = clamp(estimatedTextWidth * 1.2, 120, 280)
 */
function estimateNodeWidth(label: string, minWidth: number): number {
  const estimatedTextWidth = label.length * 7 + 24;
  const width = Math.max(estimatedTextWidth * 1.2, 120);
  return Math.max(minWidth, Math.min(width, 280));
}

/** Node height matching ElementNode rectangle: max(baseSize * 0.5, 40) ≈ 40px */
const ESTIMATED_NODE_HEIGHT = 40;

function applyHierarchyLayout(graph: Graph, links: SerializedLink[], elements: SerializedElement[], center: { x: number; y: number }, nodeCount: number): Record<string, { x: number; y: number }> {
  // Adaptive sizing based on node count
  let defaultNodeWidth: number, nodeHeight: number, nodesep: number, ranksep: number;
  if (nodeCount >= 1500) {
    defaultNodeWidth = 80; nodeHeight = 35; nodesep = 4; ranksep = 65;
  } else if (nodeCount >= 500) {
    defaultNodeWidth = 100; nodeHeight = 40; nodesep = 8; ranksep = 80;
  } else if (nodeCount >= 100) {
    defaultNodeWidth = 130; nodeHeight = 50; nodesep = 12; ranksep = 100;
  } else {
    defaultNodeWidth = 160; nodeHeight = 60; nodesep = 20; ranksep = 120;
  }

  // Build label lookup for per-node width estimation
  const labelMap = new Map<string, string>();
  for (const el of elements) {
    labelMap.set(el.id, el.label || '');
  }

  postProgress(20, 'building dagre graph');

  // Build dagre graph
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'TB',
    nodesep,
    ranksep,
    edgesep: 10,
    acyclicer: 'greedy',
    ranker: 'network-simplex',
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes with per-node width based on label
  graph.forEachNode((node) => {
    const label = labelMap.get(node) || '';
    const width = estimateNodeWidth(label, defaultNodeWidth);
    g.setNode(node, { width, height: nodeHeight });
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
  for (let pass = 0; pass < 15; pass++) {
    let hasOverlap = false;
    for (let i = 0; i < nodeData.length; i++) {
      for (let j = i + 1; j < nodeData.length; j++) {
        const a = nodeData[i];
        const b = nodeData[j];
        const overlapX = (a.w / 2 + b.w / 2 + gap) - Math.abs(a.x - b.x);
        const overlapY = (a.h / 2 + b.h / 2 + gap) - Math.abs(a.y - b.y);

        if (overlapX > 0 && overlapY > 0) {
          hasOverlap = true;
          if (overlapX < overlapY) {
            const push = overlapX / 2 + 1;
            if (a.x < b.x) { a.x -= push; b.x += push; }
            else { a.x += push; b.x -= push; }
          } else {
            const push = overlapY / 2 + 1;
            if (a.y < b.y) { a.y -= push; b.y += push; }
            else { a.y += push; b.y -= push; }
          }
        }
      }
    }
    if (!hasOverlap) break;
  }

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
// PATH FINDING
// ============================================================================

function findPaths(elements: SerializedElement[], links: SerializedLink[], fromId: string, toId: string): { path: string[]; length: number }[] {
  const graph = buildGraph(elements, links);
  if (!graph.hasNode(fromId) || !graph.hasNode(toId)) return [];

  try {
    const path = bidirectional(graph, fromId, toId);
    if (path) {
      return [{ path, length: path.length - 1 }];
    }
  } catch { /* no path */ }

  return [];
}

// ============================================================================
// PROGRESS REPORTING
// ============================================================================

function postProgress(percent: number, phase: string) {
  self.postMessage({ type: 'progress', percent, phase } satisfies WorkerResponse);
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  try {
    switch (request.type) {
      case 'computeInsights': {
        const data = computeInsights(request.elements, request.links);
        self.postMessage({ type: 'insightsResult', data } satisfies WorkerResponse);
        break;
      }
      case 'computeLayout': {
        const positions = computeLayout(request.elements, request.links, request.options);
        self.postMessage({ type: 'layoutResult', positions } satisfies WorkerResponse);
        break;
      }
      case 'findPaths': {
        const paths = findPaths(request.elements, request.links, request.fromId, request.toId);
        self.postMessage({ type: 'pathResult', paths } satisfies WorkerResponse);
        break;
      }
      case 'cancel':
        // Currently no cancellation mechanism for synchronous algorithms
        break;
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: (err as Error).message } satisfies WorkerResponse);
  }
};
