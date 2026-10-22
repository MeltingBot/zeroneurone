import { describe, it, expect } from 'vitest';
import type { Element, Property } from '../types';
import { matrixFiltersToQuery } from './matrixFilterQuery';
import { evaluateQuery } from '../services/query/evaluator';
import { serializeQuery } from '../services/query/serializer';
import { parseQuery } from '../services/query/parser';

const el = (id: string, properties: Property[], over: Partial<Element> = {}): Element =>
  ({ id, label: id, tags: [], properties, source: '', ...over } as unknown as Element);
const text = (key: string, value: string): Property => ({ key, value, type: 'text' });

const elements = [
  el('a', [text("Type d'enquête", 'Enquête de flagrance'), text('Unité', 'BTA Cognac')], { tags: ['Fait'] }),
  el('b', [text("Type d'enquête", 'Préliminaire'), text('Unité', 'COB Cognac')]),
  el('c', [text("Type d'enquête", 'enquête de FLAGRANCE'), text('Unité', 'BTA Macau')]),
  el('d', [{ key: 'Date des faits', value: new Date('2026-01-02'), type: 'date' }]),
];

describe('matrixFiltersToQuery', () => {
  it('keeps the same rows as the column filters, case aside', () => {
    const { ast } = matrixFiltersToQuery({ "Type d'enquête": 'flagra', Unité: 'BTA' }, elements);
    expect(ast).not.toBeNull();
    expect([...evaluateQuery(ast!, elements, []).elementIds].sort()).toEqual(['a', 'c']);
  });

  it('writes a query the parser reads back', () => {
    const { ast } = matrixFiltersToQuery({ "Type d'enquête": 'flagra', label: 'a' }, elements);
    const parsed = parseQuery(serializeQuery(ast!));
    expect(parsed.error).toBeNull();
    expect([...evaluateQuery(parsed.ast!, elements, []).elementIds]).toEqual(['a']);
  });

  it('maps the fixed columns to their fields', () => {
    const { ast } = matrixFiltersToQuery({ tags: 'fai' }, elements);
    expect(ast).toEqual({ type: 'condition', field: 'tag', operator: 'contains', value: 'fai' });
  });

  it('builds nothing when a filter has no exact query', () => {
    expect(matrixFiltersToQuery({ confidence: '80' }, elements)).toEqual({ ast: null, unsupported: ['confidence'] });
    expect(matrixFiltersToQuery({ 'Date des faits': '2026', Unité: 'BTA' }, elements)).toEqual({ ast: null, unsupported: ['Date des faits'] });
    expect(matrixFiltersToQuery({ Unité: '—' }, elements).ast).toBeNull();
    expect(matrixFiltersToQuery({ Unité: '  ' }, elements)).toEqual({ ast: null, unsupported: [] });
  });
});
