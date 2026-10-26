import { Background, BackgroundVariant, useStore } from '@xyflow/react';

/** Smallest on-screen spacing of the grid, in pixels. */
const MIN_SPACING = 10;
/** Enough for React Flow's smallest zoom with a 1-unit grid. */
const MAX_DOUBLINGS = 16;

interface CanvasGridProps {
  gridSize: number;
  /** Lines (snap to grid on) or dots. */
  lines: boolean;
}

/**
 * Canvas background. Zoomed out, the grid step doubles until it is readable:
 * its lines stay a subset of the snap grid. Dots keep their screen size
 * (React Flow shrinks them with the zoom).
 */
export function CanvasGrid({ gridSize, lines }: CanvasGridProps) {
  const rawZoom = useStore((s) => s.transform[2]);
  // A zero or invalid zoom (mid-transition) would never end the loop below
  const zoom = Number.isFinite(rawZoom) && rawZoom > 0 ? rawZoom : 1;
  let gap = Number.isFinite(gridSize) && gridSize > 0 ? gridSize : 20;
  for (let i = 0; i < MAX_DOUBLINGS && gap * zoom < MIN_SPACING; i++) gap *= 2;
  return (
    <Background
      variant={lines ? BackgroundVariant.Lines : BackgroundVariant.Dots}
      gap={gap}
      size={lines ? 0.5 : Math.max(1, 1 / zoom)}
      color="var(--color-border-strong)"
      style={{ backgroundColor: 'var(--color-bg-canvas)' }}
    />
  );
}
