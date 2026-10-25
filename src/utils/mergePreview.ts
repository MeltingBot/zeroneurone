import type { Element } from '../types';

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
