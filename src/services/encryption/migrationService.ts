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
 *   Pour chaque dossier, on lit les updates Yjs, on les chiffre, on
 *   réécrit. La fonction migrateToEncrypted/migrateToPlaintext est dans
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
 * Levée quand une migration s'est terminée avec des échecs partiels.
 *
 * Pour disableEncryption, elle est levée AVANT la suppression de
 * `_encryptionMeta` : la base reste chiffrée, donc récupérable avec le mot de
 * passe. Pour enableEncryption, elle signale que certaines données sont restées
 * en clair alors que le chiffrement est actif.
 */
export class PartialMigrationError extends Error {
  readonly failures: string[];
  /** Présente pour l'activation : le chiffrement est actif malgré l'échec. */
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
 * Levée quand la désactivation du chiffrement détruirait des données.
 * L'appelant doit demander confirmation puis relancer avec acceptDataLoss.
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

/** Passe en lecture seule sur toutes les bases Yjs, avant toute écriture. */
async function countUndecryptableData(
  dek: Uint8Array,
  dossiers: Array<{ id: string }>
): Promise<{ total: number; undecryptable: number; dossierIds: string[] }> {
  let total = 0;
  let undecryptable = 0;
  const dossierIds: string[] = [];

  for (const dossier of dossiers) {
    try {
      const count = await countUndecryptableUpdates(`zeroneurone-ydoc-${dossier.id}`, dek);
      total += count.total;
      if (count.undecryptable > 0) {
        undecryptable += count.undecryptable;
        dossierIds.push(dossier.id);
      }
    } catch (err) {
      // Une base illisible est un risque, pas un zéro : migrateToPlaintext
      // rencontrera la même erreur et effacera son contenu. La compter comme
      // indéchiffrable est le seul comptage honnête.
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
async function migrateDexieToEncrypted(onProgress: ProgressCallback): Promise<string[]> {
  const tables = Array.from(DEFAULT_ENCRYPTED_TABLES);
  const failures: string[] = [];
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
      failures.push(`table ${tableName}`);
    }
    done++;
  }

  onProgress({ phase: 'Dexie chiffrée', current: tables.length, total: tables.length });
  return failures;
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

      if (isOpfsEncrypted(rawBuf)) continue; // déjà chiffré

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
 * Déchiffre tous les fichiers OPFS des assets Dexie.
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

      if (!isOpfsEncrypted(rawBuf)) continue; // déjà en clair

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
// API PUBLIQUE
// ============================================================================

/**
 * Active le chiffrement sur une installation existante.
 *
 * Flow :
 * 1. Initialiser DEK/KEK → stocker _encryptionMeta dans Dexie
 * 2. Appliquer le middleware Dexie
 * 3. Re-écrire tous les enregistrements Dexie (middleware chiffre à l'écriture)
 * 4. Pour chaque dossier, migrer la base y-indexeddb
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

  // Tout échec partiel est collecté : le silence laissait croire à un
  // chiffrement complet alors que des données restaient en clair sur le disque,
  // sans que rien ne repasse jamais dessus (la détection par marqueur les voit
  // comme déjà traitées).
  const failures: string[] = [];

  // 3. Re-écrire tous les enregistrements Dexie existants
  onProgress({ phase: 'Migration données Dexie', current: 2, total: 5 });
  failures.push(...await migrateDexieToEncrypted((p) =>
    onProgress({ phase: p.phase, current: 2, total: 5 })
  ));

  // 4. Migrer les bases y-indexeddb de chaque dossier
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
      await migrateToEncrypted(`zeroneurone-ydoc-${inv.id}`, dek);
    } catch (err) {
      console.warn(`[migrationService] Erreur y-indexeddb ${inv.id}:`, err);
      failures.push(`dossier ${inv.id}`);
    }
  }

  // 5. Migrer les fichiers OPFS
  onProgress({ phase: 'Migration fichiers OPFS', current: 4, total: 5 });
  failures.push(...await migrateOpfsToEncrypted(dek, (p) =>
    onProgress({ phase: p.phase, current: 4, total: 5 })
  ));

  // 6. Configurer syncService
  syncService.setAtRestDek(dek);

  // Le chiffrement est actif et la base utilisable, mais une partie des données
  // est restée en clair : on le dit plutôt que de recharger sur un succès
  // apparent. L'utilisateur recharge lui-même une fois informé.
  if (failures.length > 0) {
    // Pas de rechargement ici : applyEncryption a déjà refermé puis rouvert la
    // connexion avec le middleware recompilé, la base est donc utilisable en
    // l'état. Recharger ferait disparaître le message avant lecture.
    throw new PartialMigrationError(
      'Activation du chiffrement',
      failures,
      dek,
      "Le chiffrement est actif et la base utilisable, mais ces éléments sont restés en clair sur le disque."
    );
  }

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
  onProgress: ProgressCallback = () => {},
  options: { acceptDataLoss?: boolean } = {}
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

  const dossiers = (data['dossiers'] || []) as Array<{ id: string }>;
  const failures: string[] = [];

  // Rien n'a encore été modifié : c'est le dernier moment où l'on peut renoncer
  // sans conséquence. Si des updates sont indéchiffrables, ils seront effacés
  // par migrateToPlaintext — l'utilisateur doit l'accepter explicitement.
  if (!options.acceptDataLoss) {
    const loss = await countUndecryptableData(dek, dossiers);
    if (loss.undecryptable > 0) {
      throw new UndecryptableDataError(loss.undecryptable, loss.total, loss.dossierIds);
    }
  }

  onProgress({ phase: 'Écriture en clair', current: 1, total: 5 });

  // 2. Réécrire via raw IndexedDB pour bypasser le middleware Dexie
  //    (un bulkPut via Dexie rechiffrerait les données car le middleware
  //    est toujours dans la chaîne — Dexie v4 n'a pas de unuse())
  await writePlaintextViaRawIDB(data);

  onProgress({ phase: 'Déchiffrement bases Yjs', current: 2, total: 5 });

  // 3. Migrer les bases y-indexeddb vers le clair
  for (let i = 0; i < dossiers.length; i++) {
    const inv = dossiers[i];
    onProgress({
      phase: `Déchiffrement dossier ${i + 1}/${dossiers.length}`,
      current: 2,
      total: 5,
    });
    try {
      await migrateToPlaintext(`zeroneurone-ydoc-${inv.id}`, dek);
    } catch (err) {
      console.warn(`[migrationService] Erreur y-indexeddb ${inv.id}:`, err);
      failures.push(`dossier ${inv.id}`);
    }
  }

  // 4. Déchiffrer les fichiers OPFS
  onProgress({ phase: 'Déchiffrement fichiers OPFS', current: 3, total: 5 });
  failures.push(...await migrateOpfsToPlaintext(dek, (p) =>
    onProgress({ phase: p.phase, current: 3, total: 5 })
  ));

  // Point de non-retour. `_encryptionMeta` porte la seule copie de la DEK
  // chiffrée : la supprimer alors que des données sont restées chiffrées les
  // rendrait définitivement illisibles. On s'arrête ici, base toujours
  // chiffrée et donc entièrement récupérable avec le mot de passe.
  if (failures.length > 0) {
    throw new PartialMigrationError(
      'Désactivation du chiffrement',
      failures,
      undefined,
      'Aucune donnée n\'a été détruite : la base reste chiffrée et récupérable avec le mot de passe.'
    );
  }

  onProgress({ phase: 'Suppression métadonnées', current: 4, total: 5 });

  // 5. Supprimer _encryptionMeta + retirer DEK du syncService
  await db._encryptionMeta.delete('main');
  syncService.setAtRestDek(null);

  onProgress({ phase: 'Terminé — redémarrage', current: 5, total: 5 });

  // Donner aux plugins la chance de déchiffrer leurs propres données avant reload.
  // Promise.allSettled dans runBeforeDisableHooks garantit qu'un plugin qui plante
  // ne bloque pas le redémarrage.
  await runBeforeDisableHooks(dek);

  // Recharger : au prochain démarrage, _encryptionMeta absent →
  // isReady = true immédiatement → Dexie ouvre sans middleware ✅
  window.location.reload();
}
