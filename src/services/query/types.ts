// ZNQuery AST types
// Shared between parser (text → AST), serializer (AST → text),
// visual builder (UI → AST), and evaluator (AST × data → results).

// ── Logical nodes ──

export interface QueryAnd {
  type: 'and';
  children: QueryNode[];
}

export interface QueryOr {
  type: 'or';
  children: QueryNode[];
}

export interface QueryNot {
  type: 'not';
  child: QueryNode;
}

// ── Condition node ──

export interface QueryCondition {
  type: 'condition';
  field: string;
  operator: QueryOperator;
  value: QueryValue | null; // null for EXISTS / NOT EXISTS
}

export type QueryNode = QueryAnd | QueryOr | QueryNot | QueryCondition;

// ── Operators ──

export type QueryOperator =
  | 'eq' | 'neq'
  | 'gt' | 'lt' | 'gte' | 'lte'
  | 'contains' | 'starts' | 'ends'
  | 'matches'
  | 'exists' | 'not_exists'
  | 'in'
  | 'near';

// ── Values ──

export type QueryValue = string | number | boolean | Date | string[];

// ── Parse result ──

export interface ParseError {
  message: string;
  position: number;
  expected?: string;
}

export type ParseResult =
  | { ast: QueryNode; error: null }
  | { ast: null; error: ParseError };

// ── Evaluation result ──

export interface QueryResult {
  elementIds: Set<string>;
  linkIds: Set<string>;
  executionTime: number; // ms
}

// ── Operator keyword mapping (text ↔ AST) ──

export const OPERATOR_KEYWORDS: Record<string, QueryOperator> = {
  '=': 'eq',
  '!=': 'neq',
  '>': 'gt',
  '<': 'lt',
  '>=': 'gte',
  '<=': 'lte',
  'CONTAINS': 'contains',
  'STARTS': 'starts',
  'ENDS': 'ends',
  'MATCHES': 'matches',
  'EXISTS': 'exists',
  'NOT EXISTS': 'not_exists',
  'IN': 'in',
  'NEAR': 'near',
};

export const OPERATOR_SYMBOLS: Record<QueryOperator, string> = {
  eq: '=',
  neq: '!=',
  gt: '>',
  lt: '<',
  gte: '>=',
  lte: '<=',
  contains: 'CONTAINS',
  starts: 'STARTS',
  ends: 'ENDS',
  matches: 'MATCHES',
  exists: 'EXISTS',
  not_exists: 'NOT EXISTS',
  in: 'IN',
  near: 'NEAR',
};

// ── Reserved field names (case-insensitive) ──

export const RESERVED_FIELDS = new Set([
  'label', 'notes', 'tag', 'confidence', 'source',
  'date', 'date.start', 'date.end',
  'created', 'updated',
  'type', 'has_geo', 'group', 'country',
  // Link-specific
  'from.label', 'from.tag', 'to.label', 'to.tag', 'directed',
  // Geo fields (numeric lat/lng for bounding box queries)
  'geo.lat', 'geo.lng',
  // Element events (ANY semantics: matches if at least one event satisfies)
  'event.date', 'event.date.end', 'event.label', 'event.description',
  'event.source', 'event.geo', 'event.geo.lat', 'event.geo.lng',
]);
