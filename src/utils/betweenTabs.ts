/**
 * What links two canvas tabs: the elements in both, the links going from one
 * to the other, and the relays (elements in neither, linked to both).
 */
import type { CanvasTab, Link } from '../types';

export interface BetweenTabs {
  nameA: string;
  nameB: string;
  /** Elements in both tabs */
  common: string[];
  /** Links from an element of one tab only to an element of the other only */
  directLinks: string[];
  directEnds: string[];
  /** Elements in neither tab, linked to both */
  relays: string[];
}

export function computeBetweenTabs(tabs: CanvasTab[], idA: string, idB: string, links: Link[]): BetweenTabs | null {
  const tabA = tabs.find((t) => t.id === idA);
  const tabB = tabs.find((t) => t.id === idB);
  if (!tabA || !tabB) return null;
  const a = new Set(tabA.memberElementIds);
  const b = new Set(tabB.memberElementIds);
  const common = tabA.memberElementIds.filter((id) => b.has(id));
  const onlyA = (id: string) => a.has(id) && !b.has(id);
  const onlyB = (id: string) => b.has(id) && !a.has(id);
  const directLinks: string[] = [];
  const directEnds = new Set<string>();
  const touchesA = new Set<string>();
  const touchesB = new Set<string>();
  for (const link of links) {
    const { fromId, toId } = link;
    if ((onlyA(fromId) && onlyB(toId)) || (onlyB(fromId) && onlyA(toId))) {
      directLinks.push(link.id);
      directEnds.add(fromId);
      directEnds.add(toId);
    }
    // Relay candidates: an outsider at one end, a member at the other
    for (const [outside, inside] of [[fromId, toId], [toId, fromId]]) {
      if (a.has(outside) || b.has(outside)) continue;
      if (a.has(inside)) touchesA.add(outside);
      if (b.has(inside)) touchesB.add(outside);
    }
  }
  const relays = [...touchesA].filter((id) => touchesB.has(id));
  return { nameA: tabA.name, nameB: tabB.name, common, directLinks, directEnds: [...directEnds], relays };
}
