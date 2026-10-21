// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useViewStore } from './viewStore';
import { useUIStore } from './uiStore';
import { useQueryStore } from './queryStore';
import { useDossierStore } from './dossierStore';
import { DEFAULT_FILTERS } from '../types';
import type { Element, View } from '../types';

const el = (id: string, tags: string[]) => ({
  id, label: id, notes: '', tags, properties: [], events: [], confidence: null, geo: null,
  date: null, dateRange: null, isGroup: false, isAnnotation: false,
}) as unknown as Element;

const view = (extra: Partial<View>): View => ({
  id: 'v', dossierId: 'd', name: 'v', viewport: { x: 0, y: 0, zoom: 1 },
  filters: { ...DEFAULT_FILTERS, includeTags: ['Personne'] },
  hiddenElementIds: [], displayMode: 'canvas', createdAt: new Date(), updatedAt: new Date(),
  ...extra,
}) as View;

// loadView restores the UI and query state through dynamic imports
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('viewStore.loadView', () => {
  beforeEach(() => {
    useDossierStore.setState({ elements: [el('p1', ['Personne']), el('o1', ['Organisation'])], links: [] });
    useQueryStore.getState().clear();
    useUIStore.setState({ hideFilteredOut: false });
  });

  it('restores the filters, the hide choice and the query applied', async () => {
    useViewStore.getState().loadView(view({
      hideFilteredOut: true,
      query: { text: 'tag = "Personne"', outputMode: 'canvas' },
    }));
    await settle();
    expect(useViewStore.getState().filters.includeTags).toEqual(['Personne']);
    expect(useUIStore.getState().hideFilteredOut).toBe(true);
    const q = useQueryStore.getState();
    expect(q.currentText).toBe('tag = "Personne"');
    expect(q.isFilterActive).toBe(true);
    expect([...q.matchingElementIds]).toEqual(['p1']);
  });

  it('clears the query when the view was saved without one', async () => {
    useQueryStore.getState().setText('tag = "Organisation"');
    useViewStore.getState().loadView(view({ hideFilteredOut: false, query: null }));
    await settle();
    expect(useQueryStore.getState().currentText).toBe('');
    expect(useQueryStore.getState().isFilterActive).toBe(false);
  });

  it('leaves the hide choice and the query alone for a view saved before them', async () => {
    useUIStore.setState({ hideFilteredOut: true });
    useQueryStore.getState().setText('tag = "Organisation"');
    useViewStore.getState().loadView(view({}));
    await settle();
    expect(useUIStore.getState().hideFilteredOut).toBe(true);
    expect(useQueryStore.getState().currentText).toBe('tag = "Organisation"');
  });
});
