// ZNQuery Evaluator — AST × (Element | Link)[] → QueryResult
// Runs entirely in-memory on Zustand data. No IndexedDB calls.

import type { Element, Link } from '../../types';
import type { QueryNode, QueryCondition, QueryOperator, QueryValue, QueryResult } from './types';

// ── Field resolution ──

type DataItem = Element | Link;

function isLink(item: DataItem): item is Link {
  return 'fromId' in item;
}

/**
 * Resolve a field value from an Element or Link.
 * Reserved fields map to system attributes; everything else is a free property lookup.
 */
function resolveField(
  item: DataItem,
  field: string,
  elements: Map<string, Element>,
): unknown {
  const lower = field.toLowerCase();

  // ── Reserved fields ──
  switch (lower) {
    case 'label':
      return item.label;
    case 'notes':
      return item.notes;
    case 'confidence':
      return item.confidence;
    case 'source':
      return item.source;
    case 'created':
      return item.createdAt;
    case 'updated':
      return item.updatedAt;
    case 'type':
      return isLink(item) ? 'link' : 'element';
    case 'tag': {
      // Special: tag field returns the tags array for multi-value matching
      return item.tags;
    }
    case 'date': {
      if (!isLink(item) && item.date) return item.date;
      if (!isLink(item) && item.dateRange?.start) return item.dateRange.start;
      if (isLink(item) && item.date) return item.date;
      if (isLink(item) && item.dateRange?.start) return item.dateRange.start;
      return null;
    }
    case 'date.start': {
      if (!isLink(item)) return item.dateRange?.start ?? null;
      return item.dateRange?.start ?? null;
    }
    case 'date.end': {
      if (!isLink(item)) return item.dateRange?.end ?? null;
      return item.dateRange?.end ?? null;
    }
    case 'has_geo':
      return isLink(item) ? false : item.geo != null;
    case 'group':
      return isLink(item) ? false : item.isGroup;
    case 'directed':
      return isLink(item) ? item.directed : null;

    // Link endpoint fields
    case 'from.label': {
      if (!isLink(item)) return null;
      return elements.get(item.fromId)?.label ?? null;
    }
    case 'from.tag': {
      if (!isLink(item)) return null;
      return elements.get(item.fromId)?.tags ?? null;
    }
    case 'to.label': {
      if (!isLink(item)) return null;
      return elements.get(item.toId)?.label ?? null;
    }
    case 'to.tag': {
      if (!isLink(item)) return null;
      return elements.get(item.toId)?.tags ?? null;
    }
  }

  // ── Free property lookup (case-insensitive) ──
  const prop = item.properties.find(p => p.key.toLowerCase() === lower);
  if (prop) return prop.value;
  return undefined; // Property does not exist
}

// ── Comparison helpers ──

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string') {
    const n = parseFloat(v);
    if (!isNaN(n)) return n;
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return null;
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof v === 'number') return new Date(v);
  return null;
}

