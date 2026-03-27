import { describe, it, expect } from 'vitest';
import { parseQuery } from '../parser';
import type { QueryNode, QueryCondition, QueryAnd, QueryOr, QueryNot } from '../types';

// Helper: expect a successful parse and return the AST
function parse(input: string): QueryNode {
  const result = parseQuery(input);
  expect(result.error).toBeNull();
  return result.ast!;
}

// Helper: expect a parse error
function parseError(input: string) {
  const result = parseQuery(input);
  expect(result.ast).toBeNull();
  expect(result.error).not.toBeNull();
  return result.error!;
}

// ── Simple conditions ──

describe('parser — simple conditions', () => {
  it('field = "string"', () => {
    const ast = parse('tag = "personne"') as QueryCondition;
    expect(ast.type).toBe('condition');
    expect(ast.field).toBe('tag');
    expect(ast.operator).toBe('eq');
    expect(ast.value).toBe('personne');
  });

  it('field != "string"', () => {
    const ast = parse('tag != "archivé"') as QueryCondition;
    expect(ast.operator).toBe('neq');
    expect(ast.value).toBe('archivé');
  });

  it('field > number', () => {
    const ast = parse('confidence > 60') as QueryCondition;
    expect(ast.operator).toBe('gt');
    expect(ast.value).toBe(60);
  });

  it('field >= number', () => {
    const ast = parse('confidence >= 50') as QueryCondition;
    expect(ast.operator).toBe('gte');
    expect(ast.value).toBe(50);
  });

  it('field < number', () => {
    const ast = parse('confidence < 30') as QueryCondition;
    expect(ast.operator).toBe('lt');
    expect(ast.value).toBe(30);
  });

  it('field <= number', () => {
    const ast = parse('confidence <= 100') as QueryCondition;
    expect(ast.operator).toBe('lte');
    expect(ast.value).toBe(100);
  });

  it('field = date', () => {
    const ast = parse('date = 2024-01-15') as QueryCondition;
    expect(ast.operator).toBe('eq');
    expect(ast.value).toBeInstanceOf(Date);
    expect((ast.value as Date).getFullYear()).toBe(2024);
    expect((ast.value as Date).getMonth()).toBe(0);
    expect((ast.value as Date).getDate()).toBe(15);
  });

  it('field >= date', () => {
    const ast = parse('date >= 2024-01-01') as QueryCondition;
    expect(ast.operator).toBe('gte');
    expect(ast.value).toBeInstanceOf(Date);
  });

  it('field = boolean true', () => {
    const ast = parse('has_geo = true') as QueryCondition;
    expect(ast.operator).toBe('eq');
    expect(ast.value).toBe(true);
  });

  it('field = boolean false', () => {
    const ast = parse('group = false') as QueryCondition;
    expect(ast.operator).toBe('eq');
    expect(ast.value).toBe(false);
  });

  it('field with negative number', () => {
    const ast = parse('score > -5') as QueryCondition;
    expect(ast.operator).toBe('gt');
    expect(ast.value).toBe(-5);
  });

  it('field with decimal number', () => {
    const ast = parse('ratio = 3.14') as QueryCondition;
    expect(ast.value).toBe(3.14);
  });
});

// ── String operators ──

describe('parser — string operators', () => {
  it('CONTAINS', () => {
    const ast = parse('notes CONTAINS "blanchiment"') as QueryCondition;
    expect(ast.operator).toBe('contains');
    expect(ast.value).toBe('blanchiment');
  });

  it('STARTS', () => {
    const ast = parse('label STARTS "Jean"') as QueryCondition;
    expect(ast.operator).toBe('starts');
    expect(ast.value).toBe('Jean');
  });

  it('ENDS', () => {
    const ast = parse('label ENDS "SA"') as QueryCondition;
    expect(ast.operator).toBe('ends');
    expect(ast.value).toBe('SA');
  });

  it('MATCHES regex', () => {
    const ast = parse('"Numero SIREN" MATCHES /^[0-9]{9}$/') as QueryCondition;
    expect(ast.operator).toBe('matches');
    expect(ast.value).toBe('/^[0-9]{9}$/');
  });
});

// ── Existence operators ──

describe('parser — EXISTS / NOT EXISTS', () => {
  it('EXISTS', () => {
    const ast = parse('email EXISTS') as QueryCondition;
    expect(ast.operator).toBe('exists');
    expect(ast.value).toBeNull();
  });

  it('NOT EXISTS', () => {
    const ast = parse('date NOT EXISTS') as QueryCondition;
    expect(ast.operator).toBe('not_exists');
    expect(ast.value).toBeNull();
  });
});

// ── Quoted fields ──

describe('parser — quoted fields', () => {
  it('quoted field with spaces', () => {
    const ast = parse('"Numero SIREN" = "123456789"') as QueryCondition;
    expect(ast.field).toBe('Numero SIREN');
    expect(ast.value).toBe('123456789');
  });

  it('quoted field with escape', () => {
    const ast = parse('"champ \\"complexe\\"" = "val"') as QueryCondition;
    expect(ast.field).toBe('champ "complexe"');
  });
});

// ── Dotted fields ──

describe('parser — dotted fields', () => {
  it('from.label', () => {
    const ast = parse('from.label = "Alice"') as QueryCondition;
    expect(ast.field).toBe('from.label');
  });

  it('date.start', () => {
    const ast = parse('date.start >= 2024-01-01') as QueryCondition;
    expect(ast.field).toBe('date.start');
  });

  it('to.tag', () => {
    const ast = parse('to.tag = "entreprise"') as QueryCondition;
    expect(ast.field).toBe('to.tag');
  });
});

