/**
 * Layout Service
 *
 * Provides automatic graph layout algorithms using Graphology
 */

import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { random } from 'graphology-layout';
import louvain from 'graphology-communities-louvain';
import dagre from '@dagrejs/dagre';
import type { Element, Link, Position } from '../types';
import { computeElementDimensions } from '../utils/elementDimensions';

/**
 * Real rendered footprint of an element, shared with ElementNode so that
 * anti-collision spacing matches the drawn size (shape, custom size, image).
 */
function elementDims(el: Element): { w: number; h: number } {
  const { width, height } = computeElementDimensions(
    el.visual,
    el.label || '',
    Boolean(el.visual?.image),
  );
  return { w: width, h: height };
}

/** Build an id → {w,h} lookup. */
function buildDimsMap(elements: Element[]): Map<string, { w: number; h: number }> {
  const map = new Map<string, { w: number; h: number }>();
  for (const el of elements) map.set(el.id, elementDims(el));
  return map;
}

/** Resolve dimensions for a node id, with a default if absent. */
function dimsFor(map: Map<string, { w: number; h: number }>, id: string): { w: number; h: number } {
  return map.get(id) ?? { w: 120, h: 40 };
}

// ============================================================================
// TYPES
// ============================================================================

export type LayoutType = 'force' | 'clusters' | 'circular' | 'grid' | 'random' | 'hierarchy';

export interface LayoutOptions {
  /** Padding around the layout bounds */
  padding?: number;
  /** Center position for the layout */
  center?: Position;
  /** Scale factor for the layout */
  scale?: number;
}

export interface LayoutResult {
  positions: Map<string, Position>;
}

// ============================================================================
// LAYOUT ALGORITHMS
// ============================================================================

/**
 * Apply force-directed layout using ForceAtlas2
 * Good for showing clusters and relationships
 */
function applyForceLayout(
  graph: Graph,
  elements: Element[],
  options: LayoutOptions
): Map<string, Position> {
  const { center = { x: 0, y: 0 } } = options;

  // Per-node real dimensions for size-aware spacing
  const dimsMap = buildDimsMap(elements);

  // Assign random initial positions if nodes don't have any
  graph.forEachNode((node) => {
    if (!graph.getNodeAttribute(node, 'x')) {
      graph.setNodeAttribute(node, 'x', Math.random() * 1000 - 500);
      graph.setNodeAttribute(node, 'y', Math.random() * 1000 - 500);
    }
  });

  // Run ForceAtlas2 synchronously
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

  // Extract raw positions and compute bounding box
  const rawPositions: { node: string; x: number; y: number }[] = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  graph.forEachNode((node) => {
    const x = graph.getNodeAttribute(node, 'x') as number;
    const y = graph.getNodeAttribute(node, 'y') as number;
    rawPositions.push({ node, x, y });
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });

  // Normalize to target size - larger to spread out and show link labels
  const nodeCount = graph.order;
  const targetSize = Math.max(1500, Math.sqrt(nodeCount) * 250);
  const currentWidth = maxX - minX || 1;
  const currentHeight = maxY - minY || 1;
  const scaleFactor = targetSize / Math.max(currentWidth, currentHeight);

  // Apply normalization and center
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const nodeData: { id: string; x: number; y: number; w: number; h: number }[] = [];

  for (const { node, x, y } of rawPositions) {
    const d = dimsFor(dimsMap, node);
    nodeData.push({
      id: node,
      x: (x - centerX) * scaleFactor + center.x,
      y: (y - centerY) * scaleFactor + center.y,
      w: d.w,
      h: d.h,
    });
  }

  // Post-process: AABB overlap removal on final positions
  // More passes for convergence in dense graphs
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
          // Push apart on the axis with less overlap to preserve cluster shape
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
          b.y += (a.h / 2 + b.h / 2 + gap) * Math.random();
        }
      }
    }
    if (!hasOverlap) break; // Early exit when converged
  }

  const positions = new Map<string, Position>();
  for (const n of nodeData) {
    positions.set(n.id, { x: n.x, y: n.y });
  }

  return positions;
}

/**
 * Apply cluster-aware compound layout:
 *  1. Detect communities (Louvain)
 *  2. Layout each cluster independently with ForceAtlas2 on its induced sub-graph
 *  3. Pack cluster bounding-circles via spiral placement
 *  4. Singletons are gathered in a side grid
 *
 * Guarantees inter-cluster separation (does not rely on solver convergence).
 */
