import type { Element, Link, ViewFilters } from '../types';

/**
 * Check if an element matches the given filters
 */
export function elementMatchesFilters(
  element: Element,
  filters: ViewFilters
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

  // Minimum confidence filter
  if (filters.minConfidence !== null) {
    if (element.confidence === null || element.confidence < filters.minConfidence) {
      return false;
    }
  }

  // Date range filters
  if (filters.dateFrom !== null && element.date) {
    if (new Date(element.date) < new Date(filters.dateFrom)) {
      return false;
    }
  }

  if (filters.dateTo !== null && element.date) {
    if (new Date(element.date) > new Date(filters.dateTo)) {
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
 * Get the set of element IDs that should be dimmed based on filters
 */
export function getDimmedElementIds(
  elements: Element[],
  filters: ViewFilters,
  hiddenElementIds: Set<string>
): Set<string> {
  const dimmedIds = new Set<string>();

  // Check if any filter is active
  const hasActiveFilters =
    filters.includeTags.length > 0 ||
    filters.excludeTags.length > 0 ||
    filters.hasProperty !== null ||
    filters.textSearch !== '' ||
    filters.minConfidence !== null ||
    filters.dateFrom !== null ||
    filters.dateTo !== null ||
    filters.hasGeo !== null;

  if (!hasActiveFilters) {
    return dimmedIds;
  }

  for (const element of elements) {
    // Skip hidden elements
    if (hiddenElementIds.has(element.id)) continue;

    if (!elementMatchesFilters(element, filters)) {
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
