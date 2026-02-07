import { memo } from 'react';
import { type EdgeProps } from '@xyflow/react';

/**
 * Ultra-lightweight edge for large graphs (200+ links).
 * Renders a single <path> element — no labels, arrows, halos, hitareas, or controls.
 * ~10x fewer SVG DOM nodes than CustomEdge, critical for Firefox SVG performance.
 */
function SimpleEdgeComponent(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, data } = props;

  const color = (data as any)?.color ?? '#9a948d';
  const thickness = (data as any)?.thickness ?? 2;
  const dashArray = (data as any)?.dashArray as string | undefined;
  const isDimmed = (data as any)?.isDimmed ?? false;
  const isSelected = (data as any)?.isSelected ?? false;

  const path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;

  return (
    <g style={{ opacity: isDimmed ? 0.15 : 1 }}>
      {isSelected && (
        <path
          d={path}
          fill="none"
          stroke="#2563eb"
          strokeWidth={thickness + 6}
          strokeLinecap="round"
          opacity={0.25}
        />
      )}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
      />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={thickness}
        strokeDasharray={dashArray}
        strokeLinecap="round"
      />
    </g>
  );
}

function areSimpleEdgePropsEqual(prev: EdgeProps, next: EdgeProps): boolean {
  if (prev.sourceX !== next.sourceX) return false;
  if (prev.sourceY !== next.sourceY) return false;
  if (prev.targetX !== next.targetX) return false;
  if (prev.targetY !== next.targetY) return false;
  const pd = prev.data as any;
  const nd = next.data as any;
  if (pd?.color !== nd?.color) return false;
  if (pd?.thickness !== nd?.thickness) return false;
  if (pd?.dashArray !== nd?.dashArray) return false;
  if (pd?.isDimmed !== nd?.isDimmed) return false;
  if (pd?.isSelected !== nd?.isSelected) return false;
  return true;
}

export const SimpleEdge = memo(SimpleEdgeComponent, areSimpleEdgePropsEqual);
