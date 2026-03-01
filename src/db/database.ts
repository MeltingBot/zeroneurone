import Dexie, { type Table } from 'dexie';
import type {
  Dossier,
  DossierId,
  Element,
  ElementId,
  Link,
  LinkId,
  Asset,
  AssetId,
  View,
  ViewId,
  Report,
  UUID,
  TagSet,
  TagSetId,
  CanvasTab,
  TabId,
} from '../types';
import type { EncryptionMeta } from '../services/encryption/encryptionService';
import { createEncryptionMiddleware, DEFAULT_ENCRYPTED_TABLES } from '../services/encryption/dexieEncryptionMiddleware';

export interface PluginDataRow {
  pluginId: string;
  dossierId: string;
  /** @deprecated Kept for compound PK compatibility — always equals dossierId */
  investigationId?: string;
  key: string;
  value: any;
}

class DossierDatabase extends Dexie {
  dossiers!: Table<Dossier, DossierId>;
  elements!: Table<Element, ElementId>;
  links!: Table<Link, LinkId>;
  assets!: Table<Asset, AssetId>;
  views!: Table<View, ViewId>;
  reports!: Table<Report, UUID>;
  tagSets!: Table<TagSet, TagSetId>;
  canvasTabs!: Table<CanvasTab, TabId>;
  pluginData!: Table<PluginDataRow, string>;
  _encryptionMeta!: Table<EncryptionMeta, 'main'>;

