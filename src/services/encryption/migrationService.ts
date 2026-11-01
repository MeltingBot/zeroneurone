/**
 * migrationService — migrating existing databases to at-rest encryption
 *
 * Two operations:
 * - enableEncryption: plaintext database → encrypted database
 * - disableEncryption: encrypted database → plaintext database
 *
 * Dexie migration:
 *   The middleware is applied to the open DB. The migration reads each
 *   record (plaintext, no __zn_enc__ prefix) and writes it back
 *   (the middleware encrypts on write). Simple and atomic per table.
 *
 * y-indexeddb migration:
 *   For each dossier, the Yjs updates are read, encrypted and
 *   written back. migrateToEncrypted/migrateToPlaintext live in
 *   encryptedIndexeddbPersistence.ts.
 */

import { db } from '../../db/database';
import { DEFAULT_ENCRYPTED_TABLES } from './dexieEncryptionMiddleware';
import { initializeEncryption } from './encryptionService';
import {
  migrateToEncrypted,
  migrateToPlaintext,
  countUndecryptableUpdates,
} from './encryptedIndexeddbPersistence';

/**
 * Raised when a migration finished with partial failures.
 *
 * For disableEncryption, it is raised BEFORE `_encryptionMeta` is
 * deleted: the database stays encrypted, so recoverable with the
 * password. For enableEncryption, it reports that some data stayed
 * in plaintext while encryption is active.
 */
export class PartialMigrationError extends Error {
  readonly failures: string[];
  /** Set on enabling: encryption is active despite the failure. */
  readonly dek?: Uint8Array;

  constructor(operation: string, failures: string[], dek?: Uint8Array, outcome = '') {
    super(
      `${operation} : ${failures.length} élément(s) n'ont pas pu être migrés. ` +
      (outcome ? `${outcome} ` : '') +
      `Détail : ${failures.slice(0, 5).join(', ')}` +
      (failures.length > 5 ? ` (+${failures.length - 5})` : '')
    );
    this.name = 'PartialMigrationError';
    this.failures = failures;
    this.dek = dek;
  }
}

/**
 * Raised when disabling encryption would destroy data.
 * The caller must ask for confirmation, then retry with acceptDataLoss.
 */
export class UndecryptableDataError extends Error {
  readonly undecryptable: number;
  readonly total: number;
  readonly dossierIds: string[];

  constructor(undecryptable: number, total: number, dossierIds: string[]) {
    super(`${undecryptable}/${total} updates ne peuvent pas être déchiffrés`);
    this.name = 'UndecryptableDataError';
    this.undecryptable = undecryptable;
    this.total = total;
    this.dossierIds = dossierIds;
  }
}

/** Read-only pass over every Yjs database, before anything is written. */
async function countUndecryptableData(
  dek: Uint8Array,
  dossiers: Array<{ id: string }>
): Promise<{ total: number; undecryptable: number; dossierIds: string[] }> {
  let total = 0;
  let undecryptable = 0;
  const dossierIds: string[] = [];

  for (const dossier of dossiers) {
    try {
      const count = await countUndecryptableUpdates(ydocDatabaseName(dossier.id), dek);
      total += count.total;
      if (count.undecryptable > 0) {
        undecryptable += count.undecryptable;
        dossierIds.push(dossier.id);
      }
    } catch (err) {
      // An unreadable database is a risk, not a zero: migrateToPlaintext
      // will hit the same error and erase its content. Counting it as
      // undecryptable is the only honest count.
      console.warn(`[migrationService] Comptage impossible pour ${dossier.id}:`, err);
      undecryptable += 1;
      dossierIds.push(dossier.id);
    }
  }

  return { total, undecryptable, dossierIds };
}
import { encryptOpfsBuffer, decryptOpfsBuffer, isOpfsEncrypted } from './opfsEncryption';
import { syncService } from '../syncService';
import { runBeforeDisableHooks } from '../../plugins/pluginAPI';
import { ydocDatabaseName } from '../yjs/ydocName';

export interface MigrationProgress {
  phase: string;
  current: number;
  total: number;
}

type ProgressCallback = (progress: MigrationProgress) => void;

// ============================================================================
// DEXIE MIGRATION: rewriting every record
// ============================================================================

