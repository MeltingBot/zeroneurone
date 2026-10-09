/**
 * Shared plugin data — pluginData keys a plugin declares as shared
 *
 * pluginData lives in Dexie and stays on each workstation. A plugin can declare
 * key prefixes as shared (`shareKeys`): those keys are also written to the
 * dossier's Y.Doc (map `pluginData`), so collaborators receive them with the
 * same end-to-end encryption as the rest of the dossier. Reads stay in Dexie.
 *
 * Y.Doc entry, id `${pluginId}|${key}`: { pluginId, key, value (JSON), updatedAt }.
 * Conflicts: last write wins, key by key.
 *
 * Dexie rows of shared keys carry two markers:
 * - `mirrored`: the row is known to the Y.Doc. A mirrored row missing from the
 *   Y.Doc was deleted by a collaborator; an unmirrored one was written while
 *   the dossier was closed and must be pushed.
 * - `deleted`: removal made while the dossier was closed, applied at next open.
 *
 * `meta._pluginDataSynced` marks a Y.Doc that went through a reconciliation.
 * Without it (new Y.Doc, local Y.js data lost, ZIP import), "mirrored" means
 * nothing: every local row is pushed, none is taken for a remote deletion.
 */

import type * as Y from 'yjs';
import { db, type PluginDataRow } from '../../db/database';

export interface PluginDataRemoteChange {
  dossierId: string;
  key: string;
  deleted: boolean;
}

interface SharedEntry {
  pluginId: string;
  key: string;
  value: string;
  updatedAt: number;
}

const LOCAL_ORIGIN = Symbol('pluginData-local');
const SYNCED_FLAG = '_pluginDataSynced';

const sharedPrefixes = new Map<string, string[]>();
const listeners = new Map<string, Set<(change: PluginDataRemoteChange) => void>>();

let attached: { ydoc: Y.Doc; dossierId: string; map: Y.Map<SharedEntry> } | null = null;

// Every Dexie write of shared keys goes through this queue, so remote changes,
// reconciliation and local writes apply in order.
let queue: Promise<void> = Promise.resolve();
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.then(() => undefined, () => undefined);
  return run;
}

const entryId = (pluginId: string, key: string) => `${pluginId}|${key}`;

// ─── Declaration and notification ──────────────────────────────

export function shareKeys(pluginId: string, prefixes: string[]): void {
  const valid = prefixes.filter((p) => typeof p === 'string' && p.length > 0);
  if (valid.length === 0) return;
  const current = sharedPrefixes.get(pluginId) ?? [];
  sharedPrefixes.set(pluginId, [...new Set([...current, ...valid])]);
  // Declared after the dossier was opened: bring its existing rows in
  if (attached) {
    const { ydoc, dossierId } = attached;
    enqueue(() => reconcile(ydoc, dossierId)).catch((err) => console.warn('[pluginData] reconcile failed:', err));
  }
}

export function isSharedKey(pluginId: string, key: string): boolean {
  return (sharedPrefixes.get(pluginId) ?? []).some((prefix) => key.startsWith(prefix));
}

export function onRemoteChange(pluginId: string, cb: (change: PluginDataRemoteChange) => void): () => void {
  let set = listeners.get(pluginId);
  if (!set) {
    set = new Set();
    listeners.set(pluginId, set);
  }
  set.add(cb);
  return () => { set.delete(cb); };
}

function notify(pluginId: string, change: PluginDataRemoteChange): void {
  for (const cb of listeners.get(pluginId) ?? []) {
    try {
      cb(change);
    } catch (err) {
      console.warn(`[pluginData] onRemoteChange listener of "${pluginId}" failed:`, err);
    }
  }
}

// ─── Dexie helpers ─────────────────────────────────────────────

function deleteRow(pluginId: string, dossierId: string, key: string) {
  return db.pluginData.where({ pluginId, investigationId: dossierId, key }).delete();
}

function rowFromEntry(dossierId: string, entry: SharedEntry): PluginDataRow {
  return {
    pluginId: entry.pluginId,
    investigationId: dossierId,
    dossierId,
    key: entry.key,
    value: parse(entry.value),
    updatedAt: entry.updatedAt,
    mirrored: true,
  };
}

