// Node environment, not jsdom: under jsdom the bytes read back from
// fake-indexeddb come from another realm and tweetnacl rejects them.
import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';
import { EncryptedIndexeddbPersistence } from './encryptedIndexeddbPersistence';

const KEY_A = new Uint8Array(32).fill(1);
const KEY_B = new Uint8Array(32).fill(2);
let counter = 0;

async function open(dbName: string, key?: Uint8Array) {
  const doc = new Y.Doc();
  const provider = new EncryptedIndexeddbPersistence(dbName, doc, key);
  await provider.whenSynced;
  return { doc, provider };
}

async function write(dbName: string, key: Uint8Array | undefined, labels: string[]) {
  const { doc, provider } = await open(dbName, key);
  for (const label of labels) doc.getMap('elements').set(label, label);
  await provider.compact();
  await provider.destroy();
}

describe('EncryptedIndexeddbPersistence', () => {
  it('round-trips encrypted updates with the right key', async () => {
    const dbName = `zn-persist-test-${++counter}`;
    await write(dbName, KEY_A, ['a', 'b']);
    const { doc, provider } = await open(dbName, KEY_A);
    expect([...doc.getMap('elements').keys()].sort()).toEqual(['a', 'b']);
    expect(provider._undecryptableCount).toBe(0);
    await provider.destroy();
  });

  it('keeps updates it cannot decrypt instead of compacting them away', async () => {
    const dbName = `zn-persist-test-${++counter}`;
    await write(dbName, KEY_A, ['a', 'b']);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrong = await open(dbName, KEY_B);
    expect(wrong.provider._undecryptableCount).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalled();
    wrong.doc.getMap('elements').set('c', 'c');
    await wrong.provider.compact();
    await wrong.provider.destroy();

    const noKey = await open(dbName);
    expect(noKey.provider._undecryptableCount).toBeGreaterThan(0);
    await noKey.provider.compact();
    await noKey.provider.destroy();
    warn.mockRestore();

    const { doc, provider } = await open(dbName, KEY_A);
    expect(doc.getMap('elements').get('a')).toBe('a');
    expect(doc.getMap('elements').get('b')).toBe('b');
    await provider.destroy();
  });

  it('rejects whenSynced when the database cannot be opened', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const openSpy = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('quota');
    });
    try {
      const provider = new EncryptedIndexeddbPersistence(`zn-persist-test-${++counter}`, new Y.Doc());
      await expect(provider.whenSynced).rejects.toThrow('quota');
      await expect(provider.destroy()).resolves.toBeUndefined();
    } finally {
      openSpy.mockRestore();
      error.mockRestore();
    }
  });
});
