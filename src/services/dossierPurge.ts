import { db } from '../db/database';
import type { DossierId } from '../types';

/**
 * Removal of every trace of a dossier from this browser, and the check that
 * nothing is left. The check reads each place where ZN stores dossier data
 * again after deletion and records what it found in a receipt.
 *
 * What the receipt cannot cover: browser storage is deleted logically, so the
 * bytes stay on disk until the browser compacts it; files the user exported;
 * copies on other devices or on a collaboration relay; data plugins keep
 * outside pluginData (they clean up on `dossier:deleted`).
 */

/** Dexie tables holding rows scoped to a dossier (dossierRepository.delete clears them) */
export const DOSSIER_SCOPED_TABLES = [
  'elements', 'links', 'assets', 'views', 'reports', 'canvasTabs',
  'pluginData', 'savedQueries', 'comments',
] as const;

/** localStorage keys that carry a dossier id */
const LOCAL_STORAGE_PREFIXES = ['viewport_', 'zn:suggestions:excludedKeys:'] as const;

/** OPFS folders that may hold a dossier's files (`investigations` is the legacy name) */
const OPFS_DIRS = ['dossiers', 'investigations'] as const;

export const ydocDatabaseName = (dossierId: string) => `zeroneurone-ydoc-${dossierId}`;

export interface PurgeCheck {
  /** Where: `dexie:<table>`, `opfs:<dir>`, `indexeddb:ydoc`, `localStorage` */
  store: string;
  /** What is left there (rows, folders, databases or keys); null when it could not be checked */
  remaining: number | null;
  error?: string;
}

export interface PurgeReceipt {
  dossierId: string;
  /** ISO date of the check */
  checkedAt: string;
  checks: PurgeCheck[];
  /** True when every place was checked and found empty */
  ok: boolean;
}

export function dossierLocalStorageKeys(dossierId: string): string[] {
  return LOCAL_STORAGE_PREFIXES.map((prefix) => `${prefix}${dossierId}`);
}

export function removeDossierLocalStorage(dossierId: string): void {
  for (const key of dossierLocalStorageKeys(dossierId)) {
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
  }
}

/** Every localStorage key that belongs to some dossier (for a full purge) */
export function removeAllDossierLocalStorage(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch { /* storage unavailable */ }
}

/** Remove the dossier's OPFS folders (current and legacy); a missing folder is not an error */
export async function removeDossierOpfs(dossierId: string): Promise<void> {
  let root: FileSystemDirectoryHandle;
  try {
    root = await navigator.storage.getDirectory();
  } catch {
    return; // OPFS not available: nothing can have been stored there
  }
  for (const dirName of OPFS_DIRS) {
    const dir = await root.getDirectoryHandle(dirName).catch(() => null);
    if (!dir) continue;
    await dir.removeEntry(dossierId, { recursive: true }).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
    });
  }
}

/**
 * Delete the dossier's Y.js database. When another connection still holds it,
 * the browser reports "blocked" and deletes it as soon as that connection
 * closes: wait for that, up to `blockedTimeoutMs`.
 */
export function deleteYDocDatabase(dossierId: string, blockedTimeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const request = indexedDB.deleteDatabase(ydocDatabaseName(dossierId));
    request.onsuccess = () => { if (timer) clearTimeout(timer); resolve(); };
    request.onerror = () => { if (timer) clearTimeout(timer); reject(request.error); };
    request.onblocked = () => {
      timer = setTimeout(() => reject(new Error('Y.js database still in use')), blockedTimeoutMs);
    };
  });
}

async function checkDexie(dossierId: string): Promise<PurgeCheck[]> {
  const checks: PurgeCheck[] = [];
  const dossierRow = await db.dossiers.get(dossierId as DossierId).then((d) => (d ? 1 : 0), () => null);
  checks.push({ store: 'dexie:dossiers', remaining: dossierRow });
  for (const table of DOSSIER_SCOPED_TABLES) {
    try {
      const remaining = await db.table(table).where('dossierId').equals(dossierId).count();
      checks.push({ store: `dexie:${table}`, remaining });
    } catch (error) {
      checks.push({ store: `dexie:${table}`, remaining: null, error: String(error) });
    }
  }
  return checks;
}

async function checkOpfs(dossierId: string): Promise<PurgeCheck[]> {
  let root: FileSystemDirectoryHandle;
  try {
    root = await navigator.storage.getDirectory();
  } catch {
    // No OPFS in this browser: ZN cannot have stored files there
    return OPFS_DIRS.map((dir) => ({ store: `opfs:${dir}`, remaining: 0 }));
  }
  const checks: PurgeCheck[] = [];
  for (const dirName of OPFS_DIRS) {
    try {
      const dir = await root.getDirectoryHandle(dirName).catch(() => null);
      const found = dir ? await dir.getDirectoryHandle(dossierId).then(() => 1, () => 0) : 0;
      checks.push({ store: `opfs:${dirName}`, remaining: found });
    } catch (error) {
      checks.push({ store: `opfs:${dirName}`, remaining: null, error: String(error) });
    }
  }
  return checks;
}

async function checkYDoc(dossierId: string): Promise<PurgeCheck> {
  const store = 'indexeddb:ydoc';
  if (typeof indexedDB.databases !== 'function') {
    return { store, remaining: null, error: 'indexedDB.databases() unsupported' };
  }
  try {
    const name = ydocDatabaseName(dossierId);
    const found = (await indexedDB.databases()).filter((d) => d.name === name).length;
    return { store, remaining: found };
  } catch (error) {
    return { store, remaining: null, error: String(error) };
  }
}

function checkLocalStorage(dossierId: string): PurgeCheck {
  try {
    const remaining = dossierLocalStorageKeys(dossierId)
      .filter((key) => localStorage.getItem(key) !== null).length;
    return { store: 'localStorage', remaining };
  } catch (error) {
    return { store: 'localStorage', remaining: null, error: String(error) };
  }
}

/** Look again in every place a dossier's data lives and report what is left */
export async function verifyDossierPurged(dossierId: string): Promise<PurgeReceipt> {
  const checks = [
    ...(await checkDexie(dossierId)),
    ...(await checkOpfs(dossierId)),
    await checkYDoc(dossierId),
    checkLocalStorage(dossierId),
  ];
  return {
    dossierId,
    checkedAt: new Date().toISOString(),
    checks,
    ok: checks.every((check) => check.remaining === 0),
  };
}
