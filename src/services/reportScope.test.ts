import { describe, it, expect } from 'vitest';
import type { Asset, Element, Link } from '../types';
import { scopeReportData } from './reportScope';

const el = (id: string, over: Partial<Element> = {}) =>
  ({ id, assetIds: [], parentGroupId: null, isGroup: false, visual: { image: null }, source: '', events: [], ...over }) as unknown as Element;
const lk = (id: string, fromId: string, toId: string, assetIds: string[] = []) =>
  ({ id, fromId, toId, assetIds, source: '' }) as unknown as Link;
const asset = (id: string) => ({ id, hash: id.repeat(4) }) as unknown as Asset;

// A - B - C, D isolated, B - D; G group holding H; f1 on A, f2 on link B-C
const data = {
  elements: [el('A', { assetIds: ['f1'] }), el('B'), el('C'), el('D'), el('G', { isGroup: true }), el('H', { parentGroupId: 'G' })],
  links: [lk('ab', 'A', 'B'), lk('bc', 'B', 'C', ['f2']), lk('bd', 'B', 'D'), lk('cd', 'C', 'D')],
  assets: [asset('f1'), asset('f2'), asset('f3')],
};
const ids = (items: { id: string }[]) => items.map((i) => i.id);

describe('scopeReportData', () => {
  it('keeps everything for the whole dossier', () => {
    expect(scopeReportData(data, { kind: 'all' })).toBe(data);
  });

  it('keeps the selected elements and the links between them', () => {
    const out = scopeReportData(data, { kind: 'selection', elementIds: ['A', 'B'], linkIds: [] });
    expect(ids(out.elements)).toEqual(['A', 'B']);
    expect(ids(out.links)).toEqual(['ab']);
    expect(ids(out.assets)).toEqual(['f1']);
  });

  it('adds the direct neighbours, without joining them to each other', () => {
    const out = scopeReportData(data, { kind: 'selection', elementIds: ['B'], linkIds: [] }, true);
    expect(ids(out.elements)).toEqual(['A', 'B', 'C', 'D']);
    expect(ids(out.links)).toEqual(['ab', 'bc', 'bd']);
    expect(ids(out.assets)).toEqual(['f1', 'f2']);
  });

  it('brings the two ends of a selected link, and the children of a group', () => {
    const out = scopeReportData(data, { kind: 'selection', elementIds: ['G'], linkIds: ['bc'] });
    expect(ids(out.elements)).toEqual(['B', 'C', 'G', 'H']);
    expect(ids(out.links)).toEqual(['bc']);
  });

  it('uses the tab members, leaving out the dismissed ghosts', () => {
    const tab = { memberElementIds: ['B'], excludedElementIds: ['D'] };
    expect(ids(scopeReportData(data, { kind: 'tab', tab }).elements)).toEqual(['B']);
    expect(ids(scopeReportData(data, { kind: 'tab', tab }, true).elements)).toEqual(['A', 'B', 'C']);
  });
});
