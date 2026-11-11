/**
 * Shares received from Android ("Share to ZeroNeurone"): kept by the service
 * worker (public/share-target-sw.js, same format) until a capture uses them.
 */

const SHARE_DB = 'zeroneurone-companion-share';
const SHARE_STORE = 'shares';
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

function openShareDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(SHARE_STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openShareDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(SHARE_STORE, mode);
      const request = run(tx.objectStore(SHARE_STORE));
      tx.oncomplete = () => resolve(request ? request.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function readShare(id: string): Promise<SharedItem | null> {
  const item = await withStore<SharedItem>('readonly', (store) => store.get(id));
  return item ?? null;
}

export async function keepShare(item: SharedItem): Promise<void> {
  await withStore('readwrite', (store) => { store.put(item); });
}

export async function deleteShare(id: string): Promise<void> {
  await withStore('readwrite', (store) => { store.delete(id); });
}

/** Drops shares left unused (the capture was not saved) */
export async function dropOldShares(now = Date.now()): Promise<void> {
  const all = (await withStore<SharedItem[]>('readonly', (store) => store.getAll())) ?? [];
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
