import { describe, it, expect, beforeEach } from 'vitest';
import type { CanvasTab } from '../types';
import { useTabStore, openTabIds } from './tabStore';

const tab = (id: string, members: string[], excluded: string[] = []): CanvasTab => ({
  id, dossierId: 'd', name: id, order: 0, memberElementIds: members, excludedElementIds: excluded,
  viewport: { x: 0, y: 0, zoom: 1 }, createdAt: new Date(), updatedAt: new Date(),
});

const state = () => useTabStore.getState();
const members = () => [...state().memberSet].sort();

describe('combined tabs', () => {
  beforeEach(() => {
    useTabStore.setState({ tabs: [tab('A', ['a', 'shared']), tab('B', ['b', 'shared']), tab('C', ['c'])], extraTabIds: [] });
    state().setActiveTab('A');
  });

  it('shows the union of the open and combined tabs', () => {
    state().toggleCombinedTab('B');
    expect(openTabIds(state())).toEqual(['A', 'B']);
    expect(members()).toEqual(['a', 'b', 'shared']);
  });

  it('uncombines, and hands the open role to a combined tab when leaving the open one', () => {
    state().toggleCombinedTab('B');
    state().toggleCombinedTab('C');
    state().toggleCombinedTab('B');
    expect(openTabIds(state())).toEqual(['A', 'C']);
    state().toggleCombinedTab('A');
    expect(openTabIds(state())).toEqual(['C']);
    expect(members()).toEqual(['c']);
  });

  it('cannot leave the only open tab, and opening a tab alone clears the combination', () => {
    state().toggleCombinedTab('A');
    expect(openTabIds(state())).toEqual(['A']);
    state().toggleCombinedTab('B');
    state().setActiveTab('C');
    expect(openTabIds(state())).toEqual(['C']);
  });

  it('from "All", Ctrl+click opens the tab', () => {
    state().setActiveTab(null);
    state().toggleCombinedTab('B');
    expect(openTabIds(state())).toEqual(['B']);
  });

  describe('collaboration (remote changes)', () => {
    it('follows a remote change to a combined tab', () => {
      state().toggleCombinedTab('B');
      state()._syncTabsFromYDoc([tab('A', ['a', 'shared']), tab('B', ['b', 'shared', 'b2']), tab('C', ['c'])]);
      expect(members()).toEqual(['a', 'b', 'b2', 'shared']);
      expect(openTabIds(state())).toEqual(['A', 'B']);
    });

    it('drops a combined tab deleted remotely', () => {
      state().toggleCombinedTab('B');
      state()._syncTabsFromYDoc([tab('A', ['a', 'shared']), tab('C', ['c'])]);
      expect(openTabIds(state())).toEqual(['A']);
      expect(members()).toEqual(['a', 'shared']);
    });

    it('hands over to a combined tab when the open one is deleted remotely', () => {
      state().toggleCombinedTab('B');
      state().toggleCombinedTab('C');
      state()._syncTabsFromYDoc([tab('B', ['b', 'shared']), tab('C', ['c'])]);
      expect(openTabIds(state())).toEqual(['B', 'C']);
      expect(members()).toEqual(['b', 'c', 'shared']);
    });

    it('stays in "All" when a tab changes remotely', () => {
      state().setActiveTab(null);
      state()._syncTabsFromYDoc([tab('A', ['a']), tab('B', ['b'])]);
      expect(state().activeTabId).toBeNull();
      expect(state().memberSet.size).toBe(0);
    });
  });
});
