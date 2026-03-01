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
      let investigations: any[];
      try {
        investigations = await this.table('investigations').toArray();
      } catch {
        return; // Table doesn't exist
      }
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

  // IndexedDB table size estimates (bytes)
  tableSizes: { name: string; size: number; count: number }[];

  // OPFS
  opfsSupported: boolean;
  opfsSize: number;
  cacheSize: number;

  // Y.js databases (estimated from IndexedDB)
  ydocDatabases: string[];
  ydocEstimatedSize: number;
  /** Per-database Y.js size breakdown: dbName, dossierId, estimatedSize */
  ydocSizes: { dbName: string; dossierId: string; size: number }[];
}

async function measureDirectorySize(dir: FileSystemDirectoryHandle): Promise<number> {
  let total = 0;
  for await (const [, handle] of (dir as any).entries()) {
    if (handle.kind === 'file') {
      const file = await (handle as FileSystemFileHandle).getFile();
      total += file.size;
    } else if (handle.kind === 'directory') {
      total += await measureDirectorySize(handle as FileSystemDirectoryHandle);
    }
  }
  return total;
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
  const tableSizes: { name: string; size: number; count: number }[] = [];

  try {
    dossierCount = await db.dossiers.count();
    elementCount = await db.elements.count();
    linkCount = await db.links.count();
    assetCount = await db.assets.count();

    // Estimate size of each table by sampling + JSON serialization
    const tables: { name: string; table: import('dexie').Table }[] = [
      { name: 'dossiers', table: db.dossiers },
      { name: 'elements', table: db.elements },
      { name: 'links', table: db.links },
      { name: 'assets', table: db.assets },
      { name: 'views', table: db.views },
      { name: 'reports', table: db.reports },
      { name: 'tagSets', table: db.tagSets },
      { name: 'canvasTabs', table: db.canvasTabs },
      { name: 'pluginData', table: db.pluginData },
    ];

    for (const { name, table } of tables) {
      try {
        const count = await table.count();
        if (count === 0) continue;
        // Sample up to 20 records to estimate average size
        const sampleSize = Math.min(count, 20);
        const sample = await table.limit(sampleSize).toArray();
        const totalSampleBytes = sample.reduce(
          (sum, record) => sum + new Blob([JSON.stringify(record)]).size,
          0,
        );
        const avgSize = totalSampleBytes / sampleSize;
        tableSizes.push({ name, size: Math.round(avgSize * count), count });
      } catch {
        // Skip tables that fail
      }
    }

    // Sort by size descending
    tableSizes.sort((a, b) => b.size - a.size);
  } catch {
    // Database might not be open
  }

  // Find Y.js databases and estimate their size
  let ydocDatabases: string[] = [];
  let ydocEstimatedSize = 0;
  const ydocSizes: { dbName: string; dossierId: string; size: number }[] = [];
  try {
    const databases = await indexedDB.databases();
    ydocDatabases = databases
      .filter(d => d.name?.startsWith('zeroneurone-ydoc-'))
      .map(d => d.name || '')
      .filter(Boolean);

    // Estimate Y.js database sizes by opening each and counting
    for (const dbName of ydocDatabases) {
      let dbSize = 0;
      try {
        const ydocDb = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(dbName);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });

        // Measure actual data size by sampling records
        const storeNames = Array.from(ydocDb.objectStoreNames);
        for (const storeName of storeNames) {
          const tx = ydocDb.transaction(storeName, 'readonly');
          const store = tx.objectStore(storeName);

          // Get count
          const count = await new Promise<number>((resolve) => {
            const req = store.count();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(0);
          });
          if (count === 0) continue;

          // Sample up to 10 records via cursor to measure real size
          const sampleSize = Math.min(count, 10);
          const tx2 = ydocDb.transaction(storeName, 'readonly');
          const store2 = tx2.objectStore(storeName);
          const sampleBytes = await new Promise<number>((resolve) => {
            let total = 0;
            let sampled = 0;
            const cursorReq = store2.openCursor();
            cursorReq.onsuccess = () => {
              const cursor = cursorReq.result;
              if (!cursor || sampled >= sampleSize) {
                resolve(total);
                return;
              }
              const val = cursor.value;
              // Y.js stores ArrayBuffer/Uint8Array values
              if (val instanceof ArrayBuffer) {
                total += val.byteLength;
              } else if (val instanceof Uint8Array || val?.buffer instanceof ArrayBuffer) {
                total += val.byteLength || val.length || 0;
              } else {
                total += new Blob([JSON.stringify(val)]).size;
              }
              sampled++;
              cursor.continue();
            };
            cursorReq.onerror = () => resolve(total);
          });
          const avgSize = sampleBytes / sampleSize;
          dbSize += Math.round(avgSize * count);
        }
        ydocDb.close();
      } catch {
        // Skip databases that can't be opened
      }
      ydocEstimatedSize += dbSize;
      const dossierId = dbName.replace('zeroneurone-ydoc-', '');
      ydocSizes.push({ dbName, dossierId, size: dbSize });
    }
    // Sort by size descending
    ydocSizes.sort((a, b) => b.size - a.size);
  } catch {
    // databases() not supported in all browsers
  }

  // Calculate OPFS size by traversing all files
  let opfsSize = 0;
  if (opfsSupported) {
    try {
      const root = await navigator.storage.getDirectory();
      opfsSize = await measureDirectorySize(root);
    } catch {
      // OPFS not accessible
    }
  }

  // Calculate Cache Storage size
  let cacheSize = 0;
  try {
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      for (const req of keys) {
        const resp = await cache.match(req);
        if (resp) {
          const blob = await resp.blob();
          cacheSize += blob.size;
        }
      }
    }
  } catch {
    // Cache API not available
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
    tableSizes,
    opfsSupported,
    opfsSize,
    cacheSize,
    ydocDatabases,
    ydocEstimatedSize,
    ydocSizes,
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
 * Compact a single Y.js database: load state, delete database, recreate with
 * a single snapshot. Truly frees disk space.
 * Falls back to clear+rewrite if deleteDatabase is blocked (dossier open).
 */
export async function compactYjsDatabase(dbName: string): Promise<void> {
  const { EncryptedIndexeddbPersistence } = await import(
    '../services/encryption/encryptedIndexeddbPersistence'
  );
  const { useEncryptionStore } = await import('../stores/encryptionStore');
  const Y = await import('yjs');

  const dek = useEncryptionStore.getState().dek;

  // 1. Load all data into a Y.Doc
  const ydoc = new Y.Doc();
  const provider = new EncryptedIndexeddbPersistence(dbName, ydoc, dek || undefined);
  await provider.whenSynced;

  // 2. Capture the full state as a single update
  const snapshot = Y.encodeStateAsUpdate(ydoc);
  console.log(`[compact] ${dbName}: snapshot ${snapshot.byteLength} bytes`);

  // 3. Close the provider (releases IDB connection)
  await provider.destroy();
  ydoc.destroy();

  // 4. Try to delete the database entirely (frees disk space)
  const deleted = await new Promise<boolean>((resolve) => {
    const req = indexedDB.deleteDatabase(dbName);
    req.onsuccess = () => resolve(true);
    req.onerror = () => resolve(false);
    req.onblocked = () => {
      console.warn(`[compact] ${dbName}: deleteDatabase blocked, falling back to clear`);
      resolve(false);
    };
  });

  if (deleted) {
    // 5a. Recreate with just the snapshot
    const ydoc2 = new Y.Doc();
    Y.applyUpdate(ydoc2, snapshot);
    const provider2 = new EncryptedIndexeddbPersistence(dbName, ydoc2, dek || undefined);
    await provider2.whenSynced;
    await provider2.destroy();
    ydoc2.destroy();
    console.log(`[compact] ${dbName}: delete+recreate OK`);
  } else {
    // 5b. Fallback: clear and rewrite in-place
    const rawDb = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(dbName);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = rawDb.transaction('updates', 'readwrite');
      const store = tx.objectStore('updates');
      store.clear().onsuccess = () => store.add(snapshot);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    rawDb.close();
    console.log(`[compact] ${dbName}: clear+rewrite fallback OK`);
  }
}

/**
 * Remove OPFS dossier directories that no longer exist in Dexie.
 * Handles orphans left by previous bug or interrupted deletions.
 */
export async function cleanOrphanedOpfs(): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    const knownIds = new Set((await db.dossiers.toArray()).map(d => d.id));

    // Check both legacy "investigations" and current "dossiers" directories
    for (const dirName of ['dossiers', 'investigations']) {
      const dir = await root.getDirectoryHandle(dirName, { create: false }).catch(() => null);
      if (!dir) continue;

      const orphans: string[] = [];
      for await (const [name] of (dir as any).entries()) {
        if (!knownIds.has(name)) {
          orphans.push(name);
        }
      }

      for (const name of orphans) {
        try {
          await dir.removeEntry(name, { recursive: true });
          console.log(`[opfs] Removed orphaned: ${dirName}/${name}`);
        } catch { /* ignore */ }
      }

      // Remove empty parent directory
      if (knownIds.size === 0) {
        await root.removeEntry(dirName, { recursive: true }).catch(() => {});
      }
    }

    // Remove orphaned "media" directory (legacy)
    if (knownIds.size === 0) {
      await root.removeEntry('media', { recursive: true }).catch(() => {});
    }
  } catch {
    // OPFS not available
  }
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

  // Purge OPFS files (dossiers/, investigations/ legacy, media/ legacy)
  try {
    const root = await navigator.storage.getDirectory();
    for (const dirName of ['dossiers', 'investigations', 'media']) {
      await root.removeEntry(dirName, { recursive: true }).catch(() => {});
    }
  } catch {
    // OPFS not available
  }

  // Purge Y.js databases
  await purgeYjsDatabases();
}
