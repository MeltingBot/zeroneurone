import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { type EdgeProps, useReactFlow } from '@xyflow/react';
import i18next from 'i18next';
import { scaledLinkWidth } from '../../utils/linkWidthScale';
import { useDossierStore, useUIStore } from '../../stores';
import { FONT_SIZE_PX, type FontSize, type OrthogonalRoute } from '../../types';
import type { EvaluationBadge } from '../../utils/evaluation';
import { arrowPolygon, computeEdgeRoute, type OrthogonalGeometry } from '../../utils/edgeRouting';
import { mergeEmptySegments, segmentAxis, snapPosition, splitSegment, storedRoute, type SegmentAxis } from '../../utils/orthogonalBends';
import { snapBend, storedBendPoints, type Point } from '../../utils/freeBends';

/** Segments shorter than this get no handle (steps of the automatic route, cut steps). */
const MIN_HANDLE_SEGMENT = 24;
/** A dragged segment snaps onto a parallel one within this many screen pixels. */
const SEGMENT_SNAP_PX = 8;

/** Where a segment handle sits, and the coordinate along its segment there. */
function segmentMiddle(geometry: OrthogonalGeometry, index: number) {
  const a = geometry.points[index];
  const b = geometry.points[index + 1];
  const axis = segmentAxis(geometry.route.firstAxis, index);
  const x = (a.x + b.x) / 2;
  const y = (a.y + b.y) / 2;
  return { x, y, axis, along: axis === 'h' ? x : y, length: Math.abs(axis === 'h' ? b.x - a.x : b.y - a.y) };
}

/** Handles the route was drawn between, kept with it (auto anchors would turn them). */
export interface RouteHandles {
  sourceHandle: string;
  targetHandle: string;
}
import { lineOffsets, wrapLabelLines } from '../../utils/wrapLabel';

// Remote user presence info for a link
interface RemoteLinkPresence {
  name: string;
  color: string;
  isEditing?: boolean;
}

interface CustomEdgeData {
  color: string;
  thickness: number;
  dashArray?: string;
  hasStartArrow: boolean;
  hasEndArrow: boolean;
  isSelected?: boolean;
  isDimmed?: boolean;
  isHighlighted?: boolean;
  /** Link of a highlighted cycle: way the cycle walks it */
  flow?: 'forward' | 'backward' | 'both' | null;
  isEditing?: boolean;
  onLabelChange?: (newLabel: string) => void;
  onStopEditing?: () => void;
  // For parallel edge offset
  parallelIndex?: number;  // 0, 1, 2, ... for edges between same nodes
  parallelCount?: number;  // Total number of edges between same nodes
  // Offsets along the node side for links sharing a handle (orthogonal mode, set by Canvas)
  sourceSlot?: number;
  targetSlot?: number;
  // For manual curve offset (draggable) - 2D offset from midpoint
  curveOffset?: { x: number; y: number };
  onCurveOffsetChange?: (offset: { x: number; y: number }) => void;
  // Right-angle route drawn by hand (orthogonal mode), and where a new one is saved
  orthogonalRoute?: OrthogonalRoute | null;
  onOrthogonalRouteChange?: (route: OrthogonalRoute, handles: RouteHandles) => void;
  // Bend points placed by hand (straight mode), and where new ones are saved (null: none left)
  bendPoints?: Point[] | null;
  onBendPointsChange?: (points: Point[] | null, handles: RouteHandles) => void;
  // Curve mode: straight lines, curved bezier, or orthogonal (right angles)
  curveMode?: 'straight' | 'curved' | 'orthogonal';
  // Confidence / grading indicator (precomputed by Canvas, null when hidden)
  showConfidenceIndicator?: boolean;
  confidenceBadge?: EvaluationBadge | null;
  displayedPropertyValues?: { key: string; value: string }[];
  // Remote user presence (passed from Canvas level)
  remoteLinkSelectors?: RemoteLinkPresence[];
  fontSize?: FontSize;
}

