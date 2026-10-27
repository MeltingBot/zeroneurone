/**
 * How a link shows on the canvas: selected, dimmed, glowing. Shared by the
 * React Flow edges and the overview layer so both read the same rules.
 */

import type { Link } from '../types';

export interface LinkVisualContext {
  selectedLinkIds: ReadonlySet<string>;
  dimmedElementIds: ReadonlySet<string>;
  /** Elements with a glow: the result set of an active narrowing. */
  emphasizedElementCount: number;
  queryFilterActive: boolean;
  queryMatchLinkIds: ReadonlySet<string>;
  /** Time cursor classification, null when the cursor is off. */
  temporal: {
    inactiveLinkIds: ReadonlySet<string>;
    undatedLinkIds: ReadonlySet<string>;
    activeLinkIds: ReadonlySet<string>;
  } | null;
  showUndated: boolean;
  /** Links of the highlighted cycles and the way they are walked: they alone glow, and their dashes move. */
  flowLinks?: ReadonlyMap<string, 'forward' | 'backward' | 'both'>;
}

/**
 * Way a cycle walks a link, relative to its from→to; 'both' when no sense
 * applies (dashes go back and forth); null outside a cycle.
 */
export type LinkFlow = 'forward' | 'backward' | 'both' | null;

export interface LinkVisualState {
  isSelected: boolean;
  isDimmed: boolean;
  isHighlighted: boolean;
  flow: LinkFlow;
}

export function linkVisualState(link: Link, ctx: LinkVisualContext): LinkVisualState {
  const isSelected = ctx.selectedLinkIds.has(link.id);
  const endpointDimmed = ctx.dimmedElementIds.has(link.fromId) || ctx.dimmedElementIds.has(link.toId);
  const temporalDimmed = !!ctx.temporal && (
    ctx.temporal.inactiveLinkIds.has(link.id) ||
    (ctx.showUndated && ctx.temporal.undatedLinkIds.has(link.id))
  );
  const isDimmed = temporalDimmed || (endpointDimmed && !(ctx.queryFilterActive && ctx.queryMatchLinkIds.has(link.id)));
  // Emphasis (glow): link is part of the active result set — kept (not dimmed)
  // while a narrowing is active (insights, query, or filters). With the time
  // cursor on, only links dated inside the window glow.
  const walked = ctx.flowLinks?.get(link.id);
  const flow: LinkFlow = isDimmed || walked === undefined ? null : walked;
  const isHighlighted = ctx.temporal
    ? ctx.temporal.activeLinkIds.has(link.id) && !isDimmed
    // A cycle search glows its own links, not the chords between its elements
    : ctx.flowLinks && ctx.flowLinks.size > 0
      ? flow !== null
      : ctx.emphasizedElementCount > 0 && !isDimmed;
  return { isSelected, isDimmed, isHighlighted, flow };
}
