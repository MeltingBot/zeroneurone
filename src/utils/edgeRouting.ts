/**
 * Link routing shared by the canvas (CustomEdge) and the SVG export, so both draw the same lines.
 *
 * Links sharing a node side each leave it from their own slot along that side, ordered by the
 * position of their other end (computeHandleSlots). Edges then run apart in lanes LANE_FACTOR times
 * their slot, which keeps the slot order all along (computeEdgeRoute).
 */

export type EdgeCurveMode = 'straight' | 'curved' | 'orthogonal';

export interface Point {
  x: number;
  y: number;
}

export const EDGE_ARROW_LENGTH = 16;
export const EDGE_ARROW_WIDTH = 12;
/** Spacing between the slots of a node side, and the largest spread of a side */
export const HANDLE_SLOT_SPACING = 12;
export const HANDLE_SLOT_SPAN = 48;
const MAX_HANDLE_SLOT = HANDLE_SLOT_SPAN / 2;
/** Lanes sit this many times their handle slot away from the node side */
const LANE_FACTOR = 2.5;
/** Below this lane spacing, labels of parallel edges are staggered along the run */
const LABEL_MIN_SPACING = 18;
const LABEL_STAGGER_STEP = 45;
/** Minimum segment length for clean orthogonal routing */
const MIN_SEGMENT = 20;

/** Direction an edge leaves (source) or enters from (target) a handle, as a unit vector. */
export function getHandleDirection(handleId: string | null | undefined, type: 'source' | 'target'): { dx: number; dy: number } {
  const defaultDir = type === 'source' ? { dx: 1, dy: 0 } : { dx: -1, dy: 0 }; // default: horizontal
  if (!handleId) return defaultDir;

  const position = handleId.split('-')[1]; // e.g., 'source-right' -> 'right'
  switch (position) {
    case 'top': return { dx: 0, dy: -1 };
    case 'bottom': return { dx: 0, dy: 1 };
    case 'left': return { dx: -1, dy: 0 };
    case 'right': return { dx: 1, dy: 0 };
    default: return defaultDir;
  }
}

// ============================================================================
// HANDLE SLOTS
// ============================================================================

export interface HandleSlots {
  source: number;
  target: number;
}

export interface SlotLink {
  id: string;
  fromId: string;
  toId: string;
  sourceHandle: string;
  targetHandle: string;
  /** Rank among parallel links (same two nodes), keeps their order identical at both ends */
  tie: number;
}

/**
 * Links leaving the same node side would start from the same point (and share their first segments
 * in orthogonal mode), whatever their other end. Spread every link of a side along it, ordered by
 * the position of its other end so the lines do not cross on their way out.
 */
export function computeHandleSlots(links: SlotLink[], nodePositions: Map<string, Point>): Map<string, HandleSlots> {
  type SlotEntry = { linkId: string; end: 'source' | 'target'; order: number; tie: number };
  const sides = new Map<string, SlotEntry[]>();
  for (const link of links) {
    const ends = [
      { end: 'source' as const, nodeId: link.fromId, handle: link.sourceHandle, otherId: link.toId },
      { end: 'target' as const, nodeId: link.toId, handle: link.targetHandle, otherId: link.fromId },
    ];
    for (const { end, nodeId, handle, otherId } of ends) {
      const side = handle.split('-')[1];
      const other = nodePositions.get(otherId);
      const order = other ? (side === 'top' || side === 'bottom' ? other.x : other.y) : 0;
      const key = `${nodeId}:${side}`;
      let entries = sides.get(key);
      if (!entries) { entries = []; sides.set(key, entries); }
      entries.push({ linkId: link.id, end, order, tie: link.tie });
    }
  }

  const slots = new Map<string, HandleSlots>();
  for (const entries of sides.values()) {
    if (entries.length < 2) continue;
    entries.sort((a, b) => a.order - b.order || a.tie - b.tie);
    const spacing = Math.min(HANDLE_SLOT_SPACING, HANDLE_SLOT_SPAN / (entries.length - 1));
    entries.forEach((entry, i) => {
      const slot = slots.get(entry.linkId) ?? { source: 0, target: 0 };
      slot[entry.end] = (i - (entries.length - 1) / 2) * spacing;
      slots.set(entry.linkId, slot);
    });
  }
  return slots;
}

// ============================================================================
// ROUTE
// ============================================================================

