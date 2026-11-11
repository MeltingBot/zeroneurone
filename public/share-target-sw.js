/*
 * "Share to ZeroNeurone" (Android, companion installed): the system posts the
 * shared title, text, link and files to m/share (share_target in
 * companion.webmanifest). Loaded into the service worker by Workbox
 * (importScripts in vite.config.ts): keeps the share in IndexedDB, then sends
 * the companion to m/share?id=… where a dossier is picked.
 * The format is read by src/companion/shareInbox.ts: keep both in step.
 */

const SHARE_DB = 'zeroneurone-companion-share';
const SHARE_STORE = 'shares';

function openShareDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(SHARE_STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function keepShare(record) {
  const db = await openShareDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(SHARE_STORE, 'readwrite');
      tx.objectStore(SHARE_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || !url.pathname.endsWith('/m/share')) return;
  event.respondWith((async () => {
    const id = self.crypto.randomUUID();
    try {
      const form = await event.request.formData();
      const text = (name) => (typeof form.get(name) === 'string' ? form.get(name) : '');
      const files = form.getAll('files')
        .filter((f) => typeof f === 'object' && f && f.size > 0)
        .map((f) => ({ name: f.name || 'fichier', type: f.type || '', blob: f }));
      await keepShare({ id, title: text('title'), text: text('text'), url: text('url'), files, createdAt: Date.now() });
    } catch (err) {
      console.warn('[Share] not kept:', err);
    }
    // 303: the companion opens with a GET, the share waiting under its id
    return Response.redirect(new URL(`share?id=${id}`, url).href, 303);
  })());
});
