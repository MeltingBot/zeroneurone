import { useCallback, useMemo } from 'react';

import type { useViewStore } from '../../stores';
import type { Element, GeoData, Link } from '../../types';
import { getGeoCenter, isGeoPolygon, isGeoInRange } from '../../utils/geo';
import { toMinuteStart, dateEndInclusive, linkInterval, eventInterval, propertyDateIntervals, datePropertyRules, type TimeInterval, elementRangeInterval, overlaps } from '../../utils/temporalUtils';
import { traceBreadcrumbs } from './mapGeometry';

type ViewStore = ReturnType<typeof useViewStore.getState>;

// Element with geo coordinates (resolved for a specific time)
export interface ResolvedGeoElement {
  element: Element;
  geo: { lat: number; lng: number };
  /** Full GeoData (point or polygon) — used by ZoneLayers for temporal zone geometry */
  geoData?: GeoData;
  fromEvent: boolean;
  eventLabel?: string;
  /** Event id that produced the current position (set when `fromEvent` is true) */
  eventId?: string;
  /** Rendered as a light breadcrumb (past event in trace mode) rather than the active marker */
  isBreadcrumb?: boolean;
  /** Breadcrumb: how many past events happened at its position */
  traceCount?: number;
  /** Extra marker beyond the element's primary one (breadcrumb or co-temporal sibling event).
      Excluded from clustering so trajectories/bursts don't collapse, while the primary
      marker of each element still clusters normally. */
  secondaryEvent?: boolean;
}

export interface MapTemporalGeoParams {
  elements: Element[];
  links: Link[];
  filters: ViewStore['filters'];
  viewHiddenIds: ReadonlySet<string>;
  activeTabId: string | null;
  tabMemberSet: ReadonlySet<string>;
  tabGhostIds: ReadonlySet<string>;
  effectiveDimmedIds: ReadonlySet<string>;
  temporalMode: boolean;
  selectedDate: Date | null;
  periodWindow: TimeInterval | null;
  temporalTrace: boolean;
}

/**
 * Where each element stands on the map, at the time cursor or the period
 * when temporal mode is on (events, date ranges, date properties, links),
 * and the links drawn between located elements.
 */
