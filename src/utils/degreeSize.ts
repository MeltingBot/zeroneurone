/**
 * "Size by connections" dossier option: an element is drawn larger the more
 * links it has. Display only — nothing is written to the element, so turning
 * the option off restores every size.
 *
 * The factor depends on the element's own degree only (not on the dossier's
 * busiest element), so adding a link never resizes unrelated elements.
 * An element resized by hand is enlarged from its own size; groups and
 * annotations keep theirs. A resize made while the option is on is stored
 * divided by the factor (see Canvas), so it keeps following its links.
 *
 * Dependency-free (no React, no i18n): usable from the layout code too.
 */

import type { Element, Link } from '../types';
import { computeElementDimensions } from './elementDimensions';

/** Largest factor, reached at 81 links. */
export const DEGREE_SIZE_MAX_FACTOR = 3;

/**
 * Size factor for a number of links: 0 or 1 link ×1, 4 ×1.25, 9 ×1.5,
 * 25 ×2, 81+ ×3. An element with a single link (the leaves of a tree, most
 * elements of a star) keeps its size, so tightly packed rows don't overlap.
 */
export function degreeSizeFactor(degree: number): number {
  if (!(degree > 1)) return 1;
  return Math.min(DEGREE_SIZE_MAX_FACTOR, 1 + 0.25 * (Math.sqrt(degree) - 1));
}

/** Number of links touching each element (a link to itself counts once). */
export function buildDegreeMap(links: readonly Pick<Link, 'fromId' | 'toId'>[]): Map<string, number> {
  const degree = new Map<string, number>();
  for (const link of links) {
    degree.set(link.fromId, (degree.get(link.fromId) ?? 0) + 1);
    if (link.toId !== link.fromId) degree.set(link.toId, (degree.get(link.toId) ?? 0) + 1);
  }
  return degree;
}

/**
 * The element as drawn with the option on: a copy with custom dimensions set
 * to its usual footprint (its hand-set size if any) times the factor, moved so
 * that it grows around its center. Returns the element itself when it is not
 * resized. Positions read from a drawn copy are turned back into stored ones
 * with `storedPosition`.
 */
export function scaleByDegree(el: Element, degree: number, hasImage: boolean): Element {
  if (el.isGroup || el.isAnnotation) return el;
  const factor = degreeSizeFactor(degree);
  if (factor === 1) return el;
  const { width, height } = computeElementDimensions(el.visual, el.label || '', hasImage);
  const customWidth = Math.round(width * factor);
  const customHeight = Math.round(height * factor);
  return {
    ...el,
    position: { x: el.position.x - (customWidth - width) / 2, y: el.position.y - (customHeight - height) / 2 },
    visual: { ...el.visual, customWidth, customHeight },
  };
}

/** Stored position of an element from where its drawn copy is (or would be) placed. */
export function storedPosition(stored: Element, drawn: Element, drawnPosition: { x: number; y: number }): { x: number; y: number } {
  return {
    x: drawnPosition.x + stored.position.x - drawn.position.x,
    y: drawnPosition.y + stored.position.y - drawn.position.y,
  };
}

/** Every element as drawn, for code that works on the whole list (layout, export). */
export function scaleElementsByDegree(
  elements: Element[],
  links: readonly Pick<Link, 'fromId' | 'toId'>[],
  hasImage: (el: Element) => boolean = (el) => Boolean(el.visual?.image),
): Element[] {
  const degree = buildDegreeMap(links);
  return elements.map((el) => scaleByDegree(el, degree.get(el.id) ?? 0, hasImage(el)));
}
