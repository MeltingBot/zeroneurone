import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { CACHE_TTL_MS, cachedFile, cacheFile, dropAllCachedFiles, dropCachedDossier, pruneCache } from './fileCache';
import { setUnlocked } from './lockState';

const bytes = (n: number, fill = 7) => new Uint8Array(n).fill(fill);
const read = async (blob: Blob | null) => (blob ? new Uint8Array(await blob.arrayBuffer()) : null);

afterEach(async () => {
  setUnlocked(null, null);
  await dropAllCachedFiles();
});

describe('companion file cache', () => {
  it('gives back a cached file with its type', async () => {
    await cacheFile('d1', 'a1', 'image/jpeg', bytes(10));
    const blob = await cachedFile('a1');
    expect(blob?.type).toBe('image/jpeg');
    expect(await read(blob)).toEqual(bytes(10));
    expect(await cachedFile('unknown')).toBeNull();
  });

  it('forgets files not opened for 5 days', async () => {
    await cacheFile('d1', 'a1', 'image/jpeg', bytes(10));
    await pruneCache(Date.now() + CACHE_TTL_MS + 1000);
    expect(await cachedFile('a1')).toBeNull();
  });

  it('drops the least recently opened past the size cap', async () => {
    await cacheFile('d1', 'old', 'image/jpeg', bytes(60));
    await new Promise((r) => setTimeout(r, 5));
    await cacheFile('d1', 'new', 'image/jpeg', bytes(60));
    await pruneCache(Date.now(), 100);
    expect(await cachedFile('old')).toBeNull();
    expect(await read(await cachedFile('new'))).toEqual(bytes(60));
  });

  it('encrypts with the lock key and needs it to read', async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    setUnlocked(dek, null);
    await cacheFile('d1', 'a1', 'application/pdf', bytes(16, 3));
    expect(await read(await cachedFile('a1'))).toEqual(bytes(16, 3));
    setUnlocked(null, null);
    expect(await cachedFile('a1')).toBeNull();
  });

  it('forgets one dossier only', async () => {
    await cacheFile('d1', 'a1', 'image/jpeg', bytes(4));
    await cacheFile('d2', 'a2', 'image/jpeg', bytes(4));
    await dropCachedDossier('d1');
    expect(await cachedFile('a1')).toBeNull();
    expect(await cachedFile('a2')).not.toBeNull();
  });
});
