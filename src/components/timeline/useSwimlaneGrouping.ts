import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Element } from '../../types';
import type { TimelineItem } from './TimelineView';

export interface GroupingCriterion {
  id: string;
  label: string;
}

export interface LaneGroup {
  key: string;
  label: string;
  items: TimelineItem[];
}

export function useSwimlaneGrouping(
  items: TimelineItem[],
  elements: Map<string, Element>,
  criterion: string,
  activeTags?: string[] | null,
): { availableCriteria: GroupingCriterion[]; lanes: LaneGroup[]; availableTags: string[] } {
  const { t } = useTranslation('pages');

  // Collect the set of dated element IDs present in items
  const datedElementIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of items) {
      if (item.parentElementIds) {
        for (const pid of item.parentElementIds) ids.add(pid);
      } else if (item.sourceId) {
        ids.add(item.sourceId);
      }
    }
    return ids;
  }, [items]);

  // Compute available tags (all unique tags from dated elements)
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const id of datedElementIds) {
      const el = elements.get(id);
      if (el) {
        for (const tag of el.tags) {
          if (tag) tags.add(tag);
        }
      }
    }
    return [...tags].sort((a, b) => a.localeCompare(b));
  }, [datedElementIds, elements]);

  // Compute available criteria (at least 2 distinct values)
  const availableCriteria = useMemo(() => {
    const criteria: GroupingCriterion[] = [];
    const datedElements: Element[] = [];
    for (const id of datedElementIds) {
      const el = elements.get(id);
      if (el) datedElements.push(el);
    }
    if (datedElements.length === 0) return criteria;

    // Tags criterion: available if 2+ distinct tags exist
    if (availableTags.length >= 2) {
      criteria.push({ id: 'tag', label: t('timeline.groupByTag') });
    }

    // Source
    const sourceValues = new Set<string>();
    for (const el of datedElements) {
      sourceValues.add(el.source || '');
    }
    if (sourceValues.size >= 2) {
      criteria.push({ id: 'source', label: t('timeline.groupBySource') });
    }

    // Property keys (skip date-typed, need 2+ distinct values)
    const propKeyValues = new Map<string, Set<string>>();
    for (const el of datedElements) {
      for (const prop of el.properties) {
        if (prop.type === 'date' || prop.type === 'datetime') continue;
        if (!propKeyValues.has(prop.key)) propKeyValues.set(prop.key, new Set());
        propKeyValues.get(prop.key)!.add(String(prop.value ?? ''));
      }
    }
    for (const [key, values] of propKeyValues) {
      if (values.size >= 2) {
        criteria.push({
          id: `property:${key}`,
          label: t('timeline.groupByProperty', { key }),
        });
      }
    }

    return criteria;
  }, [datedElementIds, elements, availableTags, t]);

  // Effective tag set for filtering lanes (null = all, Set = specific selection)
  const activeTagSet = useMemo(() => {
    if (activeTags === null || activeTags === undefined) return null; // all tags
    return new Set(activeTags); // can be empty = no tags
  }, [activeTags]);

  // Group items into lanes based on active criterion
  const lanes = useMemo(() => {
    const groups = new Map<string, TimelineItem[]>();
    const groupItemIds = new Map<string, Set<string>>();

    const addToGroup = (key: string, item: TimelineItem) => {
      if (!groups.has(key)) {
        groups.set(key, []);
        groupItemIds.set(key, new Set());
      }
      // Prevent duplicates: a link with parentElementIds [A, B] could be added
      // twice to the same lane if both parents share the same tag/source/property
      if (groupItemIds.get(key)!.has(item.id)) return;
      groupItemIds.get(key)!.add(item.id);
      groups.get(key)!.push(item);
    };

    const groupByElement = (el: Element, item: TimelineItem) => {
      if (criterion === 'tag') {
        const tags = el.tags.filter(t => t);
        const matchingTags = activeTagSet
          ? tags.filter(t => activeTagSet.has(t))
          : tags;
        if (matchingTags.length === 0) {
          addToGroup('', item);
        } else {
          for (const tag of matchingTags) {
            addToGroup(tag, item);
          }
        }
      } else if (criterion === 'source') {
        addToGroup(el.source || '', item);
      } else if (criterion.startsWith('property:')) {
        const propKey = criterion.slice(9);
        const prop = el.properties.find(p => p.key === propKey);
        addToGroup(prop ? String(prop.value ?? '') : '', item);
      } else {
        addToGroup('', item);
      }
    };

    for (const item of items) {
      // Links: use parentElementIds to group into parent element lanes
      if (item.parentElementIds && item.parentElementIds.length > 0) {
        let placed = false;
        for (const pid of item.parentElementIds) {
          const el = elements.get(pid);
          if (el) {
            groupByElement(el, item);
            placed = true;
          }
        }
        if (!placed) addToGroup('', item);
        continue;
      }

      if (!item.sourceId) {
        addToGroup('', item);
        continue;
      }
      const el = elements.get(item.sourceId);
      if (!el) {
        addToGroup('', item);
        continue;
      }
      groupByElement(el, item);
    }

    // Build lane array with labels
    const fallbackLabel =
      criterion === 'tag' ? t('timeline.noTag') :
      criterion === 'source' ? t('timeline.noSource') :
      t('timeline.notSet');

    const laneArr: LaneGroup[] = [];
    for (const [key, laneItems] of groups) {
      laneArr.push({
        key: key || '__fallback__',
        label: key || fallbackLabel,
        items: laneItems,
      });
    }

    // Sort: alphabetical, fallback lane last
    laneArr.sort((a, b) => {
      if (a.key === '__fallback__') return 1;
      if (b.key === '__fallback__') return -1;
      return a.label.localeCompare(b.label);
    });

    return laneArr;
  }, [items, elements, criterion, activeTagSet, t]);

  return { availableCriteria, lanes, availableTags };
}
