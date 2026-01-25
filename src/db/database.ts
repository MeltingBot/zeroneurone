import Dexie, { type Table } from 'dexie';
import type {
  Investigation,
  InvestigationId,
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
} from '../types';

class InvestigationDatabase extends Dexie {
  investigations!: Table<Investigation, InvestigationId>;
  elements!: Table<Element, ElementId>;
  links!: Table<Link, LinkId>;
  assets!: Table<Asset, AssetId>;
  views!: Table<View, ViewId>;
  reports!: Table<Report, UUID>;
  tagSets!: Table<TagSet, TagSetId>;

  constructor() {
    super('zeroneurone');

    this.version(1).stores({
      investigations: 'id, name, createdAt, updatedAt',
      elements: 'id, investigationId, label, parentGroupId, createdAt, updatedAt, *tags',
      links: 'id, investigationId, fromId, toId, createdAt, updatedAt',
      assets: 'id, investigationId, hash, createdAt',
      views: 'id, investigationId, name, createdAt',
      reports: 'id, investigationId, createdAt, updatedAt',
    });

    // Version 2: Add tagSets store (global, not per-investigation)
    this.version(2).stores({
      investigations: 'id, name, createdAt, updatedAt',
      elements: 'id, investigationId, label, parentGroupId, createdAt, updatedAt, *tags',
      links: 'id, investigationId, fromId, toId, createdAt, updatedAt',
      assets: 'id, investigationId, hash, createdAt',
      views: 'id, investigationId, name, createdAt',
      reports: 'id, investigationId, createdAt, updatedAt',
      tagSets: 'id, name',
    });

    // Version 3: Add compound index [investigationId+hash] on assets for faster deduplication
    this.version(3).stores({
      investigations: 'id, name, createdAt, updatedAt',
      elements: 'id, investigationId, label, parentGroupId, createdAt, updatedAt, *tags',
      links: 'id, investigationId, fromId, toId, createdAt, updatedAt',
      assets: 'id, investigationId, hash, createdAt, [investigationId+hash]',
      views: 'id, investigationId, name, createdAt',
      reports: 'id, investigationId, createdAt, updatedAt',
      tagSets: 'id, name',
    });
  }
}

export const db = new InvestigationDatabase();

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
  investigationCount: number;
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
  let investigationCount = 0;
  let elementCount = 0;
  let linkCount = 0;
  let assetCount = 0;

  try {
    investigationCount = await db.investigations.count();
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
    investigationCount,
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
 * The databases will be recreated from IndexedDB data on next investigation load
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
