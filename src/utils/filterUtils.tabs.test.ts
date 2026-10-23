import { describe, it, expect } from 'vitest';
import type { CanvasTab, Element } from '../types';
import { DEFAULT_FILTERS } from '../types';
import { getDimmedElementIds, tabFilterElementIds } from './filterUtils';

const el = (id: string) => ({ id, label: id, notes: '', tags: [], properties: [], events: [], geo: null, confidence: null }) as unknown as Element;
const tab = (id: string, members: string[]) => ({ id, memberElementIds: members }) as unknown as CanvasTab;

const elements = [el('a'), el('b'), el('c')];
const tabs = [tab('t1', ['a']), tab('t2', ['b'])];

describe('tabs filter', () => {
  it('keeps the members of the chosen tabs in the "All" view', () => {
    const ids = tabFilterElementIds({ ...DEFAULT_FILTERS, includeTabs: ['t1', 't2'] }, tabs, null);
    expect([...ids!].sort()).toEqual(['a', 'b']);
    expect([...getDimmedElementIds(elements, DEFAULT_FILTERS, new Set(), 'zeroneurone', ids)]).toEqual(['c']);
  });

  it('does not apply inside a tab, with nothing chosen, or with chosen tabs gone', () => {
    expect(tabFilterElementIds({ ...DEFAULT_FILTERS, includeTabs: ['t1'] }, tabs, 't2')).toBeNull();
    expect(tabFilterElementIds(DEFAULT_FILTERS, tabs, null)).toBeNull();
    expect(tabFilterElementIds({ ...DEFAULT_FILTERS, includeTabs: ['gone'] }, tabs, null)).toBeNull();
  });
});
