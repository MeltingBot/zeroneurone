import type { Page } from '@playwright/test';

/**
 * Count and total size of the stored updates of every dossier Y.js database
 * (`zeroneurone-ydoc-`), or of every files document (`zeroneurone-files-`).
 */
export async function ydocStorage(page: Page, prefix = 'zeroneurone-ydoc-') {
  return page.evaluate(async (prefix) => {
    const result: { count: number; bytes: number }[] = [];
    for (const { name } of await indexedDB.databases()) {
      if (!name?.startsWith(prefix)) continue;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(name);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const all = await new Promise<Uint8Array[]>((resolve) => {
        const req = db.transaction('updates').objectStore('updates').getAll();
        req.onsuccess = () => resolve(req.result);
      });
      db.close();
      result.push({ count: all.length, bytes: all.reduce((s, u) => s + u.byteLength, 0) });
    }
    return result;
  }, prefix);
}
