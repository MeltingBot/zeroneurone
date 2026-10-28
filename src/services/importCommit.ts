import { db } from '../db/database';
import { syncService } from './syncService';
import { getYMaps } from '../types/yjs';
import * as Y from 'yjs';
import { elementToYMap, linkToYMap, tabToYMap, updateElementYMap, yMapToElement } from './yjs';
import { commentToYMap } from './yjs/commentMapper';
import type { DossierId } from '../types';
import { refuseWrite } from '../utils/dossierLock';
import { emitImported } from '../plugins/pluginEventBus';

/**
 * Imports write to Dexie, but an open dossier displays its Y.Doc, which only
 * migrates from Dexie while empty. These two helpers bring what an import
 * wrote into the open Y.Doc without discarding it: the Y.Doc keeps data that
 * lives nowhere else (comments, shared-session state).
 */

export interface ImportSnapshot {
  dossierId: DossierId;
  startedAt: number;
  elementIds: Set<string>;
  linkIds: Set<string>;
  commentIds: Set<string>;
  tabIds: Set<string>;
}

/** Records what the dossier holds in Dexie, just before an import. */
export async function snapshotBeforeImport(dossierId: DossierId): Promise<ImportSnapshot> {
  // A closed dossier takes no import (the dossier need not be open: read its row)
  const target = await db.dossiers.get(dossierId);
  if (target?.closedAt) refuseWrite('closed');
  const [elementIds, linkIds, commentIds, tabIds] = await Promise.all([
    db.elements.where('dossierId').equals(dossierId).primaryKeys(),
    db.links.where('dossierId').equals(dossierId).primaryKeys(),
    db.comments.where('dossierId').equals(dossierId).primaryKeys(),
    db.canvasTabs.where('dossierId').equals(dossierId).primaryKeys(),
  ]);
  return {
    dossierId,
    startedAt: Date.now(),
    elementIds: new Set(elementIds),
    linkIds: new Set(linkIds),
    commentIds: new Set(commentIds),
    tabIds: new Set(tabIds),
  };
}

/**
 * Copies into the open Y.Doc what the import created since the snapshot. For
 * an element that existed before (CSV events added to it), only the events
 * missing from the Y.Doc are appended: its other fields may hold a newer edit
 * from a peer, which the Dexie copy would overwrite.
 * Does nothing when the dossier's Y.Doc is not open: it will migrate from
 * Dexie on its first load.
 */
export async function commitImportToYDoc(snapshot: ImportSnapshot, format = 'unknown'): Promise<void> {
  const [newElements, newLinks] = await Promise.all([
    db.elements.where('dossierId').equals(snapshot.dossierId).filter((e) => !snapshot.elementIds.has(e.id)).count(),
    db.links.where('dossierId').equals(snapshot.dossierId).filter((l) => !snapshot.linkIds.has(l.id)).count(),
  ]);
  emitImported(snapshot.dossierId, format, true, { elements: newElements, links: newLinks });

  const ydoc = syncService.getYDoc();
  if (!ydoc || syncService.getDossierId() !== snapshot.dossierId) return;

  const id = snapshot.dossierId;
  const [elements, links, comments, tabs] = await Promise.all([
    db.elements.where('dossierId').equals(id).toArray(),
    db.links.where('dossierId').equals(id).filter((l) => !snapshot.linkIds.has(l.id)).toArray(),
    db.comments.where('dossierId').equals(id).filter((c) => !snapshot.commentIds.has(c.id)).toArray(),
    db.canvasTabs.where('dossierId').equals(id).filter((t) => !snapshot.tabIds.has(t.id)).toArray(),
  ]);
  const touched = elements.filter((e) =>
    !snapshot.elementIds.has(e.id) || new Date(e.updatedAt).getTime() >= snapshot.startedAt,
  );

  const maps = getYMaps(ydoc);
  ydoc.transact(() => {
    for (const element of touched) {
      const existing = snapshot.elementIds.has(element.id) ? maps.elements.get(element.id) : undefined;
      if (existing instanceof Y.Map) {
        let current;
        try {
          current = yMapToElement(existing).events ?? [];
        } catch {
          continue; // unreadable in the Y.Doc (no valid position): leave it as is
        }
        const known = new Set(current.map((e) => e.id));
        const added = (element.events ?? []).filter((e) => !known.has(e.id));
        if (added.length > 0) updateElementYMap(existing, { events: [...current, ...added] }, ydoc);
      } else {
        maps.elements.set(element.id, elementToYMap(element));
      }
    }
    for (const link of links) maps.links.set(link.id, linkToYMap(link));
    for (const comment of comments) maps.comments.set(comment.id, commentToYMap(comment));
    for (const tab of tabs) maps.tabs.set(tab.id, tabToYMap(tab));
  });
}