/**
 * Encrypts all existing Dexie data.
 * The middleware must already be applied (db.applyEncryption(dek)) before the call.
 * Reads each table in plaintext and writes it back → the middleware encrypts on write.
 */
async function migrateDexieToEncrypted(onProgress: ProgressCallback): Promise<string[]> {
  const tables = Array.from(DEFAULT_ENCRYPTED_TABLES);
  const failures: string[] = [];
  let done = 0;

  for (const tableName of tables) {
    onProgress({ phase: `Chiffrement ${tableName}`, current: done, total: tables.length });
    try {
      // @ts-expect-error - dynamic access to Dexie tables
      const table = db[tableName];
      if (!table) { done++; continue; }

      const records = await table.toArray();
      if (records.length > 0) {
        await table.bulkPut(records);
      }
    } catch (err) {
      console.warn(`[migrationService] Erreur sur table ${tableName}:`, err);
      failures.push(`table ${tableName}`);
    }
    done++;
  }

  onProgress({ phase: 'Dexie chiffrée', current: tables.length, total: tables.length });
  return failures;
}

// ============================================================================
// OPFS MIGRATION: encrypting/decrypting asset files
// ============================================================================

/**
 * Encrypts every OPFS file of the Dexie assets.
 * Reads each file, encrypts it unless already done, writes it back.
 */
async function migrateOpfsToEncrypted(
  dek: Uint8Array,
  onProgress: ProgressCallback
): Promise<string[]> {
  const assets = await db.assets.toArray();
  if (assets.length === 0) return [];

  const failures: string[] = [];
  const root = await navigator.storage.getDirectory();

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    onProgress({ phase: `OPFS asset ${i + 1}/${assets.length}`, current: i, total: assets.length });
    try {
      const pathParts = asset.opfsPath.split('/');
      let dir: FileSystemDirectoryHandle = root;
      for (const part of pathParts.slice(0, -1)) {
        dir = await dir.getDirectoryHandle(part);
      }
      const fileHandle = await dir.getFileHandle(pathParts.at(-1)!);
      const rawBuf = await (await fileHandle.getFile()).arrayBuffer();

      if (isOpfsEncrypted(rawBuf)) continue; // already encrypted

      const encrypted = await encryptOpfsBuffer(dek, rawBuf);
      const writable = await fileHandle.createWritable();
      await writable.write(encrypted);
      await writable.close();
    } catch (err) {
      console.warn(`[migrationService] Erreur OPFS ${asset.opfsPath}:`, err);
      failures.push(asset.opfsPath);
    }
  }

  return failures;
}

/**
 * Decrypts every OPFS file of the Dexie assets.
 */
async function migrateOpfsToPlaintext(
  dek: Uint8Array,
  onProgress: ProgressCallback
): Promise<string[]> {
  const assets = await db.assets.toArray();
  if (assets.length === 0) return [];

  const failures: string[] = [];
  const root = await navigator.storage.getDirectory();

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    onProgress({ phase: `OPFS asset ${i + 1}/${assets.length}`, current: i, total: assets.length });
    try {
      const pathParts = asset.opfsPath.split('/');
      let dir: FileSystemDirectoryHandle = root;
      for (const part of pathParts.slice(0, -1)) {
        dir = await dir.getDirectoryHandle(part);
      }
      const fileHandle = await dir.getFileHandle(pathParts.at(-1)!);
      const rawBuf = await (await fileHandle.getFile()).arrayBuffer();

      if (!isOpfsEncrypted(rawBuf)) continue; // already plaintext

      const plainBuf = await decryptOpfsBuffer(dek, rawBuf);
      const writable = await fileHandle.createWritable();
      await writable.write(plainBuf);
      await writable.close();
    } catch (err) {
      console.warn(`[migrationService] Erreur OPFS ${asset.opfsPath}:`, err);
      failures.push(asset.opfsPath);
    }
  }

  return failures;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Enables encryption on an existing installation.
 *
 * Flow:
 * 1. Set up DEK/KEK → store _encryptionMeta in Dexie
 * 2. Apply the Dexie middleware
 * 3. Rewrite every Dexie record (the middleware encrypts on write)
 * 4. For each dossier, migrate the y-indexeddb database
 * 5. Configure syncService with the DEK
 */