function applyClustersLayout(
  graph: Graph,
  elements: Element[],
  options: LayoutOptions
): Map<string, Position> {
  const { center = { x: 0, y: 0 } } = options;

  const dimsMap = buildDimsMap(elements);

  // Step 1: detect communities. Louvain only assigns nodes that participate
  // in the modularity optimization; we treat the rest as singletons.
  let communities: Record<string, number> = {};
  try {
    communities = louvain(graph);
  } catch {
    // Fallback: all in one community
    graph.forEachNode((n) => { communities[n] = 0; });
  }

  const clusterMap = new Map<number, string[]>();
  for (const [nodeId, cid] of Object.entries(communities)) {
    const arr = clusterMap.get(cid);
    if (arr) arr.push(nodeId);
    else clusterMap.set(cid, [nodeId]);
  }
  // Catch unassigned nodes
  let unassignedId = -1;
  graph.forEachNode((n) => {
    if (!(n in communities)) {
      clusterMap.set(unassignedId--, [n]);
    }
  });

  const realClusters: string[][] = [];
  const singletons: string[] = [];
  for (const nodes of clusterMap.values()) {
    if (nodes.length >= 2) realClusters.push(nodes);
    else singletons.push(nodes[0]);
  }

  type ClusterLayout = {
    nodes: { id: string; x: number; y: number; w: number; h: number }[];
    radius: number;
    cx: number;
    cy: number;
  };
  const layouts: ClusterLayout[] = [];

  // Step 2: layout each real cluster independently on its induced sub-graph
  const GAP = 32;

  for (const nodes of realClusters) {
    // Pre-compute per-node dimensions so FA2 can use them via `size` attribute
    const dims = new Map<string, { w: number; h: number }>();
    let totalArea = 0;
    let maxNodeSize = 0;
    for (const n of nodes) {
      const { w, h } = dimsFor(dimsMap, n);
      dims.set(n, { w, h });
      totalArea += (w + GAP) * (h + GAP);
      maxNodeSize = Math.max(maxNodeSize, Math.max(w, h));
    }

    const sub = new Graph();
    for (const n of nodes) {
      const d = dims.get(n)!;
      sub.addNode(n, {
        x: Math.random() * 200 - 100,
        y: Math.random() * 200 - 100,
        // FA2 size attribute: half the largest dimension (treats node as a disc)
        size: Math.max(d.w, d.h) / 2,
      });
    }
    for (const n of nodes) {
      graph.forEachNeighbor(n, (m) => {
        if (sub.hasNode(m) && !sub.hasEdge(n, m)) {
          try { sub.addEdge(n, m); } catch { /* duplicate */ }
        }
      });
    }

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
        adjustSizes: true, // prevent node overlap during simulation using size attribute
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

    // Target diameter sized to hold the total node area with breathing room
    // (1.4 = packing factor accounting for circle-vs-rectangle inefficiency)
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

    // Intra-cluster overlap removal (more passes for convergence)
    for (let pass = 0; pass < 60; pass++) {
      let any = false;
      for (let i = 0; i < nodeArr.length; i++) {
        for (let j = i + 1; j < nodeArr.length; j++) {
          const a = nodeArr[i], b = nodeArr[j];
          const ox = (a.w / 2 + b.w / 2 + GAP) - Math.abs(a.x - b.x);
          const oy = (a.h / 2 + b.h / 2 + GAP) - Math.abs(a.y - b.y);
          if (ox > 0 && oy > 0) {
            any = true;
            if (ox < oy) {
              const push = ox / 2 + 1;
              if (a.x < b.x) { a.x -= push; b.x += push; } else { a.x += push; b.x -= push; }
            } else {
              const push = oy / 2 + 1;
              if (a.y < b.y) { a.y -= push; b.y += push; } else { a.y += push; b.y -= push; }
            }
          } else if (Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1) {
            any = true;
            b.x += (a.w / 2 + b.w / 2 + GAP) * (Math.random() - 0.5) * 2;
            b.y += (a.h / 2 + b.h / 2 + GAP) * (Math.random() - 0.5) * 2;
          }
        }
      }
      if (!any) break;
    }

    // Cluster bounding radius: max distance from origin to any node's corner
    let radius = 0;
    for (const n of nodeArr) {
      const corner = Math.hypot(Math.abs(n.x) + n.w / 2, Math.abs(n.y) + n.h / 2);
      if (corner > radius) radius = corner;
    }

    layouts.push({ nodes: nodeArr, radius, cx: 0, cy: 0 });
  }

  // Step 3: bundle singletons as one "cluster" arranged in a compact grid.
  // Cell size based on the widest singleton label to prevent inter-cell overlap.
  if (singletons.length > 0) {
    // Cell sized to the largest singleton footprint to prevent inter-cell overlap
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

  // Step 4: pack cluster bounding-circles. Largest at origin, others placed
  // on an Archimedean spiral at the first non-overlapping position.
  layouts.sort((a, b) => b.radius - a.radius);
  const placed: { cx: number; cy: number; r: number }[] = [];
  for (const L of layouts) {
    if (placed.length === 0) {
      placed.push({ cx: 0, cy: 0, r: L.radius });
      continue;
    }
    let fx = 0, fy = 0, found = false;
    const step = 0.25;
    const b = 25;
    for (let theta = 0; theta < 400; theta += step) {
      const r = b * theta;
      const x = r * Math.cos(theta);
      const y = r * Math.sin(theta);
      let ok = true;
      for (const p of placed) {
        const margin = Math.max(80, 0.12 * (L.radius + p.r));
        const minDist = L.radius + p.r + margin;
        const dx = x - p.cx;
        const dy = y - p.cy;
        if (dx * dx + dy * dy < minDist * minDist) { ok = false; break; }
      }
      if (ok) { fx = x; fy = y; found = true; break; }
    }
    if (!found) {
      fx = placed.reduce((m, p) => Math.max(m, p.cx + p.r), 0) + L.radius + 200;
      fy = 0;
    }
    L.cx = fx; L.cy = fy;
    placed.push({ cx: fx, cy: fy, r: L.radius });
  }

  // Step 5: recenter overall bbox onto requested center
  let gMinX = Infinity, gMaxX = -Infinity, gMinY = Infinity, gMaxY = -Infinity;
  for (const L of layouts) {
    for (const n of L.nodes) {
      const x = n.x + L.cx;
      const y = n.y + L.cy;
      gMinX = Math.min(gMinX, x); gMaxX = Math.max(gMaxX, x);
      gMinY = Math.min(gMinY, y); gMaxY = Math.max(gMaxY, y);
    }
  }
  const gCx = Number.isFinite(gMinX) ? (gMinX + gMaxX) / 2 : 0;
  const gCy = Number.isFinite(gMinY) ? (gMinY + gMaxY) / 2 : 0;

  const positions = new Map<string, Position>();
  for (const L of layouts) {
    for (const n of L.nodes) {
      positions.set(n.id, {
        x: n.x + L.cx - gCx + center.x,
        y: n.y + L.cy - gCy + center.y,
      });
    }
  }
  return positions;
}

/**
 * Apply circular layout
 * Arranges nodes in a circle
 */
function applyCircularLayout(
  graph: Graph,
  elements: Element[],
  options: LayoutOptions
): Map<string, Position> {
  const { center = { x: 0, y: 0 } } = options;
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

  const positions = new Map<string, Position>();
  nodes.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / n;
    positions.set(id, {
      x: Math.cos(angle) * radius + center.x,
      y: Math.sin(angle) * radius + center.y,
    });
  });

  return positions;
}

