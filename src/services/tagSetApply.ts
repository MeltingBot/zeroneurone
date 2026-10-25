/**
 * A tag family edited: bring its appearance and its suggested properties to
 * the elements of the open dossier that already carry the tag. Only on the
 * analyst's request (two boxes in the family editor), undone at once.
 */
import type { Element, ElementVisual, Property, SuggestedProperty, TagSetDefaultVisual } from '../types';

export interface TagSetApplyPlan {
  /** Elements whose main (first) tag it is and whose appearance differs */
  visualIds: string[];
  /** The appearance fields the family sets (the others are left alone) */
  visual: Partial<ElementVisual>;
  /** Elements carrying the tag and missing suggested properties: before / after */
  propertyChanges: { id: string; before: Property[]; after: Property[] }[];
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function planTagSetApply(
  elements: readonly Element[],
  tagName: string,
  defaultVisual: TagSetDefaultVisual,
  suggested: readonly SuggestedProperty[],
): TagSetApplyPlan {
  const visual: Partial<ElementVisual> = {};
  if (defaultVisual.color !== null) visual.color = defaultVisual.color;
  if (defaultVisual.shape !== null) visual.shape = defaultVisual.shape;
  if (defaultVisual.icon !== null) visual.icon = defaultVisual.icon;

  const visualIds: string[] = [];
  const propertyChanges: TagSetApplyPlan['propertyChanges'] = [];
  for (const el of elements) {
    if (!el.tags.some((tag) => same(tag, tagName))) continue;
    // The appearance follows the main tag, as when the first tag is added
    // (those already alike are left out: the count says what will change)
    if (el.tags[0] && same(el.tags[0], tagName)
      && (Object.keys(visual) as (keyof ElementVisual)[]).some((k) => el.visual?.[k] !== visual[k])) {
      visualIds.push(el.id);
    }
    // Missing keys added empty, values in place left untouched
    const missing = suggested.filter((s) => s.key.trim() && !el.properties.some((p) => same(p.key, s.key)));
    if (missing.length > 0) {
      propertyChanges.push({
        id: el.id,
        before: el.properties,
        after: [...el.properties, ...missing.map((s) => ({ key: s.key, value: s.type === 'text' ? '' : null, type: s.type }))],
      });
    }
  }
  return { visualIds, visual, propertyChanges };
}
