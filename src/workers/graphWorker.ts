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
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { circular, random } from 'graphology-layout';

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
}

interface LayoutOptions {
  padding?: number;
  center?: { x: number; y: number };
  scale?: number;
  layoutType: 'force' | 'circular' | 'grid' | 'random' | 'hierarchy';
}

interface InsightsData {
  clusters: { id: number; elementIds: string[]; size: number }[];
  centrality: { elementId: string; degree: number; score: number }[];
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

  postProgress(30, 'centrality');

  // Centrality (degree)
  const centrality: InsightsData['centrality'] = [];
  const maxDegree = Math.max(1, graph.order - 1);
  graph.forEachNode((nodeId) => {
    const degree = graph.degree(nodeId);
    if (degree > 0) {
      centrality.push({ elementId: nodeId, degree, score: degree / maxDegree });
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
      return applyForceLayout(graph, center);
    case 'circular':
      return applyCircularLayout(graph, center, filteredElements.length);
    case 'grid':
      return applyGridLayout(graph, center);
    case 'random':
      return applyRandomLayout(graph, center, filteredElements.length);
    case 'hierarchy':
      return applyHierarchyLayout(graph, center, filteredElements.length);
    default:
      return {};
  }
}

function applyForceLayout(graph: Graph, center: { x: number; y: number }): Record<string, { x: number; y: number }> {
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

  postProgress(60, 'overlap removal');

  // Overlap removal
  const minNodeDistance = 280;
  const nodes = graph.nodes();
  for (let pass = 0; pass < 5; pass++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const x1 = graph.getNodeAttribute(nodes[i], 'x') as number;
        const y1 = graph.getNodeAttribute(nodes[i], 'y') as number;
        const x2 = graph.getNodeAttribute(nodes[j], 'x') as number;
        const y2 = graph.getNodeAttribute(nodes[j], 'y') as number;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < minNodeDistance && dist > 0) {
          const scale = (minNodeDistance - dist) / 2 / dist;
          graph.setNodeAttribute(nodes[i], 'x', x1 - dx * scale);
          graph.setNodeAttribute(nodes[i], 'y', y1 - dy * scale);
          graph.setNodeAttribute(nodes[j], 'x', x2 + dx * scale);
          graph.setNodeAttribute(nodes[j], 'y', y2 + dy * scale);
        } else if (dist === 0) {
          graph.setNodeAttribute(nodes[j], 'x', x2 + minNodeDistance * Math.random());
          graph.setNodeAttribute(nodes[j], 'y', y2 + minNodeDistance * Math.random());
        }
      }
    }
  }

  postProgress(90, 'normalization');

  // Normalize and center
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

  const positions: Record<string, { x: number; y: number }> = {};
  for (const { node, x, y } of rawPositions) {
    positions[node] = {
      x: (x - centerX) * scaleFactor + center.x,
      y: (y - centerY) * scaleFactor + center.y,
    };
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

function applyHierarchyLayout(graph: Graph, center: { x: number; y: number }, nodeCount: number): Record<string, { x: number; y: number }> {
  // Adaptive sizing based on node count
  let nodeWidth: number, levelHeight: number, siblingGap: number;
  if (nodeCount >= 1500) {
    nodeWidth = 80; levelHeight = 65; siblingGap = 2;
  } else if (nodeCount >= 500) {
    nodeWidth = 100; levelHeight = 80; siblingGap = 4;
  } else if (nodeCount >= 100) {
    nodeWidth = 130; levelHeight = 100; siblingGap = 8;
  } else {
    nodeWidth = 160; levelHeight = 120; siblingGap = 20;
  }

  postProgress(20, 'finding roots');

  // Find roots (nodes with no incoming edges)
  const roots: string[] = [];
  const hasIncoming = new Set<string>();

  graph.forEachEdge((_edge, _attrs, _source, target) => {
    hasIncoming.add(target);
  });

  graph.forEachNode((node) => {
    if (!hasIncoming.has(node)) {
      roots.push(node);
    }
  });

  // If no roots found, pick nodes with minimum in-degree
  if (roots.length === 0) {
    const inDegrees = new Map<string, number>();
    graph.forEachNode((node) => {
      inDegrees.set(node, graph.inDegree(node));
    });
    const minDegree = Math.min(...inDegrees.values());
    graph.forEachNode((node) => {
      if (inDegrees.get(node) === minDegree) {
        roots.push(node);
      }
    });
  }

  postProgress(40, 'assigning levels');

  // BFS to assign levels
  const levels = new Map<string, number>();
  const queue: string[] = [...roots];
  const visited = new Set<string>(roots);

  for (const root of roots) {
    levels.set(root, 0);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLevel = levels.get(current) || 0;

    graph.forEachOutNeighbor(current, (neighbor) => {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        levels.set(neighbor, currentLevel + 1);
        queue.push(neighbor);
      }
    });
  }

  // Handle unvisited nodes (disconnected components)
  graph.forEachNode((node) => {
    if (!levels.has(node)) {
      levels.set(node, 0);
    }
  });

  postProgress(60, 'grouping by level');

  // Group nodes by level
  const byLevel = new Map<number, string[]>();
  let maxLevel = 0;

  for (const [node, level] of levels) {
    if (!byLevel.has(level)) {
      byLevel.set(level, []);
    }
    byLevel.get(level)!.push(node);
    maxLevel = Math.max(maxLevel, level);
  }

  postProgress(80, 'positioning');

  // Position nodes
  const positions: Record<string, { x: number; y: number }> = {};

  for (let level = 0; level <= maxLevel; level++) {
    const nodesAtLevel = byLevel.get(level) || [];
    const count = nodesAtLevel.length;
    const totalWidth = count * nodeWidth + (count - 1) * siblingGap;
    let x = center.x - totalWidth / 2;

    for (const node of nodesAtLevel) {
      positions[node] = {
        x: x + nodeWidth / 2,
        y: center.y + level * levelHeight,
      };
      x += nodeWidth + siblingGap;
    }
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
