// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type { Element, Link } from '../types';
import { DEFAULT_FILTERS } from '../types';
import { computeFilterOutcome } from './useFilterOutcome';

function el(id: string, tags: string[]): Element {
  return {
    id, label: id, notes: '', tags, properties: [], events: [],
    dateRange: null, date: null, geo: null, confidence: null, isGroup: false, isAnnotation: false,
  } as unknown as Element;
}
const link = (id: string, fromId: string, toId: string) => ({ id, fromId, toId }) as unknown as Link;

const elements = [el('p1', ['Personne']), el('p2', ['Personne']), el('o1', ['Organisation']), el('x', [])];
const links = [link('l1', 'p1', 'p2'), link('l2', 'p1', 'o1')];
const personne = { ...DEFAULT_FILTERS, includeTags: ['Personne'] };
const none = new Set<string>();

describe('computeFilterOutcome', () => {
  it('counts the filters alone without a query', () => {
    const o = computeFilterOutcome(elements, links, personne, none, 'zeroneurone', false, none, none);
    expect(o).toMatchObject({ total: 4, filterCount: 2, queryCount: null, shownLinkIds: [] });
    expect(o.shownIds).toEqual(['p1', 'p2']);
  });

  it('shows what both the filters and the query keep', () => {
    const query = new Set(['p1', 'o1']);
    const o = computeFilterOutcome(elements, links, personne, none, 'zeroneurone', true, query, none);
    expect(o.filterCount).toBe(2);
    expect(o.queryCount).toBe(2);
    expect(o.shownIds).toEqual(['p1']);
  });

  it('ignores a query not applied on the views', () => {
    const o = computeFilterOutcome(elements, links, personne, none, 'zeroneurone', false, new Set(['p1']), none);
    expect(o.queryCount).toBeNull();
    expect(o.shownIds).toEqual(['p1', 'p2']);
  });

  it('keeps the query links whose two ends are shown', () => {
    const o = computeFilterOutcome(
      elements, links, personne, none, 'zeroneurone',
      true, new Set(['p1', 'p2', 'o1']), new Set(['l1', 'l2']),
    );
    expect(o.shownLinkIds).toEqual(['l1']);
  });

  it('leaves out the elements hidden by hand', () => {
    const o = computeFilterOutcome(elements, links, DEFAULT_FILTERS, new Set(['x']), 'zeroneurone', false, none, none);
    expect(o.total).toBe(3);
    expect(o.shownIds).not.toContain('x');
  });

  it('counts and shows only the members of the open tab', () => {
    const o = computeFilterOutcome(elements, links, personne, none, 'zeroneurone', false, none, none, new Set(['p1', 'o1']));
    expect(o).toMatchObject({ total: 2, filterCount: 1 });
    expect(o.shownIds).toEqual(['p1']);
  });
});