export function useMapTemporalGeo({
  elements,
  links,
  filters,
  viewHiddenIds,
  activeTabId,
  tabMemberSet,
  tabGhostIds,
  effectiveDimmedIds,
  temporalMode,
  selectedDate,
  periodWindow,
  temporalTrace,
}: MapTemporalGeoParams) {
  // Date properties kept in the filters panel date the elements too, as on
  // the timeline (a dossier may be dated by its properties only)
  const { includedDateProperties, excludedDateProperties, dateRangeProperties } = filters;
  const propertyIntervals = useMemo(() => {
    const keep = datePropertyRules({ includedDateProperties, excludedDateProperties, dateRangeProperties });
    const byElement = new Map<string, TimeInterval[]>();
    for (const el of elements) {
      const intervals = propertyDateIntervals(el, keep);
      if (intervals.length > 0) byElement.set(el.id, intervals);
    }
    return byElement;
  }, [elements, includedDateProperties, excludedDateProperties, dateRangeProperties]);

  // Calculate time range and collect all unique event dates
  // Only what the map shows and the filters keep: hidden, out-of-tab or
  // filtered-out elements do not add steps (falls back to everything shown
  // when the filters keep nothing)
  const { timeRange, eventDates } = useMemo(() => {
    const allDates: Date[] = [];
    const shown = elements.filter(
      (el) => !viewHiddenIds.has(el.id) && (activeTabId === null || tabMemberSet.has(el.id) || tabGhostIds.has(el.id)),
    );
    const kept = shown.filter((el) => !effectiveDimmedIds.has(el.id));
    const stepElements = kept.length > 0 ? kept : shown;
    const stepIds = new Set(stepElements.map((el) => el.id));
    stepElements.forEach((el) => {
      const hasBaseGeo = !!el.geo;
      const hasEventGeo = el.events?.some((e) => e.geo);
      if (hasBaseGeo || hasEventGeo) {
        for (const interval of propertyIntervals.get(el.id) ?? []) allDates.push(new Date(interval.from));
        if (el.events && el.events.length > 0) {
          el.events.forEach((event) => {
            if (event.geo || hasBaseGeo) {
              if (event.date) allDates.push(new Date(event.date));
              if (event.dateEnd) allDates.push(new Date(event.dateEnd));
            }
          });
        }
        // Element.date is the collection date, not a fact: left out, as on
        // the timeline and the canvas
        if (hasBaseGeo) {
          if (el.dateRange?.start) allDates.push(new Date(el.dateRange.start));
          if (el.dateRange?.end) allDates.push(new Date(el.dateRange.end));
        }
      }
    });
    links.forEach((link) => {
      if (!stepIds.has(link.fromId) || !stepIds.has(link.toId)) return;
      if (link.date) allDates.push(new Date(link.date));
      if (link.dateRange?.start) allDates.push(new Date(link.dateRange.start));
      if (link.dateRange?.end) allDates.push(new Date(link.dateRange.end));
    });
    if (allDates.length === 0) return { timeRange: null, eventDates: [] };
    const uniqueTimestamps = [...new Set(allDates.map((d) => toMinuteStart(d).getTime()))].sort((a, b) => a - b);
    const sortedDates = uniqueTimestamps.map((t) => new Date(t));
    return {
      timeRange: { min: sortedDates[0], max: sortedDates[sortedDates.length - 1] },
      eventDates: sortedDates,
    };
  }, [elements, links, propertyIntervals, viewHiddenIds, activeTabId, tabMemberSet, tabGhostIds, effectiveDimmedIds]);

  // Get position for an element at a specific time
  const getPositionAtTime = useCallback(
    (element: Element, date: Date | null): { geo: { lat: number; lng: number }; geoData?: GeoData; label?: string; eventId?: string } | null => {
      if (!date || !temporalMode) {
        // Static mode: show the most recent known position — i.e. prefer the latest event over
        // the base geo when the event carries a POINT (movement tracking). Polygon events stay
        // treated as zone overrides: marker stays on the base, but geoData reflects the latest shape.
        const geoEvents = (element.events || [])
          .filter((e) => e.geo && e.date)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const mostRecentEventGeo = geoEvents.length > 0 ? geoEvents[geoEvents.length - 1] : null;
        const mostRecentIsPoint = !!(mostRecentEventGeo?.geo && !isGeoPolygon(mostRecentEventGeo.geo));

        if (mostRecentIsPoint) {
          // Latest point event wins — reflects the element's last known position.
          return {
            geo: getGeoCenter(mostRecentEventGeo!.geo!),
            geoData: mostRecentEventGeo!.geo!,
            label: mostRecentEventGeo!.label,
            eventId: mostRecentEventGeo!.id,
          };
        }
        if (element.geo) {
          // Base geo (with optional polygon event override for zone rendering).
          const effectiveGeoData = (mostRecentEventGeo?.geo && isGeoPolygon(mostRecentEventGeo.geo))
            ? mostRecentEventGeo.geo
            : element.geo;
          return { geo: getGeoCenter(element.geo), geoData: effectiveGeoData };
        }
        if (mostRecentEventGeo) {
          return { geo: getGeoCenter(mostRecentEventGeo.geo!), geoData: mostRecentEventGeo.geo!, label: mostRecentEventGeo.label, eventId: mostRecentEventGeo.id };
        }
        return null;
      }
      const targetTime = toMinuteStart(date).getTime();
      const hasBaseGeo = !!element.geo;
      const datedEvents = (element.events || [])
        .filter((e) => e.date)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      if (datedEvents.length > 0) {
        const firstEventTime = toMinuteStart(datedEvents[0].date).getTime();
        if (targetTime < firstEventTime) return null;
        let activeEvent = datedEvents[0];
        for (const event of datedEvents) {
          if (toMinuteStart(event.date).getTime() <= targetTime) activeEvent = event;
          else break;
        }
        const eventGeo = activeEvent.geo;
        if (eventGeo) return { geo: getGeoCenter(eventGeo), geoData: eventGeo, label: activeEvent.label, eventId: activeEvent.id };
        if (element.geo) return { geo: getGeoCenter(element.geo), geoData: element.geo, label: activeEvent.label, eventId: activeEvent.id };
        return null;
      }
      if (hasBaseGeo) {
        if (element.dateRange?.start) {
          const elStart = toMinuteStart(element.dateRange.start).getTime();
          const elEnd = element.dateRange.end ? dateEndInclusive(toMinuteStart(element.dateRange.end)) : Infinity;
          if (targetTime < elStart || targetTime > elEnd) return null;
        } else if (element.date) {
          const elStart = toMinuteStart(element.date).getTime();
          const elEnd = dateEndInclusive(toMinuteStart(element.date));
          if (targetTime < elStart || targetTime > elEnd) return null;
        }
        return element.geo ? { geo: getGeoCenter(element.geo), geoData: element.geo } : null;
      }
      return null;
    },
    [temporalMode]
  );

  // Get any geo position for an element (for link-pulled visibility)
  const getAnyGeoPosition = useCallback(
    (element: Element): { geo: { lat: number; lng: number }; geoData?: GeoData; label?: string; eventId?: string } | null => {
      if (element.geo) return { geo: getGeoCenter(element.geo), geoData: element.geo };
      const geoEvents = (element.events || [])
        .filter((e) => e.geo && e.date)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      if (geoEvents.length > 0) {
        if (temporalMode && selectedDate) {
          const targetTime = selectedDate.getTime();
          let closest = geoEvents[0];
          let closestDiff = Math.abs(new Date(closest.date).getTime() - targetTime);
          for (const event of geoEvents) {
            const diff = Math.abs(new Date(event.date).getTime() - targetTime);
            if (diff < closestDiff) { closestDiff = diff; closest = event; }
          }
          return { geo: getGeoCenter(closest.geo!), geoData: closest.geo!, label: closest.label, eventId: closest.id };
        }
        const mostRecent = geoEvents[geoEvents.length - 1];
        return { geo: getGeoCenter(mostRecent.geo!), geoData: mostRecent.geo!, label: mostRecent.label, eventId: mostRecent.id };
      }
      return null;
    },
    [temporalMode, selectedDate]
  );

  const isLinkActiveAtTime = useCallback(
    (link: typeof links[0]): boolean => {
      if (!temporalMode || !selectedDate) return true;
      if (periodWindow) {
        const interval = linkInterval(link);
        return interval ? overlaps(interval, periodWindow) : true;
      }
      const targetTime = toMinuteStart(selectedDate).getTime();
      if (link.date) {
        const linkDate = toMinuteStart(link.date).getTime();
        const linkEnd = dateEndInclusive(toMinuteStart(link.date));
        if (targetTime >= linkDate && targetTime <= linkEnd) return true;
      }
      if (link.dateRange?.start) {
        const linkStart = toMinuteStart(link.dateRange.start).getTime();
        const linkEnd = link.dateRange.end ? dateEndInclusive(toMinuteStart(link.dateRange.end)) : Infinity;
        if (targetTime >= linkStart && targetTime <= linkEnd) return true;
        return false;
      }
      return true;
    },
    [temporalMode, selectedDate, periodWindow]
  );

  // Calculate visibility windows for each element based on links
  const elementLinkVisibility = useMemo(() => {
    const visibilityMap = new Map<string, { from: number; until: number }[]>();
    links.forEach((link) => {
      const interval = linkInterval(link);
      if (!interval) return;
      [link.fromId, link.toId].forEach((elId) => {
        const existing = visibilityMap.get(elId) || [];
        existing.push({ from: interval.from, until: interval.until });
        visibilityMap.set(elId, existing);
      });
    });
    return visibilityMap;
  }, [links]);

  const isVisibleViaLink = useCallback(
    (elementId: string, targetTime: number): boolean => {
      const windows = elementLinkVisibility.get(elementId);
      if (!windows) return false;
      return windows.some((w) => targetTime >= w.from && targetTime <= w.until);
    },
    [elementLinkVisibility]
  );

  // Whether an element can be placed on the map: not hidden, and in the active
  // tab (or a ghost of it)
  const isOnMap = useCallback(
    (id: string) =>
      !viewHiddenIds.has(id) &&
      (activeTabId === null || tabMemberSet.has(id) || tabGhostIds.has(id)),
    [viewHiddenIds, activeTabId, tabMemberSet, tabGhostIds]
  );

  // Get elements with resolved geo positions (considering temporal mode)
  const resolvedGeoElements = useMemo((): ResolvedGeoElement[] => {
    const result: ResolvedGeoElement[] = [];
    if (!temporalMode || !selectedDate) {
      elements.forEach((el) => {
        if (!isOnMap(el.id)) return;
        const position = getPositionAtTime(el, null);
        if (position) {
          result.push({ element: el, geo: position.geo, geoData: position.geoData, fromEvent: !!position.label, eventLabel: position.label, eventId: position.eventId });
        }
      });
      return result;
    }
    if (periodWindow) {
      // Period mode: only what is active inside the period. An element shows at
      // its latest geolocated event of the period; the trace keeps the others.
      elements.forEach((el) => {
        if (!isOnMap(el.id)) return;
        const eventsInPeriod = (el.events || [])
          .filter((e) => {
            const interval = eventInterval(e);
            return interval !== null && overlaps(interval, periodWindow);
          })
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const viaLink = (elementLinkVisibility.get(el.id) || []).some((w) => overlaps(w, periodWindow));
        let position: { geo: { lat: number; lng: number }; geoData?: GeoData; label?: string; eventId?: string } | null = null;
        const geoEventsInPeriod = eventsInPeriod.filter((e) => e.geo);
        const latestGeoEvent = geoEventsInPeriod[geoEventsInPeriod.length - 1];
        if (latestGeoEvent) {
          position = { geo: getGeoCenter(latestGeoEvent.geo!), geoData: latestGeoEvent.geo!, label: latestGeoEvent.label, eventId: latestGeoEvent.id };
        } else if (eventsInPeriod.length > 0 && el.geo) {
          const latest = eventsInPeriod[eventsInPeriod.length - 1];
          position = { geo: getGeoCenter(el.geo), geoData: el.geo, label: latest.label, eventId: latest.id };
        } else if (eventsInPeriod.length === 0 && (el.events || []).length === 0 && el.geo) {
          const ownRange = elementRangeInterval(el);
          if (ownRange && overlaps(ownRange, periodWindow)) {
            position = { geo: getGeoCenter(el.geo), geoData: el.geo };
          }
        }
        if (!position && (propertyIntervals.get(el.id) ?? []).some((i) => overlaps(i, periodWindow))) {
          position = getAnyGeoPosition(el);
        }
        if (!position && viaLink) position = getAnyGeoPosition(el);
        if (!position) return;
        result.push({ element: el, geo: position.geo, geoData: position.geoData, fromEvent: !!position.label, eventLabel: position.label, eventId: position.eventId });
        if (temporalTrace) {
          for (const { event: ev, count } of traceBreadcrumbs(geoEventsInPeriod, position)) {
            result.push({
              traceCount: count,
              element: el,
              geo: getGeoCenter(ev.geo!),
              geoData: ev.geo!,
              fromEvent: true,
              eventLabel: ev.label,
              eventId: ev.id,
              isBreadcrumb: true,
              secondaryEvent: true,
            });
          }
        }
      });
      return result;
    }
    const targetTime = toMinuteStart(selectedDate).getTime();
    elements.forEach((el) => {
      if (!isOnMap(el.id)) return;
      const visibleViaActiveLink = isVisibleViaLink(el.id, targetTime);
      const datedEvents = (el.events || []).filter((e) => e.date).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      let visibleByOwnData = false;
      if (datedEvents.length > 0) {
        // Present from the start of its first event to the end of its last:
        // between two events it stays at its last known position (movement
        // tracking). An event with no end lasts: when the last one has none,
        // the element stays.
        const firstEventTime = toMinuteStart(datedEvents[0].date).getTime();
        let lastEventEnd = datedEvents[datedEvents.length - 1].dateEnd ? -Infinity : Infinity;
        for (const e of datedEvents) {
          const interval = eventInterval(e);
          if (interval && interval.until > lastEventEnd) lastEventEnd = interval.until;
        }
        if (targetTime >= firstEventTime && targetTime <= lastEventEnd) visibleByOwnData = true;
      } else if (el.geo) {
        if (el.dateRange?.start) {
          const elStart = toMinuteStart(el.dateRange.start).getTime();
          const elEnd = el.dateRange.end ? dateEndInclusive(toMinuteStart(el.dateRange.end)) : Infinity;
          if (targetTime >= elStart && targetTime <= elEnd) visibleByOwnData = true;
        }
      }
      if (!visibleByOwnData && (propertyIntervals.get(el.id) ?? []).some((i) => targetTime >= i.from && targetTime <= i.until)) {
        visibleByOwnData = true;
      }
      if (visibleByOwnData || visibleViaActiveLink) {
        const position = getPositionAtTime(el, selectedDate) || getAnyGeoPosition(el);
        if (position) {
          result.push({ element: el, geo: position.geo, geoData: position.geoData, fromEvent: !!position.label, eventLabel: position.label, eventId: position.eventId });

          if (temporalTrace) {
            // Trace mode: each past position persists as a lightweight breadcrumb,
            // drawing the movement path up to targetTime.
            const pastEvents = (el.events || []).filter(
              (past) => past.geo && past.date && toMinuteStart(past.date).getTime() <= targetTime,
            );
            for (const { event: past, count } of traceBreadcrumbs(pastEvents, position)) {
              result.push({
                traceCount: count,
                element: el,
                geo: getGeoCenter(past.geo!),
                geoData: past.geo!,
                fromEvent: true,
                eventLabel: past.label,
                eventId: past.id,
                isBreadcrumb: true,
                secondaryEvent: true,
              });
            }
          } else if (position.eventId) {
            // Snapshot mode: only the events sharing the active minute (co-temporal burst) are
            // shown alongside the active marker — e.g. GSM multi-cell pings at the same second.
            const activeEvt = (el.events || []).find((e) => e.id === position.eventId);
            const activeMinute = activeEvt ? toMinuteStart(activeEvt.date).getTime() : NaN;
            if (Number.isFinite(activeMinute) && activeMinute === targetTime) {
              for (const sibling of el.events || []) {
                if (sibling.id === position.eventId) continue;
                if (!sibling.geo || !sibling.date) continue;
                if (toMinuteStart(sibling.date).getTime() !== activeMinute) continue;
                result.push({
                  element: el,
                  geo: getGeoCenter(sibling.geo),
                  geoData: sibling.geo,
                  fromEvent: true,
                  eventLabel: sibling.label,
                  eventId: sibling.id,
                  secondaryEvent: true,
                });
              }
            }
          }
        }
      } else if (temporalTrace && datedEvents.length > 0 && targetTime >= toMinuteStart(datedEvents[0].date).getTime()) {
        // Activity over: no marker, but the trace keeps where it went,
        // last position included
        const pastEvents = datedEvents.filter((past) => past.geo && toMinuteStart(past.date).getTime() <= targetTime);
        for (const { event: past, count } of traceBreadcrumbs(pastEvents, null)) {
          result.push({
            traceCount: count,
            element: el,
            geo: getGeoCenter(past.geo!),
            geoData: past.geo!,
            fromEvent: true,
            eventLabel: past.label,
            eventId: past.id,
            isBreadcrumb: true,
            secondaryEvent: true,
          });
        }
      }
    });
    // Out-of-range coordinates (e.g. a projected file imported as degrees)
    // would make MapLibre throw and take the whole map down: skip them.
    return result.filter(r => isGeoInRange(r.geoData || { type: 'point', ...r.geo }));
  }, [elements, selectedDate, periodWindow, elementLinkVisibility, getPositionAtTime, getAnyGeoPosition, isOnMap, temporalMode, temporalTrace, isVisibleViaLink, propertyIntervals]);

  // Geolocated elements, with their full GeoData (polygons included).
  // Enriched with _markerKey/_eventId so a single element can produce several markers
  // (co-temporal events at different coordinates — e.g. GSM multi-cell pings).
  const geoElements = useMemo(() => {
    return resolvedGeoElements.map((r) => ({
      ...r.element,
      geo: r.geoData || { type: 'point' as const, ...r.geo },
      _markerKey: r.eventId ? `${r.element.id}::${r.eventId}` : r.element.id,
      _eventId: r.eventId,
      _isBreadcrumb: !!r.isBreadcrumb,
      _traceCount: r.traceCount,
      // Only secondary markers (breadcrumbs / co-temporal siblings) bypass clustering.
      // The primary marker of an element clusters normally even when its position is
      // derived from an event (e.g. "latest known point" in static mode).
      _clusterExclude: !!r.secondaryEvent,
    }));
  }, [resolvedGeoElements]);

  // Elements whose displayed zone polygon comes from an event (not draggable)
  const eventZoneIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of resolvedGeoElements) {
      if (r.geoData && isGeoPolygon(r.geoData) && !isGeoPolygon(r.element.geo)) {
        ids.add(r.element.id);
      }
    }
    return ids;
  }, [resolvedGeoElements]);

  // Elements with a marker of their own: one shown only through its trace
  // (activity over) anchors no link and is not counted as located
  const geoElementIds = useMemo(() => new Set(geoElements.filter(el => !el._isBreadcrumb).map(el => el.id)), [geoElements]);

  // Filter links where both elements have geo and are active
  const geoLinks = useMemo(() => {
    return links.filter(link => {
      if (!geoElementIds.has(link.fromId) || !geoElementIds.has(link.toId)) return false;
      if (temporalMode && selectedDate) return isLinkActiveAtTime(link);
      return true;
    });
  }, [links, geoElementIds, temporalMode, selectedDate, isLinkActiveAtTime]);

  return {
    propertyIntervals,
    timeRange,
    eventDates,
    isLinkActiveAtTime,
    isOnMap,
    resolvedGeoElements,
    geoElements,
    eventZoneIds,
    geoElementIds,
    geoLinks,
  };
}