// ── Logical operators ──

describe('parser — AND', () => {
  it('two conditions ANDed', () => {
    const ast = parse('tag = "personne" AND ville = "Paris"') as QueryAnd;
    expect(ast.type).toBe('and');
    expect(ast.children).toHaveLength(2);
    expect((ast.children[0] as QueryCondition).field).toBe('tag');
    expect((ast.children[1] as QueryCondition).field).toBe('ville');
  });

  it('three conditions ANDed', () => {
    const ast = parse('a = "1" AND b = "2" AND c = "3"') as QueryAnd;
    expect(ast.type).toBe('and');
    expect(ast.children).toHaveLength(3);
  });
});

describe('parser — OR', () => {
  it('two conditions ORed', () => {
    const ast = parse('tag = "personne" OR tag = "entreprise"') as QueryOr;
    expect(ast.type).toBe('or');
    expect(ast.children).toHaveLength(2);
  });
});

describe('parser — NOT', () => {
  it('NOT condition', () => {
    const ast = parse('NOT tag = "archivé"') as QueryNot;
    expect(ast.type).toBe('not');
    expect((ast.child as QueryCondition).field).toBe('tag');
  });

  it('NOT parenthesized group', () => {
    const ast = parse('NOT (tag = "archivé")') as QueryNot;
    expect(ast.type).toBe('not');
    expect(ast.child.type).toBe('condition');
  });
});

// ── Operator precedence ──

describe('parser — operator precedence', () => {
  it('AND binds tighter than OR', () => {
    // a OR b AND c  →  OR(a, AND(b, c))
    const ast = parse('a = "1" OR b = "2" AND c = "3"') as QueryOr;
    expect(ast.type).toBe('or');
    expect(ast.children).toHaveLength(2);
    expect(ast.children[0].type).toBe('condition');
    expect(ast.children[1].type).toBe('and');
  });

  it('parentheses override precedence', () => {
    // (a OR b) AND c  →  AND(OR(a, b), c)
    const ast = parse('(a = "1" OR b = "2") AND c = "3"') as QueryAnd;
    expect(ast.type).toBe('and');
    expect(ast.children).toHaveLength(2);
    expect(ast.children[0].type).toBe('or');
    expect(ast.children[1].type).toBe('condition');
  });
});

// ── Complex queries from spec ──

describe('parser — spec examples', () => {
  it('tag = "personne" AND ville = "Paris"', () => {
    const ast = parse('tag = "personne" AND ville = "Paris"');
    expect(ast.type).toBe('and');
  });

  it('date range with confidence', () => {
    const ast = parse('date >= 2024-01-01 AND date < 2025-01-01 AND confidence > 60') as QueryAnd;
    expect(ast.type).toBe('and');
    expect(ast.children).toHaveLength(3);
  });

  it('link type filter', () => {
    const ast = parse('type = "link" AND from.tag = "personne" AND to.tag = "entreprise"') as QueryAnd;
    expect(ast.children).toHaveLength(3);
  });

  it('combined with parentheses', () => {
    const ast = parse('(tag = "personne" OR tag = "entreprise") AND ville = "Paris" AND confidence >= 50');
    expect(ast.type).toBe('and');
    expect((ast as QueryAnd).children).toHaveLength(3);
    expect((ast as QueryAnd).children[0].type).toBe('or');
  });
});

// ── Case insensitivity of keywords ──

describe('parser — keyword case insensitivity', () => {
  it('and/or/not lowercase', () => {
    // Keywords should be case-insensitive
    const ast = parse('tag = "a" and tag = "b"') as QueryAnd;
    expect(ast.type).toBe('and');
  });

  it('CONTAINS any case', () => {
    const ast = parse('notes contains "test"') as QueryCondition;
    expect(ast.operator).toBe('contains');
  });

  it('exists any case', () => {
    const ast = parse('email exists') as QueryCondition;
    expect(ast.operator).toBe('exists');
  });

  it('not exists any case', () => {
    const ast = parse('date not exists') as QueryCondition;
    expect(ast.operator).toBe('not_exists');
  });
});

// ── Error cases ──

describe('parser — errors', () => {
  it('empty query', () => {
    const err = parseError('');
    expect(err.message).toContain('Empty');
  });

  it('unterminated string', () => {
    const err = parseError('tag = "unclosed');
    expect(err.message).toContain('Unterminated string');
  });

  it('unterminated regex', () => {
    const err = parseError('tag MATCHES /unclosed');
    expect(err.message).toContain('Unterminated regex');
  });

  it('missing value after operator', () => {
    const err = parseError('tag =');
    expect(err).toBeDefined();
  });

  it('missing operator after field', () => {
    const err = parseError('tag');
    expect(err).toBeDefined();
  });

  it('unmatched parenthesis', () => {
    const err = parseError('(tag = "a"');
    expect(err).toBeDefined();
  });

  it('unexpected token after valid query', () => {
    const err = parseError('tag = "a" "extra"');
    expect(err).toBeDefined();
  });
});

// ── Comments ──

describe('parser — comments', () => {
  it('ignores -- comments', () => {
    const ast = parse('-- ceci est un commentaire\ntag = "personne"') as QueryCondition;
    expect(ast.field).toBe('tag');
  });
});
