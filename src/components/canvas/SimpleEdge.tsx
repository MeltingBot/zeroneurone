import { memo } from 'react';
import { type EdgeProps } from '@xyflow/react';
import { arrowPolygon, EDGE_ARROW_LENGTH } from '../../utils/edgeRouting';

/**
 * Ultra-lightweight edge for large graphs (200+ links).
 * Renders a straight <path> plus its arrow heads — no labels, halos, or controls.
 * ~10x fewer SVG DOM nodes than CustomEdge, critical for Firefox SVG performance.
 */
interface SimpleEdgeData {
  color?: string;
  thickness?: number;
  dashArray?: string;
  hasStartArrow?: boolean;
  hasEndArrow?: boolean;
  isDimmed?: boolean;
  isSelected?: boolean;
  isHighlighted?: boolean;
  flow?: 'forward' | 'backward' | 'both' | null;
}

function SimpleEdgeComponent(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY } = props;
  const data = props.data as SimpleEdgeData | undefined;

  const color = data?.color ?? '#9a948d';
  const thickness = data?.thickness ?? 2;
  const dashArray = data?.dashArray;
  const isDimmed = data?.isDimmed ?? false;
  const isSelected = data?.isSelected ?? false;
  const isHighlighted = data?.isHighlighted ?? false;
  const flow = data?.flow ?? null;

  const hasStartArrow = data?.hasStartArrow ?? false;
  const hasEndArrow = data?.hasEndArrow ?? false;

  // The line stops inside the arrow head, so its round cap does not pass the tip
  const angle = Math.atan2(targetY - sourceY, targetX - sourceX);
  const length = Math.hypot(targetX - sourceX, targetY - sourceY);
  const inset = Math.min(EDGE_ARROW_LENGTH / 2, length / 4);
  const ux = Math.cos(angle), uy = Math.sin(angle);
  const sx = hasStartArrow ? sourceX + ux * inset : sourceX;
  const sy = hasStartArrow ? sourceY + uy * inset : sourceY;
  const tx = hasEndArrow ? targetX - ux * inset : targetX;
  const ty = hasEndArrow ? targetY - uy * inset : targetY;
  const path = `M ${sx} ${sy} L ${tx} ${ty}`;

  return (
    <g style={{
      opacity: isDimmed ? 0.15 : 1,
      filter: isHighlighted && !isDimmed ? 'drop-shadow(0 0 3px var(--color-accent))' : undefined,
    }}>
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
      {hasEndArrow && <polygon points={arrowPolygon(targetX, targetY, angle)} fill={color} />}
      {hasStartArrow && <polygon points={arrowPolygon(sourceX, sourceY, angle + Math.PI)} fill={color} />}
      {/* Cycle: accent dashes moving the way the cycle runs */}
      {flow && (
        <path
          d={path}
          className={`cycle-flow-line ${flow}`}
          strokeWidth={Math.max(2, thickness)}
        />
      )}
    </g>
  );
}

function areSimpleEdgePropsEqual(prev: EdgeProps, next: EdgeProps): boolean {
  if (prev.sourceX !== next.sourceX) return false;
  if (prev.sourceY !== next.sourceY) return false;
  if (prev.targetX !== next.targetX) return false;
  if (prev.targetY !== next.targetY) return false;
  const pd = prev.data as SimpleEdgeData | undefined;
  const nd = next.data as SimpleEdgeData | undefined;
  if (pd?.color !== nd?.color) return false;
  if (pd?.thickness !== nd?.thickness) return false;
  if (pd?.dashArray !== nd?.dashArray) return false;
  if (pd?.hasStartArrow !== nd?.hasStartArrow) return false;
  if (pd?.hasEndArrow !== nd?.hasEndArrow) return false;
  if (pd?.isDimmed !== nd?.isDimmed) return false;
  if (pd?.isHighlighted !== nd?.isHighlighted) return false;
  if (pd?.flow !== nd?.flow) return false;
  if (pd?.isSelected !== nd?.isSelected) return false;
  return true;
}

export const SimpleEdge = memo(SimpleEdgeComponent, areSimpleEdgePropsEqual);
