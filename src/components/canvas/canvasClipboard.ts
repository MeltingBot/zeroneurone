/** Canvas clipboard: what a cut or a delete records, what a paste creates */

import { useTabStore } from '../../stores';
import type { Element, Link } from '../../types';
import { generateUUID } from '../../utils';

/** Capture tab membership for undo restore (tabId → elementIds[]) */
export function captureTabMembership(elementIds: string[]): Record<string, string[]> | undefined {
  const { getTabsForElement } = useTabStore.getState();
  const membership: Record<string, string[]> = {};
  let hasAny = false;
  for (const elId of elementIds) {
    for (const tab of getTabsForElement(elId)) {
      if (!membership[tab.id]) membership[tab.id] = [];
      membership[tab.id].push(elId);
      hasAny = true;
    }
  }
  return hasAny ? membership : undefined;
}

/**
 * Clone clipboard elements + links into the target dossier, anchored at (anchorX, anchorY).
 * Elements get fresh UUIDs and the target dossierId; internal links are remapped to the
 * new ids. On a cross-dossier paste, asset references are dropped (assets live per-dossier
 * in OPFS/Dexie, so keeping their ids would dangle).
 */
export function cloneClipboardForPaste(
  clip: { elements: Element[]; links: Link[]; sourceDossierId: string | null },
  dossierId: string,
  anchorX: number,
  anchorY: number,
): { newElements: Element[]; newLinks: Link[] } {
  const now = new Date();
  const oldToNewIdMap = new Map<string, string>();
  const crossDossier = clip.sourceDossierId !== dossierId;

  const sumX = clip.elements.reduce((s, el) => s + el.position.x, 0);
  const sumY = clip.elements.reduce((s, el) => s + el.position.y, 0);
  const centerX = sumX / clip.elements.length;
  const centerY = sumY / clip.elements.length;

  const newElements: Element[] = clip.elements.map((el) => {
    const newId = generateUUID();
    oldToNewIdMap.set(el.id, newId);
    return {
      ...el,
      id: newId,
      dossierId: dossierId as Element['dossierId'],
      position: { x: anchorX + (el.position.x - centerX), y: anchorY + (el.position.y - centerY) },
      parentGroupId: null,
      assetIds: crossDossier ? [] : el.assetIds,
      createdAt: now,
      updatedAt: now,
    };
  });

  const newLinks: Link[] = clip.links
    .map((link) => ({
      ...link,
      id: generateUUID(),
      dossierId: dossierId as Link['dossierId'],
      fromId: oldToNewIdMap.get(link.fromId)!,
      toId: oldToNewIdMap.get(link.toId)!,
      createdAt: now,
      updatedAt: now,
    }))
    .filter((l) => l.fromId && l.toId);

  return { newElements, newLinks };
}
