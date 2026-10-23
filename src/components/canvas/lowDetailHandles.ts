import { useLayoutEffect, useRef } from 'react';
import { Position, useStoreApi } from '@xyflow/react';

/**
 * Handles of zoomed-out ("low detail") element nodes.
 *
 * Zoomed far out, an element node renders a single centred handle instead of
 * eight, and edges are sent without handle ids so React Flow anchors them to
 * it. At 10 000 nodes that is 70 000 DOM elements and Handle subscriptions
 * fewer, which is most of the cost of the overview.
 *
 * React Flow keeps the handle bounds it last measured for nodes it unmounts
 * (off screen). Coming back close up, a node measured in the overview would
 * still have only the single handle, and every edge naming `source-left` &co.
 * towards it would not be drawn. On that transition, such nodes get estimated
 * bounds for the eight handles, and are re-measured exactly when they mount.
 */

export const LOW_DETAIL_HANDLE_ID = 'low-detail';

/** Nodes carrying estimated bounds, to re-measure on their next mount. */
const estimatedHandleIds = new Set<string>();

/** True once per estimated node: its handles must be measured from the DOM. */
export function takeEstimatedHandles(nodeId: string): boolean {
  return estimatedHandleIds.delete(nodeId);
}

/**
 * Batches handle measurements into one React Flow store update. Each update
 * notifies every mounted node, so measuring nodes one call at a time is
 * quadratic: thousands of nodes flip together when the overview ends.
 */
const pendingMeasure = new Set<string>();
let measureScheduled = false;
export function requestHandleMeasure(nodeId: string, update: (ids: string[]) => void): void {
  pendingMeasure.add(nodeId);
  if (measureScheduled) return;
  measureScheduled = true;
  queueMicrotask(() => {
    measureScheduled = false;
    const ids = [...pendingMeasure];
    pendingMeasure.clear();
    update(ids);
  });
}

const SIDES = [Position.Top, Position.Bottom, Position.Left, Position.Right] as const;

/** Size of a full-detail handle (`!w-2 !h-2`), centred on the node border. */
const HANDLE_SIZE = 8;

/**
 * Bounds of the eight full-detail handles, centred on the middle of each side
 * as React Flow's CSS places them. Exact for every shape but the diamond,
 * whose handles are shifted; that one is corrected when the node mounts.
 */
function estimateHandleBounds(nodeId: string, width: number, height: number) {
  const half = HANDLE_SIZE / 2;
  const at = (side: Position) => {
    switch (side) {
      case Position.Top: return { x: width / 2 - half, y: -half };
      case Position.Bottom: return { x: width / 2 - half, y: height - half };
      case Position.Left: return { x: -half, y: height / 2 - half };
      default: return { x: width - half, y: height / 2 - half };
    }
  };
  const make = (type: 'source' | 'target') =>
    SIDES.map((side) => ({
      id: `${type}-${side}`, type, nodeId, position: side, width: HANDLE_SIZE, height: HANDLE_SIZE, ...at(side),
    }));
  return { source: make('source'), target: make('target') };
}

/**
 * Rendered inside <ReactFlow>. When the overview ends, replaces the stale
 * single-handle bounds of every node that has them with an estimate, and
 * marks them: each one is measured from the DOM once it renders in full
 * detail (ElementNode), right away for mounted nodes, on mount otherwise.
 *
 * Entering the overview needs nothing: nodes keep their eight-handle bounds,
 * and edges without handle ids attach to the first of them.
 */
export function LowDetailHandleRepair({ isLowDetail }: { isLowDetail: boolean }) {
  const store = useStoreApi();
  const wasLowDetail = useRef(isLowDetail);

  useLayoutEffect(() => {
    const leaving = wasLowDetail.current && !isLowDetail;
    wasLowDetail.current = isLowDetail;
    if (!leaving) return;

    const { nodeLookup } = store.getState();
    let repaired = false;
    for (const [id, node] of nodeLookup) {
      const source = node.internals.handleBounds?.source;
      if (!source || source.length !== 1 || source[0].id !== LOW_DETAIL_HANDLE_ID) continue;
      const { width, height } = node.measured;
      if (!width || !height) continue;
      nodeLookup.set(id, {
        ...node,
        internals: { ...node.internals, handleBounds: estimateHandleBounds(id, width, height) },
      });
      estimatedHandleIds.add(id);
      repaired = true;
    }
    // Edge positions are read from nodeLookup by store selectors: notify them.
    if (repaired) store.setState({});
  }, [isLowDetail, store]);

  return null;
}