/**
 * Apply grid layout
 * Arranges nodes in a regular grid sized to the largest node footprint
 */
function applyGridLayout(
  graph: Graph,
  elements: Element[],
  options: LayoutOptions
): Map<string, Position> {
  const { center = { x: 0, y: 0 } } = options;
  const dimsMap = buildDimsMap(elements);
  const nodes = graph.nodes();
  const gap = 32;

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

  const positions = new Map<string, Position>();
  nodes.forEach((id, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    positions.set(id, {
      x: col * cellW - offsetX + center.x,
      y: row * cellH - offsetY + center.y,
    });
  });

  return positions;
}

/**
 * Apply random layout
 * Spreads nodes randomly within bounds, then resolves overlaps by real size
 */
function applyRandomLayout(
  graph: Graph,
  elements: Element[],
  options: LayoutOptions
): Map<string, Position> {
  const { scale = 500, center = { x: 0, y: 0 } } = options;
  const dimsMap = buildDimsMap(elements);

  random.assign(graph, { scale });

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

  removeOverlaps(nodeData, 24, 20);

  const positions = new Map<string, Position>();
  for (const node of nodeData) {
    positions.set(node.id, { x: node.x + center.x, y: node.y + center.y });
  }

  return positions;
}

/**
 * AABB overlap removal: iteratively push apart any pair whose bounding boxes
 * (plus gap) intersect, on the axis of least overlap. Mutates nodeData in place.
 */
function removeOverlaps(
  nodeData: { id: string; x: number; y: number; w: number; h: number }[],
  gap: number,
  passes: number,
): void {
  for (let pass = 0; pass < passes; pass++) {
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
            if (a.x < b.x) { a.x -= push; b.x += push; } else { a.x += push; b.x -= push; }
          } else {
            const push = overlapY / 2 + 1;
            if (a.y < b.y) { a.y -= push; b.y += push; } else { a.y += push; b.y -= push; }
          }
        } else if (Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1) {
          hasOverlap = true;
          b.x += (a.w / 2 + b.w / 2 + gap) * Math.random();
          b.y += (a.h / 2 + b.h / 2 + gap) * Math.random();
        }
      }
    }
    if (!hasOverlap) break;
  }
}

