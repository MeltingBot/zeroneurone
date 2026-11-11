import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { captureFromShare, deleteShare, dropOldShares, keepShare, readShare, setSharePublicKey } from './shareInbox';
import { setUnlocked } from './lockState';

/** Runs public/share-target-sw.js against a fake worker scope; returns its fetch handler */
function loadShareWorker(): (event: { request: Request; respondWith: (r: Promise<Response>) => void }) => void {
  let handler: ((event: never) => void) | null = null;
  const scope = {
    addEventListener: (type: string, fn: (event: never) => void) => { if (type === 'fetch') handler = fn; },
    crypto: globalThis.crypto,
  };
  const code = readFileSync(join(__dirname, '../../public/share-target-sw.js'), 'utf8');
  new Function('self', 'indexedDB', 'Response', code)(scope, indexedDB, Response);
  if (!handler) throw new Error('No fetch handler');
  return handler;
}

describe('share to ZeroNeurone', () => {
  it('fills the capture from what Android sends', () => {
    // A link alone in the text (what most apps send): it is the source
    expect(captureFromShare({ title: 'Article', text: 'https://example.org/a', url: '' }))
      .toEqual({ label: 'Article', notes: '', source: 'https://example.org/a' });
    // A text with a link in it: the text is the note, the link its source
    expect(captureFromShare({ title: '', text: 'Vu ici https://example.org/b ce matin', url: '' }))
      .toEqual({ label: '', notes: 'Vu ici https://example.org/b ce matin', source: 'https://example.org/b' });
    expect(captureFromShare({ title: 'Page', text: 'Page', url: 'https://example.org/c' }))
      .toEqual({ label: 'Page', notes: '', source: 'https://example.org/c' });
  });

  it('keeps what the service worker received, for the companion to read', async () => {
    const fetchHandler = loadShareWorker();
    const form = new FormData();
    form.set('title', 'Photo terrain');
    form.set('text', 'https://example.org/photo');
    form.append('files', new File([new Uint8Array([1, 2, 3])], 'p.jpg', { type: 'image/jpeg' }));
    let response: Promise<Response> | null = null;
    fetchHandler({
      request: new Request('https://zn.example/m/share', { method: 'POST', body: form }),
      respondWith: (r) => { response = r; },
    });
    const res = await response!;
    expect(res.status).toBe(303);
    const id = new URL(res.headers.get('location')!).searchParams.get('id')!;
    expect(new URL(res.headers.get('location')!).pathname).toBe('/m/share');

    const item = await readShare(id);
    expect(item).toMatchObject({ title: 'Photo terrain', text: 'https://example.org/photo', url: '' });
    expect(item!.files.map((f) => [f.name, f.type, f.blob.size])).toEqual([['p.jpg', 'image/jpeg', 3]]);
    await deleteShare(id);
    expect(await readShare(id)).toBeNull();
  });

  it('with the lock on, keeps the share encrypted: unreadable until unlocked', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']) as CryptoKeyPair;
    await setSharePublicKey(await crypto.subtle.exportKey('jwk', pair.publicKey));
    const fetchHandler = loadShareWorker();
    const form = new FormData();
    form.set('title', 'Secret');
    form.set('text', 'Note confidentielle');
    form.append('files', new File([new Uint8Array([9, 8, 7, 6])], 'x.jpg', { type: 'image/jpeg' }));
    let response: Promise<Response> | null = null;
    fetchHandler({ request: new Request('https://zn.example/m/share', { method: 'POST', body: form }), respondWith: (r) => { response = r; } });
    const id = new URL((await response!).headers.get('location')!).searchParams.get('id')!;

    // Stored without any readable field
    const raw = await new Promise<Record<string, unknown>>((resolve) => {
      indexedDB.open('zeroneurone-companion-share', 2).onsuccess = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        const req = db.transaction('shares').objectStore('shares').get(id);
        req.onsuccess = () => { db.close(); resolve(req.result); };
      };
    });
    expect(JSON.stringify(raw)).not.toContain('Secret');
    expect(raw).not.toHaveProperty('title');

    setUnlocked(null, null);
    expect(await readShare(id)).toBeNull();
    setUnlocked(new Uint8Array(32), pair.privateKey);
    const item = await readShare(id);
    expect(item).toMatchObject({ title: 'Secret', text: 'Note confidentielle' });
    expect(new Uint8Array(await item!.files[0].blob.arrayBuffer())).toEqual(new Uint8Array([9, 8, 7, 6]));
    setUnlocked(null, null);
    await setSharePublicKey(null);
  });

  it('leaves other requests to the service worker', () => {
    const fetchHandler = loadShareWorker();
    let answered = false;
    fetchHandler({ request: new Request('https://zn.example/m/share'), respondWith: () => { answered = true; } });
    fetchHandler({ request: new Request('https://zn.example/api', { method: 'POST', body: 'x' }), respondWith: () => { answered = true; } });
    expect(answered).toBe(false);
  });

  it('drops shares left unused for a day', async () => {
    await keepShare({ id: 'old', title: '', text: 'x', url: '', files: [], createdAt: 0 });
    await keepShare({ id: 'new', title: '', text: 'y', url: '', files: [], createdAt: Date.now() });
    await dropOldShares();
    expect(await readShare('old')).toBeNull();
    expect(await readShare('new')).not.toBeNull();
  });
});
