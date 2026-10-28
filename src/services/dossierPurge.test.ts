// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/database';
import { dossierRepository } from '../db/repositories/dossierRepository';
import {
  DOSSIER_SCOPED_TABLES,
  deleteYDocDatabase,
  dossierLocalStorageKeys,
  removeAllDossierLocalStorage,
  removeDossierLocalStorage,
  verifyDossierPurged,
  ydocDatabaseName,
} from './dossierPurge';

async function seedDossier(id: string) {
  await db.dossiers.add({ id, name: id } as never);
  for (const table of DOSSIER_SCOPED_TABLES) {
    const row = table === 'pluginData'
      ? { pluginId: 'p', investigationId: id, dossierId: id, key: 'k', value: 1 }
      : { id: `${table}-${id}`, dossierId: id };
    await db.table(table).add(row as never);
  }
  for (const key of dossierLocalStorageKeys(id)) localStorage.setItem(key, '{}');
}

function openYDoc(id: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ydocDatabaseName(id));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const remaining = (receipt: Awaited<ReturnType<typeof verifyDossierPurged>>, store: string) =>
  receipt.checks.find((c) => c.store === store)?.remaining;

describe('dossierPurge', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    localStorage.clear();
  });

  it('reports every place where a dossier still has data', async () => {
    await seedDossier('A');
    (await openYDoc('A')).close();

    const receipt = await verifyDossierPurged('A');
    expect(receipt.ok).toBe(false);
    expect(remaining(receipt, 'dexie:dossiers')).toBe(1);
    for (const table of DOSSIER_SCOPED_TABLES) expect(remaining(receipt, `dexie:${table}`)).toBe(1);
    expect(remaining(receipt, 'indexeddb:ydoc')).toBe(1);
    expect(remaining(receipt, 'localStorage')).toBe(2);
  });

  it('gives a clean receipt once everything is removed, without touching other dossiers', async () => {
    await seedDossier('A');
    await seedDossier('B');
    (await openYDoc('A')).close();

    await deleteYDocDatabase('A');
    await dossierRepository.delete('A' as never);
    removeDossierLocalStorage('A');

    const receipt = await verifyDossierPurged('A');
    expect(receipt.checks.filter((c) => c.remaining !== 0)).toEqual([]);
    expect(receipt.ok).toBe(true);
    expect((await verifyDossierPurged('B')).ok).toBe(false);
  });

  it('waits for a blocked Y.js database to be released', async () => {
    const conn = await openYDoc('A');
    conn.onversionchange = () => setTimeout(() => conn.close(), 20);
    await deleteYDocDatabase('A');
    expect(remaining(await verifyDossierPurged('A'), 'indexeddb:ydoc')).toBe(0);
  });

  it('gives up on a Y.js database that stays open', async () => {
    await openYDoc('A'); // never closed, ignores versionchange
    await expect(deleteYDocDatabase('A', 50)).rejects.toThrow();
  });

  it('full purge removes the dossier keys only', () => {
    localStorage.setItem('viewport_X', '{}');
    localStorage.setItem('zn:suggestions:excludedKeys:Y', '[]');
    localStorage.setItem('zeroneurone-user', '{}');
    removeAllDossierLocalStorage();
    expect(localStorage.getItem('viewport_X')).toBeNull();
    expect(localStorage.getItem('zn:suggestions:excludedKeys:Y')).toBeNull();
    expect(localStorage.getItem('zeroneurone-user')).toBe('{}');
  });
});