/**
 * Apply hierarchical layout using dagre (Sugiyama algorithm)
 * Minimizes edge crossings and arranges nodes in clean layers
 */
function applyHierarchyLayout(
  graph: Graph,
  links: Link[],
  elements: Element[],
  options: LayoutOptions,
  nodeCount: number
): Map<string, Position> {
  const { center = { x: 0, y: 0 } } = options;

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

  // Add nodes with their real rendered footprint
  graph.forEachNode((node) => {
    const { w, h } = dimsFor(dimsMap, node);
    g.setNode(node, { width: w, height: h });
  });

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

  // Run dagre layout
  dagre.layout(g);

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

  const positions = new Map<string, Position>();
  for (const n of nodeData) {
    positions.set(n.id, {
      x: n.x - graphCenterX + center.x,
      y: n.y - graphCenterY + center.y,
    });
  }

  return positions;
}

// ============================================================================
// MAIN SERVICE
// ============================================================================

class LayoutService {
  /**
   * Build a Graphology graph from elements and links
   */
  private buildGraph(elements: Element[], links: Link[]): Graph {
    const graph = new Graph();

    // Add nodes
    for (const element of elements) {
      graph.addNode(element.id, {
        x: element.position.x,
        y: element.position.y,
      });
    }

    // Add edges
    for (const link of links) {
      // Only add edge if both nodes exist
      if (graph.hasNode(link.fromId) && graph.hasNode(link.toId)) {
        try {
          graph.addEdge(link.fromId, link.toId);
        } catch {
          // Ignore duplicate edges
        }
      }
    }

    return graph;
  }

  /**
   * Calculate the center of all elements
   */
  private calculateCenter(elements: Element[]): Position {
    if (elements.length === 0) return { x: 0, y: 0 };

    const sumX = elements.reduce((sum, el) => sum + el.position.x, 0);
    const sumY = elements.reduce((sum, el) => sum + el.position.y, 0);

    return {
      x: sumX / elements.length,
      y: sumY / elements.length,
    };
  }

  /**
   * Apply a layout algorithm to elements
   */
  applyLayout(
    layoutType: LayoutType,
    elements: Element[],
    links: Link[],
    options: LayoutOptions = {}
  ): LayoutResult {
    if (elements.length === 0) {
      return { positions: new Map() };
    }

    // Build graph
    const graph = this.buildGraph(elements, links);

    // Calculate center from current positions (to keep layout centered)
    const center = options.center ?? this.calculateCenter(elements);

    // Apply layout based on type
    let positions: Map<string, Position>;

    switch (layoutType) {
      case 'force':
        positions = applyForceLayout(graph, elements, { ...options, center });
        break;
      case 'clusters':
        positions = applyClustersLayout(graph, elements, { ...options, center });
        break;
      case 'circular':
        positions = applyCircularLayout(graph, elements, { ...options, center });
        break;
      case 'grid':
        positions = applyGridLayout(graph, elements, { ...options, center });
        break;
      case 'random':
        // Scale based on number of nodes
        const randomScale = Math.max(400, Math.sqrt(elements.length) * 100);
        positions = applyRandomLayout(graph, elements, { ...options, center, scale: randomScale });
        break;
      case 'hierarchy':
        positions = applyHierarchyLayout(graph, links, elements, { ...options, center }, elements.length);
        break;
      default:
        positions = new Map();
    }

    return { positions };
  }

  /**
   * Get layout display name
   */
  getLayoutName(layoutType: LayoutType): string {
    switch (layoutType) {
      case 'force':
        return 'Force (clusters)';
      case 'clusters':
        return 'Clusters (îlots)';
      case 'circular':
        return 'Circulaire';
      case 'grid':
        return 'Grille';
      case 'random':
        return 'Dispersion';
      default:
        return layoutType;
    }
  }

  /**
   * Get layout description
   */
  getLayoutDescription(layoutType: LayoutType): string {
    switch (layoutType) {
      case 'force':
        return 'Regroupe les elements connectes, separe les clusters';
      case 'clusters':
        return 'Regroupe chaque communaute en ilot separe';
      case 'circular':
        return 'Dispose les elements en cercle';
      case 'grid':
        return 'Aligne les elements en grille reguliere';
      case 'random':
        return 'Disperse les elements aleatoirement';
      default:
        return '';
    }
  }

  /**
   * Get all available layout types
   */
  getAvailableLayouts(): LayoutType[] {
    return ['clusters', 'force', 'hierarchy', 'circular', 'grid', 'random'];
  }
}

export const layoutService = new LayoutService();
