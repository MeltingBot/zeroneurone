import { describe, it, expect } from 'vitest';
import { parseQuery } from '../parser';
import { serializeQuery } from '../serializer';
import type { QueryNode, QueryAnd, QueryOr } from '../types';

// Helper: round-trip test — parse → serialize → parse and compare ASTs
function roundTrip(input: string, expectedOutput?: string) {
  const r1 = parseQuery(input);
  expect(r1.error).toBeNull();
  const text = serializeQuery(r1.ast!);
  if (expectedOutput !== undefined) {
    expect(text).toBe(expectedOutput);
  }
  // Parse the serialized text and verify it produces an equivalent AST
  const r2 = parseQuery(text);
  expect(r2.error).toBeNull();
  // Deep-compare (ignoring Date object identity)
  expect(normalizeNode(r2.ast!)).toEqual(normalizeNode(r1.ast!));
}

// Normalize dates to ISO strings for deep comparison
function normalizeNode(node: QueryNode): unknown {
  switch (node.type) {
    case 'condition':
      return {
        type: 'condition',
        field: node.field,
        operator: node.operator,
        value: node.value instanceof Date ? node.value.toISOString() : node.value,
      };
    case 'and':
      return { type: 'and', children: node.children.map(normalizeNode) };
    case 'or':
      return { type: 'or', children: node.children.map(normalizeNode) };
    case 'not':
      return { type: 'not', child: normalizeNode(node.child) };
  }
}

// ── Simple conditions ──

describe('serializer — simple conditions', () => {
  it('field = "string"', () => {
    roundTrip('tag = "personne"', 'tag = "personne"');
  });

  it('field != "string"', () => {
    roundTrip('tag != "archivé"', 'tag != "archivé"');
  });

  it('field > number', () => {
    roundTrip('confidence > 60', 'confidence > 60');
  });

  it('field = date', () => {
    roundTrip('date = 2024-01-15', 'date = 2024-01-15');
  });

  it('field = boolean', () => {
    roundTrip('has_geo = true', 'has_geo = true');
  });

  it('EXISTS', () => {
    roundTrip('email EXISTS', 'email EXISTS');
  });

  it('NOT EXISTS', () => {
    roundTrip('date NOT EXISTS', 'date NOT EXISTS');
  });

  it('CONTAINS', () => {
    roundTrip('notes CONTAINS "test"', 'notes CONTAINS "test"');
  });

  it('MATCHES regex', () => {
    roundTrip('"Numero SIREN" MATCHES /^[0-9]{9}$/', '"Numero SIREN" MATCHES /^[0-9]{9}$/');
  });
});

// ── Quoted fields ──

describe('serializer — quoted fields', () => {
  it('preserves quoted fields with spaces', () => {
    roundTrip('"Numero SIREN" = "123456789"', '"Numero SIREN" = "123456789"');
  });

  it('does not quote simple identifiers', () => {
    roundTrip('tag = "test"', 'tag = "test"');
  });

  it('preserves dotted fields', () => {
    roundTrip('from.label = "Alice"', 'from.label = "Alice"');
  });
});

// ── Logical operators ──

describe('serializer — logical operators', () => {
  it('AND', () => {
    roundTrip('tag = "a" AND tag = "b"', 'tag = "a" AND tag = "b"');
  });

  it('OR', () => {
    roundTrip('tag = "a" OR tag = "b"', 'tag = "a" OR tag = "b"');
  });

  it('NOT', () => {
    roundTrip('NOT tag = "archivé"', 'NOT tag = "archivé"');
  });
});

// ── Parenthesization ──

describe('serializer — minimal parentheses', () => {
  it('no parens for flat AND', () => {
    roundTrip('a = "1" AND b = "2" AND c = "3"', 'a = "1" AND b = "2" AND c = "3"');
  });

  it('no parens for flat OR', () => {
    roundTrip('a = "1" OR b = "2" OR c = "3"', 'a = "1" OR b = "2" OR c = "3"');
  });

  it('wraps OR inside AND', () => {
    // AND(OR(a,b), c) → (a OR b) AND c
    const ast: QueryAnd = {
      type: 'and',
      children: [
        { type: 'or', children: [
          { type: 'condition', field: 'a', operator: 'eq', value: '1' },
          { type: 'condition', field: 'b', operator: 'eq', value: '2' },
        ]},
        { type: 'condition', field: 'c', operator: 'eq', value: '3' },
      ],
    };
    expect(serializeQuery(ast)).toBe('(a = "1" OR b = "2") AND c = "3"');
  });

  it('no extra parens for AND inside OR', () => {
    // OR(AND(a,b), c) → a AND b OR c
    const ast: QueryOr = {
      type: 'or',
      children: [
        { type: 'and', children: [
          { type: 'condition', field: 'a', operator: 'eq', value: '1' },
          { type: 'condition', field: 'b', operator: 'eq', value: '2' },
        ]},
        { type: 'condition', field: 'c', operator: 'eq', value: '3' },
      ],
    };
    // AND binds tighter than OR, so no parens needed
    expect(serializeQuery(ast)).toBe('a = "1" AND b = "2" OR c = "3"');
  });
});

// ── Complex round-trips ──

describe('serializer — complex round-trips', () => {
  it('spec example: tag AND ville', () => {
    roundTrip('tag = "personne" AND ville = "Paris"');
  });

  it('spec example: date range with confidence', () => {
    roundTrip('date >= 2024-01-01 AND date < 2025-01-01 AND confidence > 60');
  });

  it('spec example: link type filter', () => {
    roundTrip('type = "link" AND from.tag = "personne" AND to.tag = "entreprise"');
  });

  it('spec example: combined with parentheses', () => {
    roundTrip('(tag = "personne" OR tag = "entreprise") AND ville = "Paris" AND confidence >= 50');
  });

  it('NOT with parenthesized group', () => {
    roundTrip('NOT (tag = "archivé")');
  });

  it('nested NOT', () => {
    roundTrip('NOT NOT tag = "test"');
  });
});
