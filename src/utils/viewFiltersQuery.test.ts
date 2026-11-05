import { describe, it, expect } from 'vitest';
import type { Element, Link, Property, ViewFilters } from '../types';
import { DEFAULT_FILTERS } from '../types';
import { sameQuery, viewFiltersToQuery } from './viewFiltersQuery';
import { elementMatchesFilters } from './filterUtils';
import { evaluateQuery } from '../services/query/evaluator';
import { serializeQuery } from '../services/query/serializer';
import { parseQuery } from '../services/query/parser';

const el = (id: string, over: Partial<Element> = {}): Element =>
  ({
    id, label: id, notes: '', tags: [], properties: [], source: '', confidence: null,
    evaluation: null, geo: null, events: [], isGroup: false, parentGroupId: null, ...over,
  } as unknown as Element);
const text = (key: string, value: unknown): Property => ({ key, value, type: 'text' } as Property);

const elements: Element[] = [
  el('a', { tags: ['Personne'], properties: [text('Téléphone', '0601')], confidence: 80, geo: { type: 'point', lat: 1, lng: 2 } as Element['geo'] }),
  el('b', { tags: ['Société'], confidence: 40, evaluation: { scale: 'europol', source: 'A', info: '1' } as Element['evaluation'] }),
  el('c', { tags: ['Personne', 'Suspect'], properties: [text('Téléphone', '0602')], evaluation: { scale: 'europol', source: 'B', info: '2' } as Element['evaluation'] }),
  el('d', { evaluation: { scale: 'admiralty', source: 'A', info: '1' } as Element['evaluation'] }),
];
const links: Link[] = [
  { id: 'l1', fromId: 'b', toId: 'd', tags: ['Personne'], properties: [], label: '', notes: '', confidence: 90, evaluation: null, source: '' } as unknown as Link,
];

const filters = (over: Partial<ViewFilters>): ViewFilters => ({ ...DEFAULT_FILTERS, ...over });

/** The query keeps exactly the elements the filters keep, and no link */
function expectSameAsFilters(f: ViewFilters, model: 'zeroneurone' | 'europol' = 'zeroneurone') {
  const { ast } = viewFiltersToQuery(f, elements, model, false);
  expect(ast).not.toBeNull();
  const kept = elements.filter((e) => elementMatchesFilters(e, f, model)).map((e) => e.id);
  const result = evaluateQuery(ast!, elements, links);
  expect([...result.elementIds].sort()).toEqual(kept.sort());
  expect(result.linkIds.size).toBe(0);
  // The text round-trips to the same query
  expect(sameQuery(parseQuery(serializeQuery(ast!)).ast, ast)).toBe(true);
  return serializeQuery(ast!);
}

describe('viewFiltersToQuery', () => {
  it('keeps what the filters keep', () => {
    expect(expectSameAsFilters(filters({ includeTags: ['Personne'] }))).toBe('type = "element" AND tag = "Personne"');
    expect(expectSameAsFilters(filters({ includeTags: ['Personne', 'Société'] }))).toBe('type = "element" AND tag IN ("Personne", "Société")');
    expect(expectSameAsFilters(filters({ excludeTags: ['Suspect'] }))).toBe('type = "element" AND NOT tag = "Suspect"');
    expect(expectSameAsFilters(filters({ hasProperty: 'Téléphone' }))).toBe('type = "element" AND Téléphone EXISTS');
    expect(expectSameAsFilters(filters({ minConfidence: 50 }))).toBe('type = "element" AND confidence >= 50');
    expect(expectSameAsFilters(filters({ hasGeo: true }))).toBe('type = "element" AND has_geo = true');
    expect(expectSameAsFilters(filters({ evaluationSources: ['A', 'B'], evaluationInfos: ['1'] }), 'europol'))
      .toBe('type = "element" AND evaluation.scale = "europol" AND evaluation.source IN ("A", "B") AND evaluation.info = "1"');
    expectSameAsFilters(filters({ includeTags: ['Personne'], hasProperty: 'Téléphone', minConfidence: 50 }));
  });

  it('follows the evaluation model like the filters', () => {
    // Confidence counts in the ZeroNeurone model only, gradings in the others only
    expect(viewFiltersToQuery(filters({ minConfidence: 50 }), elements, 'europol', false).ast).toBeNull();
    expect(viewFiltersToQuery(filters({ evaluationSources: ['A'] }), elements, 'zeroneurone', false).ast).toBeNull();
  });

  it('leaves out what it cannot say exactly, and lists it', () => {
    const res = viewFiltersToQuery(
      filters({ textSearch: 'tél', dateFrom: new Date(2026, 0, 1), includeTags: ['Personne'] }),
      elements, 'zeroneurone', true,
    );
    expect(res.gaps).toEqual(['textSearch', 'period', 'tabs']);
    expect(serializeQuery(res.ast!)).toBe('type = "element" AND tag = "Personne"');
    expect(viewFiltersToQuery(filters({ textSearch: 'x' }), elements, 'zeroneurone', false)).toEqual({ ast: null, gaps: ['textSearch'] });
  });

  it('leaves out tags and property names that differ only by case, or a property left empty', () => {
    const twins = [...elements, el('e', { tags: ['personne'], properties: [text('téléphone', '1')] })];
    expect(viewFiltersToQuery(filters({ includeTags: ['Personne'] }), twins, 'zeroneurone', false).gaps).toEqual(['tags']);
    expect(viewFiltersToQuery(filters({ hasProperty: 'Téléphone' }), twins, 'zeroneurone', false).gaps).toEqual(['property']);
    const empty = [...elements, el('f', { properties: [text('Téléphone', '')] })];
    expect(viewFiltersToQuery(filters({ hasProperty: 'Téléphone' }), empty, 'zeroneurone', false).gaps).toEqual(['property']);
    // A property named like a reserved field is read as that field
    expect(viewFiltersToQuery(filters({ hasProperty: 'label' }), elements, 'zeroneurone', false).gaps).toEqual(['property']);
  });

  it('gives nothing without filters', () => {
    expect(viewFiltersToQuery(DEFAULT_FILTERS, elements, 'zeroneurone', false)).toEqual({ ast: null, gaps: [] });
  });
});
