import { useMemo } from 'react';
import { useDossierStore, useTagSetStore } from '../stores';

/**
 * Colour of each tag, for the dot shown before its name: the colour its tag
 * family sets for new elements, else the colour most of the elements carrying
 * it have on the canvas. No entry: nothing to show.
 */
export function useTagColors(): Map<string, string> {
  const tagSets = useTagSetStore((s) => s.tagSets);
  const elements = useDossierStore((s) => s.elements);
  return useMemo(() => {
    const colors = new Map<string, string>();
    // Most frequent element colour per tag
    const counts = new Map<string, Map<string, number>>();
    for (const el of elements) {
      const color = el.visual?.color;
      if (!color) continue;
      for (const tag of el.tags) {
        const byColor = counts.get(tag) ?? new Map<string, number>();
        byColor.set(color, (byColor.get(color) ?? 0) + 1);
        counts.set(tag, byColor);
      }
    }
    for (const [tag, byColor] of counts) {
      let best = '';
      let bestCount = 0;
      for (const [color, n] of byColor) if (n > bestCount) { best = color; bestCount = n; }
      if (best) colors.set(tag, best);
    }
    // The family's colour wins: it is the one chosen for the tag
    for (const ts of tagSets.values()) {
      if (ts.defaultVisual.color) colors.set(ts.name, ts.defaultVisual.color);
    }
    return colors;
  }, [tagSets, elements]);
}