export async function enableEncryption(
  password: string,
  onProgress: ProgressCallback = () => {}
): Promise<Uint8Array> {
  onProgress({ phase: 'Génération des clés', current: 0, total: 5 });

  // 1. Generate DEK + store _encryptionMeta
  const { meta, dek } = await initializeEncryption(password);
  await db._encryptionMeta.put(meta);

  // 2. Apply the Dexie middleware (encrypts future writes)
  db.applyEncryption(dek);
  onProgress({ phase: 'Middleware Dexie activé', current: 1, total: 5 });

  // Every partial failure is collected: silence suggested a complete
  // encryption while some data stayed in plaintext on disk,
  // with nothing ever going over it again (marker detection sees it
  // as already processed).
  const failures: string[] = [];

  // 3. Rewrite every existing Dexie record
  onProgress({ phase: 'Migration données Dexie', current: 2, total: 5 });
  failures.push(...await migrateDexieToEncrypted((p) =>
    onProgress({ phase: p.phase, current: 2, total: 5 })
  ));

  // 4. Migrate the y-indexeddb database of each dossier
  const dossiers = await db.dossiers.toArray();
  onProgress({ phase: 'Migration bases Yjs', current: 3, total: 5 });

  for (let i = 0; i < dossiers.length; i++) {
    const inv = dossiers[i];
    onProgress({
      phase: `Migration dossier ${i + 1}/${dossiers.length}`,
      current: 3,
      total: 5,
    });
    try {
      await migrateToEncrypted(ydocDatabaseName(inv.id), dek);
    } catch (err) {
      console.warn(`[migrationService] Erreur y-indexeddb ${inv.id}:`, err);
      failures.push(`dossier ${inv.id}`);
    }
  }

  // 5. Migrate the OPFS files
  onProgress({ phase: 'Migration fichiers OPFS', current: 4, total: 5 });
  failures.push(...await migrateOpfsToEncrypted(dek, (p) =>
    onProgress({ phase: p.phase, current: 4, total: 5 })
  ));

  // 6. Configure syncService
  syncService.setAtRestDek(dek);

  // Encryption is active and the database usable, but part of the data
  // stayed in plaintext: say so rather than reload on an apparent
  // success. The user reloads once informed.
  if (failures.length > 0) {
    // No reload here: applyEncryption already closed and reopened the
    // connection with the recompiled middleware, so the database is usable
    // as is. Reloading would clear the message before it is read.
    throw new PartialMigrationError(
      'Activation du chiffrement',
      failures,
      dek,
      "Le chiffrement est actif et la base utilisable, mais ces éléments sont restés en clair sur le disque."
    );
  }

  onProgress({ phase: 'Chiffrement activé — redémarrage', current: 5, total: 5 });

  // The database was already open when applyEncryption was called.
  // Reloading guarantees Dexie reopens with the middleware compiled
  // from the start (App.tsx flow → raw IDB check → db.use() → db.open()).
  window.location.reload();

  return dek;
}

/**
 * Writes the decrypted data back directly through the native IndexedDB API,
 * bypassing Dexie. Needed because the Dexie v4 middleware cannot
 * be uninstalled (no unuse()): any bulkPut through Dexie would encrypt
 * the data again. So this step bypasses the Dexie layer entirely.
 */
async function writePlaintextViaRawIDB(data: Record<string, unknown[]>): Promise<void> {
  const tableNames = Object.keys(data).filter(t => data[t].length > 0);
  if (tableNames.length === 0) return;

  return new Promise((resolve, reject) => {
    const openReq = indexedDB.open('zeroneurone');
    openReq.onsuccess = () => {
      const idb = openReq.result;
      try {
        const tx = idb.transaction(tableNames, 'readwrite');
        for (const tableName of tableNames) {
          const store = tx.objectStore(tableName);
          for (const record of data[tableName]) {
            store.put(record);
          }
        }
        tx.oncomplete = () => { idb.close(); resolve(); };
        tx.onerror = () => { idb.close(); reject(tx.error); };
      } catch (err) {
        idb.close();
        reject(err);
      }
    };
    openReq.onerror = () => reject(openReq.error);
  });
}

