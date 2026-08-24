// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import Dexie from 'dexie';

/**
 * Version 14 collects savedQueries and comments left behind by the incomplete
 * dossier delete (lot S2). It runs on every existing database, so it is worth
 * exercising against a real v13 schema rather than trusting it by inspection.
 */

const DB_NAME = 'zeroneurone';

// Minimal v13 schema: only the tables this migration reads or writes.
function legacyDb() {
  const db = new Dexie(DB_NAME);
  db.version(13).stores({
    dossiers: 'id, name, updatedAt',
    savedQueries: 'id, dossierId, createdAt',
    comments: 'id, dossierId, targetId, createdAt',
  });
  return db;
}

let upgraded: typeof import('./database').db;

beforeAll(async () => {
  // 1. Build a database as it exists before the upgrade.
  const old = legacyDb();
  await old.open();
  await old.table('dossiers').bulkAdd([
    { id: 'live', name: 'Still open' },
    { id: 'live2', name: 'Also open' },
  ]);
  await old.table('savedQueries').bulkAdd([
    { id: 'q-live', dossierId: 'live', name: 'kept' },
    { id: 'q-orphan', dossierId: 'deleted-long-ago', name: 'orphan' },
    { id: 'q-nodossier', name: 'no dossierId at all' },
  ]);
  await old.table('comments').bulkAdd([
    { id: 'c-live', dossierId: 'live2', targetId: 't1' },
    { id: 'c-orphan', dossierId: 'deleted-long-ago', targetId: 't2' },
  ]);
  old.close();

  // 2. Opening the app database triggers the upgrade chain up to v14.
  ({ db: upgraded } = await import('./database'));
  await upgraded.open();
});

describe('database migration v14', () => {
  it('removes rows whose dossier no longer exists', async () => {
    expect(await upgraded.savedQueries.get('q-orphan')).toBeUndefined();
    expect(await upgraded.comments.get('c-orphan')).toBeUndefined();
  });

  it('removes rows that carry no dossier at all', async () => {
    expect(await upgraded.savedQueries.get('q-nodossier')).toBeUndefined();
  });

  it('keeps rows attached to a dossier that still exists', async () => {
    expect(await upgraded.savedQueries.get('q-live')).toBeDefined();
    expect(await upgraded.comments.get('c-live')).toBeDefined();
  });

  it('leaves the dossiers themselves untouched', async () => {
    expect(await upgraded.dossiers.count()).toBe(2);
  });

  it('reaches at least version 14', () => {
    // Dexie reports the version in its own units (schema version * 10).
    expect(upgraded.verno).toBeGreaterThanOrEqual(14);
  });
});
