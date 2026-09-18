// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// A failing dossier is the whole point of these tests: migrateToPlaintext is
// what throws on data the DEK cannot decrypt.
const migrateToPlaintext = vi.fn();
const migrateToEncrypted = vi.fn();
const countUndecryptableUpdates = vi.fn();

vi.mock('./encryptedIndexeddbPersistence', () => ({
  migrateToPlaintext: (...a: unknown[]) => migrateToPlaintext(...a),
  migrateToEncrypted: (...a: unknown[]) => migrateToEncrypted(...a),
  countUndecryptableUpdates: (...a: unknown[]) => countUndecryptableUpdates(...a),
}));

vi.mock('../syncService', () => ({
  syncService: { setAtRestDek: vi.fn() },
}));

vi.mock('../../plugins/pluginAPI', () => ({
  runBeforeDisableHooks: vi.fn().mockResolvedValue(undefined),
}));

import { db } from '../../db/database';
import { disableEncryption, PartialMigrationError } from './migrationService';

const DEK = new Uint8Array(32).fill(7);

async function seed() {
  await db.open();
  await db._encryptionMeta.clear();
  await db.dossiers.clear();
  await db.assets.clear();
  await db._encryptionMeta.put({
    id: 'main',
    salt: new ArrayBuffer(16),
    encryptedDEK: new ArrayBuffer(48),
    dekIV: new ArrayBuffer(12),
    version: 2,
    createdAt: new Date().toISOString(),
  });
  await db.dossiers.add({
    id: 'dossier-1',
    name: 'Enquête',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never);
}

describe('disableEncryption', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    countUndecryptableUpdates.mockResolvedValue({ total: 1, undecryptable: 0 });
    await seed();
  });

  it('keeps _encryptionMeta when a dossier fails to decrypt', async () => {
    migrateToPlaintext.mockRejectedValue(new Error('OperationError'));

    await expect(disableEncryption(DEK)).rejects.toBeInstanceOf(PartialMigrationError);

    // The only copy of the encrypted DEK. Deleting it while data is still
    // encrypted made that data unrecoverable, and the failure was only a
    // console.warn away from being invisible.
    const meta = await db._encryptionMeta.get('main');
    expect(meta).toBeDefined();
  });

  it('names the dossier that failed', async () => {
    migrateToPlaintext.mockRejectedValue(new Error('OperationError'));

    await expect(disableEncryption(DEK)).rejects.toMatchObject({
      failures: ['dossier dossier-1'],
    });
  });

  it('removes _encryptionMeta when every dossier migrates cleanly', async () => {
    migrateToPlaintext.mockResolvedValue(undefined);

    await disableEncryption(DEK);

    expect(await db._encryptionMeta.get('main')).toBeUndefined();
  });

  it('refuses upfront when updates are known to be undecryptable', async () => {
    countUndecryptableUpdates.mockResolvedValue({ total: 4, undecryptable: 2 });

    await expect(disableEncryption(DEK)).rejects.toMatchObject({
      name: 'UndecryptableDataError',
    });
    expect(migrateToPlaintext).not.toHaveBeenCalled();
    expect(await db._encryptionMeta.get('main')).toBeDefined();
  });

  it('counts an unreadable database as a loss rather than as zero', async () => {
    // The catch used to swallow this and report zero, one step before the
    // database was destroyed.
    countUndecryptableUpdates.mockRejectedValue(new Error('unreadable'));

    await expect(disableEncryption(DEK)).rejects.toMatchObject({
      name: 'UndecryptableDataError',
    });
    expect(await db._encryptionMeta.get('main')).toBeDefined();
  });
});
