import type { Element, Link, Property } from '../types';

export interface MergePreview {
  /** Elements whose notes will be put end to end */
  notesCount: number;
  /** Properties of the kept element after the merge */
  propertyCount: number;
  /** Keys that will carry several values */
  multiValueKeys: number;
}

/**
 * What a merge of `sources` into `target` will produce, by the same rules as
 * the merge itself: notes put end to end, properties joined (the same key and
 * value counted once, the same key with another value kept as well).
 */
export function mergePreview(target: Element, sources: readonly Element[]): MergePreview {
  const all = [target, ...sources];
  const notesCount = all.filter((el) => (el.notes ?? '').trim() !== '').length;

  const merged = [...target.properties];
  for (const source of sources) {
    for (const prop of source.properties) {
      if (!merged.some((p) => p.key === prop.key && p.value === prop.value)) merged.push(prop);
    }
  }
  const perKey = new Map<string, number>();
  for (const p of merged) perKey.set(p.key, (perKey.get(p.key) ?? 0) + 1);

  return {
    notesCount,
    propertyCount: merged.length,
    multiValueKeys: [...perKey.values()].filter((n) => n > 1).length,
  };
}

/** A tag or a property value one of the merged elements holds */
export interface MergeChoice {
  /** The same for an identical tag or value held by several elements */
  id: string;
  /** Tags: the tag; properties: the property (as held by its first element) */
  tag?: string;
  property?: Property;
}

/** Tags and property values of the merged elements, to keep or drop one by one */
export interface MergeChoices {
  /** Columns: the kept element first, then the others */
  columns: { element: Element; tags: MergeChoice[]; properties: Map<string, MergeChoice[]> }[];
  /** Property keys, in order of first appearance (kept element first) */
  keys: string[];
  /** Keys holding several different values across the elements */
  conflicts: Set<string>;
  /** Every choice, once each, in order (kept element first) */
  all: MergeChoice[];
}

/** Identity of a value: equal dates are the same instant, whatever their object */
function valueKey(value: unknown): string {
  if (value instanceof Date) return `d:${value.getTime()}`;
  return `${typeof value}:${String(value)}`;
}

export const tagChoiceId = (tag: string) => `t\u0000${tag}`;
export const propertyChoiceId = (p: Property) => `p\u0000${p.key}\u0000${valueKey(p.value)}`;

/**
 * Everything a merge of `sources` into `target` can keep: each element's tags
 * and property values, an identical one shared by several elements counted
 * once (one choice), and the keys whose values differ.
 */
export function mergeChoices(target: Element, sources: readonly Element[]): MergeChoices {
  const byId = new Map<string, MergeChoice>();
  const all: MergeChoice[] = [];
  const keys: string[] = [];
  const valuesPerKey = new Map<string, Set<string>>();
  const choice = (id: string, make: () => MergeChoice) => {
    let c = byId.get(id);
    if (!c) { c = make(); byId.set(id, c); all.push(c); }
    return c;
  };
  const columns = [target, ...sources].map((element) => {
    const tags = [...new Set(element.tags)].map((tag) => choice(tagChoiceId(tag), () => ({ id: tagChoiceId(tag), tag })));
    const properties = new Map<string, MergeChoice[]>();
    for (const p of element.properties) {
      const id = propertyChoiceId(p);
      const c = choice(id, () => ({ id, property: p }));
      if (!keys.includes(p.key)) keys.push(p.key);
      const list = properties.get(p.key) ?? [];
      if (!list.includes(c)) list.push(c);
      properties.set(p.key, list);
      const values = valuesPerKey.get(p.key) ?? new Set<string>();
      values.add(id);
      valuesPerKey.set(p.key, values);
    }
    return { element, tags, properties };
  });
  const conflicts = new Set([...valuesPerKey].filter(([, v]) => v.size > 1).map(([k]) => k));
  return { columns, keys, conflicts, all };
}

/** Tags and properties the kept element ends with, from the choices kept */
export function keptValues(choices: MergeChoices, kept: ReadonlySet<string>): { tags: string[]; properties: Property[] } {
  const chosen = choices.all.filter((c) => kept.has(c.id));
  return {
    tags: chosen.filter((c) => c.tag !== undefined).map((c) => c.tag!),
    properties: chosen.filter((c) => c.property).map((c) => c.property!),
  };
}

/** The ends and content a link compares on when two elements are merged */
type LinkContent = Pick<Link, 'fromId' | 'toId' | 'direction' | 'label' | 'date' | 'dateRange' | 'properties'>;

const time = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : null);

/**
 * Whether two links say the same thing: same ends (either way when neither
 * is directed), direction, label, dates and properties. Only such a link,
 * brought by the merged element, is folded into the kept one's: two links
 * that differ in any of these are two facts (two transfers, two calls).
 */
export function sameLinkContent(a: LinkContent, b: LinkContent): boolean {
  const sameEnds = (a.fromId === b.fromId && a.toId === b.toId)
    || (a.direction === 'none' && b.direction === 'none' && a.fromId === b.toId && a.toId === b.fromId);
  if (!sameEnds || a.direction !== b.direction || (a.label ?? '').trim() !== (b.label ?? '').trim()) return false;
  if (time(a.date) !== time(b.date)) return false;
  if (time(a.dateRange?.start) !== time(b.dateRange?.start) || time(a.dateRange?.end) !== time(b.dateRange?.end)) return false;
  const props = (l: LinkContent) => l.properties.map((p) => `${p.key}\u0000${valueKey(p.value)}`).sort().join('\u0001');
  return props(a) === props(b);
}
