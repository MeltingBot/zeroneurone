/**
 * Several links between the same two elements, drawn as one line (as i2 Analyst's Notebook's
 * connection multiplicity): "multiple" draws each link, "single" merges every link of a pair
 * whatever its direction, "directed" merges the links going the same way.
 *
 * Display only: the links stay apart in the data. A merged line is drawn by its first link (the
 * lead), with the arrows of the whole bundle and no label; its labels show on hover.
 */

import type { Link, LinkDirection } from '../types';

export type LinkMultiplicity = 'multiple' | 'single' | 'directed';

export interface LinkBundle {
  /** The link that draws the line */
  lead: Link;
  /** Every link of the bundle, the lead first */
  links: Link[];
  /** Arrows of the line, from the lead's source to its target */
  direction: LinkDirection;
}

const directionOf = (link: Link): LinkDirection => link.direction || (link.directed ? 'forward' : 'none');

/** Which line a link joins: the pair, and in "directed" mode the way its arrow points. */
function bundleKey(link: Link, mode: LinkMultiplicity): string {
  const pair = link.fromId < link.toId ? `${link.fromId}|${link.toId}` : `${link.toId}|${link.fromId}`;
  if (mode === 'single') return pair;
  switch (directionOf(link)) {
    case 'forward': return `${link.fromId}>${link.toId}`;
    case 'backward': return `${link.toId}>${link.fromId}`;
    case 'both': return `${pair}|both`;
    default: return `${pair}|none`;
  }
}

/** Arrows of a bundle, seen from its lead (source → target). */
function bundleDirection(lead: Link, links: Link[]): LinkDirection {
  let atStart = false;
  let atEnd = false;
  for (const link of links) {
    const direction = directionOf(link);
    // The element each arrow of this link points at
    const tips = [
      ...(direction === 'forward' || direction === 'both' ? [link.toId] : []),
      ...(direction === 'backward' || direction === 'both' ? [link.fromId] : []),
    ];
    for (const tip of tips) {
      if (tip === lead.toId) atEnd = true;
      else atStart = true;
    }
  }
  return atStart && atEnd ? 'both' : atEnd ? 'forward' : atStart ? 'backward' : 'none';
}

/**
 * The links to draw, and the bundles among them (by lead id). A link alone in its bundle is drawn
 * as usual. Order is kept: a bundle takes the place of its first link.
 */
export function bundleLinks(links: Link[], mode: LinkMultiplicity | undefined): { shown: Link[]; bundles: Map<string, LinkBundle> } {
  const bundles = new Map<string, LinkBundle>();
  if (!mode || mode === 'multiple') return { shown: links, bundles };

  const groups = new Map<string, Link[]>();
  for (const link of links) {
    const key = bundleKey(link, mode);
    const group = groups.get(key);
    if (group) group.push(link);
    else groups.set(key, [link]);
  }
  // Groups come in the order of their first link: so do the lines
  const shown: Link[] = [];
  for (const group of groups.values()) {
    const lead = group[0];
    shown.push(lead);
    if (group.length > 1) bundles.set(lead.id, { lead, links: group, direction: bundleDirection(lead, group) });
  }
  return { shown, bundles };
}

/**
 * How a merged line is drawn: its lead without label, displayed properties or grading (they
 * belong to each link, shown on hover), with the arrows of the bundle.
 */
export function bundleLine(bundle: LinkBundle): Link {
  return {
    ...bundle.lead,
    label: '',
    properties: [],
    confidence: null,
    evaluation: null,
    direction: bundle.direction,
    directed: bundle.direction !== 'none',
  };
}
