/**
 * Order of the element list: last changed first, by name, or by how many
 * links an element has in the dossier.
 */

import type { Element, Link } from '../types';

export type ElementSort = 'recent' | 'name' | 'links';

const KEY = 'zeroneurone-companion-sort';

export function readSort(): ElementSort {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'name' || v === 'links') return v;
  } catch { /* storage unavailable */ }
  return 'recent';
}

export function saveSort(sort: ElementSort): void {
  try { localStorage.setItem(KEY, sort); } catch { /* storage unavailable */ }
}

/** Links touching each element (a link to itself counts once) */
export function linkCounts(links: Link[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const l of links) {
    counts.set(l.fromId, (counts.get(l.fromId) ?? 0) + 1);
    if (l.toId !== l.fromId) counts.set(l.toId, (counts.get(l.toId) ?? 0) + 1);
  }
  return counts;
}

export function sortElements(
  elements: Element[],
  sort: ElementSort,
  counts: Map<string, number>,
  locale: string,
): Element[] {
  const byName = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  const name = (a: Element, b: Element) => byName.compare(a.label, b.label);
  const recent = (a: Element, b: Element) => b.updatedAt.getTime() - a.updatedAt.getTime();
  const list = [...elements];
  if (sort === 'name') return list.sort((a, b) => (!a.label ? 1 : 0) - (!b.label ? 1 : 0) || name(a, b));
  if (sort === 'links') return list.sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || name(a, b));
  return list.sort(recent);
}
