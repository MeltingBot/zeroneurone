// ZNQuery Autocomplete — contextual suggestions based on cursor position
// Provides: field names, operators, values, keywords, tags

import type { Element, Link } from '../../types';
import { RESERVED_FIELDS, OPERATOR_KEYWORDS } from './types';

export interface AutocompleteSuggestion {
  text: string;
  type: 'field' | 'operator' | 'value' | 'keyword' | 'tag';
  description?: string;
}

// ── Context detection ──

type CursorContext =
  | { kind: 'field'; partial: string }
  | { kind: 'operator'; field: string }
  | { kind: 'value'; field: string; operator: string; partial: string }
  | { kind: 'keyword'; partial: string }
  | { kind: 'empty' };

/**
 * Analyze the text before the cursor to determine what kind of suggestion to offer.
 */
function detectContext(input: string, cursorPos: number): CursorContext {
  const before = input.slice(0, cursorPos).trimEnd();
  if (!before) return { kind: 'field', partial: '' };

  // Tokenize what's before the cursor (simplified)
  const tokens = simpleLex(before);
  if (tokens.length === 0) return { kind: 'field', partial: '' };

  const last = tokens[tokens.length - 1];
  const prev = tokens.length >= 2 ? tokens[tokens.length - 2] : null;
  const prevPrev = tokens.length >= 3 ? tokens[tokens.length - 3] : null;
  const lastUpper = last.toUpperCase();
  const operators = new Set(Object.keys(OPERATOR_KEYWORDS));
  const isOp = (s: string) => /^[=!><]=?$/.test(s) || operators.has(s.toUpperCase());
  const trailingSpace = input.slice(0, cursorPos).endsWith(' ');

  // ── Trailing space: last token is COMPLETE, determine next context ──
  if (trailingSpace) {
    // After AND/OR/NOT/( → expect field
    if (lastUpper === 'AND' || lastUpper === 'OR' || lastUpper === 'NOT' || lastUpper === '(') {
      return { kind: 'field', partial: '' };
    }
    // After EXISTS → keyword (AND/OR)
    if (lastUpper === 'EXISTS') {
      return { kind: 'keyword', partial: '' };
    }
    // After operator → expect value
    if (isOp(last)) {
      const field = prev || '';
      return { kind: 'value', field: unquote(field), operator: last, partial: '' };
    }
    // After value (prev is operator) → keyword
    if (prev && isOp(prev)) {
      return { kind: 'keyword', partial: '' };
    }
    // After field identifier → operator
    if (/^[a-zA-Z_".]/.test(last)) {
      return { kind: 'operator', field: unquote(last) };
    }
    return { kind: 'field', partial: '' };
  }

  // ── No trailing space: user is typing, last token is PARTIAL ──

  // After AND/OR/NOT/( → typing a field
  if (lastUpper === 'AND' || lastUpper === 'OR' || lastUpper === 'NOT' || lastUpper === '(') {
    return { kind: 'field', partial: '' };
  }

  // Partial identifier after AND/OR/NOT/( → field
  if (prev) {
    const prevUpper = prev.toUpperCase();
    if (prevUpper === 'AND' || prevUpper === 'OR' || prevUpper === 'NOT' || prevUpper === '(') {
      return { kind: 'field', partial: last };
    }
  }

  // Typing a value: prev is an operator
  if (prev && isOp(prev)) {
    const field = prevPrev || '';
    return { kind: 'value', field: unquote(field), operator: prev, partial: unquote(last) };
  }

  // Last is an operator → value
  if (isOp(last)) {
    const field = prev || '';
    return { kind: 'value', field: unquote(field), operator: last, partial: '' };
  }

  // prevPrev is field, prev is operator → typing value
  if (prev && prevPrev && isOp(prev)) {
    return { kind: 'value', field: unquote(prevPrev), operator: prev, partial: unquote(last) };
  }

  // Default: assume typing a field
  return { kind: 'field', partial: last };
}

function simpleLex(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i])) { i++; continue; }
    if (text[i] === '"') {
      let s = '"';
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\') { s += text[i]; i++; }
        if (i < text.length) { s += text[i]; i++; }
      }
      if (i < text.length) { s += '"'; i++; }
      tokens.push(s);
      continue;
    }
    if (text[i] === '(' || text[i] === ')') {
      tokens.push(text[i]);
      i++;
      continue;
    }
    if (/[=!><]/.test(text[i])) {
      let op = text[i];
      i++;
      if (i < text.length && text[i] === '=') { op += '='; i++; }
      tokens.push(op);
      continue;
    }
    let word = '';
    while (i < text.length && !/[\s()=!><"]/.test(text[i])) {
      word += text[i];
      i++;
    }
    if (word) tokens.push(word);
  }
  return tokens;
}

function unquote(s: string): string {
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}

// ── Field type inference ──

type FieldType = 'string' | 'number' | 'date' | 'boolean' | 'any';

const FIELD_TYPES: Record<string, FieldType> = {
  label: 'string',
  notes: 'string',
  tag: 'string',
  confidence: 'number',
  source: 'string',
  date: 'date',
  'date.start': 'date',
  'date.end': 'date',
  created: 'date',
  updated: 'date',
  type: 'string',
  has_geo: 'boolean',
  group: 'boolean',
  'from.label': 'string',
  'from.tag': 'string',
  'to.label': 'string',
  'to.tag': 'string',
  directed: 'boolean',
};

