// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { db } from '../db/database';
import { ImportedRows } from './importedRows';
import type { Element, Link } from '../types';

const element = (id: string) => ({ id, dossierId: 'd', label: id }) as unknown as Element;
const link = (id: string) => ({ id, dossierId: 'd', fromId: 'a', toId: 'b' }) as unknown as Link;

describe('ImportedRows', () => {
  it('writes elements and links together', async () => {
    const rows = new ImportedRows();
    rows.addElement(element('a'));
    rows.addElement(element('b'));
    rows.addLink(link('l'));
    expect(rows.element('a')?.label).toBe('a');
    await rows.write();
    expect(await db.elements.get('a')).toBeDefined();
    expect(await db.links.get('l')).toBeDefined();
  });

  it('writes no element when the links fail', async () => {
    const rows = new ImportedRows();
    rows.addElement(element('x'));
    rows.addLink(link('y'));
    const spy = vi.spyOn(db.links, 'bulkAdd').mockRejectedValueOnce(new Error('quota'));
    await expect(rows.write()).rejects.toThrow('quota');
    spy.mockRestore();
    expect(await db.elements.get('x')).toBeUndefined();
  });
});
