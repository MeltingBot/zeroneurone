/**
 * Layout Service
 *
 * Provides automatic graph layout algorithms using Graphology
 */

import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { circular, random } from 'graphology-layout';
import type { Element, Link, Position } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export type LayoutType = 'force' | 'circular' | 'grid' | 'random';

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
  options: LayoutOptions
): Map<string, Position> {
  const { center = { x: 0, y: 0 } } = options;

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

  // Post-process: ensure minimum distance between ALL nodes (prevent overlap)
  // Nodes are ~200px wide x 80px tall, so need at least 250px to avoid overlap
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
          // Nodes at exact same position - push apart randomly
          graph.setNodeAttribute(nodes[j], 'x', x2 + minNodeDistance * Math.random());
          graph.setNodeAttribute(nodes[j], 'y', y2 + minNodeDistance * Math.random());
        }
      }
    }
  }

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
  const positions = new Map<string, Position>();
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  for (const { node, x, y } of rawPositions) {
    positions.set(node, {
      x: (x - centerX) * scaleFactor + center.x,
      y: (y - centerY) * scaleFactor + center.y,
    });
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
        positions = applyForceLayout(graph, { ...options, center });
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
    return ['force', 'circular', 'grid', 'random'];
  }
}

export const layoutService = new LayoutService();
