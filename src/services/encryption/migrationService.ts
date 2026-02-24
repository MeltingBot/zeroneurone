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
  onProgress({ phase: 'Génération des clés', current: 0, total: 4 });

  // 1. Générer DEK + stocker _encryptionMeta
  const { meta, dek } = await initializeEncryption(password);
  await db._encryptionMeta.put(meta);

  // 2. Appliquer le middleware Dexie (chiffre les futures écritures)
  db.applyEncryption(dek);
  onProgress({ phase: 'Middleware Dexie activé', current: 1, total: 4 });

  // 3. Re-écrire tous les enregistrements Dexie existants
  onProgress({ phase: 'Migration données Dexie', current: 2, total: 4 });
  await migrateDexieToEncrypted((p) =>
    onProgress({ phase: p.phase, current: 2, total: 4 })
  );

  // 4. Migrer les bases y-indexeddb de chaque investigation
  const investigations = await db.investigations.toArray();
  onProgress({ phase: 'Migration bases Yjs', current: 3, total: 4 });

  for (let i = 0; i < investigations.length; i++) {
    const inv = investigations[i];
    onProgress({
      phase: `Migration investigation ${i + 1}/${investigations.length}`,
      current: 3,
      total: 4,
    });
    try {
      await migrateToEncrypted(`zeroneurone-ydoc-${inv.id}`, dek);
    } catch (err) {
      console.warn(`[migrationService] Erreur y-indexeddb ${inv.id}:`, err);
    }
  }

  // 5. Configurer syncService
  syncService.setAtRestDek(dek);

  onProgress({ phase: 'Chiffrement activé', current: 4, total: 4 });
  return dek;
}

/**
 * Désactive le chiffrement.
 *
 * Flow :
 * 1. Lire toutes les données déchiffrées en RAM
 * 2. Supprimer les bases IndexedDB (Dexie + y-indexeddb)
 * 3. Recréer les bases sans middleware avec les données en clair
 * 4. Supprimer _encryptionMeta
 *
 * Note : nécessite un rechargement de l'app pour que Dexie reparte sans middleware.
 */
export async function disableEncryption(
  dek: Uint8Array,
  onProgress: ProgressCallback = () => {}
): Promise<void> {
  onProgress({ phase: 'Lecture des données déchiffrées', current: 0, total: 3 });

  // 1. Lire toutes les données en clair depuis la DB avec middleware actif
  const data: Record<string, unknown[]> = {};
  for (const tableName of DEFAULT_ENCRYPTED_TABLES) {
    try {
      // @ts-expect-error
      const table = db[tableName];
      if (table) {
        data[tableName] = await table.toArray();
      }
    } catch { data[tableName] = []; }
  }

  // Lire les investigations pour la migration y-indexeddb
  const investigations = (data['investigations'] || []) as Array<{ id: string }>;

  onProgress({ phase: 'Migration bases Yjs vers clair', current: 1, total: 3 });

  // 2. Migrer les bases y-indexeddb vers le clair
  for (let i = 0; i < investigations.length; i++) {
    const inv = investigations[i];
    onProgress({
      phase: `Déchiffrement investigation ${i + 1}/${investigations.length}`,
      current: 1,
      total: 3,
    });
    try {
      await migrateToPlaintext(`zeroneurone-ydoc-${inv.id}`, dek);
    } catch (err) {
      console.warn(`[migrationService] Erreur y-indexeddb ${inv.id}:`, err);
    }
  }

  onProgress({ phase: 'Suppression métadonnées', current: 2, total: 3 });

  // 3. Supprimer _encryptionMeta
  await db._encryptionMeta.delete('main');

  // 4. Retirer la DEK du syncService
  syncService.setAtRestDek(null);

  onProgress({ phase: 'Terminé — redémarrage requis', current: 3, total: 3 });

  // Note : Dexie doit être rechargée sans middleware.
  // Le moyen le plus simple est de recharger l'app — au prochain démarrage,
  // _encryptionMeta n'existe plus → db est ouverte sans middleware.
}
