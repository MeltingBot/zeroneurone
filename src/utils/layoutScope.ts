/**
 * Layout scope — what the auto-layout actually moves.
 *
 * Children of a group are positioned relative to their group (React Flow
 * `parentId`). Laying them out as free nodes mixes relative and absolute
 * coordinates and tears groups apart. Instead, each group is laid out as a
 * single block carrying its children: only the group moves, the children
 * follow and keep their internal arrangement.
 *
 * Exception: when the selection only holds children of the same group, they
 * are arranged inside that group (relative coordinates, group stays put).
 *
 * Locked elements (isPositionLocked) never move: they are left out of the
 * layout, and so is a group holding a locked element (moving the group would
 * carry it along).
 *
 * Layout algorithms treat a position as the node centre while the canvas
 * stores its top-left corner: positions are converted both ways so large
 * nodes (groups) do not overlap their neighbours.
 */

import type { Element, Link, Position } from '../types';
import { computeElementDimensions } from './elementDimensions';

const DEFAULT_GROUP_WIDTH = 300;
const DEFAULT_GROUP_HEIGHT = 200;

export interface LayoutScope {
  /** Nodes handed to the layout algorithm (groups replaced by block proxies), positioned by centre. */
  elements: Element[];
  /** Links between those nodes, re-targeted from children to their block. */
  links: Link[];
  /** Stored (top-left) positions before layout, for undo. */
  originalPositions: { id: string; position: Position }[];
  /** Convert a layout result (centre) back to a stored position (top-left). */
  toStoredPosition: (id: string, center: Position) => Position;
  /** Size of a laid-out node, for overlap checks. */
  sizeOf: (id: string) => { width: number; height: number };
  /** Locked blocks that stay put, as canvas rectangles: the result must not cover them. */
  obstacles: Rect[];
}

export interface Rect { x: number; y: number; width: number; height: number }

/**
 * Build the layout scope.
 *
 * @param selectedIds Selection used as scope when it holds >= 2 elements;
 *                    otherwise the whole dossier (or the pool) is laid out.
 * @param pool        Members of the open canvas tab. Only they can move, and
 *                    every other block becomes an obstacle, so that each tab
 *                    keeps its own zone and the "All" view has no overlap.
 */
export function buildLayoutScope(
  elements: Element[],
  links: Link[],
  selectedIds: ReadonlySet<string>,
  pool?: ReadonlySet<string>,
): LayoutScope {
  const byId = new Map(elements.map((el) => [el.id, el]));
  const candidates = pool ? elements.filter((el) => pool.has(el.id)) : elements;
  const selectedCandidates = candidates.filter((el) => selectedIds.has(el.id));
  const useSelection = selectedCandidates.length >= 2;
  const scoped = (useSelection ? selectedCandidates : candidates)
    .filter((el) => !el.isPositionLocked);

  // Selection inside a single group: arrange the children within it.
  const firstParent = scoped[0]?.parentGroupId ?? null;
  if (
    useSelection &&
    firstParent &&
    byId.has(firstParent) &&
    scoped.every((el) => el.parentGroupId === firstParent)
  ) {
    const ids = new Set(scoped.map((el) => el.id));
    const lockedSiblings = elements.filter((el) => el.parentGroupId === firstParent && el.isPositionLocked);
    return centred(
      scoped.map((el) => (el.isGroup ? groupProxy(el) : el)),
      links.filter((l) => ids.has(l.fromId) && ids.has(l.toId)),
      lockedSiblings.map(rectOf), // same relative coordinates as the children
    );
  }

  // Map each element to the top-level block it moves with.
  const unitOf = (el: Element): string => {
    let current = el;
    const seen = new Set<string>();
    while (current.parentGroupId && !seen.has(current.id)) {
      seen.add(current.id);
      const parent = byId.get(current.parentGroupId);
      if (!parent) break;
      current = parent;
    }
    return current.id;
  };

  const elementUnit = new Map<string, string>();
  for (const el of elements) elementUnit.set(el.id, unitOf(el));

  // Blocks that must stay put: locked themselves or carrying a locked element
  const lockedUnits = new Set<string>();
  for (const el of elements) {
    if (el.isPositionLocked) lockedUnits.add(elementUnit.get(el.id)!);
  }

  const unitIds = new Set<string>();
  for (const el of scoped) {
    const unit = elementUnit.get(el.id)!;
    if (!lockedUnits.has(unit)) unitIds.add(unit);
  }

  const layoutElements: Element[] = [];
  for (const id of unitIds) {
    const el = byId.get(id);
    if (!el) continue;
    layoutElements.push(el.isGroup ? groupProxy(el) : el);
  }

  // Re-target links to blocks; drop links internal to a block.
  const layoutLinks: Link[] = [];
  for (const link of links) {
    const from = elementUnit.get(link.fromId);
    const to = elementUnit.get(link.toId);
    if (!from || !to || from === to) continue;
    if (!unitIds.has(from) || !unitIds.has(to)) continue;
    layoutLinks.push({ ...link, fromId: from, toId: to });
  }

  // Obstacles: the locked blocks; in a tab, every block that does not move
  const obstacleUnits = pool
    ? new Set([...elementUnit.values()].filter((unit) => !unitIds.has(unit)))
    : lockedUnits;
  const obstacles: Rect[] = [];
  for (const id of obstacleUnits) {
    const el = byId.get(id);
    if (el) obstacles.push(rectOf(el.isGroup ? groupProxy(el) : el));
  }

  return centred(layoutElements, layoutLinks, obstacles);
}

function rectOf(el: Element): Rect {
  const { width, height } = computeElementDimensions(el.visual, el.label || '', Boolean(el.visual?.image));
  return { x: el.position.x, y: el.position.y, width, height };
}

/** Shift positions from top-left to centre and expose the reverse mapping. */
function centred(elements: Element[], links: Link[], obstacles: Rect[]): LayoutScope {
  const halfSizes = new Map<string, { hw: number; hh: number }>();
  const originalPositions: { id: string; position: Position }[] = [];
  const centredElements = elements.map((el) => {
    const { width, height } = computeElementDimensions(
      el.visual,
      el.label || '',
      Boolean(el.visual?.image),
    );
    const half = { hw: width / 2, hh: height / 2 };
    halfSizes.set(el.id, half);
    originalPositions.push({ id: el.id, position: { ...el.position } });
    return { ...el, position: { x: el.position.x + half.hw, y: el.position.y + half.hh } };
  });

  return {
    elements: centredElements,
    links,
    originalPositions,
    toStoredPosition: (id, center) => {
      const half = halfSizes.get(id) ?? { hw: 0, hh: 0 };
      return { x: center.x - half.hw, y: center.y - half.hh };
    },
    sizeOf: (id) => {
      const half = halfSizes.get(id) ?? { hw: 0, hh: 0 };
      return { width: half.hw * 2, height: half.hh * 2 };
    },
    obstacles,
  };
}

/** A group seen by the layout as one node sized like its frame. */
function groupProxy(group: Element): Element {
  return {
    ...group,
    isGroup: false,
    parentGroupId: null,
    visual: {
      ...group.visual,
      shape: 'rectangle',
      image: null,
      customWidth: group.visual.customWidth || DEFAULT_GROUP_WIDTH,
      customHeight: group.visual.customHeight || DEFAULT_GROUP_HEIGHT,
    },
  };
}
