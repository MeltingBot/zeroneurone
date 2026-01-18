import { useState, useEffect, useRef, useCallback } from 'react';
import { type EdgeProps, useReactFlow } from '@xyflow/react';
import { useUIStore } from '../../stores';

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
  // For parallel edge offset
  parallelIndex?: number;  // 0, 1, 2, ... for edges between same nodes
  parallelCount?: number;  // Total number of edges between same nodes
  // For manual curve offset (draggable) - 2D offset from midpoint
  curveOffset?: { x: number; y: number };
  onCurveOffsetChange?: (offset: { x: number; y: number }) => void;
}

export function CustomEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    label,
    labelStyle,
    labelBgStyle,
    labelBgBorderRadius,
    data,
    selected,  // React Flow's built-in selected state
  } = props;

  const fontMode = useUIStore((state) => state.fontMode);
  const anonymousMode = useUIStore((state) => state.anonymousMode);
  const { screenToFlowPosition } = useReactFlow();
  const edgeData = data as CustomEdgeData | undefined;

  const color = edgeData?.color ?? 'var(--color-text-tertiary)';
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
  const parallelIndex = edgeData?.parallelIndex ?? 0;
  const parallelCount = edgeData?.parallelCount ?? 1;
  const curveOffset = edgeData?.curveOffset ?? { x: 0, y: 0 };
  const onCurveOffsetChange = edgeData?.onCurveOffsetChange;

  // Calculate perpendicular offset for parallel edges
  const parallelSpacing = 30;
  const parallelOffset = parallelCount > 1
    ? (parallelIndex - (parallelCount - 1) / 2) * parallelSpacing
    : 0;

  // Dragging state - 2D offset
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>(curveOffset);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; offsetX: number; offsetY: number } | null>(null);

  // Sync dragOffset with curveOffset when not dragging
  useEffect(() => {
    if (!isDragging) {
      setDragOffset(curveOffset);
    }
  }, [curveOffset, isDragging]);

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

  // Use dragOffset during drag, otherwise curveOffset
  const currentOffset = isDragging ? dragOffset : curveOffset;

  // Selection halo settings
  const haloColor = 'var(--color-accent)';
  const haloThickness = thickness + 6;

  // Arrow size
  const arrowLength = 16;
  const arrowWidth = 12;

  // Calculate the midpoint and perpendicular direction
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;
  const edgeDx = targetX - sourceX;
  const edgeDy = targetY - sourceY;
  const edgeLength = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);

  // Perpendicular unit vector
  const perpX = edgeLength > 0 ? -edgeDy / edgeLength : 0;
  const perpY = edgeLength > 0 ? edgeDx / edgeLength : 0;

  // Control point for the quadratic bezier (the draggable point)
  // Uses direct 2D offset + parallel edge offset (perpendicular)
  const controlHandleX = midX + currentOffset.x + perpX * parallelOffset;
  const controlHandleY = midY + currentOffset.y + perpY * parallelOffset;

  // For arrows: calculate angle at endpoints
  // Start angle: from source to control point
  const startAngle = Math.atan2(controlHandleY - sourceY, controlHandleX - sourceX);
  // End angle: from control point to target
  const endAngle = Math.atan2(targetY - controlHandleY, targetX - controlHandleX);

  // For arrows: shorten the path so arrow doesn't overlap with line
  const endOffsetX = hasEndArrow ? arrowLength * Math.cos(endAngle) : 0;
  const endOffsetY = hasEndArrow ? arrowLength * Math.sin(endAngle) : 0;
  const startOffsetX = hasStartArrow ? arrowLength * Math.cos(startAngle) : 0;
  const startOffsetY = hasStartArrow ? arrowLength * Math.sin(startAngle) : 0;

  // Adjusted endpoints for the path (shortened to make room for arrows)
  const adjustedSourceX = sourceX + startOffsetX;
  const adjustedSourceY = sourceY + startOffsetY;
  const adjustedTargetX = targetX - endOffsetX;
  const adjustedTargetY = targetY - endOffsetY;

  // Create a quadratic bezier path that passes through (or near) the control point
  // Q command uses a control point, but the curve doesn't pass through it
  // To make it more "elastic", we double the offset for the control point
  const curveControlX = midX + currentOffset.x * 2 + perpX * parallelOffset * 2;
  const curveControlY = midY + currentOffset.y * 2 + perpY * parallelOffset * 2;

  // Build the SVG path: M (move to start) Q (quadratic bezier to end)
  const edgePath = `M ${adjustedSourceX} ${adjustedSourceY} Q ${curveControlX} ${curveControlY} ${adjustedTargetX} ${adjustedTargetY}`;

  // Label position is at the visual midpoint (the control handle)
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
    <g className="react-flow__edge" style={{ opacity: edgeOpacity, transition: 'opacity 0.2s' }}>
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

      {/* Wider invisible path for clicking */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
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
          <rect
            x={-40}
            y={-12}
            width={80}
            height={24}
            rx={labelBgBorderRadius || 3}
            style={{
              fill: (labelBgStyle as React.CSSProperties)?.fill || 'var(--color-bg-primary)',
              fillOpacity: (labelBgStyle as React.CSSProperties)?.fillOpacity || 0.95,
            }}
          />
          {isEditing ? (
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
                  color: 'var(--color-text-primary)',
                  fontFamily: fontMode === 'handwritten' ? '"Caveat", cursive' : undefined,
                  fontSize: fontMode === 'handwritten' ? '14px' : '11px',
                }}
              />
            </foreignObject>
          ) : anonymousMode ? (
            <rect
              x={-20}
              y={-5}
              width={40}
              height={10}
              rx={2}
              fill="var(--color-text-primary)"
            />
          ) : (
            <text
              style={{
                ...labelStyle,
                fill: 'var(--color-text-primary)',
                fontFamily: fontMode === 'handwritten' ? '"Caveat", cursive' : undefined,
                fontSize: fontMode === 'handwritten' ? '14px' : undefined,
              }}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {String(label)}
            </text>
          )}
        </g>
      )}

      {/* Draggable control point - always visible for debugging */}
      <g
        onMouseDown={isSelected ? handleControlPointMouseDown : undefined}
        style={{
          cursor: isSelected ? (isDragging ? 'grabbing' : 'grab') : 'default',
        }}
      >
        {/* Hit area - only active when selected */}
        <circle
          cx={controlHandleX}
          cy={controlHandleY}
          r={isSelected ? 16 : 6}
          fill="transparent"
          style={{ pointerEvents: isSelected ? 'auto' : 'none' }}
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
          style={{
            opacity: isSelected ? 1 : 0.5,
            transition: 'all 0.15s',
          }}
        />
      </g>
    </g>
  );
}
