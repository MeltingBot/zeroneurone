import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type MiniSearch from 'minisearch';
import { searchService, SEARCH_INDEX_TASK } from './searchService';
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

  beforeEach(async () => {
    searchService.clear();
    elements = Array.from({ length: 2000 }, (_, i) => element(i));
    await searchService.loadDossier('d', elements, []);
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

describe('searchService.search modes', () => {
  beforeEach(async () => {
    searchService.clear();
    await searchService.loadDossier('modes', [
      element(1, { label: 'Jean Martin', tags: [] }),
      element(2, { label: 'Jean Dupont', tags: [] }),
      element(3, { label: 'Paul Marin', tags: [] }),
    ], []);
  });
  const ids = (q: string, mode: 'fuzzy' | 'exact') => searchService.search(q, 20, mode).map((r) => r.id).sort();

  it('fuzzy: any word, typos allowed', () => {
    expect(ids('jean martin', 'fuzzy')).toEqual(['el-1', 'el-2', 'el-3']);
  });

  it('exact: every word, no typo', () => {
    expect(ids('jean martin', 'exact')).toEqual(['el-1']);
    expect(ids('martin', 'exact')).toEqual(['el-1']);
  });

  it('exact: the word being typed matches as a prefix', () => {
    expect(ids('jean mar', 'exact')).toEqual(['el-1']);
  });
});

describe('searchService comments', () => {
  const comment = (targetId: string, content: string) => ({
    id: `c-${targetId}`, dossierId: 'c', targetId, targetType: 'element', authorName: 'A', authorColor: '#000',
    content, resolved: false, resolvedBy: null, resolvedAt: null, createdAt: new Date(),
  }) as unknown as import('../types').Comment;

  it('finds an element by the text of its comments, and forgets it once the comment is gone', async () => {
    searchService.clear();
    const elements = [element(1, { label: 'Alpha' }), element(2, { label: 'Beta' })];
    await searchService.loadDossier('c', elements, [], [], [comment('el-2', 'vérifier le virement suspect')]);
    expect(searchService.search('virement').map((r) => r.id)).toEqual(['el-2']);

    searchService.syncIncremental(elements, [], [], []);
    expect(searchService.search('virement')).toEqual([]);
  });
});

describe('searchService.loadDossier in slices', () => {
  // Each read of the clock advances 10 ms: a slice (25 ms) holds a few documents
  let now = 0;
  beforeEach(() => {
    searchService.clear();
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (now += 10));
  });
  afterEach(() => vi.restoreAllMocks());

  const many = (n: number) => Array.from({ length: n }, (_, i) => element(i, { label: `Nom${i}` }));

  it('yields before the end, then indexes everything', async () => {
    const elements = many(50);
    const loaded = searchService.loadDossier('s', elements, []);
    expect(index().documentCount).toBeLessThan(50);
    await loaded;
    expect(index().documentCount).toBe(50);
    expect(searchService.search('Nom49', 5, 'exact').map((r) => r.id)).toEqual(['el-49']);
  });

  it('applies the changes synced during the load once it ends', async () => {
    const elements = many(50);
    const loaded = searchService.loadDossier('s', elements, []);
    const changed = [...elements.slice(1), element(99, { label: 'Ajout' })];
    searchService.syncIncremental(changed, []);
    await loaded;
    expect(searchService.search('Ajout', 5, 'exact').map((r) => r.id)).toEqual(['el-99']);
    expect(searchService.search('Nom0', 5, 'exact')).toEqual([]);
  });

  it('shows the activity bar task during a sliced load only', async () => {
    const { useProgressStore } = await import('../stores/progressStore');
    const task = () => useProgressStore.getState().tasks[SEARCH_INDEX_TASK];

    await searchService.loadDossier('small', [element(1)], []);
    expect(task()).toBeUndefined();

    const loaded = searchService.loadDossier('s', many(50), []);
    expect(task()?.labelKey).toBe('activity.searchIndex');
    expect(task()?.percent).toBeGreaterThan(0);
    await loaded;
    expect(task()).toBeUndefined();

    void searchService.loadDossier('s2', many(50), []);
    expect(task()).toBeDefined();
    searchService.clear();
    expect(task()).toBeUndefined();
  });

  it('stops when the dossier is closed during the load', async () => {
    const loaded = searchService.loadDossier('s', many(50), []);
    searchService.clear();
    await loaded;
    expect(index().documentCount).toBe(0);
  });

  it('lets a newer load of another dossier take over', async () => {
    const first = searchService.loadDossier('s', many(50), []);
    const second = searchService.loadDossier('t', [element(1, { label: 'Autre' })], []);
    await Promise.all([first, second]);
    expect(index().documentCount).toBe(1);
    expect(searchService.search('Autre', 5, 'exact').map((r) => r.id)).toEqual(['el-1']);
  });
});