function parse(json: string): any {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

function isEntry(value: unknown): value is SharedEntry {
  const e = value as SharedEntry | undefined;
  return !!e && typeof e.pluginId === 'string' && typeof e.key === 'string'
    && typeof e.value === 'string' && typeof e.updatedAt === 'number';
}

// ─── Writes (called by pluginAPI.pluginData) ───────────────────

/** Mirrors to the Y.Doc when it is the one of `dossierId`; returns whether it did. */
function mirror(dossierId: string, apply: (map: Y.Map<SharedEntry>) => void): boolean {
  if (!attached || attached.dossierId !== dossierId) return false;
  const { ydoc, map } = attached;
  ydoc.transact(() => apply(map), LOCAL_ORIGIN);
  return true;
}

export function setSharedValue(pluginId: string, dossierId: string, key: string, value: any): Promise<void> {
  return enqueue(async () => {
    const updatedAt = Date.now();
    const json = JSON.stringify(value ?? null);
    // Y.Doc first: a row marked mirrored must be in the Y.Doc
    const mirrored = mirror(dossierId, (map) => map.set(entryId(pluginId, key), { pluginId, key, value: json, updatedAt }));
    await db.pluginData.put({ pluginId, investigationId: dossierId, dossierId, key, value, updatedAt, mirrored });
  });
}

export function removeSharedValue(pluginId: string, dossierId: string, key: string): Promise<void> {
  return enqueue(async () => {
    const mirrored = mirror(dossierId, (map) => map.delete(entryId(pluginId, key)));
    if (mirrored) {
      await deleteRow(pluginId, dossierId, key);
    } else {
      await db.pluginData.put({
        pluginId, investigationId: dossierId, dossierId, key,
        value: undefined, updatedAt: Date.now(), mirrored: false, deleted: true,
      });
    }
  });
}

// ─── Y.Doc → Dexie ─────────────────────────────────────────────

/**
 * Follows the dossier's shared plugin data: applies collaborators' changes to
 * Dexie, then reconciles what each side holds. Returns the cleanup function.
 */
export function attachPluginDataSync(ydoc: Y.Doc, dossierId: string): () => void {
  const map = ydoc.getMap<SharedEntry>('pluginData');
  attached = { ydoc, dossierId, map };

  const observer = (event: Y.YMapEvent<SharedEntry>, transaction: Y.Transaction) => {
    if (transaction.origin === LOCAL_ORIGIN) return;
    const changes: { id: string; action: string; oldValue: unknown }[] = [];
    event.changes.keys.forEach((change, id) => changes.push({ id, action: change.action, oldValue: change.oldValue }));
    enqueue(async () => {
      for (const { id, action, oldValue } of changes) {
        if (action === 'delete') {
          if (!isEntry(oldValue)) continue;
          await deleteRow(oldValue.pluginId, dossierId, oldValue.key);
          notify(oldValue.pluginId, { dossierId, key: oldValue.key, deleted: true });
        } else {
          const entry = map.get(id);
          if (!isEntry(entry)) continue;
          await db.pluginData.put(rowFromEntry(dossierId, entry));
          notify(entry.pluginId, { dossierId, key: entry.key, deleted: false });
        }
      }
    }).catch((err) => console.warn('[pluginData] remote change failed:', err));
  };
  map.observe(observer);

  // Observer first: nothing arriving during reconciliation is missed
  enqueue(() => reconcile(ydoc, dossierId)).catch((err) => console.warn('[pluginData] reconcile failed:', err));

  return () => {
    map.unobserve(observer);
    if (attached?.map === map) attached = null;
  };
}

/** Brings Dexie and the Y.Doc to the same shared plugin data. */
export async function reconcile(ydoc: Y.Doc, dossierId: string): Promise<void> {
  const map = ydoc.getMap<SharedEntry>('pluginData');
  const meta = ydoc.getMap<unknown>('meta');
  const synced = meta.get(SYNCED_FLAG) === true;

  // Keys first: values (OCR pages, caches…) are read and decrypted only for shared keys
  const primaryKeys = await db.pluginData.where('investigationId').equals(dossierId).primaryKeys() as unknown as [string, string, string][];
  const candidates = primaryKeys.filter(([pluginId, , key]) => isSharedKey(pluginId, key) || map.has(entryId(pluginId, key)));
  const rows = candidates.length > 0 ? await db.pluginData.bulkGet(candidates as unknown as string[]) : [];
  const local = new Map<string, PluginDataRow>();
  for (const row of rows) {
    if (!row) continue;
    local.set(entryId(row.pluginId, row.key), synced ? row : { ...row, mirrored: false });
  }

  const toPut: PluginDataRow[] = [];
  const toDelete: PluginDataRow[] = [];
  const toPush: SharedEntry[] = [];
  const toRemoveRemote: string[] = [];
  const changed: { pluginId: string; change: PluginDataRemoteChange }[] = [];

  const pull = (entry: SharedEntry) => {
    toPut.push(rowFromEntry(dossierId, entry));
    changed.push({ pluginId: entry.pluginId, change: { dossierId, key: entry.key, deleted: false } });
  };
  const push = (row: PluginDataRow) => {
    const entry = { pluginId: row.pluginId, key: row.key, value: JSON.stringify(row.value ?? null), updatedAt: row.updatedAt ?? Date.now() };
    toPush.push(entry);
    toPut.push({ ...row, updatedAt: entry.updatedAt, mirrored: true });
  };

  map.forEach((entry, id) => {
    if (!isEntry(entry)) return;
    const row = local.get(id);
    if (!row) {
      pull(entry);
    } else if (row.mirrored) {
      if (row.updatedAt !== entry.updatedAt) pull(entry);
    } else if ((row.updatedAt ?? 0) > entry.updatedAt) {
      // Changed here while the dossier was closed, after the last remote change
      if (row.deleted) {
        toRemoveRemote.push(id);
        toDelete.push(row);
      } else {
        push(row);
      }
    } else {
      pull(entry);
    }
  });

  for (const [id, row] of local) {
    if (map.has(id)) continue;
    if (row.deleted) {
      toDelete.push(row);
    } else if (row.mirrored) {
      // Known to the Y.Doc and gone from it: deleted by a collaborator
      toDelete.push(row);
      changed.push({ pluginId: row.pluginId, change: { dossierId, key: row.key, deleted: true } });
    } else {
      push(row);
    }
  }

  if (toPush.length > 0 || toRemoveRemote.length > 0 || !synced) {
    ydoc.transact(() => {
      for (const entry of toPush) map.set(entryId(entry.pluginId, entry.key), entry);
      for (const id of toRemoveRemote) map.delete(id);
      if (!synced) meta.set(SYNCED_FLAG, true);
    }, LOCAL_ORIGIN);
  }
  if (toPut.length > 0) await db.pluginData.bulkPut(toPut);
  for (const row of toDelete) await deleteRow(row.pluginId, dossierId, row.key);
  for (const { pluginId, change } of changed) notify(pluginId, change);
}

/** Waits for queued shared writes (tests). */
export function flushPluginDataSync(): Promise<void> {
  return enqueue(async () => undefined);
}

/** Clears declarations, listeners and attachment (tests). */
export function resetPluginDataSync(): void {
  sharedPrefixes.clear();
  listeners.clear();
  attached = null;
}
