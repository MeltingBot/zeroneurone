import { describe, it, expect } from 'vitest';
import type { ExportData } from './exportService';
import { selectZipTabs, zipTabsOverview } from './zipTabSelection';

type Data = Pick<ExportData, 'elements' | 'links' | 'tabs' | 'assets'>;

const el = (id: string, over: Record<string, unknown> = {}) =>
  ({ id, label: id, assetIds: [], source: '', parentGroupId: null, childIds: [], ...over }) as unknown as ExportData['elements'][number];
const link = (id: string, fromId: string, toId: string) =>
  ({ id, fromId, toId, source: '' }) as unknown as ExportData['links'][number];
const tab = (id: string, name: string, order: number, memberElementIds: string[]) =>
  ({ id, name, order, memberElementIds, excludedElementIds: [] }) as unknown as NonNullable<ExportData['tabs']>[number];
const asset = (id: string) => ({ id, filename: `${id}.pdf`, mimeType: 'application/pdf', size: 1, archivePath: `assets/${id}.pdf` });

function archive(): Data {
  return {
    elements: [el('a', { assetIds: ['f1'] }), el('b'), el('c', { assetIds: ['f2'] }), el('d')],
    links: [link('ab', 'a', 'b'), link('bc', 'b', 'c'), link('cd', 'c', 'd')],
    tabs: [tab('t2', 'Transport', 2, ['c']), tab('t1', 'Énergie', 1, ['a', 'b'])],
    assets: [asset('f1'), asset('f2')],
  };
}

describe('zipTabsOverview', () => {
  it('lists the tabs in order with their counts, and the elements in none', () => {
    expect(zipTabsOverview(archive())).toEqual({
      tabs: [{ id: 't1', name: 'Énergie', count: 2 }, { id: 't2', name: 'Transport', count: 1 }],
      unassignedCount: 1,
      reportSections: 0,
    });
  });
});

describe('selectZipTabs', () => {
  it('keeps the chosen tabs, the links between kept elements and their files', () => {
    const out = selectZipTabs(archive(), { tabIds: ['t1'], includeUnassigned: false });
    expect(out.elements.map((e) => e.id)).toEqual(['a', 'b']);
    expect(out.links.map((l) => l.id)).toEqual(['ab']);
    expect(out.tabs?.map((t) => t.id)).toEqual(['t1']);
    expect(out.assets?.map((a) => a.id)).toEqual(['f1']);
  });

  it('adds the elements in no tab when asked', () => {
    const out = selectZipTabs(archive(), { tabIds: ['t2'], includeUnassigned: true });
    expect(out.elements.map((e) => e.id)).toEqual(['c', 'd']);
    expect(out.links.map((l) => l.id)).toEqual(['cd']);
  });

  it('adds the elements linked to a kept one when asked, filed elsewhere or not', () => {
    const out = selectZipTabs(archive(), { tabIds: ['t1'], includeUnassigned: false, includeLinked: true });
    expect(out.elements.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(out.links.map((l) => l.id)).toEqual(['ab', 'bc']);
    expect(out.assets?.map((a) => a.id)).toEqual(['f1', 'f2']);
  });

  it('brings the group of a kept child and the children of a kept group', () => {
    const data: Data = {
      elements: [el('g', { childIds: ['x', 'y'] }), el('x', { parentGroupId: 'g' }), el('y', { parentGroupId: 'g' }), el('z')],
      links: [],
      tabs: [tab('t', 'T', 0, ['x'])],
      assets: [],
    };
    expect(selectZipTabs(data, { tabIds: ['t'], includeUnassigned: false }).elements.map((e) => e.id)).toEqual(['g', 'x', 'y']);
  });

  it('keeps every file when a kept source points at one (its hash is not known yet)', () => {
    const data = archive();
    data.elements[0] = el('a', { source: '[PV](asset:3fa1b2c3d4e5f6a7)' });
    const out = selectZipTabs(data, { tabIds: ['t1'], includeUnassigned: false });
    expect(out.assets?.map((a) => a.id)).toEqual(['f1', 'f2']);
  });
});
