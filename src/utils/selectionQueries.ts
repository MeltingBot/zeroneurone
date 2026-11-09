import type { Element } from '../types';
import type { QueryCondition, QueryNode, QueryOr } from '../services/query/types';
import { serializeQuery } from '../services/query/serializer';

/**
 * Queries and visibility built from a selection, shared by the menus of the
 * canvas and of the map: the same selection gives the same query everywhere.
 */

/** Similar elements: a label close to the element's (LIKE) AND one of its tags; either part alone when the other is missing */
export function similarQueryText(el: Element): string | null {
  const label = el.label.trim();
  const tags = el.tags.filter(Boolean);
  if (tags.length === 0 && !label) return null;
  const tagConditions: QueryNode[] = tags.map((tag) => ({ type: 'condition', field: 'tag', operator: 'eq', value: tag }));
  const tagPart: QueryNode | null = tagConditions.length === 0 ? null
    : tagConditions.length === 1 ? tagConditions[0]
    : { type: 'or', children: tagConditions };
  const labelPart: QueryNode | null = label ? { type: 'condition', field: 'label', operator: 'like', value: label } : null;
  const ast: QueryNode = labelPart && tagPart
    ? { type: 'and', children: [labelPart, tagPart] }
    : (labelPart ?? tagPart)!;
  return serializeQuery(ast);
}

/** Elements bearing one of the labels of `els` */
export function labelsQueryText(els: Element[]): string | null {
  const conditions: QueryCondition[] = els.map((el) => ({ type: 'condition', field: 'label', operator: 'eq', value: el.label }));
  if (conditions.length === 0) return null;
  const ast = conditions.length === 1 ? conditions[0] : { type: 'or', children: conditions } as QueryOr;
  return serializeQuery(ast);
}

/**
 * Neighbourhood of `ids` within `depth` hops. A target is its label, readable;
 * its id only when another element bears the same label (label = is case-insensitive)
 */
export function neighbourhoodQueryText(ids: string[], elements: Element[], depth: number): string | null {
  const byId = new Map(elements.map((el) => [el.id, el]));
  const conditions: QueryCondition[] = [];
  for (const id of ids) {
    const el = byId.get(id);
    if (!el) continue;
    const label = el.label.toLowerCase();
    const shared = elements.some((e) => e.id !== el.id && e.label.toLowerCase() === label);
    conditions.push(shared
      ? { type: 'condition', field: '_id', operator: 'eq', value: el.id }
      : { type: 'condition', field: 'label', operator: 'eq', value: el.label });
  }
  if (conditions.length === 0) return null;
  const target: QueryNode = conditions.length === 1 ? conditions[0] : { type: 'or', children: conditions };
  return serializeQuery({ type: 'within', hops: depth, target });
}

/**
 * Show only `ids`: everything else hidden, except the groups holding them (a
 * hidden group would take them along) and the members of a group among them
 */
export function showOnlySplit(ids: string[], all: Element[]): { keep: string[]; hide: string[] } {
  const byId = new Map(all.map((el) => [el.id, el]));
  // The chosen ones and, through nested groups, everything inside them
  const chosen = new Set(ids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const el of all) {
      if (el.parentGroupId && chosen.has(el.parentGroupId) && !chosen.has(el.id)) {
        chosen.add(el.id);
        grew = true;
      }
    }
  }
  const keep = new Set(chosen);
  for (const id of ids) {
    let parent = byId.get(id)?.parentGroupId ?? null;
    while (parent && !keep.has(parent)) {
      keep.add(parent);
      parent = byId.get(parent)?.parentGroupId ?? null;
    }
  }
  return { keep: [...keep], hide: all.filter((el) => !keep.has(el.id)).map((el) => el.id) };
}
