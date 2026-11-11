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
/** With the companion's lock on: the public key shares are encrypted to */
const KEY_STORE = 'keys';

function openShareDb() {
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

function request(db, store, mode, run) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = run(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Encrypts the share to the companion's public key (ECDH P-256, then
 * AES-GCM): only an unlocked companion, holding the private key, reads it.
 */
async function sealShare(publicJwk, meta, blobs) {
  const curve = { name: 'ECDH', namedCurve: 'P-256' };
  const recipient = await self.crypto.subtle.importKey('jwk', publicJwk, curve, false, []);
  const ephemeral = await self.crypto.subtle.generateKey(curve, true, ['deriveKey']);
  const key = await self.crypto.subtle.deriveKey(
    { name: 'ECDH', public: recipient }, ephemeral.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt'],
  );
  const encrypt = async (data) => {
    const iv = self.crypto.getRandomValues(new Uint8Array(12));
    return { iv, data: await self.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data) };
  };
  const files = [];
  for (const blob of blobs) files.push(await encrypt(await blob.arrayBuffer()));
  return {
    epk: await self.crypto.subtle.exportKey('jwk', ephemeral.publicKey),
    meta: await encrypt(new TextEncoder().encode(JSON.stringify(meta))),
    files,
  };
}

async function keepShare(share) {
  const db = await openShareDb();
  try {
    const publicJwk = await request(db, KEY_STORE, 'readonly', (store) => store.get('public'));
    let record = share;
    if (publicJwk) {
      const meta = { title: share.title, text: share.text, url: share.url, files: share.files.map((f) => ({ name: f.name, type: f.type })) };
      record = { id: share.id, createdAt: share.createdAt, sealed: await sealShare(publicJwk, meta, share.files.map((f) => f.blob)) };
    }
    await request(db, SHARE_STORE, 'readwrite', (store) => { store.put(record); });
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
