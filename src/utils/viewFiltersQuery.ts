import type { Element, EvaluationModel, ViewFilters } from '../types';
import type { QueryCondition, QueryNode, QueryValue } from '../services/query/types';
import { RESERVED_FIELDS } from '../services/query/types';
import { getModelScale } from './evaluation';

/** Filters of the panel that have no exact ZNQuery */
export type FilterQueryGap = 'textSearch' | 'tags' | 'property' | 'period' | 'tabs';

/**
 * The filters of the filters panel as a ZNQuery, so that the query panel
 * shows what they keep, in its own language.
 *
 * The query keeps exactly the elements the filters keep: `type = "element"`
 * first (the filters panel filters elements; a query also finds links), then
 * one condition per filter. A filter the query cannot say exactly is left out
 * and listed in `gaps`; it keeps filtering the views as before:
 * - the text search also reads the property names, which no field reaches;
 * - the period keeps undated elements and reads events and date properties;
 * - the tabs filter has no field;
 * - tags and property names are read case aside by the query, as stored by
 *   the filters: two tags (or names) differing only by case leave them out,
 *   as does a property held with an empty value (the query does not count it).
 */
export function viewFiltersToQuery(
  filters: ViewFilters,
  elements: readonly Element[],
  evaluationModel: EvaluationModel,
  tabsFilterApplies: boolean,
): { ast: QueryNode | null; gaps: FilterQueryGap[] } {
  const gaps: FilterQueryGap[] = [];
  const conditions: QueryNode[] = [];

  if (filters.textSearch !== '') gaps.push('textSearch');
  if (filters.dateFrom !== null || filters.dateTo !== null) gaps.push('period');
  if (tabsFilterApplies) gaps.push('tabs');

  const tagsUsed = [...filters.includeTags, ...filters.excludeTags];
  if (tagsUsed.length > 0 && tagsDifferByCase(tagsUsed, elements)) {
    gaps.push('tags');
  } else {
    if (filters.includeTags.length > 0) conditions.push(tagCondition(filters.includeTags));
    if (filters.excludeTags.length > 0) conditions.push({ type: 'not', child: tagCondition(filters.excludeTags) });
  }

  if (filters.hasProperty) {
    if (propertyExistsIsExact(filters.hasProperty, elements)) {
      conditions.push(condition(filters.hasProperty, 'exists', null));
    } else {
      gaps.push('property');
    }
  }

  // Same rules as filterUtils: confidence in the ZeroNeurone model only,
  // gradings in the other models only, and of that model's scale
  if (filters.minConfidence !== null && evaluationModel === 'zeroneurone') {
    conditions.push(condition('confidence', 'gte', filters.minConfidence));
  }
  const scale = getModelScale(evaluationModel);
  const sources = filters.evaluationSources ?? [];
  const infos = filters.evaluationInfos ?? [];
  if (scale && (sources.length > 0 || infos.length > 0)) {
    conditions.push(condition('evaluation.scale', 'eq', scale));
    if (sources.length > 0) conditions.push(oneOf('evaluation.source', sources));
    if (infos.length > 0) conditions.push(oneOf('evaluation.info', infos));
  }

  if (filters.hasGeo !== null) conditions.push(condition('has_geo', 'eq', filters.hasGeo));

  if (conditions.length === 0) return { ast: null, gaps };
  return {
    ast: { type: 'and', children: [condition('type', 'eq', 'element'), ...conditions] },
    gaps,
  };
}

function condition(field: string, operator: QueryCondition['operator'], value: QueryValue | null): QueryCondition {
  return { type: 'condition', field, operator, value };
}

/** `field = "a"` for one value, `field IN ("a", "b")` for several */
function oneOf(field: string, values: readonly string[]): QueryCondition {
  return values.length === 1
    ? condition(field, 'eq', values[0])
    : condition(field, 'in', [...values]);
}

function tagCondition(tags: readonly string[]): QueryCondition {
  return oneOf('tag', tags);
}

/** Whether a chosen tag has a twin differing only by case (the query would keep both) */
function tagsDifferByCase(chosen: readonly string[], elements: readonly Element[]): boolean {
  const lower = new Map<string, string>();
  for (const tag of chosen) lower.set(tag.toLowerCase(), tag);
  for (const el of elements) {
    for (const tag of el.tags) {
      const twin = lower.get(tag.toLowerCase());
      if (twin !== undefined && twin !== tag) return true;
    }
  }
  return false;
}

/**
 * Whether `"key" EXISTS` keeps the elements holding the key: not a reserved
 * field name, no other key differing only by case, and a value the query
 * counts on every element holding it.
 */
function propertyExistsIsExact(key: string, elements: readonly Element[]): boolean {
  const lower = key.toLowerCase();
  if (RESERVED_FIELDS.has(lower)) return false;
  for (const el of elements) {
    const values: unknown[] = [];
    for (const prop of el.properties) {
      if (prop.key.toLowerCase() !== lower) continue;
      if (prop.key !== key) return false;
      values.push(prop.value);
    }
    if (values.length === 0) continue;
    // Read as the evaluator does: one value, or the values of every copy
    const exists = values.length === 1
      ? isPresent(values[0])
      : values.flatMap((v) => (Array.isArray(v) ? v : [v])).some((v) => !!v);
    if (!exists) return false;
  }
  return true;
}

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string' && value === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

/** Whether two queries have the same structure and values */
export function sameQuery(a: QueryNode | null, b: QueryNode | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.type !== b.type) return false;
  switch (a.type) {
    case 'condition': {
      const c = b as QueryCondition;
      return a.field === c.field && a.operator === c.operator && sameValue(a.value, c.value);
    }
    case 'and':
    case 'or': {
      const children = (b as typeof a).children;
      return a.children.length === children.length && a.children.every((child, i) => sameQuery(child, children[i]));
    }
    case 'not':
      return sameQuery(a.child, (b as typeof a).child);
    case 'within': {
      const w = b as typeof a;
      return a.hops === w.hops && sameQuery(a.target, w.target);
    }
  }
}

function sameValue(a: QueryValue | null, b: QueryValue | null): boolean {
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}
