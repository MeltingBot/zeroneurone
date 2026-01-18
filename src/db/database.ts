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
