/**
 * Handle positions of a node React Flow has not measured yet, estimated from
 * its size the way the node components lay them out.
 *
 * React Flow mounts every node it has never measured, on screen or not
 * (getNodesInside: forceInitialRender). After the overview layer, or on a
 * dossier reopened zoomed out, that is thousands of full nodes at once and a
 * blank canvas for seconds. Given handles, an unmeasured node is culled like
 * any other and measured for real once it comes on screen.
 */

import { Position, type NodeHandle } from '@xyflow/react';
import { DIAMOND_HALF_DIAGONAL } from './overview/overviewHitTest';

/** Handles are 8 px squares centred on their anchor (`!w-2 !h-2`). */
const HANDLE = 8;
const SIDES = [Position.Top, Position.Bottom, Position.Left, Position.Right] as const;

function handlesAt(
  type: 'source' | 'target',
  anchor: (side: Position) => { x: number; y: number },
): NodeHandle[] {
  return SIDES.map((side) => {
    const { x, y } = anchor(side);
    return { id: `${type}-${side}`, type, position: side, x: x - HANDLE / 2, y: y - HANDLE / 2, width: HANDLE, height: HANDLE };
  });
}

export function estimateHandles(nodeType: string | undefined, shape: string | undefined, width: number, height: number): NodeHandle[] {
  if (nodeType === 'annotation') return [];

  if (nodeType === 'groupFrame') {
    // GroupNode: sources at 30 % of each side, targets at 70 %
    const at = (ratio: number) => (side: Position) => {
      switch (side) {
        case Position.Top: return { x: width * ratio, y: 0 };
        case Position.Bottom: return { x: width * ratio, y: height };
        case Position.Left: return { x: 0, y: height * ratio };
        default: return { x: width, y: height * ratio };
      }
    };
    return [...handlesAt('source', at(0.3)), ...handlesAt('target', at(0.7))];
  }

  // ElementNode: middle of each side; on a diamond, its tips
  const cx = width / 2, cy = height / 2;
  const rx = shape === 'diamond' ? width * DIAMOND_HALF_DIAGONAL : width / 2;
  const ry = shape === 'diamond' ? width * DIAMOND_HALF_DIAGONAL : height / 2;
  const anchor = (side: Position) => {
    switch (side) {
      case Position.Top: return { x: cx, y: cy - ry };
      case Position.Bottom: return { x: cx, y: cy + ry };
      case Position.Left: return { x: cx - rx, y: cy };
      default: return { x: cx + rx, y: cy };
    }
  };
  return [...handlesAt('source', anchor), ...handlesAt('target', anchor)];
}
