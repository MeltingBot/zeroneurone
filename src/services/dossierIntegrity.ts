/**
 * Read-only check of every dossier's Y.Doc for entries that belong to another
 * dossier. Each element, link, comment, tab and report records its dossier id
 * in the Y.Doc; one carrying another dossier's id got there by mistake (a
 * load superseded by another before v2.93, see dossierStore.loadDossier).
 *
 * Nothing is written: the stored updates are read and decrypted into a
 * throwaway Y.Doc. Entries whose id was rewritten on the way (through the
 * local Dexie copy) cannot be told apart and are not reported.
 */

import * as Y from 'yjs';
import { db } from '../db/database';
import { readStoredUpdates } from './encryption/encryptedIndexeddbPersistence';
import { isYdocDatabaseName, ydocDatabaseName } from './yjs/ydocName';
import { useEncryptionStore } from '../stores/encryptionStore';

export type IntegrityKind = 'elements' | 'links' | 'comments' | 'tabs' | 'reports';
export const INTEGRITY_KINDS: IntegrityKind[] = ['elements', 'links', 'comments', 'tabs', 'reports'];

export interface ForeignGroup {
  /** The dossier these entries belong to */
  fromDossierId: string;
  /** Its name, when it exists in this browser */
  fromName: string | null;
  counts: Record<IntegrityKind, number>;
  /** A few labels, to recognise them */
  samples: string[];
}

export interface DossierIntegrity {
  dossierId: string;
  name: string;
  foreign: ForeignGroup[];
  /** The name stored in the Y.Doc is another dossier's */
  metaNameFrom: string | null;
  /** Stored updates that could not be decrypted (not checked) */
  undecryptable: number;
}

const SAMPLE_COUNT = 5;

/** Foreign entries of one Y.Doc, grouped by the dossier they belong to */
export function findForeignEntries(
  ydoc: Y.Doc,
  dossierId: string,
): Map<string, { counts: Record<IntegrityKind, number>; samples: string[] }> {
  const groups = new Map<string, { counts: Record<IntegrityKind, number>; samples: string[] }>();
  for (const kind of INTEGRITY_KINDS) {
    ydoc.getMap(kind).forEach((value) => {
      if (!(value instanceof Y.Map)) return;
      const owner = value.get('dossierId');
      // Entries without an id predate it: not evidence of anything
      if (typeof owner !== 'string' || !owner || owner === dossierId) return;
      let group = groups.get(owner);
      if (!group) {
        group = { counts: { elements: 0, links: 0, comments: 0, tabs: 0, reports: 0 }, samples: [] };
        groups.set(owner, group);
      }
      group.counts[kind]++;
      const label = value.get('label') ?? value.get('name') ?? value.get('title') ?? value.get('content');
      if (typeof label === 'string' && label.trim() && group.samples.length < SAMPLE_COUNT) {
        group.samples.push(label.trim().slice(0, 60));
      }
    });
  }
  return groups;
}

export async function scanDossierIntegrity(): Promise<DossierIntegrity[]> {
  const dossiers = await db.dossiers.toArray();
  const names = new Map(dossiers.map((d) => [d.id as string, d.name]));
  const existing = new Set(
    (await indexedDB.databases()).map((d) => d.name).filter(isYdocDatabaseName),
  );
  const key = useEncryptionStore.getState().dek;

  const results: DossierIntegrity[] = [];
  for (const dossier of dossiers) {
    const dbName = ydocDatabaseName(dossier.id);
    // Never open one that does not exist: opening creates it
    if (!existing.has(dbName)) continue;
    const { updates, undecryptable } = await readStoredUpdates(dbName, key);
    const ydoc = new Y.Doc();
    try {
      for (const update of updates) Y.applyUpdate(ydoc, update);
      const foreign = [...findForeignEntries(ydoc, dossier.id)].map(([fromDossierId, group]) => ({
        fromDossierId,
        fromName: names.get(fromDossierId) ?? null,
        ...group,
      }));
      const metaName = ydoc.getMap('meta').get('name');
      const metaNameFrom = typeof metaName === 'string' && metaName !== dossier.name
        && dossiers.some((d) => d.id !== dossier.id && d.name === metaName)
        ? metaName
        : null;
      if (foreign.length > 0 || metaNameFrom || undecryptable > 0) {
        results.push({ dossierId: dossier.id, name: dossier.name, foreign, metaNameFrom, undecryptable });
      }
    } finally {
      ydoc.destroy();
    }
  }
  return results;
}
