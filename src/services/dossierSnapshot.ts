/** Everything a dossier ZIP carries, for an open or a closed dossier */

import * as Y from 'yjs';
import { db } from '../db/database';
import { elementRepository } from '../db/repositories/elementRepository';
import { linkRepository } from '../db/repositories/linkRepository';
import { reportRepository } from '../db/repositories/reportRepository';
import { tabRepository } from '../db/repositories/tabRepository';
import { fileService } from './fileService';
import { EncryptedIndexeddbPersistence } from './encryption/encryptedIndexeddbPersistence';
import { ydocDatabaseName } from './yjs/ydocName';
import { getYMaps } from '../types/yjs';
import { yMapToElement } from './yjs/elementMapper';
import { yMapToLink } from './yjs/linkMapper';
import { yMapToComment } from './yjs/commentMapper';
import { yMapToTab } from './yjs/tabMapper';
import { yMapToReport } from './yjs/reportMapper';
import { useDossierStore } from '../stores/dossierStore';
import { useQueryStore } from '../stores/queryStore';
import type {
  Asset, CanvasTab, Comment, DossierId, Element, Link, Report, SavedQuery, View,
} from '../types';

export interface DossierSnapshot {
  elements: Element[];
  links: Link[];
  assets: Asset[];
  report: Report | null;
  tabs: CanvasTab[];
  views: View[];
  queries: SavedQuery[];
  queryHistory: string[];
  comments: Comment[];
}

interface GraphPart {
  elements: Element[];
  links: Link[];
  comments: Comment[];
  tabs: CanvasTab[];
  report: Report | null;
}

/**
 * Graph of a dossier that is not open, from its Y.Doc (the source of truth).
 * Null when the Y.Doc holds no element: a dossier never opened since it was
 * imported, whose data still sits in the IndexedDB tables only.
 */
async function readClosedDossierYDoc(dossierId: DossierId): Promise<GraphPart | null> {
  const ydoc = new Y.Doc();
  const provider = new EncryptedIndexeddbPersistence(ydocDatabaseName(dossierId), ydoc);
  try {
    await provider.whenSynced;
    const maps = getYMaps(ydoc);
    if (maps.elements.size === 0) return null;
    const asMaps = (m: Y.Map<Y.Map<unknown>>) =>
      [...m.values()].filter((v) => v instanceof Y.Map);
    const report = asMaps(maps.reports)
      .map((ymap) => yMapToReport(ymap))
      .find((r) => r.dossierId === dossierId) ?? null;
    return {
      elements: asMaps(maps.elements).map((m) => ({ ...yMapToElement(m), dossierId })),
      links: asMaps(maps.links).map((m) => ({ ...yMapToLink(m), dossierId })),
      comments: asMaps(maps.comments).map((m) => ({ ...yMapToComment(m), dossierId })),
      tabs: asMaps(maps.tabs).map((m) => ({ ...yMapToTab(m), dossierId })),
      report,
    };
  } finally {
    await provider.destroy();
    ydoc.destroy();
  }
}

/** All the content of a dossier, as its ZIP export carries it. */
export async function loadDossierSnapshot(dossierId: DossierId): Promise<DossierSnapshot> {
  const store = useDossierStore.getState();
  const isOpen = store.currentDossier?.id === dossierId;

  let graph: GraphPart | null;
  if (isOpen) {
    graph = {
      elements: store.elements,
      links: store.links,
      comments: store.comments,
      tabs: await tabRepository.getByDossier(dossierId),
      report: await reportRepository.getByDossierWithYDoc(dossierId),
    };
  } else {
    graph = await readClosedDossierYDoc(dossierId);
  }
  if (!graph) {
    graph = {
      elements: await elementRepository.getByDossier(dossierId),
      links: await linkRepository.getByDossier(dossierId),
      comments: await db.comments.where({ dossierId }).toArray(),
      tabs: await tabRepository.getByDossier(dossierId),
      report: await reportRepository.getByDossierWithYDoc(dossierId),
    };
  }

  const queryState = useQueryStore.getState();
  return {
    ...graph,
    assets: await fileService.getAssetsByDossier(dossierId),
    views: await db.views.where({ dossierId }).toArray(),
    queries: await db.savedQueries.where({ dossierId }).toArray(),
    queryHistory: isOpen ? queryState.recentQueries : queryState.recentByDossier[dossierId] ?? [],
  };
}
