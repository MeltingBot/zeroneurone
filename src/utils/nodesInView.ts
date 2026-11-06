/** Whether a saved view shows any of the canvas nodes (opening a dossier) */

interface ViewNode {
  id: string;
  position: { x: number; y: number };
  parentId?: string;
  /** Hidden by a filter: does not count */
  hidden?: boolean;
  width?: number;
  height?: number;
  measured?: { width?: number; height?: number };
  initialWidth?: number;
  initialHeight?: number;
}

/** Footprint of a node never measured yet: an element of medium size */
const DEFAULT_SIZE = { width: 150, height: 60 };

/**
 * Whether the viewport (`x`, `y`, `zoom`, React Flow's) over a canvas of
 * `width` × `height` pixels shows part of at least one node. A node in a
 * group has a position relative to its group.
 */
export function anyNodeInView(
  nodes: readonly ViewNode[],
  viewport: { x: number; y: number; zoom: number },
  width: number,
  height: number,
): boolean {
  const zoom = viewport.zoom || 1;
  const left = -viewport.x / zoom;
  const top = -viewport.y / zoom;
  const right = left + width / zoom;
  const bottom = top + height / zoom;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const absolute = (n: ViewNode, depth = 0): { x: number; y: number } => {
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    if (!parent || depth > 20) return n.position;
    const p = absolute(parent, depth + 1);
    return { x: p.x + n.position.x, y: p.y + n.position.y };
  };
  return nodes.some((n) => {
    if (n.hidden) return false;
    const { x, y } = absolute(n);
    const w = n.measured?.width ?? n.width ?? n.initialWidth ?? DEFAULT_SIZE.width;
    const h = n.measured?.height ?? n.height ?? n.initialHeight ?? DEFAULT_SIZE.height;
    return x < right && x + w > left && y < bottom && y + h > top;
  });
}
