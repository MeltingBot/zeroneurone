// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as Y from 'yjs';
import { db } from '../../db/database';
import {
  attachPluginDataSync,
  flushPluginDataSync,
  isSharedKey,
  onRemoteChange,
  removeSharedValue,
  resetPluginDataSync,
  setSharedValue,
  shareKeys,
} from './pluginDataSync';

const D = 'dossier-1';
const P = 'mark-neurone';

/** Two Y.Docs exchanging every update, as two workstations in a shared dossier. */
function connect(a: Y.Doc, b: Y.Doc): void {
  a.on('update', (update: Uint8Array, origin: unknown) => { if (origin !== 'peer') Y.applyUpdate(b, update, 'peer'); });
  b.on('update', (update: Uint8Array, origin: unknown) => { if (origin !== 'peer') Y.applyUpdate(a, update, 'peer'); });
}

const row = (key: string, pluginId = P) => db.pluginData.get({ pluginId, investigationId: D, key });
const remoteEntry = (doc: Y.Doc, key: string, pluginId = P) => doc.getMap<any>('pluginData').get(`${pluginId}|${key}`);

function setRemote(doc: Y.Doc, key: string, value: unknown, updatedAt: number, pluginId = P): void {
  doc.getMap<any>('pluginData').set(`${pluginId}|${key}`, { pluginId, key, value: JSON.stringify(value), updatedAt });
}

let local: Y.Doc;
let peer: Y.Doc;
let detach: (() => void) | null;

beforeEach(async () => {
  await db.pluginData.clear();
  resetPluginDataSync();
  shareKeys(P, ['ann:']);
  local = new Y.Doc();
  peer = new Y.Doc();
  detach = null;
});

afterEach(() => {
  detach?.();
});

async function open(): Promise<void> {
  detach = attachPluginDataSync(local, D);
  await flushPluginDataSync();
}

