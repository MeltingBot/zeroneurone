import type { Element, Link } from '../../types';

/**
 * A cheap fingerprint of a graph's *shape*.
 *
 * Insights — clusters, bridges, centrality, duplicate labels — depend on which
 * elements exist, how they are labelled and tagged, and how they are wired.
 * They do not depend on where the nodes sit on the canvas. Recomputing them
 * whenever `elements` changes therefore relaunches a full analysis on every
 * drag, which is the dominant source of work on a large dossier.
 *
 * The signature is built in O(n) with integer arithmetic: no sort, no
 * concatenation, no allocation per item. Per-item hashes are summed, so the
 * result does not depend on array order — a re-sync that reorders the array
 * without changing anything must not trigger a recompute.
 */

/** FNV-1a, 32-bit. */
function hashString(input: string, seed = 0x811c9dc5): number {
  let hash = seed;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function graphStructureSignature(elements: Element[], links: Link[]): string {
  let elementSum = 0;
  for (const el of elements) {
    // Everything the analyses read: identity, wiring-relevant flags, and the
    // text that duplicate detection compares.
    let h = hashString(el.id);
    h = (h + hashString(el.label ?? '', 0x9e3779b1)) >>> 0;
    for (const tag of el.tags) h = (h + hashString(tag, 0x85ebca6b)) >>> 0;
    if (el.isGroup) h = (h + 1) >>> 0;
    elementSum = (elementSum + h) >>> 0;
  }

  let linkSum = 0;
  for (const lk of links) {
    let h = hashString(lk.id);
    h = (h + hashString(lk.fromId, 0xc2b2ae35)) >>> 0;
    h = (h + hashString(lk.toId, 0x27d4eb2f)) >>> 0;
    linkSum = (linkSum + h) >>> 0;
  }

  // Counts are included so that two different sets summing alike still differ.
  return `${elements.length}.${elementSum}:${links.length}.${linkSum}`;
}
