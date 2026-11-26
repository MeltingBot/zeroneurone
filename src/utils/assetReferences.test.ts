import { describe, it, expect } from 'vitest';
import type { Element, Link } from '../types';
import { isAssetInHistory, isAssetReferenced, referencedAssets } from './assetReferences';

const HASH = 'a'.repeat(64);
const file = { id: 'f1', hash: HASH };
const el = (assetIds: string[], over: Record<string, unknown> = {}) =>
  ({ assetIds, visual: { image: null }, source: '', events: [], ...over }) as unknown as Element;
const lk = (assetIds?: string[], source = '') => ({ assetIds, source }) as Pick<Link, 'assetIds' | 'source'>;

describe('isAssetReferenced', () => {
  it('sees a file still attached to another element', () => {
    expect(isAssetReferenced(file, [el([]), el(['f1'])], [])).toBe(true);
  });

  it('sees a file attached to a link', () => {
    expect(isAssetReferenced(file, [el([])], [lk(['f1'])])).toBe(true);
  });

  it('sees a file used as an element image', () => {
    expect(isAssetReferenced(file, [el([], { visual: { image: 'f1' } })], [])).toBe(true);
  });

  it('sees a file cited by a source, on an element, an event or a link', () => {
    const cite = `[acte](asset:${HASH})`;
    expect(isAssetReferenced(file, [el([], { source: cite })], [])).toBe(true);
    expect(isAssetReferenced(file, [el([], { events: [{ source: cite }] })], [])).toBe(true);
    expect(isAssetReferenced(file, [], [lk([], cite)])).toBe(true);
  });

  it('lets a file go once nothing uses it, links without files included', () => {
    expect(isAssetReferenced(file, [el(['f2'])], [lk(), lk(['f2'])])).toBe(false);
  });
});

describe('referencedAssets', () => {
  it('keeps only the files still in use', () => {
    const files = [file, { id: 'f2', hash: 'b'.repeat(64) }, { id: 'f3', hash: 'c'.repeat(64) }];
    expect(referencedAssets(files, [el(['f1'])], [lk(['f3'])]).map((f) => f.id)).toEqual(['f1', 'f3']);
  });
});

describe('isAssetInHistory', () => {
  it('sees a file held by a deleted element that an undo can bring back', () => {
    const deletion = { type: 'delete-elements', undo: { elements: [{ id: 'a', assetIds: ['f1'] }] }, redo: {} };
    expect(isAssetInHistory('f1', [deletion])).toBe(true);
    expect(isAssetInHistory('f9', [deletion])).toBe(false);
  });

  it('sees a file held by a deleted link', () => {
    const deletion = { type: 'delete-links', undo: { links: [{ id: 'l', assetIds: ['f1'] }] }, redo: {} };
    expect(isAssetInHistory('f1', [deletion])).toBe(true);
  });

  it('leaves out adding a file, whose redo attaches it again from its copy', () => {
    const add = { type: 'add-asset', undo: { snapshot: { linkId: 'l', assetId: 'f1' } }, redo: { snapshot: { linkId: 'l', file: new Blob(['x']) } } };
    expect(isAssetInHistory('f1', [add])).toBe(false);
  });
});