export interface EdgeRouteInput {
  /** Handle points on the node sides */
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourceHandleId: string | null | undefined;
  targetHandleId: string | null | undefined;
  curveMode: EdgeCurveMode;
  parallelIndex: number;
  parallelCount: number;
  sourceSlot: number;
  targetSlot: number;
  /** Manual offset of the current route style (curve control point, or orthogonal segments) */
  offset: Point;
  hasStartArrow: boolean;
  hasEndArrow: boolean;
}

export interface EdgeRoute {
  path: string;
  /** Label anchor; also where the drag handle sits */
  labelX: number;
  labelY: number;
  startAngle: number;
  endAngle: number;
  /** Slot-shifted ends, where arrow tips sit */
  sourcePoint: Point;
  targetPoint: Point;
  /** Orthogonal route with a middle segment the user can drag */
  adjustable: boolean;
}

export function computeEdgeRoute(input: EdgeRouteInput): EdgeRoute {
  const {
    sourceHandleId, targetHandleId, curveMode, parallelIndex, parallelCount,
    sourceSlot, targetSlot, offset, hasStartArrow, hasEndArrow,
  } = input;
  const arrowLength = EDGE_ARROW_LENGTH;

  // Ends shifted along the node side the handle sits on
  const slotSourceDir = getHandleDirection(sourceHandleId, 'source');
  const slotTargetDir = getHandleDirection(targetHandleId, 'target');
  const sourceSpread = slotSourceDir.dx !== 0 ? { x: 0, y: sourceSlot } : { x: sourceSlot, y: 0 };
  const targetSpread = slotTargetDir.dx !== 0 ? { x: 0, y: targetSlot } : { x: targetSlot, y: 0 };
  const sourceX = input.sourceX + sourceSpread.x;
  const sourceY = input.sourceY + sourceSpread.y;
  const targetX = input.targetX + targetSpread.x;
  const targetY = input.targetY + targetSpread.y;
  // Straight and curved edges only need lanes between the same two nodes (parallel edges); other
  // links go straight from their slot. Shifts are relative to the slot-shifted ends.
  const isParallel = parallelCount > 1;
  const sourceLane = isParallel
    ? { x: sourceSpread.x * (LANE_FACTOR - 1), y: sourceSpread.y * (LANE_FACTOR - 1) }
    : { x: 0, y: 0 };
  const targetLane = isParallel
    ? { x: targetSpread.x * (LANE_FACTOR - 1), y: targetSpread.y * (LANE_FACTOR - 1) }
    : { x: 0, y: 0 };

  const edgeDx = targetX - sourceX;
  const edgeDy = targetY - sourceY;
  const edgeLength = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);

  let path: string;
  let labelX: number;
  let labelY: number;
  let startAngle: number;
  let endAngle: number;
  let adjustable = false;

  if (curveMode === 'straight' && isParallel && edgeLength > 0) {
    // Parallel edge: leave the handle, run alongside the others, come back to the target handle,
    // so every edge stays attached and keeps its own arrow
    const ux = edgeDx / edgeLength;
    const uy = edgeDy / edgeLength;
    const fan = Math.min(30, edgeLength / 4);
    const p1 = { x: sourceX + ux * fan + sourceLane.x, y: sourceY + uy * fan + sourceLane.y };
    const p2 = { x: targetX - ux * fan + targetLane.x, y: targetY - uy * fan + targetLane.y };

    labelX = (p1.x + p2.x) / 2;
    labelY = (p1.y + p2.y) / 2;
    startAngle = Math.atan2(p1.y - sourceY, p1.x - sourceX);
    endAngle = Math.atan2(targetY - p2.y, targetX - p2.x);

    const adjustedSourceX = sourceX + (hasStartArrow ? arrowLength * Math.cos(startAngle) : 0);
    const adjustedSourceY = sourceY + (hasStartArrow ? arrowLength * Math.sin(startAngle) : 0);
    const adjustedTargetX = targetX - (hasEndArrow ? arrowLength * Math.cos(endAngle) : 0);
    const adjustedTargetY = targetY - (hasEndArrow ? arrowLength * Math.sin(endAngle) : 0);

    path = `M ${adjustedSourceX} ${adjustedSourceY} L ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${adjustedTargetX} ${adjustedTargetY}`;
  } else if (curveMode === 'straight') {
    labelX = (sourceX + targetX) / 2;
    labelY = (sourceY + targetY) / 2;
    startAngle = Math.atan2(edgeDy, edgeDx);
    endAngle = startAngle;

    const adjustedSourceX = sourceX + (hasStartArrow ? arrowLength * Math.cos(startAngle) : 0);
    const adjustedSourceY = sourceY + (hasStartArrow ? arrowLength * Math.sin(startAngle) : 0);
    const adjustedTargetX = targetX - (hasEndArrow ? arrowLength * Math.cos(endAngle) : 0);
    const adjustedTargetY = targetY - (hasEndArrow ? arrowLength * Math.sin(endAngle) : 0);

    path = `M ${adjustedSourceX} ${adjustedSourceY} L ${adjustedTargetX} ${adjustedTargetY}`;
  } else if (curveMode === 'orthogonal') {
    const sourceDir = getHandleDirection(sourceHandleId, 'source');
    const targetDir = getHandleDirection(targetHandleId, 'target');
    const srcHorizontal = sourceDir.dx !== 0;
    const tgtHorizontal = targetDir.dx !== 0;
    let waypoints: Point[] = [];

    // Links sharing a node side leave it from their slot through a short stub, then run in their own
    // lane on fixed axes (edges drawn in opposite directions stay apart too). The stub always has
    // room for a whole arrowhead on a straight part (so all stubs of a side line up), then 12 px of
    // line before the corner. Lanes further from the handle centre turn closer to the node, so the
    // connectors of a side nest instead of overlapping.
    const nesting = (slot: number) => (slot === 0 ? 0 : (MAX_HANDLE_SLOT - Math.abs(slot)) * 1.5);

    // Facing handles (both horizontal or both vertical, target ahead): when the gap is shorter than
    // the room stubs, nesting and lanes need, shrink them all by the same factor (arrowheads keep
    // their room). At 0, each link goes straight from its slot to its target slot.
    let laneScale = 1;
    const facingGap = srcHorizontal && tgtHorizontal
      ? (targetX - sourceX) * sourceDir.dx
      : !srcHorizontal && !tgtHorizontal
        ? (targetY - sourceY) * sourceDir.dy
        : 0;
    if (facingGap > 0) {
      const flexibleRoom = 24 + nesting(sourceSlot) + nesting(targetSlot) + 2 * MIN_SEGMENT;
      const room = facingGap - 2 * arrowLength;
      if (room < flexibleRoom) laneScale = Math.max(0, room / flexibleRoom);
    }

    const sourceStubLength = arrowLength + (12 + nesting(sourceSlot)) * laneScale;
    const targetStubLength = arrowLength + (12 + nesting(targetSlot)) * laneScale;
    const sourceStub = { x: sourceX + sourceDir.dx * sourceStubLength, y: sourceY + sourceDir.dy * sourceStubLength };
    const targetStub = { x: targetX + targetDir.dx * targetStubLength, y: targetY + targetDir.dy * targetStubLength };

    // Each end runs in its own lane, LANE_FACTOR times its slot away from the handle (values
    // relative to the slot-shifted ends, along the node side)
    const sourceRun = sourceSlot * (LANE_FACTOR - 1) * laneScale;
    const targetRun = targetSlot * (LANE_FACTOR - 1) * laneScale;

    // Parallel edges whose lanes are too close for their labels get them staggered along the run,
    // by rank, within the gap between the nodes
    const laneSpacing = HANDLE_SLOT_SPACING * (1 + (LANE_FACTOR - 1) * laneScale);
    const labelStagger = isParallel && facingGap > 0 && laneSpacing < LABEL_MIN_SPACING
      ? (parallelIndex - (parallelCount - 1) / 2) * Math.min(LABEL_STAGGER_STEP, facingGap / Math.max(1, parallelCount))
      : 0;
    let labelOverride: Point | null = null;

    if (srcHorizontal && tgtHorizontal) {
      // Both horizontal: route via vertical middle segment. Dragging moves that segment sideways
      // and the horizontal runs up or down.
      adjustable = true;
      const midX = (sourceX + targetX) / 2 + offset.x;
      const sourceRunY = sourceY + sourceRun + offset.y;
      const targetRunY = targetY + targetRun + offset.y;
      if (labelStagger !== 0) {
        // On the source run before the middle segment, on the target run after it
        const x = midX + labelStagger;
        labelOverride = { x, y: (x - midX) * sourceDir.dx < 0 ? sourceRunY : targetRunY };
      }
      waypoints = sourceRunY === sourceY && targetRunY === targetY
        ? [{ x: midX, y: sourceY }, { x: midX, y: targetY }]
        : [
          sourceStub,
          { x: sourceStub.x, y: sourceRunY },
          { x: midX, y: sourceRunY },
          { x: midX, y: targetRunY },
          { x: targetStub.x, y: targetRunY },
          targetStub,
        ];
    } else if (!srcHorizontal && !tgtHorizontal) {
      // Both vertical: route via horizontal middle segment. Dragging moves that segment up or down
      // and the vertical runs sideways.
      adjustable = true;
      const midY = (sourceY + targetY) / 2 + offset.y;
      const sourceRunX = sourceX + sourceRun + offset.x;
      const targetRunX = targetX + targetRun + offset.x;
      if (labelStagger !== 0) {
        const y = midY + labelStagger;
        labelOverride = { x: (y - midY) * sourceDir.dy < 0 ? sourceRunX : targetRunX, y };
      }
      waypoints = sourceRunX === sourceX && targetRunX === targetX
        ? [{ x: sourceX, y: midY }, { x: targetX, y: midY }]
        : [
          sourceStub,
          { x: sourceRunX, y: sourceStub.y },
          { x: sourceRunX, y: midY },
          { x: targetRunX, y: midY },
          { x: targetRunX, y: targetStub.y },
          targetStub,
        ];
    } else if (srcHorizontal && !tgtHorizontal) {
      // Source horizontal, target vertical: single corner, horizontal first
      const goingRight = sourceDir.dx > 0;
      const targetLeft = targetX < sourceX;
      if ((goingRight && !targetLeft) || (!goingRight && targetLeft)) {
        waypoints = sourceRun === 0 && targetRun === 0
          ? [{ x: targetX, y: sourceY }]
          : [
            sourceStub,
            { x: sourceStub.x, y: sourceY + sourceRun },
            { x: targetX + targetRun, y: sourceY + sourceRun },
            { x: targetX + targetRun, y: targetStub.y },
            targetStub,
          ];
      } else {
        // Route around with an extra segment (its horizontal middle is draggable)
        adjustable = true;
        const detourX = sourceX + sourceDir.dx * MIN_SEGMENT;
        const midY = (sourceY + targetY) / 2 + sourceRun + offset.y;
        waypoints = [{ x: detourX, y: sourceY }, { x: detourX, y: midY }, { x: targetX, y: midY }];
      }
    } else {
      // Source vertical, target horizontal: single corner, vertical first
      const goingDown = sourceDir.dy > 0;
      const targetBelow = targetY > sourceY;
      if ((goingDown && targetBelow) || (!goingDown && !targetBelow)) {
        waypoints = sourceRun === 0 && targetRun === 0
          ? [{ x: sourceX, y: targetY }]
          : [
            sourceStub,
            { x: sourceX + sourceRun, y: sourceStub.y },
            { x: sourceX + sourceRun, y: targetY + targetRun },
            { x: targetStub.x, y: targetY + targetRun },
            targetStub,
          ];
      } else {
        // Route around with an extra segment (its vertical middle is draggable)
        adjustable = true;
        const detourY = sourceY + sourceDir.dy * MIN_SEGMENT;
        const midX = (sourceX + targetX) / 2 + sourceRun + offset.x;
        waypoints = [{ x: sourceX, y: detourY }, { x: midX, y: detourY }, { x: midX, y: targetY }];
      }
    }

    if (waypoints.length > 0) {
      startAngle = Math.atan2(waypoints[0].y - sourceY, waypoints[0].x - sourceX);
      const lastWp = waypoints[waypoints.length - 1];
      endAngle = Math.atan2(targetY - lastWp.y, targetX - lastWp.x);
    } else {
      startAngle = Math.atan2(edgeDy, edgeDx);
      endAngle = startAngle;
    }

    const adjustedSourceX = sourceX + (hasStartArrow ? arrowLength * Math.cos(startAngle) : 0);
    const adjustedSourceY = sourceY + (hasStartArrow ? arrowLength * Math.sin(startAngle) : 0);
    const adjustedTargetX = targetX - (hasEndArrow ? arrowLength * Math.cos(endAngle) : 0);
    const adjustedTargetY = targetY - (hasEndArrow ? arrowLength * Math.sin(endAngle) : 0);
    path = [
      `M ${adjustedSourceX} ${adjustedSourceY}`,
      ...waypoints.map(wp => `L ${wp.x} ${wp.y}`),
      `L ${adjustedTargetX} ${adjustedTargetY}`,
    ].join(' ');

    if (labelOverride) {
      labelX = labelOverride.x;
      labelY = labelOverride.y;
    } else if (waypoints.length >= 2) {
      // Middle of the middle segment of the whole route (source, waypoints, target)
      const points = [{ x: sourceX, y: sourceY }, ...waypoints, { x: targetX, y: targetY }];
      const segment = Math.floor((points.length - 1) / 2);
      labelX = (points[segment].x + points[segment + 1].x) / 2;
      labelY = (points[segment].y + points[segment + 1].y) / 2;
    } else if (waypoints.length === 1) {
      // Single corner: between source and corner
      labelX = (sourceX + waypoints[0].x) / 2;
      labelY = (sourceY + waypoints[0].y) / 2;
    } else {
      labelX = (sourceX + targetX) / 2;
      labelY = (sourceY + targetY) / 2;
    }
  } else {
    // CURVED MODE
    const hasCustomOffset = offset.x !== 0 || offset.y !== 0;
    const sourceDir = getHandleDirection(sourceHandleId, 'source');
    const targetDir = getHandleDirection(targetHandleId, 'target');
    // Curve factor: minimum 40px for short edges, scales with length, capped at 80px
    const curveFactor = Math.max(40, Math.min(edgeLength * 0.3, 80));

    let cp1x: number, cp1y: number, cp2x: number, cp2y: number;
    if (hasCustomOffset) {
      // Dragged control point: quadratic bezier through that point, converted to cubic
      const controlX = (sourceX + targetX) / 2 + offset.x + (sourceLane.x + targetLane.x) / 2;
      const controlY = (sourceY + targetY) / 2 + offset.y + (sourceLane.y + targetLane.y) / 2;
      cp1x = sourceX + (2 / 3) * (controlX - sourceX);
      cp1y = sourceY + (2 / 3) * (controlY - sourceY);
      cp2x = targetX + (2 / 3) * (controlX - targetX);
      cp2y = targetY + (2 / 3) * (controlY - targetY);
    } else {
      // Natural S-curve using handle directions; parallel edges bend through their own lane
      cp1x = sourceX + sourceDir.dx * curveFactor + sourceLane.x;
      cp1y = sourceY + sourceDir.dy * curveFactor + sourceLane.y;
      cp2x = targetX + targetDir.dx * curveFactor + targetLane.x;
      cp2y = targetY + targetDir.dy * curveFactor + targetLane.y;
    }

    // Midpoint of cubic bezier at t=0.5
    labelX = 0.125 * sourceX + 0.375 * cp1x + 0.375 * cp2x + 0.125 * targetX;
    labelY = 0.125 * sourceY + 0.375 * cp1y + 0.375 * cp2y + 0.125 * targetY;
    startAngle = Math.atan2(cp1y - sourceY, cp1x - sourceX);
    endAngle = Math.atan2(targetY - cp2y, targetX - cp2x);

    const endOffsetX = hasEndArrow ? arrowLength * Math.cos(endAngle) : 0;
    const endOffsetY = hasEndArrow ? arrowLength * Math.sin(endAngle) : 0;
    const startOffsetX = hasStartArrow ? arrowLength * Math.cos(startAngle) : 0;
    const startOffsetY = hasStartArrow ? arrowLength * Math.sin(startAngle) : 0;
    const adjustedCp1x = hasStartArrow ? cp1x + startOffsetX * 0.5 : cp1x;
    const adjustedCp1y = hasStartArrow ? cp1y + startOffsetY * 0.5 : cp1y;
    const adjustedCp2x = hasEndArrow ? cp2x - endOffsetX * 0.5 : cp2x;
    const adjustedCp2y = hasEndArrow ? cp2y - endOffsetY * 0.5 : cp2y;

    path = `M ${sourceX + startOffsetX} ${sourceY + startOffsetY} C ${adjustedCp1x} ${adjustedCp1y} ${adjustedCp2x} ${adjustedCp2y} ${targetX - endOffsetX} ${targetY - endOffsetY}`;
  }

  return {
    path,
    labelX,
    labelY,
    startAngle,
    endAngle,
    sourcePoint: { x: sourceX, y: sourceY },
    targetPoint: { x: targetX, y: targetY },
    adjustable,
  };
}

/** Arrowhead triangle with its tip at (tipX, tipY), pointing along `angle`. */
export function arrowPolygon(tipX: number, tipY: number, angle: number): string {
  const baseX = tipX - EDGE_ARROW_LENGTH * Math.cos(angle);
  const baseY = tipY - EDGE_ARROW_LENGTH * Math.sin(angle);
  const leftX = baseX - (EDGE_ARROW_WIDTH / 2) * Math.sin(angle);
  const leftY = baseY + (EDGE_ARROW_WIDTH / 2) * Math.cos(angle);
  const rightX = baseX + (EDGE_ARROW_WIDTH / 2) * Math.sin(angle);
  const rightY = baseY - (EDGE_ARROW_WIDTH / 2) * Math.cos(angle);
  return `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`;
}
