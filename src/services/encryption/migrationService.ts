/**
 * migrationService — Migration des bases existantes vers le chiffrement at-rest
 *
 * Deux opérations :
 * - enableEncryption : base en clair → base chiffrée
 * - disableEncryption : base chiffrée → base en clair
 *
 * Migration Dexie :
 *   Le middleware est appliqué sur la DB ouverte. La migration lit chaque
 *   enregistrement (en clair, le préfixe __zn_enc__ est absent) et le réécrit
 *   (le middleware chiffre à l'écriture). Simple et atomique par table.
 *
 * Migration y-indexeddb :
 *   Pour chaque investigation, on lit les updates Yjs, on les chiffre, on
 *   réécrit. La fonction migrateToEncrypted/migrateToPlaintext est dans
 *   encryptedIndexeddbPersistence.ts.
 */

import { db } from '../../db/database';
import { DEFAULT_ENCRYPTED_TABLES } from './dexieEncryptionMiddleware';
import { initializeEncryption } from './encryptionService';
import { migrateToEncrypted, migrateToPlaintext } from './encryptedIndexeddbPersistence';
import { encryptOpfsBuffer, decryptOpfsBuffer, isOpfsEncrypted } from './opfsEncryption';
import { syncService } from '../syncService';

export interface MigrationProgress {
  phase: string;
  current: number;
  total: number;
}

type ProgressCallback = (progress: MigrationProgress) => void;

// ============================================================================
// MIGRATION DEXIE : re-écriture de tous les enregistrements
// ============================================================================

/**
 * Chiffre toutes les données Dexie existantes.
 * Le middleware doit être déjà appliqué (db.applyEncryption(dek)) avant appel.
 * Lit chaque table en clair et réécrit → le middleware chiffre à l'écriture.
 */
async function migrateDexieToEncrypted(onProgress: ProgressCallback): Promise<void> {
  const tables = Array.from(DEFAULT_ENCRYPTED_TABLES);
  let done = 0;

  for (const tableName of tables) {
    onProgress({ phase: `Chiffrement ${tableName}`, current: done, total: tables.length });
    try {
      // @ts-expect-error - accès dynamique aux tables Dexie
      const table = db[tableName];
      if (!table) { done++; continue; }

      const records = await table.toArray();
      if (records.length > 0) {
        await table.bulkPut(records);
      }
    } catch (err) {
      console.warn(`[migrationService] Erreur sur table ${tableName}:`, err);
    }
    done++;
  }

  onProgress({ phase: 'Dexie chiffrée', current: tables.length, total: tables.length });
}

// ============================================================================
// MIGRATION OPFS : chiffrement/déchiffrement des fichiers assets
// ============================================================================

/**
 * Chiffre tous les fichiers OPFS des assets Dexie.
 * Lit chaque fichier, le chiffre si ce n'est pas déjà fait, réécrit.
 */
async function migrateOpfsToEncrypted(
  dek: Uint8Array,
  onProgress: ProgressCallback
): Promise<void> {
  const assets = await db.assets.toArray();
  if (assets.length === 0) return;

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

      if (isOpfsEncrypted(rawBuf)) continue; // déjà chiffré

      const encrypted = await encryptOpfsBuffer(dek, rawBuf);
      const writable = await fileHandle.createWritable();
      await writable.write(encrypted);
      await writable.close();
    } catch (err) {
      console.warn(`[migrationService] Erreur OPFS ${asset.opfsPath}:`, err);
    }
  }
}

/**
 * Déchiffre tous les fichiers OPFS des assets Dexie.
 */
async function migrateOpfsToPlaintext(
  dek: Uint8Array,
  onProgress: ProgressCallback
): Promise<void> {
  const assets = await db.assets.toArray();
  if (assets.length === 0) return;

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

      if (!isOpfsEncrypted(rawBuf)) continue; // déjà en clair

      const plainBuf = await decryptOpfsBuffer(dek, rawBuf);
      const writable = await fileHandle.createWritable();
      await writable.write(plainBuf);
      await writable.close();
    } catch (err) {
      console.warn(`[migrationService] Erreur OPFS ${asset.opfsPath}:`, err);
    }
  }
}

// ============================================================================
// API PUBLIQUE
// ============================================================================

/**
 * Active le chiffrement sur une installation existante.
 *
 * Flow :
 * 1. Initialiser DEK/KEK → stocker _encryptionMeta dans Dexie
 * 2. Appliquer le middleware Dexie
 * 3. Re-écrire tous les enregistrements Dexie (middleware chiffre à l'écriture)
 * 4. Pour chaque investigation, migrer la base y-indexeddb
 * 5. Configurer syncService avec la DEK
 */
