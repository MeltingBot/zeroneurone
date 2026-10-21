// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useQueryStore } from './queryStore';
import { useDossierStore } from './dossierStore';
import type { Element } from '../types';

const el = (id: string, tags: string[]) => ({
  id, label: id, notes: '', tags, properties: [], events: [], confidence: null, geo: null,
  date: null, dateRange: null, isGroup: false, isAnnotation: false,
}) as unknown as Element;

describe('queryStore.setOutputMode', () => {
  beforeEach(() => {
    useDossierStore.setState({ elements: [el('p1', ['Personne']), el('o1', ['Organisation'])], links: [] });
    useQueryStore.getState().clear();
  });

  it('fills what the query keeps when it is applied to the views again', () => {
    const q = useQueryStore.getState();
    q.setOutputMode('table');
    q.setText('tag = "Personne"');
    expect(useQueryStore.getState().isFilterActive).toBe(false);
    expect(useQueryStore.getState().matchingElementIds.size).toBe(0);

    useQueryStore.getState().setOutputMode('both');
    const after = useQueryStore.getState();
    expect(after.isFilterActive).toBe(true);
    expect([...after.matchingElementIds]).toEqual(['p1']);
  });

  it('empties it when the query no longer applies to the views', () => {
    useQueryStore.getState().setText('tag = "Personne"');
    useQueryStore.getState().setOutputMode('table');
    expect(useQueryStore.getState().matchingElementIds.size).toBe(0);
  });
});
