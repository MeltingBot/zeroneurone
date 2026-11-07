/**
 * Hand-drawn routes (right-angle routes, bend points) are kept on the canvas: moving one end of a
 * link leaves them in place. When both ends move by the same amount (a selection dragged, nudged
 * or aligned together, a group moved), the route moves with them.
 */

import type { Element, Link, OrthogonalRoute, Position } from '../types';

type RouteChanges = { orthogonalRoute?: OrthogonalRoute; bendPoints?: { x: number; y: number }[] };

/**
 * How far an element moves on the canvas: its own move plus those of the groups it sits in (a
 * child's position is relative to its group).
 */
export function canvasMoves(elements: Element[], moves: Map<string, Position>): (id: string) => Position {
  const byId = new Map(elements.map((el) => [el.id, el]));
  const cache = new Map<string, Position>();
  const moveOf = (id: string, depth = 0): Position => {
    const cached = cache.get(id);
    if (cached) return cached;
    const el = byId.get(id);
    const target = moves.get(id);
    const own = el && target ? { x: target.x - el.position.x, y: target.y - el.position.y } : { x: 0, y: 0 };
    const parent = el?.parentGroupId && depth < 32 ? moveOf(el.parentGroupId, depth + 1) : { x: 0, y: 0 };
    const total = { x: own.x + parent.x, y: own.y + parent.y };
    cache.set(id, total);
    return total;
  };
  return (id) => moveOf(id);
}

/** Routes of the links whose two ends moved together, moved with them. */
export function followedRoutes(links: Link[], moveOf: (id: string) => Position): { id: string; changes: RouteChanges }[] {
  const followed: { id: string; changes: RouteChanges }[] = [];
  for (const link of links) {
    if (!link.orthogonalRoute && !link.bendPoints?.length) continue;
    const from = moveOf(link.fromId);
    const to = moveOf(link.toId);
    if (Math.abs(from.x - to.x) > 1e-6 || Math.abs(from.y - to.y) > 1e-6) continue;
    if (from.x === 0 && from.y === 0) continue;
    followed.push({ id: link.id, changes: shiftedRoute(link, from) });
  }
  return followed;
}

/** A route drawn by hand: right-angle segments or bend points. */
export function hasHandDrawnRoute(link: Link): boolean {
  return !!link.orthogonalRoute || (link.bendPoints?.length ?? 0) > 0;
}

/**
 * Links whose hand-drawn route a move breaks: its two ends moved by different amounts (an
 * automatic layout), so the corners left in place no longer fit the link.
 */
export function brokenRoutes(links: Link[], moveOf: (id: string) => Position): Link[] {
  return links.filter((link) => {
    if (!hasHandDrawnRoute(link)) return false;
    const from = moveOf(link.fromId);
    const to = moveOf(link.toId);
    return Math.abs(from.x - to.x) > 1e-6 || Math.abs(from.y - to.y) > 1e-6;
  });
}

/** What clears every route drawn by hand on a link, whatever the curve mode. */
export const CLEARED_ROUTE: Pick<Link, 'orthogonalRoute' | 'bendPoints' | 'orthogonalOffset' | 'curveOffset'> = {
  orthogonalRoute: null,
  bendPoints: null,
  orthogonalOffset: null,
  curveOffset: { x: 0, y: 0 },
};

/** The route fields of a link as they are, to restore them. */
export function routeFields(link: Link): Pick<Link, 'orthogonalRoute' | 'bendPoints' | 'orthogonalOffset' | 'curveOffset'> {
  return {
    orthogonalRoute: link.orthogonalRoute ?? null,
    bendPoints: link.bendPoints ?? null,
    orthogonalOffset: link.orthogonalOffset ?? null,
    curveOffset: link.curveOffset ?? { x: 0, y: 0 },
  };
}

/** The hand-drawn route of a link moved by `by` (only the fields the link has). */
export function shiftedRoute(link: Pick<Link, 'orthogonalRoute' | 'bendPoints'>, by: Position): RouteChanges {
  const changes: RouteChanges = {};
  if (link.orthogonalRoute) {
    const { first, positions } = link.orthogonalRoute;
    changes.orthogonalRoute = {
      first,
      // x and y in turn, starting with `first`
      positions: positions.map((v, i) => v + ((i % 2 === 0) === (first === 'x') ? by.x : by.y)),
    };
  }
  if (link.bendPoints?.length) {
    changes.bendPoints = link.bendPoints.map((p) => ({ x: p.x + by.x, y: p.y + by.y }));
  }
  return changes;
}

type Placed = Pick<Element, 'position' | 'parentGroupId'>;

/**
 * The hand-drawn route of a copied link (duplicate, paste): moved with its ends when both copies
 * moved alike from their originals, back to automatic otherwise. Ends inside a group are placed
 * relative to it, so the move is not known: automatic too. Nothing to add for a link without one.
 */
export function routeOfCopy(
  link: Pick<Link, 'orthogonalRoute' | 'bendPoints'>,
  from: { original?: Placed; copy?: Placed },
  to: { original?: Placed; copy?: Placed },
): RouteChanges | { orthogonalRoute: null; bendPoints: null } {
  if (!link.orthogonalRoute && !link.bendPoints?.length) return {};
  const cleared = { orthogonalRoute: null, bendPoints: null };
  const ends = [from.original, from.copy, to.original, to.copy];
  if (ends.some((el) => !el || el.parentGroupId)) return cleared;
  const fromMove = { x: from.copy!.position.x - from.original!.position.x, y: from.copy!.position.y - from.original!.position.y };
  const toMove = { x: to.copy!.position.x - to.original!.position.x, y: to.copy!.position.y - to.original!.position.y };
  if (Math.abs(fromMove.x - toMove.x) > 1e-6 || Math.abs(fromMove.y - toMove.y) > 1e-6) return cleared;
  return shiftedRoute(link, fromMove);
}

/** routeOfCopy for a link copied with its ends: originals by id, copies by id, original → copy id. */
export function routeOfCopiedLink(
  link: Pick<Link, 'fromId' | 'toId' | 'orthogonalRoute' | 'bendPoints'>,
  originals: Map<string, Placed>,
  copies: Map<string, Placed>,
  copyId: Map<string, string>,
): ReturnType<typeof routeOfCopy> {
  const end = (id: string) => ({ original: originals.get(id), copy: copies.get(copyId.get(id) ?? '') });
  return routeOfCopy(link, end(link.fromId), end(link.toId));
}
