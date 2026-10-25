import type { Property } from '../types';

/**
 * Property rows are addressed by position: a key may come back several times
 * (a merge keeps every value), and only the row edited or removed must change.
 */

/** A key per row: the property key plus its rank among the rows of that key */
export function propertyRowKeys(properties: readonly Property[]): string[] {
  const seen = new Map<string, number>();
  return properties.map((prop) => {
    const n = seen.get(prop.key) ?? 0;
    seen.set(prop.key, n + 1);
    return `${prop.key}\u0000${n}`;
  });
}

/** Every row of a key, in order (a merge may leave several) */
export function propertiesOf(properties: readonly Property[] | undefined, key: string): Property[] {
  return (properties ?? []).filter((p) => p.key === key && p.value != null);
}

/** Values of several rows of a key shown as one */
export const VALUES_SEPARATOR = ' · ';

export function removePropertyAt(properties: readonly Property[], index: number): Property[] {
  return properties.filter((_, i) => i !== index);
}

export function updatePropertyAt(properties: readonly Property[], index: number, change: (prop: Property) => Property): Property[] {
  return properties.map((prop, i) => (i === index ? change(prop) : prop));
}
