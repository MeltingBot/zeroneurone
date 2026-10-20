import { describe, it, expect, beforeEach, vi } from 'vitest';
import type MiniSearch from 'minisearch';
import { searchService } from './searchService';
import type { Asset, Element, SearchDocument } from '../types';

function element(i: number, changes: Partial<Element> = {}): Element {
  return {
    id: `el-${i}`, dossierId: 'd', label: `Élément ${i}`, notes: '', tags: ['t'], properties: [],
    confidence: null, source: '', date: null, dateRange: null, position: { x: i, y: 0 }, isPositionLocked: false,
    geo: null, events: [], assetIds: [], parentGroupId: null, isGroup: false, isAnnotation: false, childIds: [],
    visual: { color: '#fff', borderColor: '#000', shape: 'rectangle', size: 'medium', icon: null, image: null },
    createdAt: new Date(), updatedAt: new Date(), ...changes,
  } as Element;
}

const index = () => (searchService as unknown as { index: MiniSearch<SearchDocument> }).index;

describe('searchService.syncIncremental', () => {
  let elements: Element[];

  beforeEach(() => {
    searchService.clear();
    elements = Array.from({ length: 2000 }, (_, i) => element(i));
    searchService.loadDossier('d', elements, []);
  });

  it('does not re-index elements whose indexed text is unchanged (a layout moves them all)', () => {
    const add = vi.spyOn(index(), 'add');
    const discard = vi.spyOn(index(), 'discard');
    const moved = elements.map((el) => ({ ...el, position: { x: el.position.x + 100, y: 50 } }));
    searchService.syncIncremental(moved, []);
    expect(add).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
  });

  it('re-indexes only the element whose text changed', () => {
    const add = vi.spyOn(index(), 'add');
    const discard = vi.spyOn(index(), 'discard');
    const next = elements.map((el, i) => (i === 7 ? { ...el, label: 'Renommé Zorglub' } : el));
    searchService.syncIncremental(next, []);
    expect(add).toHaveBeenCalledTimes(1);
    expect(discard).toHaveBeenCalledTimes(1);
    expect(searchService.search('Zorglub').map((r) => r.id)).toEqual(['el-7']);
  });

  it('re-indexes an element whose attachment text changed, the element object being the same', () => {
    const withAsset = elements.map((el, i) => (i === 3 ? { ...el, assetIds: ['a1'] } : el));
    searchService.syncIncremental(withAsset, [], []);
    const asset = { id: 'a1', extractedText: 'procès-verbal Bérénice' } as Asset;
    searchService.syncIncremental(withAsset, [], [asset]);
    expect(searchService.search('Bérénice').map((r) => r.id)).toEqual(['el-3']);
  });

  it('removes deleted elements and indexes new ones', () => {
    const next = [...elements.slice(1), element(5000, { label: 'Nouveau Quetzal' })];
    searchService.syncIncremental(next, []);
    expect(searchService.search('Élément 0', 50).some((r) => r.id === 'el-0')).toBe(false);
    expect(searchService.search('Quetzal').map((r) => r.id)).toEqual(['el-5000']);
  });
});
