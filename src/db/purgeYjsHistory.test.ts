// Node environment, not jsdom: under jsdom the bytes read back from
// fake-indexeddb come from another realm, tweetnacl rejects them and every
// encrypted database reads as empty.
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Y from 'yjs';

vi.mock('../services/syncService', () => ({
  syncService: { getDossierId: () => null, isOpen: () => false, close: vi.fn() },
}));

// OPFS is out of reach here: files are served from this map, by asset id
const opfsFiles = new Map<string, Uint8Array<ArrayBuffer>>();
vi.mock('../services/fileService', () => ({
  fileService: {
    getAssetFile: async (asset: { id: string }) => {
      const data = opfsFiles.get(asset.id);
      if (!data) throw new Error('missing');
      return new Blob([data]);
    },
  },
}));

import { db, purgeYjsHistory } from './database';
import { EncryptedIndexeddbPersistence } from '../services/encryption/encryptedIndexeddbPersistence';
import { ydocFingerprint } from '../services/yjs/rebuildYdoc';
import { useEncryptionStore } from '../stores/encryptionStore';
import type { Asset, Dossier } from '../types';

const DEK = new Uint8Array(32).fill(3);
let counter = 0;

/** A dossier database after a long editing session. */
async function seed(dek: Uint8Array | null): Promise<{ dbName: string; fingerprint: string }> {
  const dbName = `zeroneurone-ydoc-test-${++counter}`;
  const doc = new Y.Doc();
  const provider = new EncryptedIndexeddbPersistence(dbName, doc, dek ?? undefined);
  await provider.whenSynced;
  const elements = doc.getMap('elements');
  doc.transact(() => {
    for (let i = 0; i < 40; i++) {
      const el = new Y.Map();
      elements.set(`e${i}`, el);
      el.set('label', `Element ${i}`);
      const notes = new Y.Text();
      el.set('notes', notes);
      notes.insert(0, 'note', { italic: true });
    }
  });
  for (let round = 0; round < 15; round++) {
    elements.forEach((el) => doc.transact(() => (el as Y.Map<unknown>).set('positionX', Math.random())));
  }
  await provider.compact();
  const fingerprint = ydocFingerprint(doc);
  await provider.destroy();
  return { dbName, fingerprint };
}

async function load(dbName: string, dek: Uint8Array | null) {
  const doc = new Y.Doc();
  const provider = new EncryptedIndexeddbPersistence(dbName, doc, dek ?? undefined);
  await provider.whenSynced;
  const fingerprint = ydocFingerprint(doc);
  await provider.destroy();
  return fingerprint;
}

describe('purgeYjsHistory', () => {
  beforeEach(async () => {
    await db.open();
    await db.dossiers.clear();
    await db.assets.clear();
    opfsFiles.clear();
    useEncryptionStore.setState({ dek: null });
  });

  it('frees space and keeps the content of a plain database', async () => {
    const { dbName, fingerprint } = await seed(null);
    const result = await purgeYjsHistory(dbName);
    expect(result.status).toBe('done');
    if (result.status !== 'done') return;
    expect(result.after).toBeLessThan(result.before * 0.8);
    expect(await load(dbName, null)).toBe(fingerprint);
  });

  it('keeps an encrypted database encrypted and readable', async () => {
    useEncryptionStore.setState({ dek: DEK });
    const { dbName, fingerprint } = await seed(DEK);
    expect((await purgeYjsHistory(dbName)).status).toBe('done');
    expect(await load(dbName, DEK)).toBe(fingerprint);
  });

  it('leaves an encrypted database alone without the key', async () => {
    const { dbName, fingerprint } = await seed(DEK);
    expect(await purgeYjsHistory(dbName)).toEqual({ status: 'failed', reason: 'undecryptable' });
    expect(await load(dbName, DEK)).toBe(fingerprint);
  });

  it('drops file copies verified in OPFS, and only those', async () => {
    const { dbName } = await seed(null);
    const dossierId = dbName.replace('zeroneurone-ydoc-', '');
    const sha256 = async (data: Uint8Array<ArrayBuffer>) => Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', data)),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('');

    // Three files copied into the Y.Doc: one intact in OPFS, one whose OPFS
    // copy differs, one missing from OPFS
    const files = ['intact', 'altered', 'missing'].map((id, i) => ({ id, data: new Uint8Array(200_000).fill(i + 1) }));
    const doc = new Y.Doc();
    const provider = new EncryptedIndexeddbPersistence(dbName, doc);
    await provider.whenSynced;
    for (const { id, data } of files) {
      const entry = new Y.Map();
      doc.getMap('assets').set(id, entry);
      entry.set('id', id);
      entry.set('hash', await sha256(data));
      const chunks = new Y.Array<Uint8Array>();
      entry.set('chunks', chunks);
      chunks.push([data]);
      await db.assets.put({ id, dossierId, hash: await sha256(data) } as Asset);
    }
    await provider.compact();
    await provider.destroy();
    opfsFiles.set('intact', files[0].data);
    opfsFiles.set('altered', new Uint8Array(200_000).fill(9));

    const result = await purgeYjsHistory(dbName);
    expect(result.status).toBe('done');
    if (result.status !== 'done') return;
    expect(result.before - result.after).toBeGreaterThan(190_000);

    const reloaded = new Y.Doc();
    const check = new EncryptedIndexeddbPersistence(dbName, reloaded);
    await check.whenSynced;
    expect([...reloaded.getMap('assets').keys()].sort()).toEqual(['altered', 'missing']);
    await check.destroy();
  });

  it('skips a shared dossier', async () => {
    const { dbName } = await seed(null);
    const id = dbName.replace('zeroneurone-ydoc-', '');
    await db.dossiers.put({ id, name: 'Partagé', lastSharedKey: 'secret' } as Dossier);
    expect(await purgeYjsHistory(dbName)).toEqual({ status: 'skipped', reason: 'shared' });
  });
});
