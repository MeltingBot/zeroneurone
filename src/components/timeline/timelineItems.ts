/** The timeline's items: built from the dossier and the view filters */

import { datePropertyRules, propertyDateSpans } from '../../utils/temporalUtils';
import type { Comment, DatePrecision, Element as ZNElement, Link, ViewFilters } from '../../types';
import { effectivePrecision, endOfPrecision, formatPropertyValue } from '../../utils/dates';

export interface TimelineItem {
  id: string;
  label: string;
  sublabel?: string;
  start: Date;
  end?: Date;
  /** End as entered, for labels (`end` extends to the end of its period, or to now) */
  displayEnd?: Date;
  /** Precision of start/end ("2019", "mars 2019"…); inferred when absent */
  precision?: DatePrecision;
  approximate?: boolean;
  /** Source zone of the hours (shown in parentheses) */
  timeZone?: string;
  color: string;
  type: 'link' | 'event' | 'property' | 'created';
  sourceId?: string; // For selection
  eventId?: string; // For type === 'event': the ElementEvent.id, used to focus the event in the side panel
  parentElementIds?: string[]; // Element IDs this item belongs to (for swimlane grouping)
  isDimmed?: boolean; // For filter dimming
  unresolvedCommentCount?: number; // Number of unresolved comments
  // Thumbnail info from source element
  thumbLetter: string;
  thumbColor: string;
  thumbShape: 'circle' | 'square' | 'diamond' | 'rectangle' | 'hexagon';
  thumbImageId?: string; // AssetId for image thumbnail
  // Destination thumbnail info (for links)
  destThumbLetter?: string;
  destThumbColor?: string;
  destThumbShape?: 'circle' | 'square' | 'diamond' | 'rectangle' | 'hexagon';
  destThumbImageId?: string;
}

export interface TimelineItemsInput {
  elements: ZNElement[];
  links: Link[];
  comments: Comment[];
  viewHiddenIds: Set<string>;
  dimmedElementIds: Set<string>;
  activeTabId: string | null;
  tabMemberSet: Set<string>;
  tabGhostIds: Set<string>;
  queryFilterActive: boolean;
  queryMatchLinkIds: Set<string>;
  showCreatedAt: boolean;
  includedDateProperties: ViewFilters['includedDateProperties'];
  excludedDateProperties: ViewFilters['excludedDateProperties'];
  dateRangeProperties: ViewFilters['dateRangeProperties'];
  t: (key: string, options?: Record<string, unknown>) => string;
  language: string;
}

/**
 * Items the timeline draws (element dates and events, links, date
 * properties, creation dates) and the time span they cover. Pure: built from
 * the dossier and the view filters, no store.
 */
