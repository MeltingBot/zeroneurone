import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CanvasTab } from '../types';

vi.mock('../db/repositories/tabRepository', () => ({
  tabRepository: { update: vi.fn().mockResolvedValue(undefined) },
}));

import { useTabStore, setTabViewportBridge } from './tabStore';

const tab = (id: string, members: string[], viewport = { x: 0, y: 0, zoom: 1 }): CanvasTab => ({
  id, dossierId: 'd', name: id, order: 0, memberElementIds: members, excludedElementIds: [],
  viewport, createdAt: new Date(), updatedAt: new Date(),
});

let view = { x: 10, y: 20, zoom: 1.5 };
let canvas = true;
const restore = vi.fn((v: typeof view) => { view = v; });
const fit = vi.fn();
setTabViewportBridge({ current: () => view, restore, fit, canvasShown: () => canvas });

const state = () => useTabStore.getState();
const tabById = (id: string) => state().tabs.find((t) => t.id === id)!;

describe('each tab keeps its zoom and centre', () => {
  beforeEach(() => {
    restore.mockClear();
    fit.mockClear();
    canvas = true;
    view = { x: 10, y: 20, zoom: 1.5 };
    useTabStore.setState({
      tabs: [tab('A', ['a']), tab('B', ['b'], { x: -300, y: 40, zoom: 0.5 })],
      activeTabId: 'A', extraTabIds: [], allViewport: null,
    });
  });

  it('saves the tab left and restores the one opened', () => {
    state().setActiveTab('B');
    expect(tabById('A').viewport).toEqual({ x: 10, y: 20, zoom: 1.5 });
    expect(restore).toHaveBeenCalledWith({ x: -300, y: 40, zoom: 0.5 });
  });

  it('frames a tab never seen on its elements', () => {
    useTabStore.setState({ activeTabId: 'B' });
    state().setActiveTab('A');
    expect(restore).not.toHaveBeenCalled();
    expect(fit).toHaveBeenCalledWith(['a']);
  });

  it('remembers "All" too', () => {
    state().setActiveTab(null);
    expect(fit).toHaveBeenCalledWith([]);
    view = { x: 1, y: 2, zoom: 3 };
    state().setActiveTab('A');
    restore.mockClear();
    state().setActiveTab(null);
    expect(restore).toHaveBeenCalledWith({ x: 1, y: 2, zoom: 3 });
  });

  it('leaves the map and the timeline alone, and does nothing on the same tab', () => {
    canvas = false;
    state().setActiveTab('B');
    expect(restore).not.toHaveBeenCalled();
    canvas = true;
    state().setActiveTab('B');
    expect(restore).not.toHaveBeenCalled();
    expect(fit).not.toHaveBeenCalled();
  });
});

describe('a centring asked right after a tab switch wins', () => {
  it('drops the framing of a tab never seen when a viewport change follows', async () => {
    const { useViewStore } = await import('./viewStore');
    const v = useViewStore.getState();
    v.requestFitView(['a']);
    v.requestViewportChange({ x: 1, y: 2, zoom: 1 });
    expect(useViewStore.getState().pendingFitView).toBe(false);
    expect(useViewStore.getState().pendingViewport).toEqual({ x: 1, y: 2, zoom: 1 });
    v.requestFitView(['a']);
    expect(useViewStore.getState().pendingViewport).toBeNull();
  });
});
