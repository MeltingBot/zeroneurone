import type { Position } from '../types';

/** Vertical gap between the lowest element and a new capture */
export const CAPTURE_GAP = 160;

/**
 * Where a capture lands on the canvas: under the lowest element, aligned on
 * the leftmost one. Successive captures stack into a column the desktop finds
 * at the bottom of the dossier, never on top of an existing element.
 */
export function capturePosition(positions: Position[]): Position {
  if (positions.length === 0) return { x: 0, y: 0 };
  let minX = Infinity;
  let maxY = -Infinity;
  for (const p of positions) {
    if (p.x < minX) minX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: maxY + CAPTURE_GAP };
}
