/**
 * Attachments fetched on demand, kept on the phone for a while: 5 days after
 * they were last opened, 200 MB at most (the oldest go first). Encrypted with
 * the lock's data key when the lock is on (AES-GCM).
 */

import { unlockedKey } from './lockState';

const DB = 'zeroneurone-companion-files';
const STORE = 'files';
export const CACHE_TTL_MS = 5 * 24 * 3600 * 1000;
export const CACHE_MAX_BYTES = 200 * 1024 * 1024;

interface CachedFile {
  assetId: string;
  dossierId: string;
  mimeType: string;
  size: number;
  lastOpened: number;
  /** The bytes, or AES-GCM ciphertext with `iv` when the lock is on */
  data: ArrayBuffer;
  iv?: Uint8Array;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'assetId' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = body(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request ? request.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function aesKey(): Promise<CryptoKey | null> {
  const dek = unlockedKey();
  return dek ? crypto.subtle.importKey('raw', Uint8Array.from(dek), 'AES-GCM', false, ['encrypt', 'decrypt']) : null;
}

/** The cached file, or null; opening it counts as using it (its 5 days start again) */
export async function cachedFile(assetId: string): Promise<Blob | null> {
  const entry = await run<CachedFile>('readonly', (s) => s.get(assetId));
  if (!entry || Date.now() - entry.lastOpened > CACHE_TTL_MS) return null;
  let bytes = entry.data;
  if (entry.iv) {
    const key = await aesKey();
    if (!key) return null;
    bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Uint8Array.from(entry.iv) }, key, entry.data);
  }
  await run('readwrite', (s) => { s.put({ ...entry, lastOpened: Date.now() }); });
  return new Blob([bytes], { type: entry.mimeType });
}

export async function cacheFile(dossierId: string, assetId: string, mimeType: string, bytes: Uint8Array): Promise<void> {
  if (bytes.length > CACHE_MAX_BYTES) return;
  const key = await aesKey();
  const plain = bytes.slice().buffer as ArrayBuffer;
  const iv = key ? crypto.getRandomValues(new Uint8Array(12)) : undefined;
  const data = key && iv ? await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain) : plain;
  await run('readwrite', (s) => {
    s.put({ assetId, dossierId, mimeType, size: bytes.length, lastOpened: Date.now(), data, iv } satisfies CachedFile);
  });
  await pruneCache();
}

/** Drops files past 5 days, then the least recently opened past 200 MB */
export async function pruneCache(now = Date.now(), maxBytes = CACHE_MAX_BYTES): Promise<void> {
  const all = (await run<CachedFile[]>('readonly', (s) => s.getAll())) ?? [];
  const keep = all.filter((f) => now - f.lastOpened <= CACHE_TTL_MS).sort((a, b) => b.lastOpened - a.lastOpened);
  const drop = new Set(all.filter((f) => now - f.lastOpened > CACHE_TTL_MS).map((f) => f.assetId));
  let total = 0;
  for (const f of keep) {
    total += f.size;
    if (total > maxBytes) drop.add(f.assetId);
  }
  if (drop.size > 0) await run('readwrite', (s) => { for (const id of drop) s.delete(id); });
}

/** A forgotten dossier's files */
export async function dropCachedDossier(dossierId: string): Promise<void> {
  const all = (await run<CachedFile[]>('readonly', (s) => s.getAll())) ?? [];
  await run('readwrite', (s) => { for (const f of all) if (f.dossierId === dossierId) s.delete(f.assetId); });
}

/** Every cached file (lock turned on or off, "Erase ZeroNeurone dossiers") */
export async function dropAllCachedFiles(): Promise<void> {
  await run('readwrite', (s) => { s.clear(); });
}
