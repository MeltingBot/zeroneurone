// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useQueryStore } from './queryStore';
import { useDossierStore } from './dossierStore';
import type { Dossier, DossierId, Element } from '../types';

const el = (id: string, tags: string[]) => ({
  id, label: id, notes: '', tags, properties: [], events: [], confidence: null, geo: null,
  date: null, dateRange: null, isGroup: false, isAnnotation: false,
}) as unknown as Element;

const open = (id: string | null) =>
  useDossierStore.setState({ currentDossier: id ? ({ id } as unknown as Dossier) : null });

const run = (text: string) => {
  useQueryStore.getState().setText(text);
  useQueryStore.getState().execute();
};

describe('queryStore — one history per dossier', () => {
  beforeEach(() => {
    open(null);
    useQueryStore.setState({ recentQueries: [], recentByDossier: {} });
    useDossierStore.setState({ elements: [el('p1', ['Personne'])], links: [] });
  });

  it('does not show a query typed in one dossier in another', () => {
    open('A');
    run('tag = "Personne"');
    expect(useQueryStore.getState().recentQueries).toEqual(['tag = "Personne"']);

    open('B');
    const b = useQueryStore.getState();
    expect(b.recentQueries).toEqual([]);
    expect(b.currentText).toBe('');
    expect(b.isFilterActive).toBe(false);
    expect(b.results).toBeNull();
  });

  it('gives a dossier its history back when it is opened again', () => {
    open('A');
    run('tag = "Personne"');
    open('B');
    run('label = "x"');
    open('A');
    expect(useQueryStore.getState().recentQueries).toEqual(['tag = "Personne"']);
  });

  it('merges imported history into the target dossier only', () => {
    open('A');
    run('tag = "Personne"');
    useQueryStore.getState().mergeRecentQueries('B' as DossierId, ['label = "y"']);
    expect(useQueryStore.getState().recentQueries).toEqual(['tag = "Personne"']);

    open('B');
    expect(useQueryStore.getState().recentQueries).toEqual(['label = "y"']);
  });
});
