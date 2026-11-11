/**
 * What the phone can offer when tagging or adding a property: the tags and
 * property keys already used in the dossier. TagSets and property
 * definitions stay on each computer (not in the Y.Doc), so the dossier's own
 * elements are the only shared vocabulary.
 */

import type { Element, PropertyType } from '../types';

function byUse<T>(counts: Map<string, { n: number; value: T }>): T[] {
  return [...counts.entries()]
    .sort(([a, x], [b, y]) => y.n - x.n || a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map(([, { value }]) => value);
}

/** Tags carried by the dossier's elements, most used first */
export function dossierTags(elements: Element[]): string[] {
  const counts = new Map<string, { n: number; value: string }>();
  for (const e of elements) {
    for (const tag of new Set(e.tags)) {
      if (!tag) continue;
      const c = counts.get(tag);
      if (c) c.n++;
      else counts.set(tag, { n: 1, value: tag });
    }
  }
  return byUse(counts);
}

export interface KnownKey {
  key: string;
  type: PropertyType;
}

/**
 * Property keys used on the dossier's elements, most used first, each with
 * the type it has most often. Location properties are left out: the phone
 * cannot enter one.
 */
export function dossierPropertyKeys(elements: Element[]): KnownKey[] {
  const keys = new Map<string, { n: number; types: Map<PropertyType, number> }>();
  for (const e of elements) {
    for (const p of e.properties) {
      if (!p.key) continue;
      const type = p.type ?? 'text';
      const entry = keys.get(p.key) ?? { n: 0, types: new Map() };
      entry.n++;
      entry.types.set(type, (entry.types.get(type) ?? 0) + 1);
      keys.set(p.key, entry);
    }
  }
  const counts = new Map<string, { n: number; value: KnownKey }>();
  for (const [key, { n, types }] of keys) {
    const type = [...types.entries()].sort((a, b) => b[1] - a[1])[0][0];
    if (type === 'geo') continue;
    counts.set(key, { n, value: { key, type } });
  }
  return byUse(counts);
}

/** The known key matching `typed` (case and accents aside) */
export function findKey(keys: KnownKey[], typed: string): KnownKey | undefined {
  const wanted = typed.trim();
  return keys.find((k) => k.key.localeCompare(wanted, undefined, { sensitivity: 'base' }) === 0);
}
