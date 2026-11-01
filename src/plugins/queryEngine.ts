// ZNQuery for plugins: parse and evaluate a query text without touching the
// query panel, the canvas, the query history or the event bus.
import { parseQuery } from '../services/query/parser';
import { evaluateQuery } from '../services/query/evaluator';
import { OPERATOR_KEYWORDS, RESERVED_FIELDS } from '../services/query/types';
import type { Element, Link } from '../types';

export interface QueryEngineError {
  message: string;
  position: number;
  expected?: string;
}

export type QueryParseOutcome = { ok: true } | { ok: false; error: QueryEngineError };

export type QueryEvaluateOutcome =
  | { elementIds: string[]; linkIds: string[] }
  | { error: QueryEngineError };

/** The parser trims the text: positions are shifted back onto the text the plugin gave. */
function parseText(text: string) {
  const source = typeof text === 'string' ? text : '';
  const result = parseQuery(source);
  if (result.error) {
    const offset = source.length - source.trimStart().length;
    const { message, position, expected } = result.error;
    const error: QueryEngineError = { message, position: position + offset };
    if (expected !== undefined) error.expected = expected;
    return { ast: null, error } as const;
  }
  return { ast: result.ast, error: null } as const;
}

export function parseQueryText(text: string): QueryParseOutcome {
  const { error } = parseText(text);
  return error ? { ok: false, error } : { ok: true };
}

/**
 * Evaluate on the whole dossier, as the query panel does, then keep what lies
 * inside `within`: those elements and the links between two of them. Conditions
 * that follow links (WITHIN, from.*, to.*) still see the elements outside it.
 */
export function evaluateQueryText(
  text: string,
  elements: Element[],
  links: Link[],
  options?: { within?: Iterable<string> },
): QueryEvaluateOutcome {
  const { ast, error } = parseText(text);
  if (error) return { error };

  const results = evaluateQuery(ast, elements, links);
  const within = options?.within != null ? new Set(options.within) : null;

  const elementIds: string[] = [];
  for (const el of elements) {
    if (results.elementIds.has(el.id) && (!within || within.has(el.id))) elementIds.push(el.id);
  }
  const linkIds: string[] = [];
  for (const link of links) {
    if (results.linkIds.has(link.id) && (!within || (within.has(link.fromId) && within.has(link.toId)))) {
      linkIds.push(link.id);
    }
  }
  return { elementIds, linkIds };
}

export function queryVocabulary(): { fields: string[]; operators: string[] } {
  return {
    fields: [...RESERVED_FIELDS],
    operators: [...Object.keys(OPERATOR_KEYWORDS), 'AND', 'OR', 'NOT', 'WITHIN <n> HOPS OF'],
  };
}
