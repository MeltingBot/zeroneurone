import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { type EdgeProps, useReactFlow } from '@xyflow/react';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore, useSyncStore } from '../../stores';

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
  isEditing?: boolean;
  onLabelChange?: (newLabel: string) => void;
  onStopEditing?: () => void;
  onStartEditing?: () => void;
  // For parallel edge offset
  parallelIndex?: number;  // 0, 1, 2, ... for edges between same nodes
  parallelCount?: number;  // Total number of edges between same nodes
  // For manual curve offset (draggable) - 2D offset from midpoint
  curveOffset?: { x: number; y: number };
  onCurveOffsetChange?: (offset: { x: number; y: number }) => void;
  // Curve mode: straight lines, curved bezier, or orthogonal (right angles)
  curveMode?: 'straight' | 'curved' | 'orthogonal';
  // Confidence indicator
  showConfidenceIndicator?: boolean;
  confidence?: number | null;
  // Displayed properties
  displayedPropertyValues?: { key: string; value: string }[];
}

// Helper to get handle direction vector from handle ID
// Returns [dx, dy] unit vector indicating the direction the curve should exit/enter
function getHandleDirection(handleId: string | null | undefined, type: 'source' | 'target'): { dx: number; dy: number } {
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

function CustomEdgeComponent(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourceHandleId,
    targetHandleId,
    label,
    labelStyle,
    labelBgStyle,
    labelBgBorderRadius,
    data,
    selected,  // React Flow's built-in selected state
  } = props;

  const fontMode = useUIStore((state) => state.fontMode);
  const anonymousMode = useUIStore((state) => state.anonymousMode);
  const themeMode = useUIStore((state) => state.themeMode);
  const { screenToFlowPosition } = useReactFlow();
  const edgeData = data as CustomEdgeData | undefined;

  // Get remote users directly from sync store for real-time updates
  const remoteUsers = useSyncStore(
    useShallow((state) => state.remoteUsers)
  );

  // Build remote selectors for this link from remote users
  const remoteLinkSelectors: RemoteLinkPresence[] = [];
  for (const user of remoteUsers) {
    const linkSelections = user.linkSelection || [];
    const editingLink = user.editingLink;

    const isEditingThis = editingLink === id;
    const isSelectingThis = linkSelections.includes(id);

    if (isEditingThis || isSelectingThis) {
      remoteLinkSelectors.push({
        name: user.name,
        color: user.color,
        isEditing: isEditingThis,
      });
    }
  }

  const color = edgeData?.color ?? '#9a948d';
  const thickness = edgeData?.thickness ?? 2;
  const dashArray = edgeData?.dashArray ?? undefined;
  const hasStartArrow = edgeData?.hasStartArrow ?? false;
  const hasEndArrow = edgeData?.hasEndArrow ?? false;
  // Use React Flow's selected prop OR our custom isSelected
  const isSelected = selected || (edgeData?.isSelected ?? false);
  const isDimmed = edgeData?.isDimmed ?? false;
  const isEditing = edgeData?.isEditing ?? false;
  const onLabelChange = edgeData?.onLabelChange;
  const onStopEditing = edgeData?.onStopEditing;
  const onStartEditing = edgeData?.onStartEditing;
  const parallelIndex = edgeData?.parallelIndex ?? 0;
  const parallelCount = edgeData?.parallelCount ?? 1;
  const curveOffset = edgeData?.curveOffset ?? { x: 0, y: 0 };
  const onCurveOffsetChange = edgeData?.onCurveOffsetChange;
  const curveMode = edgeData?.curveMode ?? 'curved';
  const showConfidenceIndicator = edgeData?.showConfidenceIndicator ?? false;
  const confidence = edgeData?.confidence;
  const displayedPropertyValues = edgeData?.displayedPropertyValues;

  // Calculate perpendicular offset for parallel edges
  const parallelSpacing = 30;
  const parallelOffset = parallelCount > 1
    ? (parallelIndex - (parallelCount - 1) / 2) * parallelSpacing
    : 0;

  // Dragging state - 2D offset
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

  // Local state for editing
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

  // Handle input key events
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

  // Handle input blur
  const handleInputBlur = () => {
    onLabelChange?.(editValue);
    onStopEditing?.();
  };

  // Drag handlers for control point - free 2D movement
  const handleControlPointMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    // Convert screen coordinates to flow coordinates
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

      // Convert screen coordinates to flow coordinates
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

  // Always use dragOffset (synced from curveOffset via useEffect when not dragging)
  // This prevents snap-back to stale curveOffset when drag ends before store update propagates
  const currentOffset = dragOffset;

  // Selection halo settings
  const haloColor = '#e07a5f';
  const haloThickness = thickness + 6;

  // Arrow size
  const arrowLength = 16;
  const arrowWidth = 12;

  // Calculate edge direction and length
  const edgeDx = targetX - sourceX;
  const edgeDy = targetY - sourceY;
  const edgeLength = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);

  // Perpendicular vector for parallel offset
  const perpX = edgeLength > 0 ? -edgeDy / edgeLength : 0;
  const perpY = edgeLength > 0 ? edgeDx / edgeLength : 0;

  // Determine path mode
  const isStraight = curveMode === 'straight';
  const isOrthogonal = curveMode === 'orthogonal';

  // Variables for path calculation
  let edgePath: string;
  let controlHandleX: number;
  let controlHandleY: number;
  let startAngle: number;
  let endAngle: number;

  if (isStraight) {
    // STRAIGHT LINE MODE
    // Midpoint for label (with parallel offset for multiple edges)
    const midX = (sourceX + targetX) / 2 + perpX * parallelOffset;
    const midY = (sourceY + targetY) / 2 + perpY * parallelOffset;
    controlHandleX = midX;
    controlHandleY = midY;

    // Arrow angles based on line direction
    startAngle = Math.atan2(edgeDy, edgeDx);
    endAngle = startAngle;

    // Arrow offsets
    const endOffsetX = hasEndArrow ? arrowLength * Math.cos(endAngle) : 0;
    const endOffsetY = hasEndArrow ? arrowLength * Math.sin(endAngle) : 0;
    const startOffsetX = hasStartArrow ? arrowLength * Math.cos(startAngle) : 0;
    const startOffsetY = hasStartArrow ? arrowLength * Math.sin(startAngle) : 0;

    // Adjusted endpoints
    const adjustedSourceX = sourceX + startOffsetX + perpX * parallelOffset;
    const adjustedSourceY = sourceY + startOffsetY + perpY * parallelOffset;
    const adjustedTargetX = targetX - endOffsetX + perpX * parallelOffset;
    const adjustedTargetY = targetY - endOffsetY + perpY * parallelOffset;

    // Straight line path
    edgePath = `M ${adjustedSourceX} ${adjustedSourceY} L ${adjustedTargetX} ${adjustedTargetY}`;
  } else if (isOrthogonal) {
    // ORTHOGONAL MODE (right angles only)
    // Get handle directions
    const sourceDir = getHandleDirection(sourceHandleId, 'source');
    const targetDir = getHandleDirection(targetHandleId, 'target');

    // Minimum segment length for clean routing
    const minSegment = 20;

    // Calculate waypoints based on handle directions
    // sourceDir: direction the edge exits the source
    // targetDir: direction the edge enters the target (we need opposite for routing)
    const srcHorizontal = sourceDir.dx !== 0;
    const tgtHorizontal = targetDir.dx !== 0;

    let waypoints: { x: number; y: number }[] = [];

    if (srcHorizontal && tgtHorizontal) {
      // Both horizontal: route via vertical middle segment
      const midX = (sourceX + targetX) / 2 + parallelOffset;
      waypoints = [
        { x: midX, y: sourceY },
        { x: midX, y: targetY },
      ];
    } else if (!srcHorizontal && !tgtHorizontal) {
      // Both vertical: route via horizontal middle segment
      const midY = (sourceY + targetY) / 2 + parallelOffset;
      waypoints = [
        { x: sourceX, y: midY },
        { x: targetX, y: midY },
      ];
    } else if (srcHorizontal && !tgtHorizontal) {
      // Source horizontal, target vertical: single corner
      // Go horizontal first, then vertical
      const cornerX = targetX;
      const cornerY = sourceY;
      // Check if we need to go around
      const goingRight = sourceDir.dx > 0;
      const targetLeft = targetX < sourceX;

      if ((goingRight && !targetLeft) || (!goingRight && targetLeft)) {
        // Direct corner works
        waypoints = [{ x: cornerX, y: cornerY + parallelOffset }];
      } else {
        // Need to route around with extra segment
        const detourX = sourceX + sourceDir.dx * minSegment;
        const midY = (sourceY + targetY) / 2;
        waypoints = [
          { x: detourX, y: sourceY },
          { x: detourX, y: midY + parallelOffset },
          { x: targetX, y: midY + parallelOffset },
        ];
      }
    } else {
      // Source vertical, target horizontal: single corner
      const cornerX = sourceX;
      const cornerY = targetY;
      const goingDown = sourceDir.dy > 0;
      const targetBelow = targetY > sourceY;

      if ((goingDown && targetBelow) || (!goingDown && !targetBelow)) {
        // Direct corner works
        waypoints = [{ x: cornerX + parallelOffset, y: cornerY }];
      } else {
        // Need to route around with extra segment
        const detourY = sourceY + sourceDir.dy * minSegment;
        const midX = (sourceX + targetX) / 2;
        waypoints = [
          { x: sourceX, y: detourY },
          { x: midX + parallelOffset, y: detourY },
          { x: midX + parallelOffset, y: targetY },
        ];
      }
    }

    // Calculate arrow angles based on final segment directions
    if (waypoints.length > 0) {
      const firstWp = waypoints[0];
      startAngle = Math.atan2(firstWp.y - sourceY, firstWp.x - sourceX);
      const lastWp = waypoints[waypoints.length - 1];
      endAngle = Math.atan2(targetY - lastWp.y, targetX - lastWp.x);
    } else {
      startAngle = Math.atan2(edgeDy, edgeDx);
      endAngle = startAngle;
    }

    // Arrow offsets
    const endOffsetX = hasEndArrow ? arrowLength * Math.cos(endAngle) : 0;
    const endOffsetY = hasEndArrow ? arrowLength * Math.sin(endAngle) : 0;
    const startOffsetX = hasStartArrow ? arrowLength * Math.cos(startAngle) : 0;
    const startOffsetY = hasStartArrow ? arrowLength * Math.sin(startAngle) : 0;

    // Build path
    const adjustedSourceX = sourceX + startOffsetX;
    const adjustedSourceY = sourceY + startOffsetY;
    const adjustedTargetX = targetX - endOffsetX;
    const adjustedTargetY = targetY - endOffsetY;

    let pathParts = [`M ${adjustedSourceX} ${adjustedSourceY}`];
    for (const wp of waypoints) {
      pathParts.push(`L ${wp.x} ${wp.y}`);
    }
    pathParts.push(`L ${adjustedTargetX} ${adjustedTargetY}`);
    edgePath = pathParts.join(' ');

    // Control handle at midpoint of the path for label placement
    if (waypoints.length >= 2) {
      // Place at middle of the middle segment
      const midIndex = Math.floor(waypoints.length / 2);
      const wp1 = midIndex === 0 ? { x: sourceX, y: sourceY } : waypoints[midIndex - 1];
      const wp2 = waypoints[midIndex];
      controlHandleX = (wp1.x + wp2.x) / 2;
      controlHandleY = (wp1.y + wp2.y) / 2;
    } else if (waypoints.length === 1) {
      // Single corner: place between source and corner
      controlHandleX = (sourceX + waypoints[0].x) / 2;
      controlHandleY = (sourceY + waypoints[0].y) / 2;
    } else {
      // Fallback to midpoint
      controlHandleX = (sourceX + targetX) / 2;
      controlHandleY = (sourceY + targetY) / 2;
    }
  } else {
    // CURVED MODE
    const hasCustomOffset = currentOffset.x !== 0 || currentOffset.y !== 0;

    // Get handle directions from handle IDs
    const sourceDir = getHandleDirection(sourceHandleId, 'source');
    const targetDir = getHandleDirection(targetHandleId, 'target');

    // Curve factor: minimum 40px for short edges, scales with length, capped at 80px
    const curveFactor = Math.max(40, Math.min(edgeLength * 0.3, 80));

    // Calculate control points for cubic bezier
    let cp1x: number, cp1y: number, cp2x: number, cp2y: number;

    if (hasCustomOffset) {
      // User has dragged the control point - use quadratic bezier through that point
      const midX = (sourceX + targetX) / 2;
      const midY = (sourceY + targetY) / 2;

      const controlX = midX + currentOffset.x + perpX * parallelOffset;
      const controlY = midY + currentOffset.y + perpY * parallelOffset;

      // Convert quadratic to cubic bezier
      cp1x = sourceX + (2/3) * (controlX - sourceX);
      cp1y = sourceY + (2/3) * (controlY - sourceY);
      cp2x = targetX + (2/3) * (controlX - targetX);
      cp2y = targetY + (2/3) * (controlY - targetY);
    } else {
      // Natural S-curve using handle directions
      cp1x = sourceX + sourceDir.dx * curveFactor;
      cp1y = sourceY + sourceDir.dy * curveFactor;
      cp2x = targetX + targetDir.dx * curveFactor;
      cp2y = targetY + targetDir.dy * curveFactor;

      // Apply parallel offset
      if (parallelOffset !== 0) {
        cp1x += perpX * parallelOffset;
        cp1y += perpY * parallelOffset;
        cp2x += perpX * parallelOffset;
        cp2y += perpY * parallelOffset;
      }
    }

    // Midpoint of cubic bezier at t=0.5
    controlHandleX = 0.125 * sourceX + 0.375 * cp1x + 0.375 * cp2x + 0.125 * targetX;
    controlHandleY = 0.125 * sourceY + 0.375 * cp1y + 0.375 * cp2y + 0.125 * targetY;

    // Arrow angles based on control points
    startAngle = Math.atan2(cp1y - sourceY, cp1x - sourceX);
    endAngle = Math.atan2(targetY - cp2y, targetX - cp2x);

    // Arrow offsets
    const endOffsetX = hasEndArrow ? arrowLength * Math.cos(endAngle) : 0;
    const endOffsetY = hasEndArrow ? arrowLength * Math.sin(endAngle) : 0;
    const startOffsetX = hasStartArrow ? arrowLength * Math.cos(startAngle) : 0;
    const startOffsetY = hasStartArrow ? arrowLength * Math.sin(startAngle) : 0;

    // Adjusted endpoints and control points
    const adjustedSourceX = sourceX + startOffsetX;
    const adjustedSourceY = sourceY + startOffsetY;
    const adjustedTargetX = targetX - endOffsetX;
    const adjustedTargetY = targetY - endOffsetY;
    const adjustedCp1x = hasStartArrow ? cp1x + startOffsetX * 0.5 : cp1x;
    const adjustedCp1y = hasStartArrow ? cp1y + startOffsetY * 0.5 : cp1y;
    const adjustedCp2x = hasEndArrow ? cp2x - endOffsetX * 0.5 : cp2x;
    const adjustedCp2y = hasEndArrow ? cp2y - endOffsetY * 0.5 : cp2y;

    // Cubic bezier path
    edgePath = `M ${adjustedSourceX} ${adjustedSourceY} C ${adjustedCp1x} ${adjustedCp1y} ${adjustedCp2x} ${adjustedCp2y} ${adjustedTargetX} ${adjustedTargetY}`;
  }

  // Label position is at the control handle (which is on the curve at t=0.5)
  const labelX = controlHandleX;
  const labelY = controlHandleY;

  // Create arrow pointing in the direction of the line
  const createEndArrow = (): string => {
    const tipX = targetX;
    const tipY = targetY;
    const baseX = tipX - arrowLength * Math.cos(endAngle);
    const baseY = tipY - arrowLength * Math.sin(endAngle);
    const leftX = baseX - (arrowWidth / 2) * Math.sin(endAngle);
    const leftY = baseY + (arrowWidth / 2) * Math.cos(endAngle);
    const rightX = baseX + (arrowWidth / 2) * Math.sin(endAngle);
    const rightY = baseY - (arrowWidth / 2) * Math.cos(endAngle);

    return `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`;
  };

  const createStartArrow = (): string => {
    const tipX = sourceX;
    const tipY = sourceY;
    const arrowAngle = startAngle + Math.PI;
    const baseX = tipX - arrowLength * Math.cos(arrowAngle);
    const baseY = tipY - arrowLength * Math.sin(arrowAngle);
    const leftX = baseX - (arrowWidth / 2) * Math.sin(arrowAngle);
    const leftY = baseY + (arrowWidth / 2) * Math.cos(arrowAngle);
    const rightX = baseX + (arrowWidth / 2) * Math.sin(arrowAngle);
    const rightY = baseY - (arrowWidth / 2) * Math.cos(arrowAngle);

    return `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`;
  };

  // Apply dimmed opacity
  const edgeOpacity = isDimmed ? 0.3 : 1;

  return (
    <g className="react-flow__edge" style={{ opacity: edgeOpacity, transition: 'opacity 0.2s', cursor: 'pointer' }}>
      {/* Selection halo - rendered behind the main line */}
      {isSelected && (
        <path
          d={edgePath}
          fill="none"
          stroke={haloColor}
          strokeWidth={haloThickness}
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
        style={{ stroke: color, strokeWidth: thickness }}
      />

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
                  className="w-full h-full text-xs text-center bg-transparent border-none outline-none"
                  style={{
                    color: '#3d3833',
                    fontFamily: fontMode === 'handwritten' ? '"Caveat", cursive' : undefined,
                    fontSize: fontMode === 'handwritten' ? '14px' : '11px',
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
                fontFamily: fontMode === 'handwritten' ? '"Caveat", cursive' : undefined,
                fontSize: fontMode === 'handwritten' ? '16px' : '12px',
                fontWeight: 500,
              }}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {String(label)}
            </text>
          )}
        </g>
      )}

      {/* Confidence indicator - 🤝 + % */}
      {showConfidenceIndicator && confidence !== null && confidence !== undefined && (
        <g transform={`translate(${controlHandleX}, ${controlHandleY + (label ? 12 : 0)})`}>
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
            fill={themeMode === 'dark' ? '#ffffff' : '#3d3833'}
          >
            🤝 {confidence}%
          </text>
        </g>
      )}

      {/* Displayed properties */}
      {displayedPropertyValues && displayedPropertyValues.length > 0 && !anonymousMode && (
        <g transform={`translate(${controlHandleX}, ${controlHandleY + (label ? 12 : 0) + (showConfidenceIndicator && confidence !== null ? 18 : 0)})`}>
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

      {/* Draggable control point - hidden during label editing, straight mode, or orthogonal mode, only interactive when selected */}
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
            fill={isSelected ? '#ffffff' : 'transparent'}
            stroke={isSelected ? '#2563eb' : '#9ca3af'}
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

  // Compare selection state
  if (prevProps.selected !== nextProps.selected) return false;

  // Compare label
  if (prevProps.label !== nextProps.label) return false;

  // Compare data
  const prevData = prevProps.data as CustomEdgeData | undefined;
  const nextData = nextProps.data as CustomEdgeData | undefined;

  if (!prevData && !nextData) return true;
  if (!prevData || !nextData) return false;

  if (prevData.isSelected !== nextData.isSelected) return false;
  if (prevData.isDimmed !== nextData.isDimmed) return false;
  if (prevData.isEditing !== nextData.isEditing) return false;
  if (prevData.color !== nextData.color) return false;
  if (prevData.thickness !== nextData.thickness) return false;
  if (prevData.dashArray !== nextData.dashArray) return false;
  if (prevData.hasStartArrow !== nextData.hasStartArrow) return false;
  if (prevData.hasEndArrow !== nextData.hasEndArrow) return false;
  if (prevData.parallelIndex !== nextData.parallelIndex) return false;
  if (prevData.parallelCount !== nextData.parallelCount) return false;
  if (prevData.curveOffset?.x !== nextData.curveOffset?.x) return false;
  if (prevData.curveOffset?.y !== nextData.curveOffset?.y) return false;
  if (prevData.curveMode !== nextData.curveMode) return false;
  if (prevData.showConfidenceIndicator !== nextData.showConfidenceIndicator) return false;
  if (prevData.confidence !== nextData.confidence) return false;

  // Compare displayed properties
  const prevDisplayedProps = prevData.displayedPropertyValues ?? [];
  const nextDisplayedProps = nextData.displayedPropertyValues ?? [];
  if (prevDisplayedProps.length !== nextDisplayedProps.length) return false;
  for (let i = 0; i < prevDisplayedProps.length; i++) {
    if (prevDisplayedProps[i].key !== nextDisplayedProps[i].key || prevDisplayedProps[i].value !== nextDisplayedProps[i].value) return false;
  }

  return true;
}

// Memoize to prevent re-renders during drag of unrelated nodes
export const CustomEdge = memo(CustomEdgeComponent, areEdgePropsEqual);