function toString(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

// ── Condition evaluation ──

/**
 * Evaluate a single value against a condition operator + query value.
 * Returns true if the value matches.
 */
function matchValue(
  fieldValue: unknown,
  operator: QueryOperator,
  queryValue: QueryValue | null,
): boolean {
  // EXISTS / NOT EXISTS
  if (operator === 'exists') {
    if (fieldValue === undefined || fieldValue === null) return false;
    if (typeof fieldValue === 'string' && fieldValue === '') return false;
    if (Array.isArray(fieldValue) && fieldValue.length === 0) return false;
    return true;
  }
  if (operator === 'not_exists') {
    if (fieldValue === undefined || fieldValue === null) return true;
    if (typeof fieldValue === 'string' && fieldValue === '') return true;
    if (Array.isArray(fieldValue) && fieldValue.length === 0) return true;
    return false;
  }

  // Null field value → no match (except for neq)
  if (fieldValue === undefined || fieldValue === null) {
    return operator === 'neq';
  }

  // EQ / NEQ
  if (operator === 'eq' || operator === 'neq') {
    let match = false;

    if (queryValue instanceof Date) {
      const fDate = toDate(fieldValue);
      if (fDate) {
        // Compare dates by date-only (ignore time for date comparisons)
        match = fDate.toDateString() === queryValue.toDateString();
      }
    } else if (typeof queryValue === 'number') {
      const fNum = toNumber(fieldValue);
      match = fNum !== null && fNum === queryValue;
    } else if (typeof queryValue === 'boolean') {
      match = fieldValue === queryValue;
    } else if (typeof queryValue === 'string') {
      // Case-insensitive string comparison
      match = toString(fieldValue).toLowerCase() === queryValue.toLowerCase();
    }

    return operator === 'eq' ? match : !match;
  }

  // GT / LT / GTE / LTE — numeric/date comparison
  if (operator === 'gt' || operator === 'lt' || operator === 'gte' || operator === 'lte') {
    let fNum: number | null = null;
    let qNum: number | null = null;

    if (queryValue instanceof Date) {
      fNum = toDate(fieldValue)?.getTime() ?? null;
      qNum = queryValue.getTime();
    } else {
      fNum = toNumber(fieldValue);
      qNum = toNumber(queryValue);
    }

    if (fNum === null || qNum === null) return false;

    switch (operator) {
      case 'gt': return fNum > qNum;
      case 'lt': return fNum < qNum;
      case 'gte': return fNum >= qNum;
      case 'lte': return fNum <= qNum;
    }
  }

  // CONTAINS / STARTS / ENDS — string operations (case-insensitive)
  if (operator === 'contains' || operator === 'starts' || operator === 'ends') {
    const fStr = toString(fieldValue).toLowerCase();
    const qStr = toString(queryValue).toLowerCase();

    switch (operator) {
      case 'contains': return fStr.includes(qStr);
      case 'starts': return fStr.startsWith(qStr);
      case 'ends': return fStr.endsWith(qStr);
    }
  }

  // MATCHES — regex
  if (operator === 'matches') {
    const fStr = toString(fieldValue);
    let pattern = toString(queryValue);
    // Strip /.../ wrapper if present
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      pattern = pattern.slice(1, -1);
    }
    try {
      const re = new RegExp(pattern);
      return re.test(fStr);
    } catch {
      return false; // Invalid regex → no match
    }
  }

  return false;
}

/**
 * Evaluate a condition node against a data item.
 * Special handling for tag/from.tag/to.tag: match if ANY tag matches.
 */
function evaluateCondition(
  cond: QueryCondition,
  item: DataItem,
  elements: Map<string, Element>,
): boolean {
  const fieldValue = resolveField(item, cond.field, elements);

  // Multi-value fields (tags): match if ANY element matches
  if (Array.isArray(fieldValue)) {
    if (cond.operator === 'exists') {
      return fieldValue.filter(v => v).length > 0;
    }
    if (cond.operator === 'not_exists') {
      return fieldValue.filter(v => v).length === 0;
    }
    // For other operators: match if ANY tag value matches
    return fieldValue.some(v => matchValue(v, cond.operator, cond.value));
  }

  return matchValue(fieldValue, cond.operator, cond.value);
}

// ── AST evaluation ──

function evaluateNode(
  node: QueryNode,
  item: DataItem,
  elements: Map<string, Element>,
): boolean {
  switch (node.type) {
    case 'condition':
      return evaluateCondition(node, item, elements);

    case 'and':
      return node.children.every(child => evaluateNode(child, item, elements));

    case 'or':
      return node.children.some(child => evaluateNode(child, item, elements));

    case 'not':
      return !evaluateNode(node.child, item, elements);
  }
}

// ── Public API ──

export function evaluateQuery(
  ast: QueryNode,
  elements: Element[],
  links: Link[],
  elementMap?: Map<string, Element>,
): QueryResult {
  const start = performance.now();

  // Build element map if not provided
  const elMap = elementMap ?? new Map(elements.map(e => [e.id, e]));

  const matchingElements = new Set<string>();
  const matchingLinks = new Set<string>();

  for (const el of elements) {
    if (evaluateNode(ast, el, elMap)) {
      matchingElements.add(el.id);
    }
  }

  for (const link of links) {
    if (evaluateNode(ast, link, elMap)) {
      matchingLinks.add(link.id);
    }
  }

  return {
    elementIds: matchingElements,
    linkIds: matchingLinks,
    executionTime: performance.now() - start,
  };
}
