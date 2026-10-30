/**
 * Layout Service
 *
 * Automatic layouts on the main thread: the fallback when the graph worker is
 * unavailable, and the small layouts of the JSON mapping import. The
 * algorithms live in services/graph/layouts, shared with the worker.
 */

import type { Element, Link, Position } from '../types';
import { computeLayout, toLayoutEdges, toLayoutNodes, type LayoutType } from './graph/layouts';

export type { LayoutType } from './graph/layouts';

/** Above this, one ring is wider than the canvas at its smallest zoom: the layout is not offered. */
export const CIRCULAR_MAX_ELEMENTS = 1000;

export interface LayoutOptions {
  /** Center position for the layout (default: centre of the elements) */
  center?: Position;
  /** Locked elements as discs (canvas centre + radius): laid out around them */
  obstacles?: { x: number; y: number; r: number }[];
}

export interface LayoutResult {
  positions: Map<string, Position>;
}

function centreOf(elements: Element[]): Position {
  if (elements.length === 0) return { x: 0, y: 0 };
  const sumX = elements.reduce((sum, el) => sum + el.position.x, 0);
  const sumY = elements.reduce((sum, el) => sum + el.position.y, 0);
  return { x: sumX / elements.length, y: sumY / elements.length };
}

class LayoutService {
  applyLayout(
    layoutType: LayoutType,
    elements: Element[],
    links: Link[],
    options: LayoutOptions = {}
  ): LayoutResult {
    if (elements.length === 0) return { positions: new Map() };
    const positions = computeLayout(toLayoutNodes(elements), toLayoutEdges(links), {
      layoutType,
      center: options.center ?? centreOf(elements),
      obstacles: options.obstacles,
    });
    return { positions: new Map(Object.entries(positions)) };
  }

  getAvailableLayouts(): LayoutType[] {
    return ['clusters', 'force', 'hierarchy', 'circular', 'grid', 'random'];
  }
}

export const layoutService = new LayoutService();
