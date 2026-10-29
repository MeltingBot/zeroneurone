import type { Element, Link } from '../types';
import { groupLabels } from '../services/query/evaluator';

// Grouping of ZNQuery results in the results table: one row per value of a field

/** Fields offered by "Group by" before the properties found in the results */
export const GROUP_FIELDS = ['tag', 'in_group', 'country'] as const;

export interface GroupRow {
  /** null: the results holding no value for the field */
  value: string | null;
  elementIds: string[];
  linkIds: string[];
}

function displayValue(v: unknown): string[] {
  if (v == null || v === '') return [];
  if (Array.isArray(v)) return v.flatMap(displayValue);
  if (v instanceof Date) return [v.toLocaleDateString()];
  return [String(v)];
}

/** Values an item holds for a field; an item with several values counts in each */
function groupValues(item: Element | Link, field: string, elements: Map<string, Element>): string[] {
  switch (field) {
    case 'tag':
      return item.tags.filter(Boolean);
    case 'in_group':
      // Same as the in_group query field: the group, then the groups around it
      return 'fromId' in item ? [] : groupLabels(item, elements).filter(Boolean);
    case 'country':
      return item.properties.filter((p) => p.type === 'country').flatMap((p) => displayValue(p.value));
    default:
      return item.properties.filter((p) => p.key === field).flatMap((p) => displayValue(p.value));
  }
}

export function buildGroups(
  elementIds: Set<string>,
  linkIds: Set<string>,
  elements: Map<string, Element>,
  links: Map<string, Link>,
  field: string,
): GroupRow[] {
  const groups = new Map<string | null, GroupRow>();
  const add = (key: string | null, id: string, kind: 'element' | 'link') => {
    let group = groups.get(key);
    if (!group) {
      group = { value: key, elementIds: [], linkIds: [] };
      groups.set(key, group);
    }
    (kind === 'element' ? group.elementIds : group.linkIds).push(id);
  };
  const place = (item: Element | Link, kind: 'element' | 'link') => {
    const values = [...new Set(groupValues(item, field, elements))];
    if (values.length === 0) add(null, item.id, kind);
    for (const value of values) add(value, item.id, kind);
  };
  for (const id of elementIds) { const el = elements.get(id); if (el) place(el, 'element'); }
  for (const id of linkIds) { const lk = links.get(id); if (lk) place(lk, 'link'); }

  const size = (g: GroupRow) => g.elementIds.length + g.linkIds.length;
  // Largest first, "no value" last
  return [...groups.values()].sort((a, b) => {
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    return size(b) - size(a) || a.value.localeCompare(b.value);
  });
}
