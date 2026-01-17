import { memo, useMemo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
  type Edge,
} from '@xyflow/react';
import type { Link } from '../../types';

export interface LinkEdgeData extends Record<string, unknown> {
  link: Link;
  isSelected: boolean;
  isDimmed: boolean;
  parallelIndex?: number;
  parallelCount?: number;
}

function LinkEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps<Edge<LinkEdgeData>>) {
  const edgeData = data as LinkEdgeData;
  const { link, isSelected, isDimmed, parallelIndex = 0, parallelCount = 1 } = edgeData;
  const opacity = isDimmed ? 0.3 : 1;

  // Calculate offset for parallel edges between same nodes
  const offset = useMemo(() => {
    if (parallelCount <= 1) return 0;
    const spacing = 25;
    const totalOffset = (parallelCount - 1) * spacing;
    return parallelIndex * spacing - totalOffset / 2;
  }, [parallelIndex, parallelCount]);

  // Calculate curved path with offset for parallel edges
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: parallelCount > 1 ? 0.25 + Math.abs(offset) * 0.01 : 0.25,
  });

  // Apply perpendicular offset to the path
  const adjustedPath = useMemo(() => {
    if (offset === 0) return edgePath;

    // Calculate perpendicular direction
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length === 0) return edgePath;

    const perpX = -dy / length;
    const perpY = dx / length;

    // Offset source and target
    const offsetSourceX = sourceX + perpX * offset;
    const offsetSourceY = sourceY + perpY * offset;
    const offsetTargetX = targetX + perpX * offset;
    const offsetTargetY = targetY + perpY * offset;

    const [offsetPath] = getBezierPath({
      sourceX: offsetSourceX,
      sourceY: offsetSourceY,
      targetX: offsetTargetX,
      targetY: offsetTargetY,
      sourcePosition,
      targetPosition,
      curvature: 0.25 + Math.abs(offset) * 0.01,
    });

    return offsetPath;
  }, [
    edgePath,
    offset,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  ]);

  // Calculate adjusted label position
  const adjustedLabelX = useMemo(() => {
    if (offset === 0) return labelX;
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length === 0) return labelX;
    const perpX = -dy / length;
    return labelX + perpX * offset;
  }, [labelX, offset, sourceX, sourceY, targetX, targetY]);

  const adjustedLabelY = useMemo(() => {
    if (offset === 0) return labelY;
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length === 0) return labelY;
    const perpY = dx / length;
    return labelY + perpY * offset;
  }, [labelY, offset, sourceX, sourceY, targetX, targetY]);

  // Edge styles based on link visual
  const strokeDasharray = useMemo(() => {
    switch (link.visual.style) {
      case 'dashed':
        return '8,4';
      case 'dotted':
        return '2,4';
      default:
        return undefined;
    }
  }, [link.visual.style]);

  return (
    <>
      {/* Selection highlight behind the edge */}
      {isSelected && (
        <BaseEdge
          id={`${id}-selection`}
          path={adjustedPath}
          style={{
            stroke: '#2563eb',
            strokeWidth: link.visual.thickness + 6,
            strokeOpacity: 0.3,
          }}
        />
      )}

      {/* Main edge */}
      <BaseEdge
        id={id}
        path={adjustedPath}
        style={{
          stroke: link.visual.color,
          strokeWidth: link.visual.thickness,
          strokeDasharray,
          opacity,
        }}
        markerEnd={markerEnd}
      />

      {/* Invisible wider path for easier click detection */}
      <path
        d={adjustedPath}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(link.visual.thickness + 10, 15)}
        style={{ pointerEvents: 'stroke' }}
      />

      {/* Edge label */}
      {link.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${adjustedLabelX}px, ${adjustedLabelY}px)`,
              pointerEvents: 'none',
            }}
            className={`
              px-1.5 py-0.5 text-xs rounded
              ${isSelected ? 'bg-accent/10 text-accent font-medium' : 'bg-bg-primary text-text-secondary'}
              border border-border-default
            `}
          >
            {link.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const LinkEdge = memo(LinkEdgeComponent);
