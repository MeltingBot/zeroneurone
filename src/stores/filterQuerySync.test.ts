// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import type { Element } from '../types';
import { useDossierStore, useQueryStore, useViewStore } from './index';
import { editQuery } from './filterQuerySync';
import type { QueryAnd } from '../services/query/types';

const el = (id: string, tags: string[]): Element =>
  ({ id, label: id, notes: '', tags, properties: [], source: '', confidence: null, evaluation: null, geo: null, events: [] } as unknown as Element);

const query = () => useQueryStore.getState();
const filters = () => useViewStore.getState().filters;
const typeText = (text: string) => editQuery(() => query().setText(text));

describe('filters written in the query panel', () => {
  beforeEach(() => {
    useViewStore.getState().clearFilters();
    query().clear();
    useQueryStore.setState({ recentQueries: [] });
    useDossierStore.setState({ elements: [el('a', ['Personne']), el('b', ['Société'])] });
  });

  it('writes the filters as ZNQuery while the query is empty or theirs', () => {
    useViewStore.getState().addIncludeTag('Personne');
    expect(query().currentText).toBe('type = "element" AND tag = "Personne"');
    expect([...query().matchingElementIds]).toEqual(['a']);
    useViewStore.getState().addIncludeTag('Société');
    expect(query().currentText).toBe('type = "element" AND tag IN ("Personne", "Société")');
    // Not a recent query: the filters panel gives it back
    expect(query().recentQueries).toEqual([]);
    useViewStore.getState().clearFilters();
    expect(query().currentText).toBe('');
  });

  it('leaves another query as it is, the filters beside it', () => {
    query().setText('label CONTAINS "a"');
    useViewStore.getState().addIncludeTag('Personne');
    expect(query().currentText).toBe('label CONTAINS "a"');
    // A query written elsewhere (focus, view…) replaces the filters' query, filters kept
    useViewStore.getState().clearFilters();
    query().clear();
    useViewStore.getState().addIncludeTag('Personne');
    query().setText('WITHIN 1 HOPS OF label = "a"');
    expect(filters().includeTags).toEqual(['Personne']);
    // Emptied, the query is the filters' again
    query().clear();
    expect(query().currentText).toBe('type = "element" AND tag = "Personne"');
  });

  it('unchecks the filters when their query is cleared or edited in the query panel', () => {
    useViewStore.getState().addIncludeTag('Personne');
    editQuery(() => query().clear());
    expect(filters().includeTags).toEqual([]);
    expect(query().currentText).toBe('');

    useViewStore.getState().addIncludeTag('Personne');
    typeText('type = "element" AND tag = "Société"');
    expect(filters().includeTags).toEqual([]);
    expect(query().currentText).toBe('type = "element" AND tag = "Société"');
    expect([...query().matchingElementIds]).toEqual(['b']);
  });

  it('waits while the text being typed does not parse', () => {
    useViewStore.getState().addIncludeTag('Personne');
    typeText('type = "element" AND tag = "Personne" AND');
    expect(filters().includeTags).toEqual(['Personne']);
    typeText('type = "element" AND tag = "Personne"');
    expect(filters().includeTags).toEqual(['Personne']);
    expect(query().filterPart).not.toBeNull();
  });

  it('waits while a condition of the visual builder has no field', () => {
    useViewStore.getState().addIncludeTag('Personne');
    const part = query().filterPart!;
    const blank = { type: 'condition' as const, field: '', operator: 'eq' as const, value: '' };
    editQuery(() => query().setAst({ type: 'and', children: [...(part as QueryAnd).children, blank] }));
    expect(filters().includeTags).toEqual(['Personne']);
  });

  it('knows its own query written back elsewhere (a view saved with it)', () => {
    useViewStore.getState().addIncludeTag('Personne');
    query().setText('type = "element" AND tag = "Personne"');
    expect(query().filterPart).not.toBeNull();
    typeText('');
    expect(filters().includeTags).toEqual([]);
  });

  it('keeps the filters the query cannot say', () => {
    useViewStore.getState().setFilters({ textSearch: 'a', includeTags: ['Personne'] });
    editQuery(() => query().clear());
    expect(filters().textSearch).toBe('a');
    expect(filters().includeTags).toEqual([]);
  });
});
