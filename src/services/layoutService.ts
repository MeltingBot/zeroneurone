/**
 * Layout Service
 *
 * Provides automatic graph layout algorithms using Graphology
 */

import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { circular, random } from 'graphology-layout';
import dagre from '@dagrejs/dagre';
import type { Element, Link, Position } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export type LayoutType = 'force' | 'circular' | 'grid' | 'random' | 'hierarchy';

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

  // Build label lookup for per-node width estimation
  const labelMap = new Map<string, string>();
  for (const el of elements) {
    labelMap.set(el.id, el.label || '');
  }

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
          b.y += ESTIMATED_NODE_HEIGHT * Math.random();
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
 * Apply circular layout
 * Arranges nodes in a circle
 */
function applyCircularLayout(
  graph: Graph,
  options: LayoutOptions
): Map<string, Position> {
  const { scale = 300, center = { x: 0, y: 0 } } = options;

  // Apply circular layout
  circular.assign(graph, { scale });

  // Extract positions
  const positions = new Map<string, Position>();
  graph.forEachNode((node) => {
    const x = graph.getNodeAttribute(node, 'x') as number;
    const y = graph.getNodeAttribute(node, 'y') as number;
    positions.set(node, {
      x: x + center.x,
      y: y + center.y,
    });
  });

  return positions;
}

/**
 * Apply grid layout
 * Arranges nodes in a regular grid
 */
function applyGridLayout(
  graph: Graph,
  options: LayoutOptions
): Map<string, Position> {
  const { scale = 120, center = { x: 0, y: 0 } } = options;

  const nodeCount = graph.order;
  const cols = Math.ceil(Math.sqrt(nodeCount));
  const rows = Math.ceil(nodeCount / cols);

  // Calculate offset to center the grid
  const offsetX = ((cols - 1) * scale) / 2;
  const offsetY = ((rows - 1) * scale) / 2;

  const positions = new Map<string, Position>();
  let index = 0;

  graph.forEachNode((node) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    positions.set(node, {
      x: col * scale - offsetX + center.x,
      y: row * scale - offsetY + center.y,
    });
    index++;
  });

  return positions;
}

/**
 * Apply random layout
 * Spreads nodes randomly within bounds
 */
function applyRandomLayout(
  graph: Graph,
  options: LayoutOptions
): Map<string, Position> {
  const { scale = 500, center = { x: 0, y: 0 } } = options;

  // Apply random layout from graphology
  random.assign(graph, { scale });

  // Extract positions
  const positions = new Map<string, Position>();
  graph.forEachNode((node) => {
    const x = graph.getNodeAttribute(node, 'x') as number;
    const y = graph.getNodeAttribute(node, 'y') as number;
    positions.set(node, {
      x: x + center.x - scale / 2,
      y: y + center.y - scale / 2,
    });
  });

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
      case 'circular':
        // Scale based on number of nodes - need circumference >= nodeCount * nodeWidth
        // Circumference = 2πr, so r >= (n * nodeWidth) / 2π ≈ n * 45 for 280px nodes
        const circularScale = Math.max(300, elements.length * 50);
        positions = applyCircularLayout(graph, { ...options, center, scale: circularScale });
        break;
      case 'grid':
        positions = applyGridLayout(graph, { ...options, center });
        break;
      case 'random':
        // Scale based on number of nodes
        const randomScale = Math.max(400, Math.sqrt(elements.length) * 100);
        positions = applyRandomLayout(graph, { ...options, center, scale: randomScale });
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
    return ['force', 'hierarchy', 'circular', 'grid', 'random'];
  }
}

export const layoutService = new LayoutService();