function operatorsForType(type: FieldType): { symbol: string; label: string }[] {
  const base = [
    { symbol: '=', label: 'equals' },
    { symbol: '!=', label: 'not equals' },
    { symbol: 'EXISTS', label: 'exists' },
    { symbol: 'NOT EXISTS', label: 'not exists' },
  ];
  if (type === 'number' || type === 'date') {
    return [
      ...base,
      { symbol: '>', label: 'greater than' },
      { symbol: '<', label: 'less than' },
      { symbol: '>=', label: 'greater or equal' },
      { symbol: '<=', label: 'less or equal' },
    ];
  }
  if (type === 'string') {
    return [
      ...base,
      { symbol: 'CONTAINS', label: 'contains' },
      { symbol: 'STARTS', label: 'starts with' },
      { symbol: 'ENDS', label: 'ends with' },
      { symbol: 'MATCHES', label: 'regex' },
    ];
  }
  // boolean or any: base operators
  return base;
}

// ── Value collection ──

function collectFieldValues(
  field: string,
  elements: Element[],
  links: Link[],
): string[] {
  const lower = field.toLowerCase();
  const values = new Map<string, number>(); // value → frequency

  const addValue = (v: unknown) => {
    if (v == null || v === '') return;
    const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
    values.set(s, (values.get(s) || 0) + 1);
  };

  const processItems = (items: (Element | Link)[]) => {
    for (const item of items) {
      switch (lower) {
        case 'label': addValue(item.label); break;
        case 'source': addValue(item.source); break;
        case 'tag':
          for (const t of item.tags) if (t) addValue(t);
          break;
        case 'type':
          addValue('fromId' in item ? 'link' : 'element');
          break;
        default: {
          // Free property
          const prop = item.properties.find(p => p.key.toLowerCase() === lower);
          if (prop) addValue(prop.value);
        }
      }
    }
  };

  processItems(elements);
  processItems(links);

  // Sort by frequency desc, then alphabetical, limit to 50
  return [...values.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 50)
    .map(([v]) => v);
}

// ── Property key collection ──

function collectPropertyKeys(
  elements: Element[],
  links: Link[],
): { key: string; count: number }[] {
  const keyCounts = new Map<string, number>();
  for (const item of [...elements, ...links]) {
    for (const prop of item.properties) {
      const k = prop.key;
      keyCounts.set(k, (keyCounts.get(k) || 0) + 1);
    }
  }
  return [...keyCounts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

// ── Public API ──

export function getAutocompleteSuggestions(
  input: string,
  cursorPosition: number,
  elements: Element[],
  links: Link[],
): AutocompleteSuggestion[] {
  const ctx = detectContext(input, cursorPosition);
  const suggestions: AutocompleteSuggestion[] = [];

  switch (ctx.kind) {
    case 'field':
    case 'empty': {
      const partial = ctx.kind === 'field' ? ctx.partial.toLowerCase() : '';
      // Reserved fields
      for (const f of RESERVED_FIELDS) {
        if (!partial || f.includes(partial)) {
          suggestions.push({ text: f, type: 'field', description: FIELD_TYPES[f] || 'system' });
        }
      }
      // Property keys
      const props = collectPropertyKeys(elements, links);
      for (const { key, count } of props) {
        if (!partial || key.toLowerCase().includes(partial)) {
          const needsQuote = !/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(key);
          suggestions.push({
            text: needsQuote ? `"${key}"` : key,
            type: 'field',
            description: `(${count})`,
          });
        }
      }
      break;
    }

    case 'operator': {
      const fieldType = FIELD_TYPES[ctx.field.toLowerCase()] || 'any';
      const ops = operatorsForType(fieldType);
      for (const op of ops) {
        suggestions.push({ text: op.symbol, type: 'operator', description: op.label });
      }
      break;
    }

    case 'value': {
      const partial = ctx.partial.toLowerCase();
      const fieldLower = ctx.field.toLowerCase();

      // Tags: special handling
      if (fieldLower === 'tag' || fieldLower === 'from.tag' || fieldLower === 'to.tag') {
        const tags = new Set<string>();
        for (const el of elements) {
          for (const t of el.tags) if (t) tags.add(t);
        }
        for (const tag of [...tags].sort()) {
          if (!partial || tag.toLowerCase().includes(partial)) {
            suggestions.push({ text: `"${tag}"`, type: 'tag' });
          }
        }
        break;
      }

      // Boolean fields
      if (FIELD_TYPES[fieldLower] === 'boolean') {
        suggestions.push({ text: 'true', type: 'value' });
        suggestions.push({ text: 'false', type: 'value' });
        break;
      }

      // Type field
      if (fieldLower === 'type') {
        suggestions.push({ text: '"element"', type: 'value' });
        suggestions.push({ text: '"link"', type: 'value' });
        break;
      }

      // Collect existing values
      const values = collectFieldValues(ctx.field, elements, links);
      for (const v of values) {
        if (!partial || v.toLowerCase().includes(partial)) {
          const needsQuote = isNaN(Number(v)) && v !== 'true' && v !== 'false';
          suggestions.push({ text: needsQuote ? `"${v}"` : v, type: 'value' });
        }
      }
      break;
    }

    case 'keyword': {
      const partial = ctx.partial.toLowerCase();
      const keywords = ['AND', 'OR', 'NOT'];
      for (const kw of keywords) {
        if (!partial || kw.toLowerCase().startsWith(partial)) {
          suggestions.push({ text: kw, type: 'keyword' });
        }
      }
      break;
    }
  }

  return suggestions;
}
