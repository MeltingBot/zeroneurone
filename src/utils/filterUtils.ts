import type { CanvasTab, Element, EvaluationModel, Link, TabId, ViewFilters } from '../types';
import { matchesEvaluationFilters } from './evaluation';
import { dateEndInclusive, datePropertyRules, elementDateIntervals, overlaps, toMinuteStart } from './temporalUtils';

/**
 * Check if an element matches the given filters
 */
export function elementMatchesFilters(
  element: Element,
  filters: ViewFilters,
  evaluationModel: EvaluationModel = 'zeroneurone'
): boolean {
  // Text search filter
  if (filters.textSearch) {
    const searchLower = filters.textSearch.toLowerCase();
    const matchesText =
      element.label.toLowerCase().includes(searchLower) ||
      element.notes.toLowerCase().includes(searchLower) ||
      element.tags.some((tag) => tag.toLowerCase().includes(searchLower)) ||
      element.properties.some(
        (prop) =>
          prop.key.toLowerCase().includes(searchLower) ||
          String(prop.value ?? '').toLowerCase().includes(searchLower)
      );

    if (!matchesText) return false;
  }

  // Include tags filter (element must have at least one of the included tags)
  if (filters.includeTags.length > 0) {
    const hasIncludedTag = filters.includeTags.some((tag) =>
      element.tags.includes(tag)
    );
    if (!hasIncludedTag) return false;
  }

  // Exclude tags filter (element must not have any of the excluded tags)
  if (filters.excludeTags.length > 0) {
    const hasExcludedTag = filters.excludeTags.some((tag) =>
      element.tags.includes(tag)
    );
    if (hasExcludedTag) return false;
  }

  // Has property filter
  if (filters.hasProperty) {
    const hasProperty = element.properties.some(
      (prop) => prop.key === filters.hasProperty
    );
    if (!hasProperty) return false;
  }

  // Grading filters (Europol / Admiralty models only)
  if (!matchesEvaluationFilters(element.evaluation, evaluationModel, filters.evaluationSources, filters.evaluationInfos)) {
    return false;
  }

  // Minimum confidence filter (ZeroNeurone model only)
  if (filters.minConfidence !== null && evaluationModel === 'zeroneurone') {
    if (element.confidence === null || element.confidence < filters.minConfidence) {
      return false;
    }
  }

  // Period filter: kept when one of its dates (period, events, date
  // properties kept) meets the period; an undated element stays
  if (filters.dateFrom !== null || filters.dateTo !== null) {
    const period = {
      from: filters.dateFrom !== null ? toMinuteStart(filters.dateFrom).getTime() : -Infinity,
      until: filters.dateTo !== null ? dateEndInclusive(toMinuteStart(filters.dateTo)) : Infinity,
    };
    const intervals = elementDateIntervals(element, datePropertyRules(filters));
    if (intervals.length > 0 && !intervals.some((interval) => overlaps(interval, period))) {
      return false;
    }
  }

  // Has geo filter
  if (filters.hasGeo !== null) {
    const hasGeo = element.geo !== null;
    if (filters.hasGeo !== hasGeo) return false;
  }

  return true;
}

/**
 * Check if a link should be dimmed (either endpoint is dimmed)
 */
export function linkShouldBeDimmed(
  link: Link,
  dimmedElementIds: Set<string>
): boolean {
  return dimmedElementIds.has(link.fromId) || dimmedElementIds.has(link.toId);
}

/**
 * Elements kept by the tabs filter: members of at least one chosen tab.
 * Null when it does not apply: nothing chosen, chosen tabs gone, or a tab is
 * open (the views already show its members only).
 */
export function tabFilterElementIds(
  filters: ViewFilters,
  tabs: CanvasTab[],
  activeTabId: TabId | null,
): Set<string> | null {
  const chosen = filters.includeTabs ?? [];
  if (activeTabId !== null || chosen.length === 0) return null;
  const chosenTabs = tabs.filter((tab) => chosen.includes(tab.id));
  if (chosenTabs.length === 0) return null;
  const ids = new Set<string>();
  for (const tab of chosenTabs) for (const id of tab.memberElementIds) ids.add(id);
  return ids;
}

/**
 * Get the set of element IDs that should be dimmed based on filters
 *
 * @param tabFilterIds Elements kept by the tabs filter (tabFilterElementIds), null if it does not apply
 */
export function getDimmedElementIds(
  elements: Element[],
  filters: ViewFilters,
  hiddenElementIds: Set<string>,
  evaluationModel: EvaluationModel = 'zeroneurone',
  tabFilterIds: ReadonlySet<string> | null = null,
): Set<string> {
  const dimmedIds = new Set<string>();

  // Check if any filter is active
  const hasActiveFilters =
    filters.includeTags.length > 0 ||
    filters.excludeTags.length > 0 ||
    filters.hasProperty !== null ||
    filters.textSearch !== '' ||
    (filters.minConfidence !== null && evaluationModel === 'zeroneurone') ||
    (evaluationModel !== 'zeroneurone' &&
      ((filters.evaluationSources?.length ?? 0) > 0 || (filters.evaluationInfos?.length ?? 0) > 0)) ||
    filters.dateFrom !== null ||
    filters.dateTo !== null ||
    filters.hasGeo !== null ||
    tabFilterIds !== null;

  if (!hasActiveFilters) {
    return dimmedIds;
  }

  for (const element of elements) {
    // Skip hidden elements
    if (hiddenElementIds.has(element.id)) continue;

    if ((tabFilterIds && !tabFilterIds.has(element.id)) || !elementMatchesFilters(element, filters, evaluationModel)) {
      dimmedIds.add(element.id);
    }
  }

  return dimmedIds;
}

/**
 * Get neighbor element IDs within a certain depth
 */
export function getNeighborIds(
  elementId: string,
  links: Link[],
  depth: number
): Set<string> {
  const neighbors = new Set<string>([elementId]);

  for (let d = 0; d < depth; d++) {
    const currentNeighbors = new Set(neighbors);

    for (const link of links) {
      if (currentNeighbors.has(link.fromId)) {
        neighbors.add(link.toId);
      }
      if (currentNeighbors.has(link.toId)) {
        neighbors.add(link.fromId);
      }
    }
  }

  return neighbors;
}