  constructor() {
    super('zeroneurone');

    // ─── Legacy versions (1-7): use original table/index names ───────────
    // These MUST keep the original IndexedDB names for backward compatibility
    // with existing databases.

    this.version(1).stores({
      investigations: 'id, name, createdAt, updatedAt',
      elements: 'id, investigationId, label, parentGroupId, createdAt, updatedAt, *tags',
      links: 'id, investigationId, fromId, toId, createdAt, updatedAt',
      assets: 'id, investigationId, hash, createdAt',
      views: 'id, investigationId, name, createdAt',
      reports: 'id, investigationId, createdAt, updatedAt',
    });

    this.version(2).stores({
      investigations: 'id, name, createdAt, updatedAt',
      elements: 'id, investigationId, label, parentGroupId, createdAt, updatedAt, *tags',
      links: 'id, investigationId, fromId, toId, createdAt, updatedAt',
      assets: 'id, investigationId, hash, createdAt',
      views: 'id, investigationId, name, createdAt',
      reports: 'id, investigationId, createdAt, updatedAt',
      tagSets: 'id, name',
    });

    this.version(3).stores({
      investigations: 'id, name, createdAt, updatedAt',
      elements: 'id, investigationId, label, parentGroupId, createdAt, updatedAt, *tags',
      links: 'id, investigationId, fromId, toId, createdAt, updatedAt',
      assets: 'id, investigationId, hash, createdAt, [investigationId+hash]',
      views: 'id, investigationId, name, createdAt',
      reports: 'id, investigationId, createdAt, updatedAt',
      tagSets: 'id, name',
    });

    this.version(4).stores({
      investigations: 'id, name, createdAt, updatedAt, isFavorite, *tags',
      elements: 'id, investigationId, label, parentGroupId, createdAt, updatedAt, *tags',
      links: 'id, investigationId, fromId, toId, createdAt, updatedAt',
      assets: 'id, investigationId, hash, createdAt, [investigationId+hash]',
      views: 'id, investigationId, name, createdAt',
      reports: 'id, investigationId, createdAt, updatedAt',
      tagSets: 'id, name',
    });

    this.version(5).stores({
      investigations: 'id, name, createdAt, updatedAt, isFavorite, *tags',
      elements: 'id, investigationId, label, parentGroupId, createdAt, updatedAt, *tags',
      links: 'id, investigationId, fromId, toId, createdAt, updatedAt',
      assets: 'id, investigationId, hash, createdAt, [investigationId+hash]',
      views: 'id, investigationId, name, createdAt',
      reports: 'id, investigationId, createdAt, updatedAt',
      tagSets: 'id, name',
      canvasTabs: 'id, investigationId, order',
    });

    this.version(6).stores({
      investigations: 'id, name, createdAt, updatedAt, isFavorite, *tags',
      elements: 'id, investigationId, label, parentGroupId, createdAt, updatedAt, *tags',
      links: 'id, investigationId, fromId, toId, createdAt, updatedAt',
      assets: 'id, investigationId, hash, createdAt, [investigationId+hash]',
      views: 'id, investigationId, name, createdAt',
      reports: 'id, investigationId, createdAt, updatedAt',
      tagSets: 'id, name',
      canvasTabs: 'id, investigationId, order',
      pluginData: '[pluginId+investigationId+key], pluginId, investigationId',
    });

    this.version(7).stores({
      investigations: 'id, createdAt, updatedAt, isFavorite',
      elements: 'id, investigationId, parentGroupId, createdAt, updatedAt',
      links: 'id, investigationId, fromId, toId, createdAt, updatedAt',
      assets: 'id, investigationId, hash, createdAt, [investigationId+hash]',
      views: 'id, investigationId, createdAt',
      reports: 'id, investigationId, createdAt, updatedAt',
      tagSets: 'id',
      canvasTabs: 'id, investigationId, order',
      pluginData: '[pluginId+investigationId+key], pluginId, investigationId',
      _encryptionMeta: 'id',
    });

    // ─── Version 8: Copy investigations → dossiers + remap IDs ──────────
    // IMPORTANT: pluginData keeps its ORIGINAL primary key because IndexedDB
    // does NOT support changing primary keys. The compound key still uses
    // 'investigationId' internally. We add a 'dossierId' index for new queries.
    // The recovery migration copies investigationId → dossierId in the DATA.
    this.version(8).stores({
      investigations: 'id, createdAt, updatedAt, isFavorite', // keep for reading
      dossiers: 'id, createdAt, updatedAt, isFavorite',
      elements: 'id, dossierId, parentGroupId, createdAt, updatedAt',
      links: 'id, dossierId, fromId, toId, createdAt, updatedAt',
      assets: 'id, dossierId, hash, createdAt, [dossierId+hash]',
      views: 'id, dossierId, createdAt',
      reports: 'id, dossierId, createdAt, updatedAt',
      tagSets: 'id',
      canvasTabs: 'id, dossierId, order',
      // Keep original PK! Just add dossierId as secondary index
      pluginData: '[pluginId+investigationId+key], pluginId, investigationId, dossierId',
      _encryptionMeta: 'id',
    }).upgrade(async tx => {
      // Migrate investigations → dossiers (table rename)
      const oldInvestigations = tx.table('investigations');
      const newDossiers = tx.table('dossiers');
      const allInvestigations = await oldInvestigations.toArray();
      if (allInvestigations.length > 0) {
        await newDossiers.bulkAdd(allInvestigations);
      }

      // Remap investigationId → dossierId in all child tables
      const tablesToMigrate = ['elements', 'links', 'assets', 'views', 'reports', 'canvasTabs'];
      for (const tableName of tablesToMigrate) {
        const table = tx.table(tableName);
        const records = await table.toArray();
        const needsMigration = records.some((r: any) => r.investigationId !== undefined);
        if (needsMigration) {
          const migrated = records.map((record: any) => {
            if (record.investigationId !== undefined) {
              record.dossierId = record.investigationId;
              delete record.investigationId;
            }
            return record;
          });
          await table.clear();
          if (migrated.length > 0) {
            await table.bulkAdd(migrated);
          }
        }
      }

      // pluginData: keep investigationId (part of PK) but ADD dossierId
      const pluginTable = tx.table('pluginData');
      const pluginRecords = await pluginTable.toArray();
      if (pluginRecords.some((r: any) => r.investigationId && !r.dossierId)) {
        const migrated = pluginRecords.map((r: any) => {
          if (r.investigationId && !r.dossierId) {
            r.dossierId = r.investigationId;
            // DON'T delete investigationId — it's part of the compound PK
          }
          return r;
        });
        await pluginTable.clear();
        if (migrated.length > 0) {
          await pluginTable.bulkAdd(migrated);
        }
      }
    });

    // ─── Version 9: Drop legacy investigations table ──────────────────────
    this.version(9).stores({
      investigations: null, // Safe to delete after v8 upgrade copied data
    });
  }