export async function enableEncryption(
  password: string,
  onProgress: ProgressCallback = () => {}
): Promise<Uint8Array> {
  onProgress({ phase: 'Génération des clés', current: 0, total: 5 });

  // 1. Générer DEK + stocker _encryptionMeta
  const { meta, dek } = await initializeEncryption(password);
  await db._encryptionMeta.put(meta);

  // 2. Appliquer le middleware Dexie (chiffre les futures écritures)
  db.applyEncryption(dek);
  onProgress({ phase: 'Middleware Dexie activé', current: 1, total: 5 });

  // 3. Re-écrire tous les enregistrements Dexie existants
  onProgress({ phase: 'Migration données Dexie', current: 2, total: 5 });
  await migrateDexieToEncrypted((p) =>
    onProgress({ phase: p.phase, current: 2, total: 5 })
  );

  // 4. Migrer les bases y-indexeddb de chaque investigation
  const investigations = await db.investigations.toArray();
  onProgress({ phase: 'Migration bases Yjs', current: 3, total: 5 });

  for (let i = 0; i < investigations.length; i++) {
    const inv = investigations[i];
    onProgress({
      phase: `Migration investigation ${i + 1}/${investigations.length}`,
      current: 3,
      total: 5,
    });
    try {
      await migrateToEncrypted(`zeroneurone-ydoc-${inv.id}`, dek);
    } catch (err) {
      console.warn(`[migrationService] Erreur y-indexeddb ${inv.id}:`, err);
    }
  }

  // 5. Migrer les fichiers OPFS
  onProgress({ phase: 'Migration fichiers OPFS', current: 4, total: 5 });
  await migrateOpfsToEncrypted(dek, (p) =>
    onProgress({ phase: p.phase, current: 4, total: 5 })
  );

  // 6. Configurer syncService
  syncService.setAtRestDek(dek);

  onProgress({ phase: 'Chiffrement activé — redémarrage', current: 5, total: 5 });

  // La base était déjà ouverte quand applyEncryption a été appelé.
  // Le rechargement garantit que Dexie réouvre avec le middleware compilé
  // depuis le début (flow App.tsx → raw IDB check → db.use() → db.open()).
  window.location.reload();

  return dek;
}

/**
 * Réécrit les données déchiffrées directement via l'API IndexedDB native,
 * sans passer par Dexie. Nécessaire car le middleware Dexie v4 ne peut pas
 * être désinstallé (pas de unuse()) : tout bulkPut via Dexie rechiffrerait
 * les données. On bypasse donc complètement la couche Dexie pour cette étape.
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
 * Désactive le chiffrement.
 *
 * Flow :
 * 1. Lire toutes les données déchiffrées en RAM (via Dexie + middleware)
 * 2. Réécrire les données en clair via raw IndexedDB (bypass du middleware)
 * 3. Migrer les bases y-indexeddb vers le clair
 * 4. Supprimer _encryptionMeta
 * 5. Recharger l'app (Dexie réouvrira sans middleware)
 *
 * Note : le middleware Dexie v4 ne supporte pas unuse(). On contourne en
 * écrivant via raw IDB pour la déchiffrement, puis on recharge.
 */
export async function disableEncryption(
  dek: Uint8Array,
  onProgress: ProgressCallback = () => {}
): Promise<void> {
  onProgress({ phase: 'Lecture des données déchiffrées', current: 0, total: 5 });

  // 1. Lire toutes les données en clair (le middleware déchiffre à la lecture)
  const data: Record<string, unknown[]> = {};
  for (const tableName of DEFAULT_ENCRYPTED_TABLES) {
    try {
      // @ts-expect-error - accès dynamique
      const table = db[tableName];
      if (table) data[tableName] = await table.toArray();
    } catch { data[tableName] = []; }
  }

  const investigations = (data['investigations'] || []) as Array<{ id: string }>;

  onProgress({ phase: 'Écriture en clair', current: 1, total: 5 });

  // 2. Réécrire via raw IndexedDB pour bypasser le middleware Dexie
  //    (un bulkPut via Dexie rechiffrerait les données car le middleware
  //    est toujours dans la chaîne — Dexie v4 n'a pas de unuse())
  await writePlaintextViaRawIDB(data);

  onProgress({ phase: 'Déchiffrement bases Yjs', current: 2, total: 5 });

  // 3. Migrer les bases y-indexeddb vers le clair
  for (let i = 0; i < investigations.length; i++) {
    const inv = investigations[i];
    onProgress({
      phase: `Déchiffrement investigation ${i + 1}/${investigations.length}`,
      current: 2,
      total: 5,
    });
    try {
      await migrateToPlaintext(`zeroneurone-ydoc-${inv.id}`, dek);
    } catch (err) {
      console.warn(`[migrationService] Erreur y-indexeddb ${inv.id}:`, err);
    }
  }

  // 4. Déchiffrer les fichiers OPFS
  onProgress({ phase: 'Déchiffrement fichiers OPFS', current: 3, total: 5 });
  await migrateOpfsToPlaintext(dek, (p) =>
    onProgress({ phase: p.phase, current: 3, total: 5 })
  );

  onProgress({ phase: 'Suppression métadonnées', current: 4, total: 5 });

  // 5. Supprimer _encryptionMeta + retirer DEK du syncService
  await db._encryptionMeta.delete('main');
  syncService.setAtRestDek(null);

  onProgress({ phase: 'Terminé — redémarrage', current: 5, total: 5 });

  // 5. Recharger : au prochain démarrage, _encryptionMeta absent →
  //    isReady = true immédiatement → Dexie ouvre sans middleware ✅
  window.location.reload();
}
