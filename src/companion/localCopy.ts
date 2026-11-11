/**
 * Where the companion keeps a dossier on the phone, and the copies it kept
 * before under the desktop's database name.
 *
 * Until 2.93.3 the companion used the desktop's name for its copy: in a
 * browser holding both (a desktop opening its own share link at /m/, a
 * tablet), "Forget" erased the desktop's copy, and the companion wrote plain
 * updates into a desktop database encrypted at rest. Such an older copy is
 * brought over on opening, then deleted, unless the desktop in this browser
 * has that dossier: it is then the desktop's own copy, and stays.
 */

import * as Y from 'yjs';
import { EncryptedIndexeddbPersistence, readStoredUpdates } from '../services/encryption/encryptedIndexeddbPersistence';
import { companionYdocDatabaseName, deleteIdbDatabase, ydocDatabaseName } from '../services/yjs/ydocName';
import { unlockedKey } from './lockState';

/** The desktop's Dexie database and its dossier table (src/db/database.ts) */
const DESKTOP_DATABASE = 'zeroneurone';
const DESKTOP_DOSSIERS = 'dossiers';
/** Dossiers whose older copy was already looked at: not read again at each opening */
const ADOPTED_KEY = 'zeroneurone-companion-adopted';

function adopted(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(ADOPTED_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function markAdopted(dossierId: string): void {
  try { localStorage.setItem(ADOPTED_KEY, JSON.stringify([...adopted().filter((id) => id !== dossierId), dossierId])); } catch { /* storage unavailable */ }
}

async function databaseNames(): Promise<Set<string> | null> {
  if (typeof indexedDB.databases !== 'function') return null;
  return new Set((await indexedDB.databases()).map((d) => d.name ?? ''));
}

/**
 * Whether the desktop in this browser has this dossier. Opening ZeroNeurone's
 * main address on a phone creates the desktop database even behind the
 * resolution guard, so its mere presence proves nothing: the dossier itself
 * is looked up (its id stays readable when the desktop encrypts at rest).
 * The database is opened as it is, never created or upgraded here.
 */
async function desktopHasDossier(names: Set<string>, dossierId: string): Promise<boolean> {
  if (!names.has(DESKTOP_DATABASE)) return false;
  const db = await new Promise<IDBDatabase | null>((resolve) => {
    const request = indexedDB.open(DESKTOP_DATABASE);
    // No version given: an upgrade would mean the database did not exist
    request.onupgradeneeded = () => request.transaction?.abort();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  if (!db) return false;
  try {
    if (!db.objectStoreNames.contains(DESKTOP_DOSSIERS)) return false;
    return await new Promise<boolean>((resolve) => {
      const request = db.transaction(DESKTOP_DOSSIERS, 'readonly').objectStore(DESKTOP_DOSSIERS).getKey(dossierId);
      request.onsuccess = () => resolve(request.result !== undefined);
      // Unreadable: kept, in case it is the desktop's
      request.onerror = () => resolve(true);
    });
  } finally {
    db.close();
  }
}

/** The copy under the desktop's name is the companion's own, to erase */
async function legacyIsOurs(names: Set<string>, dossierId: string): Promise<boolean> {
  return names.has(ydocDatabaseName(dossierId)) && !(await desktopHasDossier(names, dossierId));
}

/**
 * Brings an older copy (desktop's name) into the companion's own database.
 * Its readable updates are added to the companion copy: Yjs merges them, so
 * running it twice changes nothing. Encrypted updates (a desktop's) are left.
 * Done once per dossier (`force`: again, as when the lock is turned on and no
 * plain copy may stay). Returns true when an older copy was found.
 */
export async function adoptLegacyCopy(dossierId: string, force = false): Promise<boolean> {
  if (!force && adopted().includes(dossierId)) return false;
  const names = await databaseNames();
  if (!names?.has(ydocDatabaseName(dossierId))) {
    if (names) markAdopted(dossierId);
    return false;
  }
  const { updates } = await readStoredUpdates(ydocDatabaseName(dossierId), null);
  if (updates.length > 0) {
    const doc = new Y.Doc();
    // Encrypted when the lock is on (the phone is unlocked when a dossier opens)
    const target = new EncryptedIndexeddbPersistence(companionYdocDatabaseName(dossierId), doc, unlockedKey() ?? undefined);
    try {
      await target.whenSynced;
      // Applied after loading: each one is stored by the persistence
      Y.applyUpdate(doc, Y.mergeUpdates(updates));
    } finally {
      await target.destroy();
      doc.destroy();
    }
  }
  markAdopted(dossierId);
  if (await legacyIsOurs(names, dossierId)) await deleteIdbDatabase(ydocDatabaseName(dossierId), 2000).catch(() => undefined);
  return true;
}

/** Erases the companion's copy, and an older copy when it is not the desktop's */
export async function deleteLocalCopy(dossierId: string, blockedTimeoutMs: number): Promise<void> {
  await deleteIdbDatabase(companionYdocDatabaseName(dossierId), blockedTimeoutMs);
  const names = await databaseNames();
  if (names && await legacyIsOurs(names, dossierId)) await deleteIdbDatabase(ydocDatabaseName(dossierId), blockedTimeoutMs);
}
