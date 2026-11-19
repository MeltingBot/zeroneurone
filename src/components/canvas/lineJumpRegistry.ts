/**
 * Line jumps on the canvas: each right-angle edge computes its own route, so the vertical segments
 * of every edge are kept here for the others to jump over. Edges publish theirs after rendering and
 * subscribe to the changes (one notification per frame however many edges moved).
 */
import { lineJumpPath, verticalSegments, type Point, type VerticalSegment } from '../../utils/edgeRouting';

const verticalsByEdge = new Map<string, { segments: VerticalSegment[]; key: string }>();
const listeners = new Set<() => void>();
let frame: number | null = null;

function notify() {
  frame = null;
  for (const listener of listeners) listener();
}

/** Publishes the drawn line of an edge (null: the edge is gone or draws no right angles). */
export function publishEdgeLine(edgeId: string, polyline: Point[] | null) {
  const segments = polyline ? verticalSegments(polyline) : [];
  const key = segments.map((s) => `${s.x},${s.y1},${s.y2}`).join(';');
  const previous = verticalsByEdge.get(edgeId);
  if ((previous?.key ?? '') === key) return;
  if (key) verticalsByEdge.set(edgeId, { segments, key });
  else verticalsByEdge.delete(edgeId);
  if (frame === null) frame = requestAnimationFrame(notify);
}

export function subscribeLineJumps(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Path of an edge with its jumps over the vertical segments of the other edges. */
export function jumpedPath(edgeId: string, polyline: Point[]): string {
  const crossed: VerticalSegment[] = [];
  for (const [id, { segments }] of verticalsByEdge) {
    if (id !== edgeId) crossed.push(...segments);
  }
  return lineJumpPath(polyline, crossed);
}