export function buildTimelineItems({ elements, links, comments, viewHiddenIds, dimmedElementIds, activeTabId, tabMemberSet, tabGhostIds, queryFilterActive, queryMatchLinkIds, showCreatedAt, includedDateProperties, excludedDateProperties, dateRangeProperties, t, language }: TimelineItemsInput) {
  const itemsList: TimelineItem[] = [];
  const now = new Date();
  let minTime = Infinity;
  let maxTime = -Infinity;

  // Helper to count unresolved comments for a target
  const getUnresolvedCommentCount = (targetId: string, targetType: 'element' | 'link'): number => {
    return comments.filter(
      c => c.targetId === targetId && c.targetType === targetType && !c.resolved
    ).length;
  };

  // === Mode "Investigation chronology": show elements & links by createdAt ===
  if (showCreatedAt) {
    // Elements by createdAt
    elements.forEach((element) => {
      if (viewHiddenIds.has(element.id)) return;
      if (activeTabId !== null && !tabMemberSet.has(element.id) && !tabGhostIds.has(element.id)) return;

      const createdDate = new Date(element.createdAt);
      if (isNaN(createdDate.getTime())) return;

      const createdTime = createdDate.getTime();
      if (createdTime < minTime) minTime = createdTime;
      if (createdTime > maxTime) maxTime = createdTime;

      const isElementDimmed = dimmedElementIds.has(element.id) || (activeTabId !== null && tabGhostIds.has(element.id));
      const elementLabel = element.label || t('timeline.unnamed');

      itemsList.push({
        id: `created-el-${element.id}`,
        label: elementLabel,
        start: createdDate,
        end: undefined,
        color: element.visual.color,
        type: 'created',
        sourceId: element.id,
        isDimmed: isElementDimmed,
        unresolvedCommentCount: getUnresolvedCommentCount(element.id, 'element'),
        thumbLetter: elementLabel.charAt(0).toUpperCase(),
        thumbColor: element.visual.color,
        thumbShape: element.visual.shape || 'circle',
        thumbImageId: element.assetIds?.[0] || undefined,
      });
    });

    // Links by createdAt
    links.forEach((link) => {
      const fromElement = elements.find(el => el.id === link.fromId);
      const toElement = elements.find(el => el.id === link.toId);
      if (!fromElement || !toElement) return;
      if (viewHiddenIds.has(fromElement.id) || viewHiddenIds.has(toElement.id)) return;
      if (activeTabId !== null) {
        const fromVisible = tabMemberSet.has(fromElement.id) || tabGhostIds.has(fromElement.id);
        const toVisible = tabMemberSet.has(toElement.id) || tabGhostIds.has(toElement.id);
        if (!fromVisible || !toVisible) return;
      }

      const createdDate = new Date(link.createdAt);
      if (isNaN(createdDate.getTime())) return;

      const createdTime = createdDate.getTime();
      if (createdTime < minTime) minTime = createdTime;
      if (createdTime > maxTime) maxTime = createdTime;

      const fromLabel = fromElement.label || t('timeline.unnamed');
      const toLabel = toElement.label || t('timeline.unnamed');
      const linkLabel = link.label || t('timeline.relation');

      const endpointDimmed = dimmedElementIds.has(fromElement.id) || dimmedElementIds.has(toElement.id)
        || (activeTabId !== null && (tabGhostIds.has(fromElement.id) || tabGhostIds.has(toElement.id)));
      const isLinkDimmed = endpointDimmed && !(queryFilterActive && queryMatchLinkIds.has(link.id));

      itemsList.push({
        id: `created-lk-${link.id}`,
        label: `${fromLabel} → ${linkLabel} → ${toLabel}`,
        start: createdDate,
        end: undefined,
        color: link.visual.color || '#6b7280',
        type: 'created',
        sourceId: link.id,
        parentElementIds: [fromElement.id, toElement.id],
        isDimmed: isLinkDimmed,
        unresolvedCommentCount: getUnresolvedCommentCount(link.id, 'link'),
        thumbLetter: fromLabel.charAt(0).toUpperCase(),
        thumbColor: fromElement.visual.color,
        thumbShape: fromElement.visual.shape || 'circle',
        thumbImageId: fromElement.assetIds?.[0] || undefined,
        destThumbLetter: toLabel.charAt(0).toUpperCase(),
        destThumbColor: toElement.visual.color,
        destThumbShape: toElement.visual.shape || 'circle',
        destThumbImageId: toElement.assetIds?.[0] || undefined,
      });
    });

    // Sort, bounds and return
    itemsList.sort((a, b) => a.start.getTime() - b.start.getTime());
    if (minTime === Infinity) {
      const nowMs = Date.now();
      minTime = nowMs - 365 * 24 * 60 * 60 * 1000;
      maxTime = nowMs + 30 * 24 * 60 * 60 * 1000;
    }
    const range = maxTime - minTime || 365 * 24 * 60 * 60 * 1000;
    const padding = range * 0.1;
    return {
      items: itemsList,
      timeBounds: { min: new Date(minTime - padding), max: new Date(maxTime + padding) },
    };
  }

  // === Normal mode: links dateRange, element events, date properties ===

  // 1. Process links with dateRange
  links.forEach((link) => {
    if (!link.dateRange?.start) return;

    const fromElement = elements.find(el => el.id === link.fromId);
    const toElement = elements.find(el => el.id === link.toId);
    if (!fromElement || !toElement) return;

    // Skip if either element is hidden
    if (viewHiddenIds.has(fromElement.id) || viewHiddenIds.has(toElement.id)) return;
    // Skip if either element is not visible in active tab
    if (activeTabId !== null) {
      const fromVisible = tabMemberSet.has(fromElement.id) || tabGhostIds.has(fromElement.id);
      const toVisible = tabMemberSet.has(toElement.id) || tabGhostIds.has(toElement.id);
      if (!fromVisible || !toVisible) return;
    }

    const startDate = new Date(link.dateRange.start);
    const enteredEnd = link.dateRange.end ? new Date(link.dateRange.end) : null;
    // A bound covers its whole period: an end "2021" lasts until 31 Dec 2021
    const endDate = enteredEnd
      ? new Date(endOfPrecision(enteredEnd, effectivePrecision(enteredEnd, link.dateRange.precision)))
      : now;

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return;

    const startTime = startDate.getTime();
    const endTime = endDate.getTime();
    if (startTime < minTime) minTime = startTime;
    if (endTime > maxTime) maxTime = endTime;

    const fromLabel = fromElement.label || t('timeline.unnamed');
    const toLabel = toElement.label || t('timeline.unnamed');
    const linkLabel = link.label || t('timeline.relation');

    // Check if link should be dimmed (either connected element is dimmed, or ghost in active tab)
    // Exception: if the link itself matches the active query, keep it visible
    const endpointDimmed = dimmedElementIds.has(fromElement.id) || dimmedElementIds.has(toElement.id)
      || (activeTabId !== null && (tabGhostIds.has(fromElement.id) || tabGhostIds.has(toElement.id)));
    const isLinkDimmed = endpointDimmed && !(queryFilterActive && queryMatchLinkIds.has(link.id));

    itemsList.push({
      id: `link-${link.id}`,
      label: `${fromLabel} → ${linkLabel} → ${toLabel}`,
      sublabel: undefined,
      start: startDate,
      end: endDate,
      displayEnd: enteredEnd ?? undefined,
      precision: link.dateRange.precision,
      approximate: link.dateRange.approximate,
      timeZone: link.dateRange.timeZone,
      color: link.visual.color || '#6b7280',
      type: 'link',
      sourceId: link.id,
      parentElementIds: [fromElement.id, toElement.id],
      isDimmed: isLinkDimmed,
      unresolvedCommentCount: getUnresolvedCommentCount(link.id, 'link'),
      thumbLetter: fromLabel.charAt(0).toUpperCase(),
      thumbColor: fromElement.visual.color,
      thumbShape: fromElement.visual.shape || 'circle',
      thumbImageId: fromElement.assetIds?.[0] || undefined,
      // Destination element thumbnail
      destThumbLetter: toLabel.charAt(0).toUpperCase(),
      destThumbColor: toElement.visual.color,
      destThumbShape: toElement.visual.shape || 'circle',
      destThumbImageId: toElement.assetIds?.[0] || undefined,
    });
  });

  // 2. Process element events
  elements.forEach((element) => {
    // Skip hidden elements or elements not in active tab
    if (viewHiddenIds.has(element.id)) return;
    if (activeTabId !== null && !tabMemberSet.has(element.id) && !tabGhostIds.has(element.id)) return;
    if (!element.events || element.events.length === 0) return;

    const isElementDimmed = dimmedElementIds.has(element.id) || (activeTabId !== null && tabGhostIds.has(element.id));

    element.events.forEach((event, index) => {
      if (!event.date) return;

      const eventDate = new Date(event.date);
      if (isNaN(eventDate.getTime())) return;

      const eventTime = eventDate.getTime();
      if (eventTime < minTime) minTime = eventTime;
      if (eventTime > maxTime) maxTime = eventTime;

      const hasEnd = event.dateEnd && !isNaN(new Date(event.dateEnd).getTime());
      const enteredEnd = hasEnd ? new Date(event.dateEnd!) : null;
      // If no end date, extend to today (ongoing event); an end covers its
      // whole period ("2021" lasts until 31 Dec 2021)
      const endDate = enteredEnd
        ? new Date(endOfPrecision(enteredEnd, effectivePrecision(enteredEnd, event.precision)))
        : now;

      const endTime = endDate.getTime();
      if (endTime > maxTime) maxTime = endTime;

      const elementLabel = element.label || t('timeline.unnamed');
      const eventLabel = event.label || '';
      const isDefaultName = element.label === t('timeline.newElement') || !element.label;

      // Event properties: one per line, shown on hover only (inline they
      // drown the labels as soon as an import brings many of them)
      let eventSublabel: string | undefined;
      if (event.properties && event.properties.length > 0) {
        eventSublabel = event.properties
          .filter((p) => p.value !== null && p.value !== undefined && p.value !== '')
          .map((p) => `${p.key}: ${formatPropertyValue(p.value, p.type, language, p.timeZone)}`)
          .join('\n') || undefined;
      }

      // Build label: prefer event label alone if element has default name
      let itemLabel: string;
      if (eventLabel && isDefaultName) {
        itemLabel = eventLabel;
      } else if (eventLabel) {
        itemLabel = `${elementLabel}: ${eventLabel}`;
      } else {
        itemLabel = elementLabel;
      }

      itemsList.push({
        id: `ev-${element.id}-${index}`,
        label: itemLabel,
        sublabel: eventSublabel,
        start: eventDate,
        end: endDate,
        displayEnd: enteredEnd ?? undefined,
        precision: event.precision,
        approximate: event.approximate,
        timeZone: event.timeZone,
        color: element.visual.color,
        type: 'event',
        sourceId: element.id,
        eventId: event.id,
        isDimmed: isElementDimmed,
        unresolvedCommentCount: getUnresolvedCommentCount(element.id, 'element'),
        thumbLetter: elementLabel.charAt(0).toUpperCase(),
        thumbColor: element.visual.color,
        thumbShape: element.visual.shape || 'circle',
        thumbImageId: element.assetIds?.[0] || undefined,
      });
    });
  });

  // 3. Process element properties with type "date" or "datetime", as chosen
  // in the filters panel; a pair declared as a period gives one bar
  const dateRules = datePropertyRules({ includedDateProperties, excludedDateProperties, dateRangeProperties });
  elements.forEach((element) => {
    // Skip hidden elements or elements not in active tab
    if (viewHiddenIds.has(element.id)) return;
    if (activeTabId !== null && !tabMemberSet.has(element.id) && !tabGhostIds.has(element.id)) return;
    if (!element.properties || element.properties.length === 0) return;

    const isElementDimmed = dimmedElementIds.has(element.id) || (activeTabId !== null && tabGhostIds.has(element.id));

    // Imported text is read like everywhere else (UTC midnight = a local day)
    for (const span of propertyDateSpans(element, dateRules)) {
      const startTime = span.start.getTime();
      const endTime = (span.end ?? span.start).getTime();
      if (startTime < minTime) minTime = startTime;
      if (endTime > maxTime) maxTime = endTime;

      const elementLabel = element.label || t('timeline.unnamed');

      itemsList.push({
        id: `prop-${element.id}-${span.index}`,
        label: span.endKey
          ? `${elementLabel}: ${span.key} → ${span.endKey}`
          : `${elementLabel}: ${span.key}`,
        start: span.start,
        end: span.end, // A point unless a pair is declared as a period
        precision: span.datetime ? 'minute' : 'day',
        ...(span.datetime && span.timeZone ? { timeZone: span.timeZone } : {}),
        color: element.visual.color,
        type: 'property',
        sourceId: element.id,
        isDimmed: isElementDimmed,
        unresolvedCommentCount: getUnresolvedCommentCount(element.id, 'element'),
        thumbLetter: elementLabel.charAt(0).toUpperCase(),
        thumbColor: element.visual.color,
        thumbShape: element.visual.shape || 'circle',
        thumbImageId: element.assetIds?.[0] || undefined,
      });
    }
  });

  // Sort by start date (oldest first by default, will be reversed in itemsWithRows if newestFirst)
  itemsList.sort((a, b) => a.start.getTime() - b.start.getTime());

  // Calculate bounds with padding
  if (minTime === Infinity) {
    const now = Date.now();
    minTime = now - 365 * 24 * 60 * 60 * 1000;
    maxTime = now + 30 * 24 * 60 * 60 * 1000;
  }
  const range = maxTime - minTime || 365 * 24 * 60 * 60 * 1000;
  const padding = range * 0.1;

  return {
    items: itemsList,
    timeBounds: {
      min: new Date(minTime - padding),
      max: new Date(maxTime + padding),
    },
  };
}