/**
 * Disables encryption.
 *
 * Flow:
 * 1. Read all the decrypted data into RAM (via Dexie + middleware)
 * 2. Write the data back in plaintext via raw IndexedDB (bypassing the middleware)
 * 3. Migrate the y-indexeddb databases to plaintext
 * 4. Delete _encryptionMeta
 * 5. Reload the app (Dexie reopens without the middleware)
 *
 * Note: the Dexie v4 middleware does not support unuse(). Worked around by
 * writing through raw IDB for decryption, then reloading.
 */
export async function disableEncryption(
  dek: Uint8Array,
  onProgress: ProgressCallback = () => {},
  options: { acceptDataLoss?: boolean } = {}
): Promise<void> {
  onProgress({ phase: 'Lecture des données déchiffrées', current: 0, total: 5 });

  // 1. Read all the data in plaintext (the middleware decrypts on read)
  const data: Record<string, unknown[]> = {};
  for (const tableName of DEFAULT_ENCRYPTED_TABLES) {
    try {
      // @ts-expect-error - dynamic access
      const table = db[tableName];
      if (table) data[tableName] = await table.toArray();
    } catch { data[tableName] = []; }
  }

  const dossiers = (data['dossiers'] || []) as Array<{ id: string }>;
  const failures: string[] = [];

  // Nothing has been changed yet: this is the last point where giving up
  // costs nothing. Undecryptable updates would be erased
  // by migrateToPlaintext — the user must accept it explicitly.
  if (!options.acceptDataLoss) {
    const loss = await countUndecryptableData(dek, dossiers);
    if (loss.undecryptable > 0) {
      throw new UndecryptableDataError(loss.undecryptable, loss.total, loss.dossierIds);
    }
  }

  onProgress({ phase: 'Écriture en clair', current: 1, total: 5 });

  // 2. Write back via raw IndexedDB to bypass the Dexie middleware
  //    (a bulkPut through Dexie would encrypt the data again since the middleware
  //    is still in the chain — Dexie v4 has no unuse())
  await writePlaintextViaRawIDB(data);

  onProgress({ phase: 'Déchiffrement bases Yjs', current: 2, total: 5 });

  // 3. Migrate the y-indexeddb databases to plaintext
  for (let i = 0; i < dossiers.length; i++) {
    const inv = dossiers[i];
    onProgress({
      phase: `Déchiffrement dossier ${i + 1}/${dossiers.length}`,
      current: 2,
      total: 5,
    });
    try {
      await migrateToPlaintext(ydocDatabaseName(inv.id), dek);
    } catch (err) {
      console.warn(`[migrationService] Erreur y-indexeddb ${inv.id}:`, err);
      failures.push(`dossier ${inv.id}`);
    }
  }

  // 4. Decrypt the OPFS files
  onProgress({ phase: 'Déchiffrement fichiers OPFS', current: 3, total: 5 });
  failures.push(...await migrateOpfsToPlaintext(dek, (p) =>
    onProgress({ phase: p.phase, current: 3, total: 5 })
  ));

  // Point of no return. `_encryptionMeta` holds the only copy of the encrypted
  // DEK: deleting it while some data is still encrypted would make that
  // data unreadable for good. Stop here, with the database still
  // encrypted and so fully recoverable with the password.
  if (failures.length > 0) {
    throw new PartialMigrationError(
      'Désactivation du chiffrement',
      failures,
      undefined,
      'Aucune donnée n\'a été détruite : la base reste chiffrée et récupérable avec le mot de passe.'
    );
  }

  onProgress({ phase: 'Suppression métadonnées', current: 4, total: 5 });

  // 5. Delete _encryptionMeta + remove the DEK from syncService
  await db._encryptionMeta.delete('main');
  syncService.setAtRestDek(null);

  onProgress({ phase: 'Terminé — redémarrage', current: 5, total: 5 });

  // Give plugins a chance to decrypt their own data before the reload.
  // Promise.allSettled in runBeforeDisableHooks ensures a crashing plugin
  // does not block the restart.
  await runBeforeDisableHooks(dek);

  // Reload: on the next startup, no _encryptionMeta →
  // isReady = true immediately → Dexie opens without the middleware
  window.location.reload();
}