describe('pluginDataSync', () => {
  it('matches declared prefixes only', () => {
    expect(isSharedKey(P, 'ann:abc')).toBe(true);
    expect(isSharedKey(P, 'ocr:abc')).toBe(false);
    expect(isSharedKey('other', 'ann:abc')).toBe(false);
  });

  it('sends a shared key written here to the collaborator', async () => {
    connect(local, peer);
    await open();
    await setSharedValue(P, D, 'ann:h1', [{ id: 'a1', text: 'Martin' }]);

    const entry = remoteEntry(peer, 'ann:h1');
    expect(JSON.parse(entry.value)).toEqual([{ id: 'a1', text: 'Martin' }]);
    expect((await row('ann:h1'))?.mirrored).toBe(true);
  });

  it('applies a collaborator change to Dexie and notifies the plugin only', async () => {
    connect(local, peer);
    await open();
    const mine = vi.fn();
    const other = vi.fn();
    onRemoteChange(P, mine);
    onRemoteChange('other', other);

    setRemote(peer, 'ann:h1', { n: 1 }, 1000);
    await flushPluginDataSync();

    expect((await row('ann:h1'))?.value).toEqual({ n: 1 });
    expect(mine).toHaveBeenCalledWith({ dossierId: D, key: 'ann:h1', deleted: false });
    expect(other).not.toHaveBeenCalled();
  });

  it('does not notify the plugin of its own writes', async () => {
    connect(local, peer);
    await open();
    const cb = vi.fn();
    onRemoteChange(P, cb);
    await setSharedValue(P, D, 'ann:h1', 1);
    await flushPluginDataSync();
    expect(cb).not.toHaveBeenCalled();
  });

  it('propagates deletions both ways', async () => {
    connect(local, peer);
    await open();
    await setSharedValue(P, D, 'ann:h1', 1);
    await removeSharedValue(P, D, 'ann:h1');
    expect(remoteEntry(peer, 'ann:h1')).toBeUndefined();
    expect(await row('ann:h1')).toBeUndefined();

    setRemote(peer, 'ann:h2', 2, 1000);
    await flushPluginDataSync();
    const cb = vi.fn();
    onRemoteChange(P, cb);
    peer.getMap('pluginData').delete(`${P}|ann:h2`);
    await flushPluginDataSync();
    expect(await row('ann:h2')).toBeUndefined();
    expect(cb).toHaveBeenCalledWith({ dossierId: D, key: 'ann:h2', deleted: true });
  });

  describe('reconciliation at opening', () => {
    it('pushes rows written before sharing existed, and only shared keys', async () => {
      await db.pluginData.put({ pluginId: P, investigationId: D, dossierId: D, key: 'ann:h1', value: 'old' });
      await db.pluginData.put({ pluginId: P, investigationId: D, dossierId: D, key: 'ocr:h1', value: 'big' });
      await open();
      expect(JSON.parse(remoteEntry(local, 'ann:h1').value)).toBe('old');
      expect(remoteEntry(local, 'ocr:h1')).toBeUndefined();
      expect((await row('ann:h1'))?.mirrored).toBe(true);
    });

    it('pulls entries received before opening', async () => {
      setRemote(local, 'ann:h1', 'remote', 1000);
      const cb = vi.fn();
      onRemoteChange(P, cb);
      await open();
      expect((await row('ann:h1'))?.value).toBe('remote');
      expect(cb).toHaveBeenCalledWith({ dossierId: D, key: 'ann:h1', deleted: false });
    });

    it('keeps the most recent side for a key written while the dossier was closed', async () => {
      setRemote(local, 'ann:new', 'remote', 1000);
      setRemote(local, 'ann:old', 'remote', 3000);
      await db.pluginData.bulkPut([
        { pluginId: P, investigationId: D, dossierId: D, key: 'ann:new', value: 'local', updatedAt: 2000, mirrored: false },
        { pluginId: P, investigationId: D, dossierId: D, key: 'ann:old', value: 'local', updatedAt: 2000, mirrored: false },
      ]);
      await open();
      expect(JSON.parse(remoteEntry(local, 'ann:new').value)).toBe('local');
      expect((await row('ann:old'))?.value).toBe('remote');
    });

    it('pushes mirrored rows to a new Y.Doc instead of deleting them', async () => {
      // Local Y.js data lost, or ZIP import copying the row as is
      await db.pluginData.put({ pluginId: P, investigationId: D, dossierId: D, key: 'ann:h1', value: 1, updatedAt: 1000, mirrored: true });
      await open();
      expect(JSON.parse(remoteEntry(local, 'ann:h1').value)).toBe(1);
      expect((await row('ann:h1'))?.value).toBe(1);
      expect(local.getMap('meta').get('_pluginDataSynced')).toBe(true);
    });

    it('drops a mirrored row deleted by a collaborator', async () => {
      local.getMap('meta').set('_pluginDataSynced', true);
      await db.pluginData.put({ pluginId: P, investigationId: D, dossierId: D, key: 'ann:h1', value: 1, updatedAt: 1000, mirrored: true });
      const cb = vi.fn();
      onRemoteChange(P, cb);
      await open();
      expect(await row('ann:h1')).toBeUndefined();
      expect(cb).toHaveBeenCalledWith({ dossierId: D, key: 'ann:h1', deleted: true });
    });

    it('applies a removal made while the dossier was closed', async () => {
      setRemote(local, 'ann:h1', 1, 1000);
      // No Y.Doc attached: the removal is kept as a marker
      await removeSharedValue(P, D, 'ann:h1');
      expect((await row('ann:h1'))?.deleted).toBe(true);

      await open();
      expect(remoteEntry(local, 'ann:h1')).toBeUndefined();
      expect(await row('ann:h1')).toBeUndefined();
    });

    it('handles prefixes declared after the dossier was opened', async () => {
      await db.pluginData.put({ pluginId: 'late', investigationId: D, dossierId: D, key: 'k:1', value: 'v' });
      await open();
      expect(remoteEntry(local, 'k:1', 'late')).toBeUndefined();
      shareKeys('late', ['k:']);
      await flushPluginDataSync();
      expect(JSON.parse(remoteEntry(local, 'k:1', 'late').value)).toBe('v');
    });
  });

  it('writes to Dexie only for a dossier that is not open', async () => {
    await open();
    await setSharedValue(P, 'other-dossier', 'ann:h1', 1);
    expect(local.getMap('pluginData').size).toBe(0);
    const stored = await db.pluginData.get({ pluginId: P, investigationId: 'other-dossier', key: 'ann:h1' });
    expect(stored?.mirrored).toBe(false);
  });
});
