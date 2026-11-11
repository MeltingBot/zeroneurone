/**
 * Shares received from Android ("Share to ZeroNeurone"): kept by the service
 * worker (public/share-target-sw.js, same format) until a capture uses them.
 * With the lock on, the service worker encrypts them to the lock's public
 * key: only the unlocked companion opens them.
 */

import { shareKey } from './lockState';

const SHARE_DB = 'zeroneurone-companion-share';
const SHARE_STORE = 'shares';
/** The public key shares are encrypted to while the lock is on */
const KEY_STORE = 'keys';
/** A share not used within a day is dropped */
const MAX_AGE_MS = 24 * 3600 * 1000;

export interface SharedFile {
  name: string;
  type: string;
  blob: Blob;
}

export interface SharedItem {
  id: string;
  title: string;
  text: string;
  url: string;
  files: SharedFile[];
  createdAt: number;
}

interface Encrypted { iv: Uint8Array; data: ArrayBuffer }

/** A share the service worker encrypted to the lock's public key */
interface SealedRecord {
  id: string;
  createdAt: number;
  sealed: { epk: JsonWebKey; meta: Encrypted; files: Encrypted[] };
}

type StoredShare = SharedItem | SealedRecord;

function openShareDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARE_DB, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SHARE_STORE)) db.createObjectStore(SHARE_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void, store = SHARE_STORE): Promise<T | undefined> {
  const db = await openShareDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = run(tx.objectStore(store));
      tx.oncomplete = () => resolve(request ? request.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** The public key the service worker encrypts shares to; null takes it away */
export async function setSharePublicKey(jwk: JsonWebKey | null): Promise<void> {
  await withStore('readwrite', (store) => { if (jwk) store.put(jwk, 'public'); else store.delete('public'); }, KEY_STORE);
}

/** Every share waiting, read or not ("Forget everything", lock turned on or off) */
export async function dropAllShares(): Promise<void> {
  await withStore('readwrite', (store) => { store.clear(); });
}

async function openSealed(record: SealedRecord, privateKey: CryptoKey): Promise<SharedItem> {
  const { epk, meta, files } = record.sealed;
  const sender = await crypto.subtle.importKey('jwk', epk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const key = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: sender }, privateKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
  );
  const decrypt = (e: Encrypted) => crypto.subtle.decrypt({ name: 'AES-GCM', iv: e.iv as Uint8Array<ArrayBuffer> }, key, e.data);
  const fields = JSON.parse(new TextDecoder().decode(await decrypt(meta))) as {
    title: string; text: string; url: string; files: { name: string; type: string }[];
  };
  const blobs = await Promise.all(files.map(decrypt));
  return {
    id: record.id,
    createdAt: record.createdAt,
    title: fields.title,
    text: fields.text,
    url: fields.url,
    files: fields.files.map((f, i) => ({ ...f, blob: new Blob([blobs[i]], { type: f.type }) })),
  };
}

/** The share, opened with the lock's private key when it is encrypted (null while locked) */
export async function readShare(id: string): Promise<SharedItem | null> {
  const stored = await withStore<StoredShare>('readonly', (store) => store.get(id));
  if (!stored) return null;
  if (!('sealed' in stored)) return stored;
  const privateKey = shareKey();
  return privateKey ? openSealed(stored, privateKey) : null;
}

export async function keepShare(item: SharedItem): Promise<void> {
  await withStore('readwrite', (store) => { store.put(item); });
}

export async function deleteShare(id: string): Promise<void> {
  await withStore('readwrite', (store) => { store.delete(id); });
}

/** Drops shares left unused (the capture was not saved) */
export async function dropOldShares(now = Date.now()): Promise<void> {
  const all = (await withStore<StoredShare[]>('readonly', (store) => store.getAll())) ?? [];
  const old = all.filter((s) => now - s.createdAt > MAX_AGE_MS);
  if (old.length > 0) await withStore('readwrite', (store) => { for (const s of old) store.delete(s.id); });
}

const URL_ONLY = /^\s*(https?:\/\/\S+)\s*$/i;

/**
 * The capture form filled from a share. Android often sends a link in the
 * text rather than in the url field: a text that is only a link becomes the
 * source. Otherwise the text is the note, and the link its source.
 */
export function captureFromShare(item: Pick<SharedItem, 'title' | 'text' | 'url'>): { label: string; notes: string; source: string } {
  const title = item.title.trim();
  const text = item.text.trim();
  const url = item.url.trim();
  const textUrl = text.match(URL_ONLY)?.[1] ?? null;
  const source = url || textUrl || (text.match(/https?:\/\/\S+/i)?.[0] ?? '');
  const notes = textUrl || text === title ? '' : text;
  return { label: title, notes, source };
}
