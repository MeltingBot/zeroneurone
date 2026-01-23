import { useMemo } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { Node } from '@xyflow/react';

export interface Guide {
  type: 'x' | 'y';
  position: number; // The aligned coordinate in flow space
  snappedValue: number; // The value to snap the dragged node to
}

interface AlignmentGuidesProps {
  draggedNodeId: string | null;
  dragPosition: { x: number; y: number } | null;
  nodes: Node[];
}

const TOLERANCE = 5; // pixels in flow space

// Default node dimensions (used when measured dimensions not available)
const DEFAULT_WIDTH = 160;
const DEFAULT_HEIGHT = 40;

function getNodeBounds(node: Node) {
  const w = (node.measured?.width ?? node.width ?? DEFAULT_WIDTH);
  const h = (node.measured?.height ?? node.height ?? DEFAULT_HEIGHT);
  const x = node.position.x;
  const y = node.position.y;
  return {
    left: x,
    right: x + w,
    top: y,
    bottom: y + h,
    centerX: x + w / 2,
    centerY: y + h / 2,
    width: w,
    height: h,
  };
}

export function computeGuides(
  draggedNodeId: string,
  dragPosition: { x: number; y: number },
  nodes: Node[]
): Guide[] {
  const draggedNode = nodes.find(n => n.id === draggedNodeId);
  if (!draggedNode) return [];

  const w = (draggedNode.measured?.width ?? draggedNode.width ?? DEFAULT_WIDTH);
  const h = (draggedNode.measured?.height ?? draggedNode.height ?? DEFAULT_HEIGHT);

  const dragged = {
    left: dragPosition.x,
    right: dragPosition.x + w,
    top: dragPosition.y,
    bottom: dragPosition.y + h,
    centerX: dragPosition.x + w / 2,
    centerY: dragPosition.y + h / 2,
  };

  const guides: Guide[] = [];
  const seenX = new Set<number>();
  const seenY = new Set<number>();

  for (const node of nodes) {
    if (node.id === draggedNodeId) continue;

    const other = getNodeBounds(node);

    // Vertical guides (x-axis alignment)
    const xChecks: { dragValue: number; otherValue: number; snapOffset: number }[] = [
      { dragValue: dragged.centerX, otherValue: other.centerX, snapOffset: -w / 2 },
      { dragValue: dragged.left, otherValue: other.left, snapOffset: 0 },
      { dragValue: dragged.right, otherValue: other.right, snapOffset: -(w) },
      { dragValue: dragged.left, otherValue: other.right, snapOffset: 0 },
      { dragValue: dragged.right, otherValue: other.left, snapOffset: -(w) },
    ];

    for (const check of xChecks) {
      if (Math.abs(check.dragValue - check.otherValue) <= TOLERANCE) {
        const pos = Math.round(check.otherValue);
        if (!seenX.has(pos)) {
          seenX.add(pos);
          guides.push({
            type: 'x',
            position: pos,
            snappedValue: pos + check.snapOffset,
          });
        }
      }
    }

    // Horizontal guides (y-axis alignment)
    const yChecks: { dragValue: number; otherValue: number; snapOffset: number }[] = [
      { dragValue: dragged.centerY, otherValue: other.centerY, snapOffset: -h / 2 },
      { dragValue: dragged.top, otherValue: other.top, snapOffset: 0 },
      { dragValue: dragged.bottom, otherValue: other.bottom, snapOffset: -(h) },
      { dragValue: dragged.top, otherValue: other.bottom, snapOffset: 0 },
      { dragValue: dragged.bottom, otherValue: other.top, snapOffset: -(h) },
    ];

    for (const check of yChecks) {
      if (Math.abs(check.dragValue - check.otherValue) <= TOLERANCE) {
        const pos = Math.round(check.otherValue);
        if (!seenY.has(pos)) {
          seenY.add(pos);
          guides.push({
            type: 'y',
            position: pos,
            snappedValue: pos + check.snapOffset,
          });
        }
      }
    }
  }

  return guides;
}

export function AlignmentGuides({ draggedNodeId, dragPosition, nodes }: AlignmentGuidesProps) {
  const { getViewport } = useReactFlow();

  const guides = useMemo(() => {
    if (!draggedNodeId || !dragPosition) return [];
    return computeGuides(draggedNodeId, dragPosition, nodes);
  }, [draggedNodeId, dragPosition, nodes]);

  if (guides.length === 0) return null;

  const viewport = getViewport();

  // Convert flow coordinates to screen coordinates
  const toScreen = (flowX: number, flowY: number) => ({
    x: flowX * viewport.zoom + viewport.x,
    y: flowY * viewport.zoom + viewport.y,
  });

  // Get viewport bounds in flow space for line extent
  const parentEl = document.querySelector('.react-flow') as HTMLElement | null;
  const width = parentEl?.clientWidth ?? 2000;
  const height = parentEl?.clientHeight ?? 1500;

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 50, width: '100%', height: '100%' }}
    >
      {guides.map((guide, i) => {
        if (guide.type === 'x') {
          const screen = toScreen(guide.position, 0);
          return (
            <line
              key={`x-${i}`}
              x1={screen.x}
              y1={0}
              x2={screen.x}
              y2={height}
              stroke="var(--color-accent)"
              strokeWidth={1}
              strokeDasharray="4 4"
              opacity={0.8}
            />
          );
        } else {
          const screen = toScreen(0, guide.position);
          return (
            <line
              key={`y-${i}`}
              x1={0}
              y1={screen.y}
              x2={width}
              y2={screen.y}
              stroke="var(--color-accent)"
              strokeWidth={1}
              strokeDasharray="4 4"
              opacity={0.8}
            />
          );
        }
      })}
    </svg>
  );
}
