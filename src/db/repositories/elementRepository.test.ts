import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import Dexie, { type Table } from 'dexie';
import { db } from '../database';
import { elementRepository } from './elementRepository';
import { createEncryptionMiddleware } from '../../services/encryption/dexieEncryptionMiddleware';
import type { Element } from '../../types';

function element(i: number): Element {
  return {
    id: `el-${i}`, dossierId: 'd', label: `Élément ${i}`, notes: 'secret', tags: [], properties: [],
    confidence: null, source: '', date: null, dateRange: null, position: { x: 0, y: 0 }, isPositionLocked: false,
    geo: null, events: [], assetIds: [], parentGroupId: null, isGroup: false, isAnnotation: false, childIds: [],
    visual: { color: '#fff', borderColor: '#000', shape: 'rectangle', size: 'medium', icon: null, image: null },
    createdAt: new Date(0), updatedAt: new Date(0),
  } as Element;
}

describe('elementRepository.updatePositions', () => {
  beforeEach(async () => {
    await db.elements.clear();
    await db.elements.bulkAdd(Array.from({ length: 50 }, (_, i) => element(i)));
  });

  it('writes every position and leaves the other fields alone', async () => {
    await elementRepository.updatePositions(Array.from({ length: 50 }, (_, i) => ({ id: `el-${i}`, position: { x: i, y: 2 * i } })));
    const stored = await db.elements.get('el-7');
    expect(stored?.position).toEqual({ x: 7, y: 14 });
    expect(stored?.label).toBe('Élément 7');
    expect(stored?.updatedAt.getTime()).toBeGreaterThan(0);
  });

  it('skips ids that are no longer stored, as update() does', async () => {
    await expect(elementRepository.updatePositions([
      { id: 'gone', position: { x: 1, y: 1 } },
      { id: 'el-3', position: { x: 9, y: 9 } },
    ])).resolves.toBeUndefined();
    expect((await db.elements.get('el-3'))?.position).toEqual({ x: 9, y: 9 });
    expect(await db.elements.get('gone')).toBeUndefined();
  });
});

describe('bulkUpdate through the encryption middleware', () => {
  it('stores the updated rows encrypted and reads them back decrypted', async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    class Enc extends Dexie { elements!: Table<Element, string>; }
    const enc = new Enc('bulk-update-encryption');
    enc.version(1).stores({ elements: 'id, dossierId' });
    enc.use(createEncryptionMiddleware(dek, new Set(['elements'])));
    await enc.elements.bulkAdd([element(1), element(2)]);

    await enc.elements.bulkUpdate([{ key: 'el-1', changes: { position: { x: 5, y: 6 } } }]);

    const read = await enc.elements.get('el-1');
    expect(read?.position).toEqual({ x: 5, y: 6 });
    expect(read?.notes).toBe('secret');
    // Raw storage, below the middleware: still encrypted
    const raw = new Dexie('bulk-update-encryption');
    raw.version(1).stores({ elements: 'id, dossierId' });
    const stored = await raw.table('elements').get('el-1');
    expect(String(stored.notes)).toMatch(/^__zn_enc__:/);
    expect(String(stored.position)).toMatch(/^__zn_enc__:/);
    enc.close();
    raw.close();
  });
});