function CustomEdgeComponent(props: EdgeProps) {
  const {
    id,
    sourceX: rawSourceX,
    sourceY: rawSourceY,
    targetX: rawTargetX,
    targetY: rawTargetY,
    sourceHandleId,
    targetHandleId,
    label,
    labelStyle,
    // labelBgStyle, // Unused - we use custom label styling
    // labelBgBorderRadius, // Unused
    data,
    selected,  // React Flow's built-in selected state
  } = props;

  const anonymousMode = useUIStore((state) => state.anonymousMode);
  const themeMode = useUIStore((state) => state.themeMode);
  const { screenToFlowPosition, getZoom } = useReactFlow();
  const edgeData = data as CustomEdgeData | undefined;

  // Remote link selectors passed from Canvas (single subscription instead of per-edge)
  const remoteLinkSelectors = edgeData?.remoteLinkSelectors ?? [];

  const color = edgeData?.color ?? '#9a948d';
  const thickness = edgeData?.thickness ?? 2;
  const dashArray = edgeData?.dashArray ?? undefined;
  const hasStartArrow = edgeData?.hasStartArrow ?? false;
  const hasEndArrow = edgeData?.hasEndArrow ?? false;
  // Use React Flow's selected prop OR our custom isSelected
  const isSelected = selected || (edgeData?.isSelected ?? false);
  const isDimmed = edgeData?.isDimmed ?? false;
  const isHighlighted = edgeData?.isHighlighted ?? false;
  const flow = edgeData?.flow ?? null;
  const isEditing = edgeData?.isEditing ?? false;
  const onLabelChange = edgeData?.onLabelChange;
  const onStopEditing = edgeData?.onStopEditing;
  const parallelIndex = edgeData?.parallelIndex ?? 0;
  const parallelCount = edgeData?.parallelCount ?? 1;
  const curveOffset = edgeData?.curveOffset ?? { x: 0, y: 0 };
  const onCurveOffsetChange = edgeData?.onCurveOffsetChange;
  const curveMode = edgeData?.curveMode ?? 'curved';
  const orthogonalRoute = edgeData?.orthogonalRoute ?? null;
  const onOrthogonalRouteChange = edgeData?.onOrthogonalRouteChange;
  const bendPoints = edgeData?.bendPoints ?? null;
  const onBendPointsChange = edgeData?.onBendPointsChange;
  const confidenceBadge = edgeData?.confidenceBadge ?? null;
  const displayedPropertyValues = edgeData?.displayedPropertyValues;
  const labelFontSize = FONT_SIZE_PX[edgeData?.fontSize || 'sm'];
  // Dossier option: long labels go on several lines
  const labelWrap = useDossierStore((s) => s.currentDossier?.options?.linkLabelWrap);
  const labelLines = label ? wrapLabelLines(String(label), labelWrap) : [];
  const labelLineHeight = Math.round(labelFontSize * 1.25);
  // What sits under the label (badge, properties) moves down past its extra lines
  const labelBelow = label ? 12 + ((labelLines.length - 1) * labelLineHeight) / 2 : 0;

  const sourceSlot = edgeData?.sourceSlot ?? 0;
  const targetSlot = edgeData?.targetSlot ?? 0;

  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>(curveOffset);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; offsetX: number; offsetY: number } | null>(null);

  // Sync dragOffset with curveOffset only when curveOffset changes (external update)
  // Don't sync on isDragging change to avoid resetting to stale props value
  useEffect(() => {
    if (!isDragging) {
      setDragOffset(curveOffset);
    }
  }, [curveOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  const [editValue, setEditValue] = useState(String(label || ''));
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      setEditValue(String(label || ''));
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing, label]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      onLabelChange?.(editValue);
      onStopEditing?.();
    } else if (e.key === 'Escape') {
      setEditValue(String(label || ''));
      onStopEditing?.();
    }
  };

  const handleInputBlur = () => {
    onLabelChange?.(editValue);
    onStopEditing?.();
  };

  // Drag handlers for control point - free 2D movement
  const handleControlPointMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    dragStartRef.current = {
      mouseX: flowPos.x,
      mouseY: flowPos.y,
      offsetX: dragOffset.x,
      offsetY: dragOffset.y,
    };
  }, [dragOffset, screenToFlowPosition]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;

      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });

      // Calculate new 2D offset: initial offset + mouse delta
      const deltaX = flowPos.x - dragStartRef.current.mouseX;
      const deltaY = flowPos.y - dragStartRef.current.mouseY;

      setDragOffset({
        x: dragStartRef.current.offsetX + deltaX,
        y: dragStartRef.current.offsetY + deltaY,
      });
    };

    const handleMouseUp = () => {
      if (onCurveOffsetChange) {
        onCurveOffsetChange(dragOffset);
      }
      setIsDragging(false);
      dragStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onCurveOffsetChange, dragOffset, screenToFlowPosition]);

  // Right-angle route: one handle per segment. A drag moves the segment across; on a segment
  // attached to a node it first cuts it, so the far half moves. A double-click cuts the segment.
  // The route drawn stays shown until the saved one comes back (no flash of the old route).
  // A draft is shown while it was drawn over the route still stored: a new stored route replaces it
  const [draft, setDraft] = useState<{ route: OrthogonalRoute; over: OrthogonalRoute | null } | null>(null);
  const [isSegmentDragging, setIsSegmentDragging] = useState(false);
  const draftRoute = draft && draft.over === orthogonalRoute ? draft.route : null;
  const setDraftRoute = (next: OrthogonalRoute | null) => setDraft(next ? { route: next, over: orthogonalRoute } : null);
  // Straight mode: bend points, same draft rule (undefined: no draft; null: all removed)
  const [bendDraft, setBendDraft] = useState<{ points: Point[] | null; over: Point[] | null } | null>(null);
  const [isBendDragging, setIsBendDragging] = useState(false);
  const draftBends = bendDraft && bendDraft.over === bendPoints ? bendDraft.points : undefined;
  const bendDragRef = useRef<{
    bends: Point[];
    current: Point[];
    ends: [Point, Point];
    index: number;
    start: Point;
    moved: boolean;
  } | null>(null);
  const segmentDragRef = useRef<{
    positions: number[];
    current: number[];
    firstAxis: SegmentAxis;
    index: number;
    axis: SegmentAxis;
    startMouse: number;
    moved: boolean;
  } | null>(null);

  // Always use dragOffset (synced from curveOffset via useEffect when not dragging)
  // This prevents snap-back to stale curveOffset when drag ends before store update propagates
  const currentOffset = dragOffset;

  // Selection halo settings
  const haloColor = 'var(--color-accent)';
  const haloThickness = thickness + 6;

  // Route shared with the SVG export (utils/edgeRouting)
  const isStraight = curveMode === 'straight';
  const isOrthogonal = curveMode === 'orthogonal';
  const route = computeEdgeRoute({
    sourceX: rawSourceX,
    sourceY: rawSourceY,
    targetX: rawTargetX,
    targetY: rawTargetY,
    sourceHandleId,
    targetHandleId,
    curveMode,
    parallelIndex,
    parallelCount,
    sourceSlot,
    targetSlot,
    offset: currentOffset,
    bends: curveMode === 'orthogonal' ? (draftRoute ?? orthogonalRoute) : null,
    bendPoints: curveMode === 'straight' ? (draftBends !== undefined ? draftBends : bendPoints) : null,
    hasStartArrow,
    hasEndArrow,
  });
  const geometry = route.orthogonal;
  const routeHandles: RouteHandles = {
    sourceHandle: sourceHandleId ?? 'source-right',
    targetHandle: targetHandleId ?? 'target-left',
  };

  const saveRoute = (positions: number[], firstAxis: SegmentAxis) => {
    const next = storedRoute({ positions, firstAxis });
    setDraftRoute(next);
    onOrthogonalRouteChange?.(next, routeHandles);
  };

  const handleSegmentMouseDown = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    e.preventDefault();
    if (!geometry) return;
    const { firstAxis } = geometry.route;
    let positions = geometry.route.positions;
    let dragged = index;
    if (index === 0 || index === positions.length - 1) {
      // A segment attached to a node keeps its end there: the half past the handle moves
      positions = splitSegment(positions, index, segmentMiddle(geometry, index).along);
      dragged = index === 0 ? 2 : index;
    }
    const axis = segmentAxis(firstAxis, dragged);
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    segmentDragRef.current = {
      positions, current: positions, firstAxis, index: dragged, axis,
      startMouse: axis === 'h' ? flowPos.y : flowPos.x, moved: false,
    };
    setIsSegmentDragging(true);
  };

  const handleSegmentDoubleClick = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    e.preventDefault();
    if (!geometry) return;
    const { positions, firstAxis } = geometry.route;
    saveRoute(splitSegment(positions, index, segmentMiddle(geometry, index).along), firstAxis);
  };

  useEffect(() => {
    if (!isSegmentDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const drag = segmentDragRef.current;
      if (!drag) return;
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const delta = (drag.axis === 'h' ? flowPos.y : flowPos.x) - drag.startMouse;
      if (Math.abs(delta) > 0.5) drag.moved = true;
      if (!drag.moved) return;
      const value = snapPosition(drag.positions, drag.index, drag.positions[drag.index] + delta, SEGMENT_SNAP_PX / getZoom());
      drag.current = drag.positions.map((p, i) => (i === drag.index ? value : p));
      setDraftRoute(storedRoute({ positions: drag.current, firstAxis: drag.firstAxis }));
    };
    const handleMouseUp = () => {
      const drag = segmentDragRef.current;
      segmentDragRef.current = null;
      setIsSegmentDragging(false);
      if (!drag?.moved) {
        setDraftRoute(null);
        return;
      }
      // The click that ends a drag is not a click on the link (selection, label editing)
      const stopClick = (ev: MouseEvent) => ev.stopPropagation();
      window.addEventListener('click', stopClick, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', stopClick, { capture: true }), 0);
      // Segments put back in line become one
      saveRoute(mergeEmptySegments(drag.current), drag.firstAxis);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }); // re-bound each render: saveRoute reads the current handles

  // Straight mode: a handle on each bend point (drag: move, double-click: remove) and one in the
  // middle of each segment (drag: a new bend point there)
  const freeLine = route.free;
  // Square handles on stored points only: the lane points of a parallel link are not bends
  const hasBends = ((draftBends !== undefined ? draftBends : bendPoints)?.length ?? 0) > 0;
  const saveBends = (bends: Point[]) => {
    const next = storedBendPoints(bends);
    setBendDraft({ points: next, over: bendPoints });
    onBendPointsChange?.(next, routeHandles);
  };

  const startBendDrag = (e: React.MouseEvent, bends: Point[], index: number) => {
    e.stopPropagation();
    e.preventDefault();
    if (!freeLine) return;
    const ends: [Point, Point] = [freeLine.points[0], freeLine.points[freeLine.points.length - 1]];
    bendDragRef.current = {
      bends, current: bends, ends, index,
      start: screenToFlowPosition({ x: e.clientX, y: e.clientY }), moved: false,
    };
    setIsBendDragging(true);
  };
  const handleBendMouseDown = (e: React.MouseEvent, index: number) => {
    if (freeLine) startBendDrag(e, freeLine.points.slice(1, -1), index);
  };
  const handleBendAddMouseDown = (e: React.MouseEvent, segment: number) => {
    if (!freeLine) return;
    const a = freeLine.points[segment];
    const b = freeLine.points[segment + 1];
    const bends = freeLine.points.slice(1, -1);
    // Added only once dragged: a click leaves the line as it is
    startBendDrag(e, [...bends.slice(0, segment), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, ...bends.slice(segment)], segment);
  };
  const handleBendDoubleClick = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    e.preventDefault();
    if (!freeLine) return;
    saveBends(freeLine.points.slice(1, -1).filter((_, i) => i !== index));
  };

  useEffect(() => {
    if (!isBendDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const drag = bendDragRef.current;
      if (!drag) return;
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const dx = flowPos.x - drag.start.x;
      const dy = flowPos.y - drag.start.y;
      if (Math.hypot(dx, dy) > 0.5) drag.moved = true;
      if (!drag.moved) return;
      const previous = drag.index === 0 ? drag.ends[0] : drag.bends[drag.index - 1];
      const next = drag.index === drag.bends.length - 1 ? drag.ends[1] : drag.bends[drag.index + 1];
      const moved = { x: drag.bends[drag.index].x + dx, y: drag.bends[drag.index].y + dy };
      // Level or plumb with a neighbour when close to it
      const point = snapBend(moved, previous, next, SEGMENT_SNAP_PX / getZoom());
      drag.current = drag.bends.map((p, i) => (i === drag.index ? point : p));
      setBendDraft({ points: storedBendPoints(drag.current), over: bendPoints });
    };
    const handleMouseUp = () => {
      const drag = bendDragRef.current;
      bendDragRef.current = null;
      setIsBendDragging(false);
      if (!drag?.moved) {
        setBendDraft(null);
        return;
      }
      const stopClick = (ev: MouseEvent) => ev.stopPropagation();
      window.addEventListener('click', stopClick, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', stopClick, { capture: true }), 0);
      saveBends(drag.current);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }); // re-bound each render: saveBends reads the current handles
  const edgePath = route.path;
  const { x: sourceX, y: sourceY } = route.sourcePoint;
  const { x: targetX, y: targetY } = route.targetPoint;
  // Label and drag handle share the same anchor
  const labelX = route.labelX;
  const labelY = route.labelY;
  const controlHandleX = route.labelX;
  const controlHandleY = route.labelY;

  const createEndArrow = (): string => arrowPolygon(targetX, targetY, route.endAngle);
  const createStartArrow = (): string => arrowPolygon(sourceX, sourceY, route.startAngle + Math.PI);

  const edgeOpacity = isDimmed ? 0.3 : 1;
  // Insights emphasis: glow the links belonging to the highlighted structure
  const edgeFilter = isHighlighted && !isDimmed
    ? 'drop-shadow(0 0 3px var(--color-accent)) drop-shadow(0 0 1px var(--color-accent))'
    : undefined;

  return (
    <g className="react-flow__edge" style={{ opacity: edgeOpacity, cursor: 'pointer', filter: edgeFilter }}>
      {/* Selection halo - rendered behind the main line */}
      {isSelected && (
        <path
          d={edgePath}
          fill="none"
          style={{ stroke: haloColor, strokeWidth: scaledLinkWidth(haloThickness) }}
          strokeLinecap="round"
        />
      )}

      {/* Remote user selection halo - rendered behind the main line */}
      {remoteLinkSelectors.length > 0 && !isSelected && (
        <path
          d={edgePath}
          fill="none"
          stroke={remoteLinkSelectors[0].color}
          strokeWidth={thickness + 4}
          strokeLinecap="round"
          strokeOpacity={0.6}
        />
      )}

      {/* Edge line (shortened to not overlap arrows) */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={color}
        strokeWidth={thickness}
        strokeDasharray={dashArray}
        style={{ stroke: color, strokeWidth: scaledLinkWidth(thickness) }}
      />

      {/* Cycle: accent dashes moving the way the cycle runs */}
      {flow && (
        <path
          d={edgePath}
          className={`cycle-flow-line ${flow}`}
          strokeWidth={Math.max(2, thickness)}
        />
      )}

      {/* Wider invisible path for easier clicking */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ cursor: 'pointer' }}
      />

      {/* End arrow - at target connection point */}
      {hasEndArrow && (
        <polygon points={createEndArrow()} fill={color} />
      )}

      {/* Start arrow - at source connection point */}
      {hasStartArrow && (
        <polygon points={createStartArrow()} fill={color} />
      )}

      {/* Label - show when editing or when label exists */}
      {(label || isEditing) && (
        <g transform={`translate(${labelX}, ${labelY})`}>
          {isEditing ? (
            <>
              {/* Background for editing input */}
              <rect
                x={-40}
                y={-12}
                width={80}
                height={24}
                rx={3}
                fill="#fffdf9"
                fillOpacity={0.95}
              />
              <foreignObject x={-38} y={-10} width={76} height={20}>
                <input
                  ref={inputRef}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  onBlur={handleInputBlur}
                  className="w-full h-full text-center bg-transparent border-none outline-none"
                  style={{
                    color: '#3d3833',
                    fontSize: labelFontSize,
                  }}
                />
              </foreignObject>
            </>
          ) : anonymousMode ? (
            <rect
              x={-20}
              y={-5}
              width={40}
              height={10}
              rx={2}
              fill="#3d3833"
            />
          ) : (
            <text
              style={{
                ...labelStyle,
                fill: themeMode === 'dark' ? '#ffffff' : '#3d3833',
                stroke: themeMode === 'dark' ? '#3d3833' : '#ffffff',
                strokeWidth: 3,
                paintOrder: 'stroke fill',
                fontSize: labelFontSize,
                fontWeight: 500,
              }}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {labelLines.length > 1
                ? lineOffsets(labelLines.length, labelLineHeight).map((dy, i) => (
                  <tspan key={i} x={0} y={dy}>{labelLines[i]}</tspan>
                ))
                : String(label)}
            </text>
          )}
        </g>
      )}

      {/* Confidence / grading indicator */}
      {confidenceBadge && (
        <g transform={`translate(${controlHandleX}, ${controlHandleY + labelBelow})`}>
          <rect
            x={-18}
            y={-8}
            width={36}
            height={16}
            rx={3}
            fill={themeMode === 'dark' ? '#3d3833' : '#fffdf9'}
            stroke={themeMode === 'dark' ? '#6b6560' : '#e8e3db'}
            strokeWidth={1}
          />
          <text
            x={0}
            y={0}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={9}
            fill={confidenceBadge.muted
              ? (themeMode === 'dark' ? '#8a8279' : '#9a948d')
              : (themeMode === 'dark' ? '#ffffff' : '#3d3833')}
          >
            {confidenceBadge.text}
          </text>
        </g>
      )}

      {/* Displayed properties */}
      {displayedPropertyValues && displayedPropertyValues.length > 0 && !anonymousMode && (
        <g transform={`translate(${controlHandleX}, ${controlHandleY + labelBelow + (confidenceBadge ? 18 : 0)})`}>
          {displayedPropertyValues.slice(0, 2).map(({ key, value }, index) => {
            const displayValue = value.length > 15 ? value.slice(0, 15) + '...' : value;
            const displayText = `${key}: ${displayValue}`;
            const textWidth = Math.min(displayText.length * 5 + 8, 100);
            return (
              <g key={key} transform={`translate(0, ${index * 14})`}>
                <rect
                  x={-textWidth / 2}
                  y={-6}
                  width={textWidth}
                  height={12}
                  rx={2}
                  fill={themeMode === 'dark' ? '#3d3833' : '#f7f4ef'}
                  stroke={themeMode === 'dark' ? '#6b6560' : '#e8e3db'}
                  strokeWidth={0.5}
                />
                <text
                  x={0}
                  y={0}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={8}
                  fill={themeMode === 'dark' ? '#9a948d' : '#6b6560'}
                >
                  {displayText}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* Remote user indicator badge */}
      {remoteLinkSelectors.length > 0 && (
        <g transform={`translate(${controlHandleX}, ${controlHandleY - 20})`}>
          {/* Get initials from name */}
          {(() => {
            const user = remoteLinkSelectors[0];
            const initials = user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
            const isEditingLink = user.isEditing;

            return (
              <>
                {/* Badge background */}
                <circle
                  cx={0}
                  cy={0}
                  r={12}
                  fill={user.color}
                  style={{
                    animation: isEditingLink ? 'pulse 1s ease-in-out infinite' : undefined,
                  }}
                />
                {/* Initials text */}
                <text
                  x={0}
                  y={0}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="white"
                  fontSize={9}
                  fontWeight="bold"
                >
                  {initials}
                </text>
              </>
            );
          })()}
          {/* Show +N if more users */}
          {remoteLinkSelectors.length > 1 && (
            <>
              <circle cx={16} cy={0} r={8} fill="#f0ece4" stroke="#e8e3db" strokeWidth={1} />
              <text x={16} y={0} textAnchor="middle" dominantBaseline="central" fill="#6b6560" fontSize={8} fontWeight="bold">
                +{remoteLinkSelectors.length - 1}
              </text>
            </>
          )}
        </g>
      )}

      {/* Endpoint anchors - visual affordance only. React Flow's own reconnect
          zones sit on top and handle the drag, so these stay non-interactive. */}
      {isSelected && !isEditing && (
        <g style={{ pointerEvents: 'none' }}>
          <circle
            cx={sourceX}
            cy={sourceY}
            r={5}
            style={{ fill: 'var(--color-bg-primary)', stroke: 'var(--color-accent)' }}
            strokeWidth={2}
          />
          <circle
            cx={targetX}
            cy={targetY}
            r={5}
            style={{ fill: 'var(--color-bg-primary)', stroke: 'var(--color-accent)' }}
            strokeWidth={2}
          />
        </g>
      )}

      {/* Right-angle route: a handle on each segment, while the link is selected */}
      {isOrthogonal && isSelected && !isEditing && geometry && onOrthogonalRouteChange && (
        <g data-segment-handles="">
          {geometry.points.slice(0, -1).map((_, index) => {
            const middle = segmentMiddle(geometry, index);
            if (middle.length < MIN_HANDLE_SEGMENT) return null;
            return (
              <g
                key={index}
                data-segment={index}
                onMouseDown={(e) => handleSegmentMouseDown(e, index)}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => handleSegmentDoubleClick(e, index)}
                style={{ cursor: middle.axis === 'h' ? 'ns-resize' : 'ew-resize', pointerEvents: 'auto' }}
              >
                {/* Read at render, no i18n subscription per edge: only the selected link shows it */}
                <title>{i18next.t('pages:dossier.linkSegmentHandle')}</title>
                <circle cx={middle.x} cy={middle.y} r={10} fill="transparent" />
                <rect
                  x={middle.x - (middle.axis === 'h' ? 7 : 3)}
                  y={middle.y - (middle.axis === 'h' ? 3 : 7)}
                  width={middle.axis === 'h' ? 14 : 6}
                  height={middle.axis === 'h' ? 6 : 14}
                  rx={2}
                  style={{ fill: 'var(--color-bg-primary)', stroke: 'var(--color-accent)' }}
                  strokeWidth={2}
                />
              </g>
            );
          })}
        </g>
      )}

      {/* Straight mode: bend points and, in the middle of each segment, a handle to add one */}
      {isStraight && isSelected && !isEditing && freeLine && onBendPointsChange && (
        <g data-bend-handles="">
          {freeLine.points.slice(0, -1).map((a, segment) => {
            const b = freeLine.points[segment + 1];
            if (Math.hypot(b.x - a.x, b.y - a.y) < MIN_HANDLE_SEGMENT) return null;
            const x = (a.x + b.x) / 2;
            const y = (a.y + b.y) / 2;
            return (
              <g
                key={`add-${segment}`}
                data-bend-add={segment}
                onMouseDown={(e) => handleBendAddMouseDown(e, segment)}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                style={{ cursor: 'copy', pointerEvents: 'auto' }}
              >
                <title>{i18next.t('pages:dossier.linkBendAdd')}</title>
                <circle cx={x} cy={y} r={9} fill="transparent" />
                <circle cx={x} cy={y} r={3.5} style={{ fill: 'var(--color-bg-primary)', stroke: 'var(--color-accent)' }} strokeWidth={1.5} opacity={0.8} />
              </g>
            );
          })}
          {hasBends && freeLine.points.slice(1, -1).map((p, index) => (
            <g
              key={`bend-${index}`}
              data-bend={index}
              onMouseDown={(e) => handleBendMouseDown(e, index)}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => handleBendDoubleClick(e, index)}
              style={{ cursor: 'move', pointerEvents: 'auto' }}
            >
              <title>{i18next.t('pages:dossier.linkBendPoint')}</title>
              <circle cx={p.x} cy={p.y} r={10} fill="transparent" />
              <rect
                x={p.x - 5} y={p.y - 5} width={10} height={10} rx={2}
                style={{ fill: 'var(--color-bg-primary)', stroke: 'var(--color-accent)' }}
                strokeWidth={2}
              />
            </g>
          ))}
        </g>
      )}

      {/* Draggable control point (curves) - hidden during label editing, in straight and
          right-angle modes; only interactive when selected */}
      {!isEditing && !isStraight && !isOrthogonal && (
        <g style={{ pointerEvents: 'none' }}>
          {/* Hit area - only active when selected */}
          <circle
            cx={controlHandleX}
            cy={controlHandleY}
            r={isSelected ? 16 : 6}
            fill="transparent"
            onMouseDown={isSelected ? handleControlPointMouseDown : undefined}
            style={{
              pointerEvents: isSelected ? 'auto' : 'none',
              cursor: isSelected ? (isDragging ? 'grabbing' : 'grab') : 'default',
            }}
          />
          {/* Visible control point */}
          <circle
            cx={controlHandleX}
            cy={controlHandleY}
            r={isSelected ? 8 : 5}
            style={{
              fill: isSelected ? 'var(--color-bg-primary)' : 'transparent',
              stroke: isSelected ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
            }}
            strokeWidth={isSelected ? 3 : 1}
            strokeDasharray={isSelected ? undefined : '2,2'}
            opacity={isSelected ? 1 : 0.5}
          />
        </g>
      )}
    </g>
  );
}

// Custom comparison for React.memo - only re-render when edge data actually changes
function areEdgePropsEqual(prevProps: EdgeProps, nextProps: EdgeProps): boolean {
  // Compare position (these change during drag of connected nodes)
  if (prevProps.sourceX !== nextProps.sourceX) return false;
  if (prevProps.sourceY !== nextProps.sourceY) return false;
  if (prevProps.targetX !== nextProps.targetX) return false;
  if (prevProps.targetY !== nextProps.targetY) return false;

  if (prevProps.selected !== nextProps.selected) return false;

  if (prevProps.label !== nextProps.label) return false;

  // Compare data
  const prevData = prevProps.data as CustomEdgeData | undefined;
  const nextData = nextProps.data as CustomEdgeData | undefined;

  if (!prevData && !nextData) return true;
  if (!prevData || !nextData) return false;

  if (prevData.isSelected !== nextData.isSelected) return false;
  if (prevData.isDimmed !== nextData.isDimmed) return false;
  if (prevData.isHighlighted !== nextData.isHighlighted) return false;
  if (prevData.flow !== nextData.flow) return false;
  if (prevData.isEditing !== nextData.isEditing) return false;
  if (prevData.color !== nextData.color) return false;
  if (prevData.thickness !== nextData.thickness) return false;
  if (prevData.dashArray !== nextData.dashArray) return false;
  if (prevData.hasStartArrow !== nextData.hasStartArrow) return false;
  if (prevData.hasEndArrow !== nextData.hasEndArrow) return false;
  if (prevData.parallelIndex !== nextData.parallelIndex) return false;
  if (prevData.parallelCount !== nextData.parallelCount) return false;
  if (prevData.sourceSlot !== nextData.sourceSlot) return false;
  if (prevData.targetSlot !== nextData.targetSlot) return false;
  if (prevData.curveOffset?.x !== nextData.curveOffset?.x) return false;
  if (prevData.curveOffset?.y !== nextData.curveOffset?.y) return false;
  if (prevData.curveMode !== nextData.curveMode) return false;
  if (prevData.orthogonalRoute !== nextData.orthogonalRoute) return false;
  if (prevData.bendPoints !== nextData.bendPoints) return false;
  if (prevProps.sourceHandleId !== nextProps.sourceHandleId) return false;
  if (prevProps.targetHandleId !== nextProps.targetHandleId) return false;
  if (prevData.showConfidenceIndicator !== nextData.showConfidenceIndicator) return false;
  if (prevData.confidenceBadge?.text !== nextData.confidenceBadge?.text) return false;
  if (prevData.confidenceBadge?.muted !== nextData.confidenceBadge?.muted) return false;
  if (prevData.fontSize !== nextData.fontSize) return false;

  // Compare displayed properties
  const prevDisplayedProps = prevData.displayedPropertyValues ?? [];
  const nextDisplayedProps = nextData.displayedPropertyValues ?? [];
  if (prevDisplayedProps.length !== nextDisplayedProps.length) return false;
  for (let i = 0; i < prevDisplayedProps.length; i++) {
    if (prevDisplayedProps[i].key !== nextDisplayedProps[i].key || prevDisplayedProps[i].value !== nextDisplayedProps[i].value) return false;
  }

  // Compare remote link selectors
  const prevRemote = prevData.remoteLinkSelectors ?? [];
  const nextRemote = nextData.remoteLinkSelectors ?? [];
  if (prevRemote.length !== nextRemote.length) return false;
  for (let i = 0; i < prevRemote.length; i++) {
    if (prevRemote[i].name !== nextRemote[i].name) return false;
    if (prevRemote[i].color !== nextRemote[i].color) return false;
    if (prevRemote[i].isEditing !== nextRemote[i].isEditing) return false;
  }

  return true;
}

// Memoize to prevent re-renders during drag of unrelated nodes
export const CustomEdge = memo(CustomEdgeComponent, areEdgePropsEqual);