  /**
   * Recovery migration: if the DB was upgraded to v8/v9 but the data
   * wasn't actually copied (bug: investigations:null deleted the table
   * before upgrade() could read it), detect and fix the situation.
   *
   * Call this ONCE after db.open() succeeds.
   */
  async runRecoveryMigration(): Promise<void> {
    try {
      // Check if dossiers table is empty but investigations has data
      const dossierCount = await this.dossiers.count();
      if (dossierCount > 0) return; // Already migrated, nothing to do

      // Check if investigations table still exists and has data
      if (!this.table('investigations')) return;
      const investigations = await this.table('investigations').toArray();
      if (investigations.length === 0) return;

      console.info(`[Recovery] Found ${investigations.length} investigations to migrate to dossiers`);

      await this.transaction('rw',
        [this.dossiers, this.elements, this.links, this.assets,
         this.views, this.reports, this.canvasTabs, this.pluginData],
        async () => {
          // Copy investigations → dossiers
          await this.dossiers.bulkAdd(investigations);

          // Remap investigationId → dossierId in child tables (except pluginData)
          const remapId = (record: any) => {
            if (record.investigationId !== undefined) {
              record.dossierId = record.investigationId;
              delete record.investigationId;
            }
            return record;
          };

          const tables = ['elements', 'links', 'assets', 'views', 'reports', 'canvasTabs'];
          for (const tableName of tables) {
            const table = this.table(tableName);
            const records = await table.toArray();
            const needsMigration = records.some((r: any) => r.investigationId !== undefined);
            if (needsMigration) {
              const migrated = records.map(remapId);
              await table.clear();
              if (migrated.length > 0) {
                await table.bulkAdd(migrated);
              }
            }
          }

          // pluginData: keep investigationId (PK) but add dossierId
          const pluginRecords = await this.pluginData.toArray();
          if (pluginRecords.some((r: any) => r.investigationId && !r.dossierId)) {
            const migrated = pluginRecords.map((r: any) => {
              if (r.investigationId && !r.dossierId) {
                r.dossierId = r.investigationId;
              }
              return r;
            });
            await this.pluginData.clear();
            if (migrated.length > 0) {
              await this.pluginData.bulkAdd(migrated);
            }
          }
        }
      );

      console.info('[Recovery] Migration complete');
    } catch (error) {
      console.error('[Recovery] Migration failed:', error);
    }
  }

  /**
   * Active le chiffrement at-rest avec la DEK fournie.
   *
   * Dexie compile la chaîne de middlewares au moment de open(). Si la DB est
   * déjà ouverte, un simple db.use() n'a aucun effet sur les transactions
   * suivantes. On ferme donc explicitement la connexion avant d'enregistrer le
   * middleware : le prochain accès à une table rouvre la DB et recompile la
   * chaîne avec le middleware de chiffrement inclus.
   */
  applyEncryption(dek: Uint8Array | null): void {
    if (dek) {
      // disableAutoOpen: false → ferme la connexion IDB mais conserve autoOpen=true.
      // La prochaine opération sur une table rouvre la DB et recompile la chaîne
      // DBCore avec le middleware fraîchement ajouté via db.use().
      this.close({ disableAutoOpen: false });
      this.use(createEncryptionMiddleware(dek, DEFAULT_ENCRYPTED_TABLES));
    }
  }
}

export const db = new DossierDatabase();

/**
 * Check if IndexedDB is supported
 */
export function isIndexedDBSupported(): boolean {
  return typeof indexedDB !== 'undefined';
}

/**
 * Check if OPFS is supported
 */
