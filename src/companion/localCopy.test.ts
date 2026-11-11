import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { EncryptedIndexeddbPersistence } from '../services/encryption/encryptedIndexeddbPersistence';
import { companionYdocDatabaseName, deleteIdbDatabase, ydocDatabaseName } from '../services/yjs/ydocName';
import { adoptLegacyCopy, deleteLocalCopy } from './localCopy';

const names = async () => (await indexedDB.databases()).map((d) => d.name);

/** Writes a document with one element under `dbName`, as a persistence would */
async function writeCopy(dbName: string, label: string) {
  const doc = new Y.Doc();
  const persistence = new EncryptedIndexeddbPersistence(dbName, doc);
  await persistence.whenSynced;
  doc.getMap('elements').set('e1', label);
  await persistence.destroy();
}

async function readLabel(dbName: string): Promise<unknown> {
  const doc = new Y.Doc();
  const persistence = new EncryptedIndexeddbPersistence(dbName, doc);
  await persistence.whenSynced;
  const label = doc.getMap('elements').get('e1');
  await persistence.destroy();
  return label;
}

/** The desktop's database (src/db/database.ts) holding these dossiers */
function desktopDatabase(dossierIds: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('zeroneurone', 150);
    request.onupgradeneeded = () => request.result.createObjectStore('dossiers', { keyPath: 'id' });
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('dossiers', 'readwrite');
      for (const id of dossierIds) tx.objectStore('dossiers').put({ id, encrypted: 'xxx' });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

describe('companion local copy', () => {
  beforeEach(async () => {
    for (const name of await names()) if (name) await deleteIdbDatabase(name);
  });

  it('keeps its own database name, apart from the desktop one', () => {
    expect(companionYdocDatabaseName('d1')).not.toBe(ydocDatabaseName('d1'));
    // The desktop scans its copies by prefix: the companion's must not match
    expect(companionYdocDatabaseName('d1').startsWith('zeroneurone-ydoc-')).toBe(false);
  });

  it('brings an older copy over and erases it when the browser has no desktop data', async () => {
    await writeCopy(ydocDatabaseName('d1'), 'Capture terrain');
    expect(await adoptLegacyCopy('d1')).toBe(true);
    expect(await readLabel(companionYdocDatabaseName('d1'))).toBe('Capture terrain');
    expect(await names()).not.toContain(ydocDatabaseName('d1'));
  });

  it('leaves the copy alone when the desktop in this browser has that dossier', async () => {
    await writeCopy(ydocDatabaseName('d1'), 'Dossier du poste');
    await desktopDatabase(['d1']);
    await adoptLegacyCopy('d1');
    expect(await readLabel(companionYdocDatabaseName('d1'))).toBe('Dossier du poste');
    expect(await names()).toContain(ydocDatabaseName('d1'));

    await deleteLocalCopy('d1', 1000);
    expect(await names()).not.toContain(companionYdocDatabaseName('d1'));
    expect(await names()).toContain(ydocDatabaseName('d1'));
  });

  it('erases its older copy when the desktop database exists without that dossier', async () => {
    // ZeroNeurone's main address opened on the phone once: an empty desktop database
    await desktopDatabase(['autre-dossier']);
    await writeCopy(ydocDatabaseName('d3'), 'Capture terrain');
    await adoptLegacyCopy('d3');
    expect(await readLabel(companionYdocDatabaseName('d3'))).toBe('Capture terrain');
    expect(await names()).not.toContain(ydocDatabaseName('d3'));
  });

  it('forgets an older copy that is its own, even never opened', async () => {
    await writeCopy(ydocDatabaseName('d2'), 'x');
    await deleteLocalCopy('d2', 1000);
    expect(await names()).not.toContain(ydocDatabaseName('d2'));
  });
});