export async function isOPFSSupported(): Promise<boolean> {
  try {
    if (!navigator.storage?.getDirectory) {
      return false;
    }
    await navigator.storage.getDirectory();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check storage quota
 */
export async function getStorageQuota(): Promise<{
  usage: number;
  quota: number;
  percentUsed: number;
} | null> {
  try {
    if (!navigator.storage?.estimate) {
      return null;
    }
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    return {
      usage,
      quota,
      percentUsed: quota > 0 ? (usage / quota) * 100 : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Check if storage is persistent (won't be evicted by browser)
 */
export async function isStoragePersistent(): Promise<boolean> {
  try {
    if (!navigator.storage?.persisted) {
      return false;
    }
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}

/**
 * Request persistent storage (prevents automatic eviction)
 * Returns true if granted, false otherwise
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) {
      return false;
    }
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/**
 * Get detailed storage information
 */
export interface StorageInfo {
  // Global storage
  totalUsage: number;
  totalQuota: number;
  percentUsed: number;
  isPersistent: boolean;

  // IndexedDB details
  indexedDBSupported: boolean;
  dossierCount: number;
  elementCount: number;
  linkCount: number;
  assetCount: number;

  // OPFS
  opfsSupported: boolean;

  // Y.js databases (estimated from IndexedDB)
  ydocDatabases: string[];
  ydocEstimatedSize: number;
}

export async function getDetailedStorageInfo(): Promise<StorageInfo> {
  const [quota, opfsSupported, isPersistent] = await Promise.all([
    getStorageQuota(),
    isOPFSSupported(),
    isStoragePersistent(),
  ]);

  // Count records in our database
  let dossierCount = 0;
  let elementCount = 0;
  let linkCount = 0;
  let assetCount = 0;

  try {
    dossierCount = await db.dossiers.count();
    elementCount = await db.elements.count();
    linkCount = await db.links.count();
    assetCount = await db.assets.count();
  } catch {
    // Database might not be open
  }

  // Find Y.js databases and estimate their size
  let ydocDatabases: string[] = [];
  let ydocEstimatedSize = 0;
  try {
    const databases = await indexedDB.databases();
    ydocDatabases = databases
      .filter(d => d.name?.startsWith('zeroneurone-ydoc-'))
      .map(d => d.name || '')
      .filter(Boolean);

    // Estimate Y.js database sizes by opening each and counting
    for (const dbName of ydocDatabases) {
      try {
        const ydocDb = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(dbName);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });

        // Count records in all object stores
        const storeNames = Array.from(ydocDb.objectStoreNames);
        for (const storeName of storeNames) {
          const tx = ydocDb.transaction(storeName, 'readonly');
          const store = tx.objectStore(storeName);
          const countRequest = store.count();
          const count = await new Promise<number>((resolve) => {
            countRequest.onsuccess = () => resolve(countRequest.result);
            countRequest.onerror = () => resolve(0);
          });
          // Rough estimate: 1KB per record (Y.js updates can vary widely)
          ydocEstimatedSize += count * 1024;
        }
        ydocDb.close();
      } catch {
        // Skip databases that can't be opened
      }
    }
  } catch {
    // databases() not supported in all browsers
  }

  return {
    totalUsage: quota?.usage || 0,
    totalQuota: quota?.quota || 0,
    percentUsed: quota?.percentUsed || 0,
    isPersistent,
    indexedDBSupported: isIndexedDBSupported(),
    dossierCount,
    elementCount,
    linkCount,
    assetCount,
    opfsSupported,
    ydocDatabases,
    ydocEstimatedSize,
  };
}

/**
 * Purge all Y.js databases to free up space
 * The databases will be recreated from IndexedDB data on next dossier load
 * WARNING: This will lose undo/redo history
 */
export async function purgeYjsDatabases(): Promise<{ deleted: number; errors: string[] }> {
  const result = { deleted: 0, errors: [] as string[] };

  try {
    const databases = await indexedDB.databases();
    const ydocDatabases = databases
      .filter(d => d.name?.startsWith('zeroneurone-ydoc-'))
      .map(d => d.name || '')
      .filter(Boolean);

    for (const dbName of ydocDatabases) {
      try {
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(dbName);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
          request.onblocked = () => {
            // Database is in use, try to close connections
            reject(new Error('Base en cours d\'utilisation'));
          };
        });
        result.deleted++;
      } catch (error) {
        result.errors.push(`${dbName}: ${error instanceof Error ? error.message : 'Erreur'}`);
      }
    }
  } catch (error) {
    result.errors.push(`Impossible de lister les bases: ${error instanceof Error ? error.message : 'Erreur'}`);
  }

  return result;
}

/**
 * Delete ALL dossiers and associated data (elements, links, assets, views,
 * reports, canvasTabs, pluginData) + purge all Y.js databases.
 * TagSets and _encryptionMeta are preserved.
 */
export async function purgeAllDossiers(): Promise<void> {
  // Clear all Dexie tables except tagSets and _encryptionMeta
  await db.transaction('rw',
    [db.dossiers, db.elements, db.links, db.assets, db.views, db.reports, db.canvasTabs, db.pluginData],
    async () => {
      await Promise.all([
        db.dossiers.clear(),
        db.elements.clear(),
        db.links.clear(),
        db.assets.clear(),
        db.views.clear(),
        db.reports.clear(),
        db.canvasTabs.clear(),
        db.pluginData.clear(),
      ]);
    }
  );

  // Purge OPFS files
  try {
    const root = await navigator.storage.getDirectory();
    const assetsDir = await root.getDirectoryHandle('assets', { create: false }).catch(() => null);
    if (assetsDir) {
      await root.removeEntry('assets', { recursive: true });
    }
  } catch {
    // OPFS not available or empty
  }

  // Purge Y.js databases
  await purgeYjsDatabases();
}
