import { Fragment, useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Supercluster from 'supercluster';
import { useDossierStore, useSelectionStore, useUIStore, useViewStore, useInsightsStore, useTabStore, useQueryStore } from '../../stores';
import { useHistoryStore } from '../../stores/historyStore';
import { useEvaluationModel } from '../../hooks/useEvaluationModel';
import { getDimmedElementIds } from '../../utils/filterUtils';
import { escapeHtml, safeColor, safeDataImageUrl } from '../../utils/escapeHtml';
import type { Element, GeoData, GeoPolygon } from '../../types';
import { getGeoCenter, isGeoPolygon, isGeoInRange, closestPointOnPolygon, pointInPolygon, computePolygonCenter, computePolygonAreaKm2 } from '../../utils/geo';
import { MapPin, Upload, Globe, Map as MapIcon, Search, Building, Pentagon, Trash2, Circle, Square, ChevronDown, Maximize2, Crosshair, Route, Flame } from 'lucide-react';
import { ViewToolbar } from '../common/ViewToolbar';

import { ZoneDrawTool } from './ZoneDrawTool';
import { ZoneEditTool } from './ZoneEditTool';
import { ZoneLayers, resolveCssColor } from './ZoneLayers';
import { TemporalNavigatorBar, TemporalToggleButton } from '../common/TemporalNavigatorBar';
import { toMinuteStart, dateEndInclusive, linkInterval, eventInterval, propertyDateIntervals, datePropertyRules, type TimeInterval, elementRangeInterval, overlaps, navigatorWindow, shiftNavigator, closestDateIndex, computeCanvasTemporalClassification, summarizeActiveEvents, type TemporalEventSummary } from '../../utils/temporalUtils';
import { useHiddenElementIds } from '../../hooks/useHiddenElementIds';
import { TemporalEventsPopover } from '../common/TemporalEventsPopover';
import { toLocalDateKey } from '../../utils/dates';
import { useHoverPopover } from '../../hooks/useHoverPopover';
import { useTabFilterIds } from '../../hooks/useTabFilterIds';
import { useFocusElementEvent } from '../../hooks/useFocusElementEvent';
import { emitExport } from '../../plugins/pluginEventBus';
import { downloadBlob } from '../../utils/download';
import { escapeCsvField } from '../../utils/csv';
import { OFM_VARIANTS, BASE_LAYERS, resolveLayerId, buildMapStyle, ensureTerrainSource, setBasemapBuildings, add3DBuildingsLayer } from './mapStyles';
import { LINK_LINES_SOURCE, LINK_ARROWS_SOURCE, LINK_OUTLINE_LAYER, DENSITY_RAMP, DENSITY_SOURCE, DENSITY_LAYER, densityPointWeight, ensureDensityLayer, ensureLinkLayers, ensureArrowImage } from './mapLayers';
import { traceBreadcrumbs, breadcrumbSize, computeSpiderfyOffsets } from './mapGeometry';

// Element with geo coordinates (resolved for a specific time)
interface ResolvedGeoElement {
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

// Supercluster point feature
interface PointFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { elementId: string; markerKey: string };
}

// Cluster lookup: for each element, where it visually appears
interface ClusterState {
  clustered: boolean;
  clusterCenter?: [number, number]; // [lng, lat]
  clusterId?: number;
}

export function MapView() {
  const { t, i18n } = useTranslation('pages');
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const clusterMarkersRef = useRef<Map<number, maplibregl.Marker>>(new Map());
  // Link labels stay DOM overlays (boxed text, never hidden by collisions)
  const linkLabelMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  // Unlocated neighbours unfolded around their located element (one overlay per element)
  const offMapMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  // Pixel spread of each element marker (spiderfy), so the overlays follow it
  const markerOffsetsRef = useRef<Map<string, [number, number]>>(new Map());
  const selectLinkRef = useRef<(id: string) => void>(() => {});
  const superclusterRef = useRef<Supercluster<{ elementId: string }, Supercluster.AnyProps> | null>(null);
  const clusterStateRef = useRef<Map<string, ClusterState>>(new Map());
  const elementIdToFirstMarkerKeyRef = useRef<Map<string, string>>(new Map());
  // Per-cluster metadata for click handling (center, member keys, whether the members are
  // co-located so that zooming can never separate them — in which case we spiderfy instead).
  const clusterMetaRef = useRef<Map<number, { center: [number, number]; leafKeys: string[]; degenerate: boolean }>>(new Map());
  // Member markerKeys the user explicitly expanded (spiderfied) by clicking a co-located cluster.
  const forceSpiderfyKeysRef = useRef<Set<string>>(new Set());
  const mapLoadedRef = useRef(false);

  // Track clustering state for dynamic link positioning
  const [clusteringVersion, setClusteringVersion] = useState(0);

  // Place search (Nominatim)
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeSearching, setPlaceSearching] = useState(false);
  const placeSearchMarkerRef = useRef<maplibregl.Marker | null>(null);

  // Map preferences (persisted in uiStore)
  const activeBaseLayer = useUIStore((s) => s.mapBaseLayer);
  const ofmVariant = useUIStore((s) => s.mapOfmVariant);
  const [showOfmMenu, setShowOfmMenu] = useState(false);
  const setActiveBaseLayer = (id: string) => useUIStore.setState({ mapBaseLayer: id });
  const setOfmVariant = (v: typeof OFM_VARIANTS[number]['id']) =>
    useUIStore.setState({ mapOfmVariant: v, mapBaseLayer: 'ofm' });
  const is3D = useUIStore((s) => s.map3D);
  const setIs3D = (v: boolean | ((prev: boolean) => boolean)) => useUIStore.setState((s) => ({ map3D: typeof v === 'function' ? v(s.map3D) : v }));
  const show3DBuildings = useUIStore((s) => s.map3DBuildings);
  const setShow3DBuildings = (v: boolean | ((prev: boolean) => boolean)) => useUIStore.setState((s) => ({ map3DBuildings: typeof v === 'function' ? v(s.map3DBuildings) : v }));
  const showDensity = useUIStore((s) => s.mapHeatmap);
  const densitySource = useUIStore((s) => s.mapHeatmapSource);
  const densityIntensity = useUIStore((s) => s.mapHeatmapIntensity);
  const densityPerElement = useUIStore((s) => s.mapHeatmapPerElement);
  const show3DBuildingsRef = useRef(show3DBuildings);
  useEffect(() => { show3DBuildingsRef.current = show3DBuildings; }, [show3DBuildings]);
  const is3DRef = useRef(is3D);
  useEffect(() => { is3DRef.current = is3D; }, [is3D]);

  // Track manually dragged positions
  const [draggedPositions, setDraggedPositions] = useState<Map<string, GeoData>>(new Map());

  // Zone drawing mode
  const [isDrawingZone, setIsDrawingZone] = useState(false);
  const [showZoneShapeMenu, setShowZoneShapeMenu] = useState(false);
  const zoneShape = useUIStore((s) => s.zoneShape);
  const setZoneShape = useUIStore((s) => s.setZoneShape);
  // Zone editing mode (editing polygon vertices)
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);

  // Temporal mode state
  const [temporalMode, setTemporalMode] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  // End of the selected period; null = instant mode (selectedDate only)
  const [periodEnd, setPeriodEnd] = useState<Date | null>(null);
  // Period mode: [selectedDate, periodEnd]; null in instant mode
  const periodWindow = useMemo(
    () => (temporalMode && selectedDate && periodEnd ? navigatorWindow(selectedDate, periodEnd) : null),
    [temporalMode, selectedDate, periodEnd]
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [temporalFollowCamera, setTemporalFollowCamera] = useState(false);
  const [temporalTrace, setTemporalTrace] = useState(false);
  const isPlayingRef = useRef(false);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  // Publish the temporal scrubber into the view store so other views
  // and plugins can follow the scrubbed instant (deduped in the store).
  // In period mode the published instant is the end of the period (the
  // leading edge while playing).
  useEffect(() => {
    const instant = periodEnd ?? selectedDate;
    useViewStore.getState().setMapTemporal({
      active: temporalMode,
      dateMs: temporalMode && instant ? instant.getTime() : null,
    });
  }, [temporalMode, selectedDate, periodEnd]);
  useEffect(() => () => {
    // Leaving the map view ends the scrub for followers.
    useViewStore.getState().setMapTemporal({ active: false, dateMs: null });
  }, []);

  const { elements, links, assets, comments, updateElement, createElement, deleteElements, currentDossier } = useDossierStore();
  const evaluationModel = useEvaluationModel();
  const pushAction = useHistoryStore((s) => s.pushAction);
  const { selectedElementIds, selectElement, selectLink, clearSelection, setFocusedEventId } = useSelectionStore();
  const themeMode = useUIStore((state) => state.themeMode);
  const hideMedia = useUIStore((state) => state.hideMedia);
  const anonymousMode = useUIStore((state) => state.anonymousMode);
  const showCommentBadges = useUIStore((state) => state.showCommentBadges);
  const registerCaptureHandler = useUIStore((state) => state.registerCaptureHandler);
  const unregisterCaptureHandler = useUIStore((state) => state.unregisterCaptureHandler);
  const { filters, hiddenElementIds } = useViewStore();
  // Hidden by hand, or outside the filters when the user chose to hide them
  const viewHiddenIds = useHiddenElementIds();
  const { highlightedElementIds: insightsHighlightedIds } = useInsightsStore();
  const queryFilterActive = useQueryStore((s) => s.isFilterActive);
  const queryMatchElementIds = useQueryStore((s) => s.matchingElementIds);
  const queryMatchLinkIds = useQueryStore((s) => s.matchingLinkIds);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const tabMemberSet = useTabStore((s) => s.memberSet);
  const tabGhostIds = useTabStore((s) => s.ghostIds);

  // Calculate dimmed element IDs based on filters, focus, and insights highlighting
  const tabFilterIds = useTabFilterIds();
  const dimmedElementIds = useMemo(() => {
    let dimmed: Set<string>;
    if (insightsHighlightedIds.size > 0) {
      dimmed = new Set<string>();
      elements.forEach((el) => {
        if (!insightsHighlightedIds.has(el.id)) dimmed.add(el.id);
      });
    } else {
      dimmed = getDimmedElementIds(elements, filters, hiddenElementIds, evaluationModel, tabFilterIds);
    }
    // ZNQuery canvas filter: dim elements not matching the query
    if (queryFilterActive && queryMatchElementIds.size > 0) {
      for (const el of elements) {
        if (!queryMatchElementIds.has(el.id)) {
          dimmed.add(el.id);
        }
      }
    }
    return dimmed;
  }, [elements, links, filters, hiddenElementIds, insightsHighlightedIds, queryFilterActive, queryMatchElementIds, evaluationModel, tabFilterIds]);

  // Extend dimming: tab ghost elements appear dimmed on map
  const effectiveDimmedIds = useMemo(() => {
    if (tabGhostIds.size === 0) return dimmedElementIds;
    const combined = new Set(dimmedElementIds);
    tabGhostIds.forEach(id => combined.add(id));
    return combined;
  }, [dimmedElementIds, activeTabId, tabGhostIds]);

  // Create asset lookup map for thumbnails
  const assetMap = useMemo(() => {
    const map = new Map<string, string | null>();
    assets.forEach((asset) => {
      map.set(asset.id, asset.thumbnailDataUrl);
    });
    return map;
  }, [assets]);

  // Calculate unresolved comment counts per element
  const unresolvedCommentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    comments.forEach((comment) => {
      if (comment.targetType === 'element' && !comment.resolved) {
        counts.set(comment.targetId, (counts.get(comment.targetId) || 0) + 1);
      }
    });
    return counts;
  }, [comments]);

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

  // Check if a link is active at the selected time
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

  // Check if element is visible via any link at a given time
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

  // Direct neighbours with no position at all (no coordinates, no located
  // event), per located element on the map: shown as a "+N" badge on its
  // marker, unfolded around it on click. Hidden, filtered-out and out-of-tab
  // neighbours do not count, nor, in temporal mode, those of inactive links.
  const offMapNeighbors = useMemo(() => {
    const result = new Map<string, Element[]>();
    if (showDensity) return result;
    const byId = new Map(elements.map((el) => [el.id, el]));
    const isUnlocated = (el: Element) => !el.geo && !(el.events || []).some((e) => e.geo);
    const seen = new Map<string, Set<string>>();
    for (const link of links) {
      if (temporalMode && selectedDate && !isLinkActiveAtTime(link)) continue;
      for (const [anchorId, otherId] of [[link.fromId, link.toId], [link.toId, link.fromId]]) {
        if (!geoElementIds.has(anchorId) || effectiveDimmedIds.has(anchorId)) continue;
        const other = byId.get(otherId);
        if (!other || other.isAnnotation || !isUnlocated(other)) continue;
        if (!isOnMap(otherId) || effectiveDimmedIds.has(otherId)) continue;
        let ids = seen.get(anchorId);
        if (!ids) { ids = new Set(); seen.set(anchorId, ids); }
        if (ids.has(otherId)) continue;
        ids.add(otherId);
        const list = result.get(anchorId);
        if (list) list.push(other); else result.set(anchorId, [other]);
      }
    }
    for (const list of result.values()) list.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
    return result;
  }, [showDensity, elements, links, temporalMode, selectedDate, isLinkActiveAtTime, geoElementIds, effectiveDimmedIds, isOnMap]);

  // Located elements whose unlocated neighbours are unfolded
  const [offMapExpanded, setOffMapExpanded] = useState<Set<string>>(new Set());
  const toggleOffMapRef = useRef((_elementId: string) => {});
  toggleOffMapRef.current = (elementId: string) => {
    setOffMapExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(elementId)) next.delete(elementId); else next.add(elementId);
      return next;
    });
  };

  // Temporal mode: events of each element at the instant/period, same rule as
  // the canvas. Shown as a badge under the element's primary marker.
  const temporalEventSummaries = useMemo(() => {
    const summaries = new Map<string, TemporalEventSummary>();
    if (!temporalMode || !selectedDate) return summaries;
    const classification = computeCanvasTemporalClassification(elements, links, selectedDate, periodEnd);
    for (const [id, events] of classification.activeEventsByElement) {
      summaries.set(id, summarizeActiveEvents(events, i18n.language));
    }
    return summaries;
  }, [temporalMode, selectedDate, periodEnd, elements, links, i18n.language]);

  // Event list popover opened from a marker badge (markers are plain DOM, so
  // their listeners reach React state through refs)
  const eventPopover = useHoverPopover();
  const eventPopoverAnchorRef = useRef<HTMLElement | null>(null);
  const [eventPopoverElementId, setEventPopoverElementId] = useState<string | null>(null);
  const eventPopoverHandlersRef = useRef({
    open: (_elementId: string, _anchor: HTMLElement) => {},
    toggle: (_elementId: string, _anchor: HTMLElement) => {},
    scheduleClose: () => {},
  });
  const focusElementEvent = useFocusElementEvent();
  useEffect(() => {
    // A single event: the list would only repeat the badge, so no hover list
    // and a click opens the event in the side panel directly.
    const openFor = (elementId: string, anchor: HTMLElement) => {
      const summary = temporalEventSummaries.get(elementId);
      if (!summary || summary.moreCount === 0) return;
      eventPopoverAnchorRef.current = anchor;
      setEventPopoverElementId(elementId);
      eventPopover.open();
    };
    eventPopoverHandlersRef.current = {
      open: openFor,
      toggle: (elementId, anchor) => {
        const summary = temporalEventSummaries.get(elementId);
        if (!summary) return;
        if (summary.moreCount === 0) focusElementEvent(elementId, summary.events[0].id);
        else if (eventPopover.isOpen && eventPopoverAnchorRef.current === anchor) eventPopover.close();
        else openFor(elementId, anchor);
      },
      scheduleClose: eventPopover.scheduleClose,
    };
  }, [eventPopover, temporalEventSummaries, focusElementEvent]);
  const eventPopoverSummary = eventPopoverElementId ? temporalEventSummaries.get(eventPopoverElementId) : undefined;
  const closeEventPopover = eventPopover.close;
  useEffect(() => {
    if (!temporalMode) closeEventPopover();
  }, [temporalMode, closeEventPopover]);

  // Get thumbnail for element
  const getThumbnail = useCallback((element: Element): string | null => {
    const firstAssetId = element.assetIds?.[0];
    if (!firstAssetId) return null;
    return assetMap.get(firstAssetId) ?? null;
  }, [assetMap]);

  // Create custom marker HTML
  const createMarkerHtml = useCallback((element: Element, isSelected: boolean, isDimmed: boolean, unresolvedCommentCount?: number, isBreadcrumb?: boolean, eventSummary?: TemporalEventSummary, offMap?: { count: number; expanded: boolean }): string => {
    const color = safeColor(element.visual.color, '#f5f5f4');
    const borderColor = safeColor(element.visual.borderColor, '#a8a29e');

    // Breadcrumb markers (past events in trace mode): a small coloured dot, no label/card.
    // Cheap to render for hundreds/thousands of them.
    if (isBreadcrumb) {
      // Glow in the element's colour: the path stands out over a busy basemap
      // (none when dimmed, so filtered-out traces stay in the background)
      const glow = isDimmed
        ? ''
        : `box-shadow:0 0 4px 1px color-mix(in srgb, ${color} 85%, transparent),0 0 10px 4px color-mix(in srgb, ${color} 45%, transparent);`;
      const dimmedStyle = isDimmed ? 'opacity:0.25;' : 'opacity:0.9;';
      const size = breadcrumbSize((element as { _traceCount?: number })._traceCount ?? 1);
      return `<div class="map-breadcrumb" style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:1.5px solid ${borderColor};${glow}${dimmedStyle}cursor:pointer;"></div>`;
    }
    const thumbnail = safeDataImageUrl(getThumbnail(element));
    const label = element.label || t('map.unnamed');
    const truncatedLabel = label.length > 12 ? label.substring(0, 10) + '...' : label;
    const displayLabel = anonymousMode
      ? '<span style="display:inline-block;background:var(--color-text-primary,#3d3833);border-radius:2px;width:2.5em;height:0.8em;"></span>'
      : escapeHtml(isSelected ? label : truncatedLabel);
    const selectedStyle = isSelected
      ? 'box-shadow: 0 0 0 2px var(--color-accent, #e07a5f), 0 2px 6px rgba(0,0,0,0.3);'
      : 'box-shadow: 0 1px 4px rgba(0,0,0,0.2);';
    const dimmedStyle = isDimmed ? 'opacity: 0.3;' : '';
    // Temporal mode: most recent event of the instant/period + count (hover lists them all)
    const eventBadge = eventSummary && !anonymousMode
      ? `<div class="map-event-badge" style="display:flex;align-items:center;gap:3px;max-width:160px;margin:2px auto 0;background:var(--color-bg-primary, #ffffff);border:1px solid var(--color-accent, #e07a5f);border-radius:3px;padding:1px 4px;box-shadow:0 1px 2px rgba(0,0,0,0.1);font-size:9px;color:var(--color-text-primary, #3d3833);white-space:nowrap;cursor:pointer;"><span style="overflow:hidden;text-overflow:ellipsis;">${escapeHtml(eventSummary.label)}</span>${eventSummary.moreCount > 0 ? `<span style="flex-shrink:0;color:var(--color-text-tertiary, #a8a29e);">+${eventSummary.moreCount}</span>` : ''}</div>`
      : '';
    // Linked elements with no position: dashed like the lines that unfold them
    const offMapBadge = offMap && offMap.count > 0
      ? `<div class="map-offmap-badge" title="${escapeHtml(t('map.offMapLinked', { count: offMap.count }))}" style="width:fit-content;margin:2px auto 0;background:var(--color-bg-primary, #ffffff);border:1px dashed ${offMap.expanded ? 'var(--color-accent, #e07a5f)' : 'var(--color-text-tertiary, #a8a29e)'};border-radius:3px;padding:0 4px;font-size:9px;font-weight:600;line-height:13px;color:var(--color-text-secondary, #6b6560);cursor:pointer;">+${offMap.count}</div>`
      : '';
    const commentBadge = showCommentBadges && unresolvedCommentCount && unresolvedCommentCount > 0
      ? `<div style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;background-color:var(--color-warning, #c9952c);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;box-shadow:0 1px 3px rgba(0,0,0,0.3);z-index:10;">${unresolvedCommentCount}</div>`
      : '';

    if (thumbnail) {
      const blurStyle = hideMedia ? 'filter: blur(8px);' : '';
      const cardWidth = isSelected ? 'min-width:48px' : 'width:48px';
      const labelOverflow = isSelected ? 'white-space:nowrap' : 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      return `
        <div class="map-marker-card" style="position:relative;background:var(--color-bg-primary, #ffffff);border:1px solid ${isSelected ? 'var(--color-accent, #e07a5f)' : borderColor};border-radius:4px;overflow:visible;${selectedStyle}${dimmedStyle}${cardWidth};">
          ${commentBadge}
          <div style="width:100%;min-width:48px;height:48px;background-image:url('${thumbnail}');background-size:cover;background-position:center;background-color:var(--color-bg-secondary, #f7f4ef);border-radius:4px 4px 0 0;${blurStyle}"></div>
          <div style="padding:2px 3px;background:var(--color-bg-primary, #ffffff);border-top:1px solid var(--color-border-default, #e8e3db);">
            <span style="font-size:9px;font-weight:500;color:var(--color-text-primary, #3d3833);display:block;text-align:center;${labelOverflow}">${displayLabel}</span>
          </div>
        </div>${offMapBadge}${eventBadge}`;
    } else {
      return `
        <div class="map-marker-simple" style="position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;${dimmedStyle}">
          ${commentBadge}
          <div style="width:16px;height:16px;background-color:${color};border:2px solid ${isSelected ? 'var(--color-accent, #e07a5f)' : borderColor};border-radius:50%;${selectedStyle}"></div>
          <div style="background:var(--color-bg-primary, #ffffff);border:1px solid var(--color-border-default, #e8e3db);border-radius:3px;padding:1px 4px;box-shadow:0 1px 2px rgba(0,0,0,0.1);">
            <span style="font-size:9px;font-weight:500;color:var(--color-text-primary, #3d3833);white-space:nowrap;">${displayLabel}</span>
          </div>
          ${offMapBadge}
          ${eventBadge}
        </div>`;
    }
  }, [getThumbnail, anonymousMode, hideMedia, showCommentBadges, t]);

  // Create marker DOM element
  const createMarkerElement = useCallback((element: Element, isSelected: boolean, isDimmed: boolean, commentCount?: number, isBreadcrumb?: boolean, eventSummary?: TemporalEventSummary, offMap?: { count: number; expanded: boolean }): HTMLDivElement => {
    const el = document.createElement('div');
    el.innerHTML = createMarkerHtml(element, isSelected, isDimmed, commentCount, isBreadcrumb, eventSummary, offMap);
    el.style.cursor = 'pointer';
    return el;
  }, [createMarkerHtml]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const { mapBaseLayer: initLayer, map3D: init3D, themeMode: initTheme, mapOfmVariant: initVariant } = useUIStore.getState();
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: buildMapStyle(resolveLayerId(initLayer, initTheme === 'dark', initVariant), init3D),
      center: [1.888334, 46.603354], // Center of France [lng, lat]
      zoom: 6,
      pitch: init3D ? 45 : 0,
      maxPitch: 70,
      renderWorldCopies: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'top-right');

    map.on('click', (e) => {
      // Only clear selection if clicking on the map background (not a marker)
      if (!(e.originalEvent.target as HTMLElement).closest('.map-marker-card, .map-marker-simple, .cluster-icon, .map-offmap')) {
        clearSelection();
        // Collapse any force-expanded (spiderfied) cluster
        if (forceSpiderfyKeysRef.current.size > 0) {
          forceSpiderfyKeysRef.current = new Set();
          setClusteringVersion(v => v + 1);
        }
      }
    });

    // Link lines: registered once by layer id, valid across style reloads
    // (the layer is re-added under the same id). The outline is the widest.
    map.on('click', LINK_OUTLINE_LAYER, (e) => {
      const linkId = e.features?.[0]?.properties?.linkId;
      if (typeof linkId === 'string') {
        e.preventDefault();
        selectLinkRef.current(linkId);
      }
    });
    map.on('mouseenter', LINK_OUTLINE_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', LINK_OUTLINE_LAYER, () => { map.getCanvas().style.cursor = ''; });

    map.on('zoomend', () => {
      // Zooming re-clusters from scratch — drop any manual spiderfy expansion.
      forceSpiderfyKeysRef.current = new Set();
      setClusteringVersion(v => v + 1);
    });

    map.on('moveend', () => {
      setClusteringVersion(v => v + 1);
    });

    // The event list is anchored to a marker: close it when the map moves
    map.on('movestart', () => {
      eventPopoverHandlersRef.current.scheduleClose();
    });

    map.on('load', () => {
      mapLoadedRef.current = true;
      const { map3D: load3D, map3DBuildings: loadBuildings } = useUIStore.getState();
      if (load3D) {
        ensureTerrainSource(map);
        map.setProjection({ type: 'globe' });
        map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 });
      }
      if (loadBuildings) {
        add3DBuildingsLayer(map);
      } else {
        setBasemapBuildings(map, false);
      }
      setClusteringVersion(v => v + 1);
    });

    mapRef.current = map;

    return () => {
      mapLoadedRef.current = false;
      // Clean up markers
      markersRef.current.forEach(m => m.remove());
      markersRef.current.clear();
      offMapMarkersRef.current.forEach(m => m.remove());
      offMapMarkersRef.current.clear();
      clusterMarkersRef.current.forEach(m => m.remove());
      clusterMarkersRef.current.clear();
      // Link layers go with the map; their label overlays are DOM
      linkLabelMarkersRef.current.forEach(m => m.remove());
      linkLabelMarkersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, [clearSelection]);

  // Switch base layer
  //
  // Skipped on mount: the map is already constructed with this exact style, so
  // calling setStyle again while the first one is still loading makes MapLibre
  // rebuild from scratch ("Unable to perform style diff"). The initial
  // 'load' handler is what flags the map ready and triggers the first link
  // build, so nothing is lost by not reloading the style here.
  const baseLayerInitRef = useRef(true);
  useEffect(() => {
    if (baseLayerInitRef.current) { baseLayerInitRef.current = false; return; }
    const map = mapRef.current;
    if (!map) return;
    // setStyle removes the link sources and layers; the link effect, re-run
    // on styledata below, adds them back
    map.setStyle(buildMapStyle(resolveLayerId(activeBaseLayer, themeMode === 'dark', ofmVariant), is3DRef.current));
    // Re-flag as loaded once the new style is actually in place.
    //
    // Neither 'style.load' nor 'idle' is reliable here. style.load only fires
    // when MapLibre rebuilds the style, not when it diffs two similar ones;
    // idle can fire before a remote style (OpenFreeMap) has finished loading.
    // In both cases the callback was missed or ran too early, so the link
    // layers were never rebuilt although their DOM markers had just been
    // removed above — switching basemap silently dropped every link line.
    //
    // 'styledata' fires once MapLibre has applied the new style, which is all
    // that adding sources and layers requires. isStyleLoaded() is deliberately
    // not consulted: it stays false while the style's own sources are still
    // fetching, so gating on it stalled the rebuild indefinitely.
    const onStyleReady = () => {
      mapLoadedRef.current = true;
      if (is3DRef.current) {
        ensureTerrainSource(map);
        map.setProjection({ type: 'globe' });
        map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 });
      }
      if (show3DBuildingsRef.current) {
        add3DBuildingsLayer(map);
      } else {
        // A freshly loaded style brings its own extrusions back: hide them
        // again so the toggle still reflects what is on screen.
        setBasemapBuildings(map, false);
      }
      setClusteringVersion(v => v + 1);
    };
    map.once('styledata', onStyleReady);
    // themeMode is a dependency: OpenFreeMap ships a light style and a dark
    // one, so switching theme reloads the style. i18n.language no longer is,
    // since the localized OSM raster entry was dropped.
  }, [activeBaseLayer, themeMode, ofmVariant]);

  // Toggle 3D mode (projection + terrain + pitch) without full style reload
  const is3DInitRef = useRef(true); // skip first render (handled by init)
  useEffect(() => {
    if (is3DInitRef.current) { is3DInitRef.current = false; return; }
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    if (is3D) {
      ensureTerrainSource(map);
      map.setProjection({ type: 'globe' });
      map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 });
      map.easeTo({ pitch: 45, duration: 600 });
      if (show3DBuildingsRef.current) add3DBuildingsLayer(map);
    } else {
      try { map.setTerrain(undefined as any); } catch { /* ignore */ }
      map.setProjection({ type: 'mercator' });
      map.easeTo({ pitch: 0, duration: 600 });
      // Remove terrain source to fully disable 3D terrain
      try { if (map.getSource('terrain-dem')) map.removeSource('terrain-dem'); } catch { /* ignore */ }
      // Keep 3D buildings if user has them enabled
      if (!show3DBuildingsRef.current && map.getLayer('3d-buildings')) {
        map.removeLayer('3d-buildings');
        setBasemapBuildings(map, false);
        // The source is deliberately left in place: on an OpenFreeMap basemap
        // it belongs to the style itself, and removing it would take the whole
        // map down. A vector source no layer consumes fetches nothing.
      }
    }
  }, [is3D]);

  // Toggle 3D buildings layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    if (show3DBuildings) {
      add3DBuildingsLayer(map);
    } else {
      if (map.getLayer('3d-buildings')) map.removeLayer('3d-buildings');
      setBasemapBuildings(map, false);
      // Same as above: never remove a source the basemap may own.
    }
  }, [show3DBuildings]);

  // Track drag start position for undo/redo
  const dragStartGeoRef = useRef<{ id: string; geo: import('../../types').GeoData } | null>(null);
  const isDraggingRef = useRef(false);

  // Clean up dragged positions when elements are removed
  useEffect(() => {
    const currentIds = new Set(elements.map((el) => el.id));
    setDraggedPositions(prev => {
      let changed = false;
      const next = new Map(prev);
      next.forEach((_, id) => {
        if (!currentIds.has(id)) { next.delete(id); changed = true; }
      });
      return changed ? next : prev;
    });
  }, [elements]);

  // Compute effective positions (dragged positions override resolved positions)
  const effectiveGeoElements = useMemo(() => {
    return geoElements.map((el) => {
      const draggedPos = draggedPositions.get(el.id);
      if (draggedPos) return { ...el, geo: draggedPos };
      return el;
    });
  }, [geoElements, draggedPositions]);

  const effectiveGeoElementsRef = useRef(effectiveGeoElements);
  effectiveGeoElementsRef.current = effectiveGeoElements;

  // Elements placed on the map, and how many of them the filters keep
  const locatedCounts = useMemo(() => {
    const ids = geoElementIds;
    let kept = 0;
    for (const id of ids) if (!effectiveDimmedIds.has(id)) kept++;
    return { total: ids.size, kept };
  }, [geoElementIds, effectiveDimmedIds]);

  // Points of the density overlay. Dimmed elements (outside the filters, the
  // query or the tab) do not count: the density shows what is kept.
  const densityPoints = useMemo((): GeoJSON.Feature<GeoJSON.Point>[] => {
    if (!showDensity) return [];
    const points: GeoJSON.Feature<GeoJSON.Point>[] = [];
    const add = (geo: GeoData, w = 1) => {
      if (!isGeoInRange(geo)) return;
      const c = getGeoCenter(geo);
      points.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [c.lng, c.lat] }, properties: { w } });
    };
    if (densitySource === 'elements') {
      // One point per element shown, at its current position
      for (const el of effectiveGeoElements) {
        if (el._clusterExclude || effectiveDimmedIds.has(el.id)) continue;
        add(el.geo);
      }
      return points;
    }
    // Every located event; with the navigator, those of the period, or those
    // up to the instant (the density builds up while playing)
    const instant = temporalMode && selectedDate && !periodWindow ? toMinuteStart(selectedDate).getTime() : null;
    for (const el of elements) {
      if (!isOnMap(el.id) || effectiveDimmedIds.has(el.id)) continue;
      const kept: GeoData[] = [];
      for (const ev of el.events || []) {
        if (!ev.geo) continue;
        if (periodWindow) {
          const interval = eventInterval(ev);
          if (!interval || !overlaps(interval, periodWindow)) continue;
        } else if (instant !== null) {
          if (!ev.date || toMinuteStart(ev.date).getTime() > instant) continue;
        }
        kept.push(ev.geo);
      }
      // Per element: n events weigh sqrt(n) together, not n
      const w = densityPerElement && kept.length > 0 ? 1 / Math.sqrt(kept.length) : 1;
      for (const geo of kept) add(geo, w);
    }
    return points;
  }, [showDensity, densitySource, densityPerElement, effectiveGeoElements, effectiveDimmedIds, elements, isOnMap, temporalMode, selectedDate, periodWindow]);

  // Rebuild Supercluster and update markers
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const zoom = Math.floor(map.getZoom());

    // Density shown: no markers nor clusters; links join the elements directly
    if (showDensity) {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
      clusterMarkersRef.current.forEach((marker) => marker.remove());
      clusterMarkersRef.current.clear();
      superclusterRef.current = null;
      clusterMetaRef.current = new Map();
      clusterStateRef.current = new Map();
      elementIdToFirstMarkerKeyRef.current = new Map();
      return;
    }

    // Build supercluster index
    const sc = new Supercluster<{ elementId: string; markerKey: string }>({
      radius: 50,
      maxZoom: 20,
    });

    // Secondary event markers (trajectory breadcrumbs, co-temporal sibling pings) stay visible
    // individually so trajectories/bursts don't collapse into a single cluster. The primary
    // marker of each element clusters normally — even when its position comes from an event.
    const basePoints: PointFeature[] = [];
    for (const el of effectiveGeoElements) {
      if (el._clusterExclude) continue;
      basePoints.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [getGeoCenter(el.geo).lng, getGeoCenter(el.geo).lat] },
        properties: { elementId: el.id, markerKey: el._markerKey },
      });
    }

    sc.load(basePoints);
    superclusterRef.current = sc;

    // Get clusters at current zoom
    const clusters = sc.getClusters([-180, -90, 180, 90], zoom);

    // Build cluster state lookup — keyed by markerKey, with parallel elementId→firstMarkerKey
    // so consumers that still reason per-element (link layers) can resolve to a state entry.
    const newClusterState = new Map<string, ClusterState>();
    const elementIdToFirstMarkerKey = new Map<string, string>();
    for (const el of effectiveGeoElements) {
      if (!elementIdToFirstMarkerKey.has(el.id)) elementIdToFirstMarkerKey.set(el.id, el._markerKey);
    }
    const activeClusters = new Map<number, { center: [number, number]; count: number; activeCount: number }>();
    const clusterMeta = new Map<number, { center: [number, number]; leafKeys: string[]; degenerate: boolean }>();
    const forced = forceSpiderfyKeysRef.current;

    clusters.forEach(feature => {
      const props = feature.properties as Record<string, unknown>;
      if (props.cluster) {
        const clusterId = props.cluster_id as number;
        const center = feature.geometry.coordinates as [number, number];
        const count = props.point_count as number;

        // Get all leaves (markerKeys + coords) in this cluster
        const leaves = sc.getLeaves(clusterId, Infinity);
        const leafKeys: string[] = [];
        let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
        leaves.forEach(leaf => {
          const leafProps = leaf.properties as { elementId: string; markerKey: string };
          leafKeys.push(leafProps.markerKey);
          const [lng, lat] = leaf.geometry.coordinates;
          if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
        });
        // Co-located if the members span a negligible geographic extent (~10m): zooming can
        // never split them, so a click spiderfies instead of zooming.
        const degenerate = (maxLng - minLng) < 1e-4 && (maxLat - minLat) < 1e-4;
        clusterMeta.set(clusterId, { center, leafKeys, degenerate });

        // If the user explicitly expanded this (co-located) cluster, render its members
        // spiderfied instead of as a single pastille.
        const isForceExpanded = forced.size > 0 && leafKeys.every(k => forced.has(k));
        if (isForceExpanded) {
          leaves.forEach(leaf => {
            const leafProps = leaf.properties as { elementId: string; markerKey: string };
            newClusterState.set(leafProps.markerKey, { clustered: false });
          });
          return;
        }

        let activeCount = 0;
        leaves.forEach(leaf => {
          const leafProps = leaf.properties as { elementId: string; markerKey: string };
          newClusterState.set(leafProps.markerKey, {
            clustered: true,
            clusterCenter: center,
            clusterId,
          });
          if (!effectiveDimmedIds.has(leafProps.elementId)) {
            activeCount++;
          }
        });
        activeClusters.set(clusterId, { center, count, activeCount });
      } else {
        const leafProps = feature.properties as { elementId: string; markerKey: string };
        newClusterState.set(leafProps.markerKey, { clustered: false });
      }
    });
    clusterMetaRef.current = clusterMeta;

    // Secondary event markers are never clustered — register them with unclustered state so
    // downstream spiderfy/visibility logic treats them uniformly.
    for (const el of effectiveGeoElements) {
      if (el._clusterExclude && !newClusterState.has(el._markerKey)) {
        newClusterState.set(el._markerKey, { clustered: false });
      }
    }

    clusterStateRef.current = newClusterState;
    elementIdToFirstMarkerKeyRef.current = elementIdToFirstMarkerKey;

    // Compute spiderfy offsets for unclustered markers at same position
    const unclusteredElements = effectiveGeoElements.filter(el => {
      const state = newClusterState.get(el._markerKey);
      return state && !state.clustered;
    });
    const spiderfyOffsets = computeSpiderfyOffsets(
      unclusteredElements.map(el => { const c = getGeoCenter(el.geo); return { id: el._markerKey, lng: c.lng, lat: c.lat }; }),
    );

    // Members of a cluster the user force-expanded are spread explicitly around the cluster
    // center (they may not share the exact coordinate that the automatic spiderfy groups by).
    if (forced.size > 0) {
      const forcedKeys = effectiveGeoElements.map(el => el._markerKey).filter(k => forced.has(k));
      forcedKeys.forEach((key, i) => {
        if (i === 0) { spiderfyOffsets.set(key, [0, 0]); return; }
        const angle = (2 * Math.PI * i) / forcedKeys.length;
        const spiralRadius = 28 * (1 + i * 0.18); // px
        spiderfyOffsets.set(key, [Math.cos(angle) * spiralRadius, Math.sin(angle) * spiralRadius]);
      });
    }

    // Update element markers
    const existingMarkers = markersRef.current;
    const currentKeys = new Set(effectiveGeoElements.map(el => el._markerKey));

    // Remove markers no longer present
    existingMarkers.forEach((marker, key) => {
      if (!currentKeys.has(key)) {
        marker.remove();
        existingMarkers.delete(key);
      }
    });

    // Add/update element markers
    effectiveGeoElements.forEach((element) => {
      const markerKey = element._markerKey;
      const isEventMarker = !!element._eventId;
      const isSelected = selectedElementIds.has(element.id);
      const isDimmed = effectiveDimmedIds.has(element.id);
      const commentCount = unresolvedCommentCounts.get(element.id);
      // Event badge only on the element's primary marker (not breadcrumbs/siblings)
      const eventSummary = element._clusterExclude ? undefined : temporalEventSummaries.get(element.id);
      // Unlocated neighbours: on the element's primary marker only
      const offMapCount = element._clusterExclude || element._isBreadcrumb ? 0 : (offMapNeighbors.get(element.id)?.length ?? 0);
      const offMap = offMapCount > 0 ? { count: offMapCount, expanded: offMapExpanded.has(element.id) } : undefined;
      const state = newClusterState.get(markerKey);
      const isClustered = state?.clustered ?? false;

      const existingMarker = existingMarkers.get(markerKey);
      const offset = spiderfyOffsets.get(markerKey);
      const center = getGeoCenter(element.geo);
      // Keep the marker at its true geographic position; the spiderfy spread is a pixel
      // offset combined with the base anchor offset ([0, -8]) so it stays constant on zoom.
      // Breadcrumbs are centred on their position whatever their size
      const traceCount = (element as { _traceCount?: number })._traceCount;
      const baseY = element._isBreadcrumb ? -breadcrumbSize(traceCount ?? 1) / 2 : -8;
      const markerOffset: [number, number] = offset ? [offset[0], offset[1] + baseY] : [0, baseY];
      const markerTitle = anonymousMode
        ? ''
        : element._isBreadcrumb && (traceCount ?? 1) > 1
          ? `${element.label || ''} · ${t('map.traceEvents', { count: traceCount })}`
          : (element.label || '');
      if (offMap) markerOffsetsRef.current.set(element.id, offset ?? [0, 0]);

      if (existingMarker) {
        // Update position (true center) and spiderfy spread (pixel offset)
        existingMarker.setLngLat([center.lng, center.lat]);
        existingMarker.setOffset(markerOffset);
        // Update draggability
        existingMarker.setDraggable(!isEventMarker && !element.isPositionLocked && !eventZoneIds.has(element.id));
        // Update visibility (hide if clustered)
        const el = existingMarker.getElement();
        const isBeingEdited = editingZoneId === element.id;
        el.style.display = (isClustered || isBeingEdited) ? 'none' : '';
        el.innerHTML = createMarkerHtml(element, isSelected, isDimmed, commentCount, element._isBreadcrumb, eventSummary, offMap);
        el.setAttribute('title', markerTitle);
      } else {
        // Create new marker
        const markerEl = createMarkerElement(element, isSelected, isDimmed, commentCount, element._isBreadcrumb, eventSummary, offMap);
        const isBeingEdited = editingZoneId === element.id;
        markerEl.style.display = (isClustered || isBeingEdited) ? 'none' : '';
        markerEl.setAttribute('title', markerTitle);

        // Event-sourced markers are not draggable: dragging them would ambiguously move the element
        // vs. the event, so we only allow drag on the primary (base-geo) marker.
        const isDraggable = !isEventMarker && !element.isPositionLocked && !eventZoneIds.has(element.id);
        const marker = new maplibregl.Marker({ element: markerEl, anchor: 'top', offset: markerOffset, draggable: isDraggable })
          .setLngLat([center.lng, center.lat])
          .addTo(map);

        // Click to select — also focus the underlying event in the side panel when the marker
        // represents a specific event (temporal mode, or element whose position comes from an event)
        const markerId = element.id;
        const markerEventId = element._eventId;
        markerEl.addEventListener('click', (e) => {
          e.stopPropagation();
          // Unlocated-neighbours badge: unfold or fold them instead of selecting
          if ((e.target as HTMLElement).closest('.map-offmap-badge')) {
            toggleOffMapRef.current(markerId);
            return;
          }
          // Event badge: open the dated list instead of selecting
          const badge = (e.target as HTMLElement).closest<HTMLElement>('.map-event-badge');
          if (badge) {
            eventPopoverHandlersRef.current.toggle(markerId, badge);
            return;
          }
          selectElement(markerId);
          setFocusedEventId(markerEventId ?? null);
        });
        // Hovering the event badge opens the dated list (delegated: the marker
        // HTML is rewritten on every update)
        markerEl.addEventListener('mouseover', (e) => {
          const badge = (e.target as HTMLElement).closest<HTMLElement>('.map-event-badge');
          if (badge) eventPopoverHandlersRef.current.open(markerId, badge);
        });
        markerEl.addEventListener('mouseout', (e) => {
          const badge = (e.target as HTMLElement).closest<HTMLElement>('.map-event-badge');
          if (!badge || badge.contains(e.relatedTarget as Node | null)) return;
          eventPopoverHandlersRef.current.scheduleClose();
        });

        // Drag handlers
        marker.on('dragstart', () => {
          isDraggingRef.current = true;
          // Store the original geo (could be point or polygon) for undo
          // Read fresh from store to avoid stale closure
          const freshElements = useDossierStore.getState().elements;
          const originalElement = freshElements.find(e => e.id === markerId);
          if (originalElement?.geo) {
            dragStartGeoRef.current = { id: markerId, geo: originalElement.geo };
          } else {
            const pos = marker.getLngLat();
            dragStartGeoRef.current = { id: markerId, geo: { type: 'point', lat: pos.lat, lng: pos.lng } };
          }
        });
        marker.on('drag', () => {
          // Live-update polygon zone directly on MapLibre source (bypasses React for smooth animation)
          const dragStart = dragStartGeoRef.current;
          if (!dragStart || dragStart.id !== markerId || !isGeoPolygon(dragStart.geo)) return;
          const startGeo = dragStart.geo;

          const pos = marker.getLngLat();
          const dLng = pos.lng - startGeo.center.lng;
          const dLat = pos.lat - startGeo.center.lat;

          const m = mapRef.current;
          if (!m) return;
          const src = m.getSource('zones-source') as maplibregl.GeoJSONSource | undefined;
          if (!src) return;

          // Rebuild all zone features, translating the dragged polygon
          // Use effectiveGeoElements (includes event polygon overrides)
          const allEls = effectiveGeoElementsRef.current;
          const features: GeoJSON.Feature[] = [];
          for (const el of allEls) {
            if (!el.geo || !isGeoPolygon(el.geo)) continue;
            let coords = el.geo.coordinates;
            if (el.id === markerId) {
              coords = startGeo.coordinates.map(
                ([lng, lat]) => [lng + dLng, lat + dLat] as [number, number]
              );
            }
            features.push({
              type: 'Feature',
              geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]]] },
              properties: {
                id: el.id,
                color: resolveCssColor(el.visual.color, '#10b981'),
                borderColor: resolveCssColor(el.visual.borderColor || el.visual.color, '#059669'),
                isSelected: false,
                isDimmed: false,
              },
            });
          }
          src.setData({ type: 'FeatureCollection', features });
        });
        marker.on('dragend', () => {
          const newPos = marker.getLngLat();
          const dragStart = dragStartGeoRef.current;
          const oldGeo = dragStart?.id === markerId ? dragStart.geo : null;

          // Build new geo: translate polygon or create point
          let newGeo: GeoData;
          if (oldGeo && isGeoPolygon(oldGeo)) {
            // Translate polygon: shift all coordinates by the delta from original position
            const dLng = newPos.lng - oldGeo.center.lng;
            const dLat = newPos.lat - oldGeo.center.lat;
            newGeo = {
              type: 'polygon',
              coordinates: oldGeo.coordinates.map(
                ([lng, lat]) => [lng + dLng, lat + dLat] as [number, number]
              ),
              center: { lat: newPos.lat, lng: newPos.lng },
              ...(oldGeo.shapeOrigin ? { shapeOrigin: oldGeo.shapeOrigin } : {}),
              ...(oldGeo.radius != null ? { radius: oldGeo.radius } : {}),
              ...(oldGeo.altitude != null ? { altitude: oldGeo.altitude } : {}),
              ...(oldGeo.extrude != null ? { extrude: oldGeo.extrude } : {}),
            };
          } else {
            newGeo = { type: 'point' as const, lat: newPos.lat, lng: newPos.lng };
          }

          setDraggedPositions(prev => {
            const next = new Map(prev);
            next.set(markerId, newGeo);
            return next;
          });
          updateElement(markerId, { geo: newGeo });
          if (oldGeo) {
            pushAction({
              type: 'update-element',
              undo: { elementId: markerId, changes: { geo: oldGeo } },
              redo: { elementId: markerId, changes: { geo: newGeo } },
            });
          }
          dragStartGeoRef.current = null;
          isDraggingRef.current = false;
          setClusteringVersion(v => v + 1);
        });

        existingMarkers.set(markerKey, marker);
      }
    });

    // Update cluster markers
    const existingClusterMarkers = clusterMarkersRef.current;
    const activeClusterIds = new Set(activeClusters.keys());

    // Remove old cluster markers
    existingClusterMarkers.forEach((marker, id) => {
      if (!activeClusterIds.has(id)) {
        marker.remove();
        existingClusterMarkers.delete(id);
      }
    });

    // Add/update cluster markers
    activeClusters.forEach(({ center, count, activeCount }, clusterId) => {
      const allDimmed = activeCount === 0;
      const displayCount = activeCount > 0 && activeCount < count ? activeCount : count;
      let size = 'small';
      let dimension = 30;
      if (displayCount >= 10) { size = 'large'; dimension = 44; }
      else if (displayCount >= 5) { size = 'medium'; dimension = 36; }
      const dimStyle = allDimmed ? 'opacity:0.3;' : '';

      const existingCluster = existingClusterMarkers.get(clusterId);
      if (existingCluster) {
        existingCluster.setLngLat(center);
        const el = existingCluster.getElement();
        el.innerHTML = `<div class="cluster-icon cluster-${size}" style="width:${dimension}px;height:${dimension}px;${dimStyle}"><span>${displayCount}</span></div>`;
      } else {
        const el = document.createElement('div');
        el.className = 'custom-cluster-icon';
        el.innerHTML = `<div class="cluster-icon cluster-${size}" style="width:${dimension}px;height:${dimension}px;${dimStyle}"><span>${displayCount}</span></div>`;
        el.style.cursor = 'pointer';

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const meta = clusterMetaRef.current.get(clusterId);
          const scNow = superclusterRef.current;
          if (!meta || !scNow) return;
          if (meta.degenerate) {
            // Co-located members: zooming can't separate them — spiderfy in place instead.
            forceSpiderfyKeysRef.current = new Set(meta.leafKeys);
            setClusteringVersion(v => v + 1);
          } else {
            const expansionZoom = scNow.getClusterExpansionZoom(clusterId);
            map.flyTo({ center: meta.center, zoom: expansionZoom });
          }
        });

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(center)
          .addTo(map);
        existingClusterMarkers.set(clusterId, marker);
      }
    });

  }, [effectiveGeoElements, selectedElementIds, effectiveDimmedIds, unresolvedCommentCounts, createMarkerHtml, createMarkerElement, selectElement, setFocusedEventId, updateElement, pushAction, anonymousMode, hideMedia, clusteringVersion, editingZoneId, eventZoneIds, temporalEventSummaries, showDensity, offMapNeighbors, offMapExpanded, t]);

  // Get visible position for an element (considering clustering). Cluster state is keyed by
  // markerKey (one element can produce multiple markers for co-temporal events); we pick the
  // element's first/base marker as the representative for link layers.
  const geoElementById = useMemo(() => new Map(effectiveGeoElements.map(el => [el.id, el])), [effectiveGeoElements]);

  // Unlocated neighbours unfolded around their element: chips on a circle,
  // joined by dashed lines, in pixels so the spread holds on zoom. Rebuilt
  // whole on each change (a few dozen nodes at most).
  useEffect(() => {
    const map = mapRef.current;
    const overlays = offMapMarkersRef.current;
    overlays.forEach((m) => m.remove());
    overlays.clear();
    if (!map || showDensity) return;

    const MAX_CHIPS = 12;
    for (const anchorId of offMapExpanded) {
      const neighbours = offMapNeighbors.get(anchorId);
      const anchor = geoElementById.get(anchorId);
      if (!neighbours || neighbours.length === 0 || !anchor) continue;
      const firstKey = elementIdToFirstMarkerKeyRef.current.get(anchorId) ?? anchorId;
      if (clusterStateRef.current.get(firstKey)?.clustered) continue;

      const shown = neighbours.slice(0, neighbours.length > MAX_CHIPS ? MAX_CHIPS - 1 : MAX_CHIPS);
      const rest = neighbours.slice(shown.length);
      const slots = shown.length + (rest.length > 0 ? 1 : 0);
      const radius = Math.max(80, slots * 17);
      const inner = 30; // lines start clear of the marker itself

      const root = document.createElement('div');
      root.className = 'map-offmap';
      root.style.cssText = 'position:relative;width:0;height:0;';
      const svgNs = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNs, 'svg');
      svg.setAttribute('width', String(2 * radius));
      svg.setAttribute('height', String(2 * radius));
      svg.style.cssText = `position:absolute;left:${-radius}px;top:${-radius}px;overflow:visible;pointer-events:none;`;
      root.appendChild(svg);

      const chipStyle = 'position:absolute;transform:translate(-50%,-50%);display:flex;align-items:center;gap:4px;max-width:140px;background:var(--color-bg-primary, #ffffff);border-radius:3px;padding:1px 5px;box-shadow:0 1px 2px rgba(0,0,0,0.12);font-size:10px;color:var(--color-text-primary, #3d3833);white-space:nowrap;cursor:pointer;';
      for (let i = 0; i < slots; i++) {
        const angle = -Math.PI / 2 + (2 * Math.PI * i) / slots;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const line = document.createElementNS(svgNs, 'line');
        line.setAttribute('x1', String(radius + Math.cos(angle) * inner));
        line.setAttribute('y1', String(radius + Math.sin(angle) * inner));
        line.setAttribute('x2', String(radius + x));
        line.setAttribute('y2', String(radius + y));
        line.setAttribute('stroke', 'var(--color-text-secondary, #6b6560)');
        line.setAttribute('stroke-width', '1.5');
        line.setAttribute('stroke-dasharray', '3 2');
        svg.appendChild(line);

        const chip = document.createElement('div');
        chip.style.cssText = `${chipStyle}left:${x}px;top:${y}px;`;
        const el = shown[i];
        if (el) {
          const isSelected = selectedElementIds.has(el.id);
          chip.style.border = `1px solid ${isSelected ? 'var(--color-accent, #e07a5f)' : 'var(--color-border-default, #e8e3db)'}`;
          const dot = document.createElement('span');
          dot.style.cssText = `flex-shrink:0;width:7px;height:7px;border-radius:50%;background:${safeColor(el.visual.color, '#f5f5f4')};border:1px solid ${safeColor(el.visual.borderColor, '#a8a29e')};`;
          const text = document.createElement('span');
          text.style.cssText = 'overflow:hidden;text-overflow:ellipsis;';
          if (anonymousMode) {
            text.innerHTML = '<span style="display:inline-block;background:var(--color-text-primary,#3d3833);border-radius:2px;width:2.5em;height:0.8em;"></span>';
          } else {
            text.textContent = el.label || t('map.unnamed');
            chip.title = el.label || '';
          }
          chip.append(dot, text);
          chip.addEventListener('click', (e) => { e.stopPropagation(); selectElement(el.id); });
        } else {
          chip.style.border = '1px dashed var(--color-text-tertiary, #a8a29e)';
          chip.style.color = 'var(--color-text-secondary, #6b6560)';
          chip.textContent = `+${rest.length}`;
          chip.title = t('map.offMapSelectRest', { count: rest.length });
          chip.addEventListener('click', (e) => {
            e.stopPropagation();
            useSelectionStore.getState().selectElements(rest.map((n) => n.id));
          });
        }
        root.appendChild(chip);
      }

      const center = getGeoCenter(anchor.geo);
      const offset = markerOffsetsRef.current.get(anchorId) ?? [0, 0];
      overlays.set(anchorId, new maplibregl.Marker({ element: root, anchor: 'center', offset })
        .setLngLat([center.lng, center.lat])
        .addTo(map));
    }
  }, [offMapExpanded, offMapNeighbors, geoElementById, clusteringVersion, selectedElementIds, anonymousMode, showDensity, selectElement, t]);

  // Fold an element whose neighbours are no longer listed (filtered, removed...)
  useEffect(() => {
    setOffMapExpanded((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (offMapNeighbors.has(id)) next.add(id); else changed = true;
      }
      return changed ? next : prev;
    });
  }, [offMapNeighbors]);

  const getVisibleLngLat = useCallback((elementId: string): [number, number] | null => {
    const firstKey = elementIdToFirstMarkerKeyRef.current.get(elementId) ?? elementId;
    const state = clusterStateRef.current.get(firstKey);
    if (state?.clustered && state.clusterCenter) return state.clusterCenter;
    const el = geoElementById.get(elementId);
    if (!el) return null;
    const center = getGeoCenter(el.geo);
    return [center.lng, center.lat];
  }, [geoElementById]);

  // Check if two elements are in the same cluster (via their representative marker)
  const areInSameCluster = useCallback((id1: string, id2: string): boolean => {
    const k1 = elementIdToFirstMarkerKeyRef.current.get(id1) ?? id1;
    const k2 = elementIdToFirstMarkerKeyRef.current.get(id2) ?? id2;
    const s1 = clusterStateRef.current.get(k1);
    const s2 = clusterStateRef.current.get(k2);
    if (!s1 || !s2) return false;
    return s1.clustered && s2.clustered && s1.clusterId === s2.clusterId;
  }, []);

  // Calculate angle between two points (degrees)
  const calculateAngle = useCallback((from: [number, number], to: [number, number]): number => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    return Math.atan2(dy, dx) * (180 / Math.PI);
  }, []);

  // Get position along line (0 = start, 1 = end)
  const getPointOnLine = useCallback((from: [number, number], to: [number, number], ratio: number): [number, number] => {
    return [
      from[0] + (to[0] - from[0]) * ratio,
      from[1] + (to[1] - from[1]) * ratio,
    ];
  }, []);

  useEffect(() => { selectLinkRef.current = selectLink; }, [selectLink]);

  // Update links: one feature per link in the line source, one per arrow in
  // the arrow source; labels are DOM overlays kept in step by id
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return;

    const map = mapRef.current;
    try {
      ensureLinkLayers(map);
    } catch (err) {
      console.warn('Failed to add link layers', err);
      return;
    }

    // Build element geo lookup for polygon edge snapping
    const elementGeoMap = new Map<string, GeoData>();
    effectiveGeoElements.forEach(el => { if (el.geo) elementGeoMap.set(el.id, el.geo); });

    const lineFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    const arrowFeatures: GeoJSON.Feature<GeoJSON.Point>[] = [];
    const labels = new Map<string, { text: string; at: [number, number] }>();

    geoLinks.forEach((link) => {
      let fromLngLat = getVisibleLngLat(link.fromId);
      let toLngLat = getVisibleLngLat(link.toId);
      if (!fromLngLat || !toLngLat) return;
      // Both ends in the same cluster: nothing to draw
      if (areInSameCluster(link.fromId, link.toId)) return;

      // Snap link endpoints to polygon edge, unless the other point is inside the zone
      const fromGeo = elementGeoMap.get(link.fromId);
      const toGeo = elementGeoMap.get(link.toId);
      if (fromGeo && isGeoPolygon(fromGeo)) {
        if (!pointInPolygon(fromGeo.coordinates, toLngLat)) {
          fromLngLat = closestPointOnPolygon(fromGeo.coordinates, toLngLat);
        }
      }
      if (toGeo && isGeoPolygon(toGeo)) {
        if (!pointInPolygon(toGeo.coordinates, fromLngLat)) {
          toLngLat = closestPointOnPolygon(toGeo.coordinates, fromLngLat);
        }
      }

      const endpointDimmed = effectiveDimmedIds.has(link.fromId) || effectiveDimmedIds.has(link.toId);
      const isLinkDimmed = endpointDimmed && !(queryFilterActive && queryMatchLinkIds.has(link.id));
      // Density shown: links are thin, discreet lines without arrows or labels,
      // which would cover the density
      const opacity = (isLinkDimmed ? 0.3 : 1) * (showDensity ? 0.6 : 1);

      const color = safeColor(link.visual.color, '#6b6560');
      const width = showDensity ? 1 : Math.max(2, (link.visual.thickness || 2));
      const style = link.visual.style === 'dashed' || link.visual.style === 'dotted' ? link.visual.style : 'solid';
      const direction = link.direction || (link.directed ? 'forward' : 'none');
      const angle = calculateAngle(fromLngLat, toLngLat);

      lineFeatures.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [fromLngLat, toLngLat] },
        properties: { linkId: link.id, color, width, opacity, style, halo: showDensity ? 0 : 1 },
      });
      if (showDensity) return;

      const arrow = (ratio: number, rotate: number) => {
        arrowFeatures.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: getPointOnLine(fromLngLat!, toLngLat!, ratio) },
          properties: { icon: ensureArrowImage(map, safeColor(color, '#a8a29e')), rotate, opacity },
        });
      };
      // Same screen rotation as the former DOM arrows
      if (direction === 'forward' || direction === 'both') arrow(0.92, -angle + 90);
      if (direction === 'backward' || direction === 'both') arrow(0.08, -angle - 90);

      if (link.label) {
        labels.set(link.id, {
          text: anonymousMode ? '\u2588\u2588\u2588' : link.label,
          at: getPointOnLine(fromLngLat, toLngLat, 0.5),
        });
      }
    });

    (map.getSource(LINK_LINES_SOURCE) as maplibregl.GeoJSONSource | undefined)
      ?.setData({ type: 'FeatureCollection', features: lineFeatures });
    (map.getSource(LINK_ARROWS_SOURCE) as maplibregl.GeoJSONSource | undefined)
      ?.setData({ type: 'FeatureCollection', features: arrowFeatures });

    const labelMarkers = linkLabelMarkersRef.current;
    labelMarkers.forEach((marker, id) => {
      if (!labels.has(id)) {
        marker.remove();
        labelMarkers.delete(id);
      }
    });
    labels.forEach(({ text, at }, id) => {
      const existing = labelMarkers.get(id);
      if (existing) {
        existing.setLngLat(at);
        existing.getElement().textContent = text;
        return;
      }
      const labelEl = document.createElement('div');
      labelEl.className = 'link-label-overlay';
      labelEl.textContent = text;
      labelMarkers.set(id, new maplibregl.Marker({ element: labelEl, anchor: 'center' }).setLngLat(at).addTo(map));
    });
  }, [geoLinks, clusteringVersion, getVisibleLngLat, areInSameCluster, calculateAngle, getPointOnLine, anonymousMode, effectiveDimmedIds, effectiveGeoElements, queryFilterActive, queryMatchLinkIds, showDensity]);

  // Density overlay: rebuilt after a style change (clusteringVersion)
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return;
    const map = mapRef.current;
    if (!showDensity && !map.getLayer(DENSITY_LAYER)) return;
    try {
      ensureDensityLayer(map);
    } catch (err) {
      console.warn('Failed to add density layer', err);
      return;
    }
    (map.getSource(DENSITY_SOURCE) as maplibregl.GeoJSONSource | undefined)
      ?.setData({ type: 'FeatureCollection', features: densityPoints });
    // Lighter points as they get numerous, so that thousands of them do not
    // turn whole regions into the top colour (a lone point keeps full weight)
    map.setPaintProperty(DENSITY_LAYER, 'heatmap-weight',
      ['*', ['coalesce', ['get', 'w'], 1], densityPointWeight(densityPoints.length) * densityIntensity]);
    map.setLayoutProperty(DENSITY_LAYER, 'visibility', showDensity ? 'visible' : 'none');
  }, [densityPoints, showDensity, densityIntensity, clusteringVersion]);

  // Fit map to markers
  const handleFit = useCallback(() => {
    if (!mapRef.current || geoElements.length === 0) return;
    const coords = geoElements.map(el => [getGeoCenter(el.geo).lng, getGeoCenter(el.geo).lat] as [number, number]);
    const bounds = coords.reduce(
      (b, c) => b.extend(c),
      new maplibregl.LngLatBounds(coords[0], coords[0])
    );
    mapRef.current.fitBounds(bounds, { padding: 50 });
  }, [geoElements]);

  // Zoom to selected element
  const handleZoomToSelected = useCallback(() => {
    if (!mapRef.current || selectedElementIds.size === 0) return;
    const selectedGeoElements = geoElements.filter((el) => selectedElementIds.has(el.id));
    if (selectedGeoElements.length === 0) return;
    if (selectedGeoElements.length === 1) {
      const c = getGeoCenter(selectedGeoElements[0].geo);
      mapRef.current.flyTo({ center: [c.lng, c.lat], zoom: 14 });
    } else {
      const coords = selectedGeoElements.map(el => [getGeoCenter(el.geo).lng, getGeoCenter(el.geo).lat] as [number, number]);
      const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
      mapRef.current.fitBounds(bounds, { padding: 50 });
    }
  }, [geoElements, selectedElementIds]);

  // Watch for pending zone draw/edit requests (from EventsEditor)
  const pendingZoneDrawCallbackRef = useRef<((geo: GeoData) => void) | null>(null);
  const [eventEditZoneGeo, setEventEditZoneGeo] = useState<GeoPolygon | null>(null);
  const pendingZoneRequestId = useUIStore((s) => s.pendingZoneRequestId);
  useEffect(() => {
    const { pendingZoneDrawCallback, pendingZoneEditGeo } = useUIStore.getState();
    if (!pendingZoneDrawCallback) return;
    pendingZoneDrawCallbackRef.current = pendingZoneDrawCallback;
    if (pendingZoneEditGeo) {
      setEventEditZoneGeo(pendingZoneEditGeo);
    } else {
      setIsDrawingZone(true);
    }
  }, [pendingZoneRequestId]);

  // Zone drawing: handle polygon completion
  const handleZoneDrawFinish = useCallback(async (geo: GeoPolygon, areaKm2: number) => {
    setIsDrawingZone(false);

    // If this was triggered by an event draw request, call the callback instead of creating element
    const pendingCb = pendingZoneDrawCallbackRef.current;
    if (pendingCb) {
      pendingZoneDrawCallbackRef.current = null;
      useUIStore.getState().clearZoneDraw();
      pendingCb(geo);
      return;
    }

    try {
      // Place the zone at the center of the current canvas viewport
      const { viewport } = useViewStore.getState();
      const canvasX = (-viewport.x + 600) / viewport.zoom;
      const canvasY = (-viewport.y + 400) / viewport.zoom;

      const newEl = await createElement(t('map.newZone'), { x: canvasX, y: canvasY }, {
        tags: ['Zone'],
        geo,
        visual: {
          color: '#10b981',
          borderColor: '#059669',
          shape: 'hexagon',
          size: 'medium',
          icon: 'MapPin',
          image: null,
        },
        properties: [
          { key: 'Surface', value: `${areaKm2} km²`, type: 'text' },
          ...(geo.radius ? [{ key: 'Rayon', value: geo.radius < 1 ? `${(geo.radius * 1000).toFixed(0)} m` : `${geo.radius.toFixed(3)} km`, type: 'text' as const }] : []),
        ],
      });
      selectElement(newEl.id);
    } catch (e) {
      console.warn('Failed to create zone element:', e);
    }
  }, [createElement, selectElement, t]);

  const handleZoneDrawCancel = useCallback(() => {
    setIsDrawingZone(false);
    pendingZoneDrawCallbackRef.current = null;
    useUIStore.getState().clearZoneDraw();
  }, []);

  // Zone click: select the zone element
  const handleZoneClick = useCallback((elementId: string) => {
    selectElement(elementId as any);
  }, [selectElement]);

  // Zone double-click: enter polygon edit mode (not for event-based zones)
  const handleZoneDoubleClick = useCallback((elementId: string) => {
    if (eventZoneIds.has(elementId)) return;
    setEditingZoneId(elementId);
  }, [eventZoneIds]);

  // Zone edit: save new coordinates
  const handleZoneEditSave = useCallback((newCoords: [number, number][]) => {
    if (!editingZoneId) return;
    const el = elements.find(e => e.id === editingZoneId);
    if (!el || !el.geo || !isGeoPolygon(el.geo)) { setEditingZoneId(null); return; }

    const oldGeo = el.geo;
    const newCenter = computePolygonCenter(newCoords);
    // For circles, compute radius from center to first vertex
    let newRadius: number | undefined;
    if (oldGeo.shapeOrigin === 'circle' && newCoords.length > 0) {
      const dLat = (newCoords[0][1] - newCenter.lat) * 111.32;
      const dLng = (newCoords[0][0] - newCenter.lng) * 111.32 * Math.cos((newCenter.lat * Math.PI) / 180);
      newRadius = Math.round(Math.sqrt(dLat * dLat + dLng * dLng) * 1000) / 1000;
    }
    const newGeo: GeoPolygon = {
      type: 'polygon',
      coordinates: newCoords,
      center: newCenter,
      ...(oldGeo.shapeOrigin ? { shapeOrigin: oldGeo.shapeOrigin } : {}),
      ...(oldGeo.altitude !== undefined ? { altitude: oldGeo.altitude } : {}),
      ...(oldGeo.extrude !== undefined ? { extrude: oldGeo.extrude } : {}),
      ...(newRadius !== undefined ? { radius: newRadius } : {}),
    };
    const areaKm2 = computePolygonAreaKm2(newCoords);

    const radiusLabel = newRadius
      ? (newRadius < 1 ? `${(newRadius * 1000).toFixed(0)} m` : `${newRadius.toFixed(3)} km`)
      : null;
    const newProps = el.properties?.map(p => {
      if (p.key === 'Surface') return { ...p, value: `${areaKm2} km²` };
      if (p.key === 'Rayon' && radiusLabel) return { ...p, value: radiusLabel };
      return p;
    });
    pushAction({
      type: 'update-element',
      undo: { elementId: editingZoneId, changes: { geo: oldGeo, properties: el.properties } },
      redo: { elementId: editingZoneId, changes: { geo: newGeo, properties: newProps } },
    });
    updateElement(editingZoneId as any, { geo: newGeo, properties: newProps });
    // Clear any stale dragged position so effectiveGeoElements uses the fresh store data
    setDraggedPositions(prev => {
      if (!prev.has(editingZoneId)) return prev;
      const next = new Map(prev);
      next.delete(editingZoneId);
      return next;
    });
    setEditingZoneId(null);
  }, [editingZoneId, elements, updateElement, pushAction]);

  // Zone edit: cancel (restore original)
  const handleZoneEditCancel = useCallback(() => {
    setEditingZoneId(null);
  }, []);

  // Event zone edit: save
  const handleEventZoneEditSave = useCallback((newCoords: [number, number][]) => {
    const pendingCb = pendingZoneDrawCallbackRef.current;
    if (pendingCb) {
      const newGeo: GeoPolygon = {
        type: 'polygon',
        coordinates: newCoords,
        center: computePolygonCenter(newCoords),
        altitude: eventEditZoneGeo?.altitude,
        extrude: eventEditZoneGeo?.extrude,
      };
      pendingZoneDrawCallbackRef.current = null;
      useUIStore.getState().clearZoneDraw();
      pendingCb(newGeo);
    }
    setEventEditZoneGeo(null);
  }, [eventEditZoneGeo]);

  // Event zone edit: cancel
  const handleEventZoneEditCancel = useCallback(() => {
    pendingZoneDrawCallbackRef.current = null;
    useUIStore.getState().clearZoneDraw();
    setEventEditZoneGeo(null);
  }, []);

  // Check if there are polygon zones (to show map even without point elements)
  const hasZonePolygons = useMemo(() => {
    return elements.some(el => el.geo && isGeoPolygon(el.geo));
  }, [elements]);

  // Delete selected elements from map (Delete / Backspace) with undo support
  const handleDeleteSelected = useCallback(async () => {
    if (selectedElementIds.size === 0) return;
    const ids = Array.from(selectedElementIds) as string[];
    const elsToDelete = elements.filter(e => ids.includes(e.id));
    const relevantLinks = links.filter(l => ids.includes(l.fromId) || ids.includes(l.toId));

    // Capture tab membership for undo
    const { getTabsForElement } = useTabStore.getState();
    const tabMembership: Record<string, string[]> = {};
    let hasTabMembership = false;
    for (const elId of ids) {
      for (const tab of getTabsForElement(elId)) {
        if (!tabMembership[tab.id]) tabMembership[tab.id] = [];
        tabMembership[tab.id].push(elId);
        hasTabMembership = true;
      }
    }

    pushAction({
      type: 'delete-elements',
      undo: { elements: elsToDelete, links: relevantLinks, tabMembership: hasTabMembership ? tabMembership : undefined },
      redo: { elementIds: ids, linkIds: relevantLinks.map(l => l.id) },
    });
    await deleteElements(ids);
    clearSelection();
  }, [selectedElementIds, elements, links, clearSelection, deleteElements, pushAction]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isDrawingZone || editingZoneId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't trigger if user is typing in an input
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (selectedElementIds.size > 0) {
          e.preventDefault();
          handleDeleteSelected();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isDrawingZone, editingZoneId, selectedElementIds, handleDeleteSelected]);

  // Register capture handler for report screenshots
  useEffect(() => {
    const captureHandler = async (): Promise<string | null> => {
      if (!mapRef.current) return null;

      // Fit bounds
      if (geoElements.length > 0) {
        const coords = geoElements.map(el => [getGeoCenter(el.geo).lng, getGeoCenter(el.geo).lat] as [number, number]);
        const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
        mapRef.current.fitBounds(bounds, { padding: 50, animate: false });
        mapRef.current.resize();
        await new Promise(resolve => setTimeout(resolve, 200));
        mapRef.current.resize();
      }

      // Wait for tiles
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Capture: combine WebGL canvas + HTML overlays
      const container = document.querySelector('[data-report-capture="map"]') as HTMLElement;
      if (!container) return null;

      try {
        // Chargement a la demande : la capture PNG n'est pas sur le chemin nominal.
        const { toPng } = await import('html-to-image');
        return await toPng(container, {
          backgroundColor: '#e5e3df',
          pixelRatio: 2,
          skipFonts: true,
        });
      } catch {
        // Fallback: just the WebGL canvas
        try {
          return mapRef.current.getCanvas().toDataURL('image/png');
        } catch {
          return null;
        }
      }
    };

    registerCaptureHandler('map', captureHandler);
    return () => unregisterCaptureHandler('map');
  }, [geoElements, registerCaptureHandler, unregisterCaptureHandler]);

  const handleToggleTemporal = () => {
    if (!temporalMode && eventDates.length > 0) {
      setTemporalMode(true);
      setSelectedDate(eventDates[closestDateIndex(eventDates, Date.now())]);
    } else {
      setTemporalMode(false);
      setSelectedDate(null);
      setPeriodEnd(null);
      setIsPlaying(false);
    }
  };

  // Play animation — fixed interval only when follow camera is OFF
  // When follow camera is ON, advancement is chained via moveend below
  // This interval handles the non-follow-camera case + kick-starts the chain
  const selectionRef = useRef({ selectedDate, periodEnd });
  useEffect(() => { selectionRef.current = { selectedDate, periodEnd }; }, [selectedDate, periodEnd]);
  const advanceDate = useCallback(() => {
    const { selectedDate: start, periodEnd: end } = selectionRef.current;
    if (!start) { setSelectedDate(eventDates[0]); return; }
    // Instant: next date; period: slide the window one step, keeping its width
    const next = shiftNavigator(eventDates, start, end, 1);
    if (!next) { setIsPlaying(false); return; }
    setSelectedDate(next.start);
    setPeriodEnd(next.periodEnd);
  }, [eventDates]);

  useEffect(() => {
    if (!isPlaying || eventDates.length === 0) return;
    if (temporalFollowCamera) {
      // Kick-start the moveend chain by advancing once
      const kickstart = setTimeout(advanceDate, 200);
      return () => clearTimeout(kickstart);
    }
    const interval = setInterval(advanceDate, 800);
    return () => clearInterval(interval);
  }, [isPlaying, eventDates, temporalFollowCamera, advanceDate]);

  // Temporal follow camera: animate to events, then chain to next date on moveend
  useEffect(() => {
    if (!temporalMode || !selectedDate || !temporalFollowCamera || !mapRef.current) return;
    if (resolvedGeoElements.length === 0) return;

    const map = mapRef.current;
    // Period mode: follow the leading edge of the window
    const targetMinute = toMinuteStart(periodEnd ?? selectedDate).getTime();
    let cancelled = false;
    let advanceTimeout: ReturnType<typeof setTimeout>;

    // Find elements that have an event specifically at this minute
    const activeCoords: [number, number][] = [];
    for (const r of resolvedGeoElements) {
      const el = r.element;
      const hasEventNow = (el.events || []).some(e => e.date && toMinuteStart(e.date).getTime() === targetMinute);
      const startsNow = (el.dateRange?.start && toMinuteStart(el.dateRange.start).getTime() === targetMinute)
        || (propertyIntervals.get(el.id) ?? []).some((i) => i.from === targetMinute);
      if (hasEventNow || startsNow) {
        activeCoords.push([r.geo.lng, r.geo.lat]);
      }
    }

    // No events at this date — advance quickly if playing
    if (activeCoords.length === 0) {
      if (isPlayingRef.current) {
        advanceTimeout = setTimeout(() => { if (!cancelled) advanceDate(); }, 400);
      }
      return () => { cancelled = true; clearTimeout(advanceTimeout); };
    }

    // Check if all active coords are co-located (same spot, e.g. family house)
    const allSameSpot = activeCoords.every(
      c => Math.abs(c[0] - activeCoords[0][0]) < 0.001 && Math.abs(c[1] - activeCoords[0][1]) < 0.001
    );
    const targetCenter = allSameSpot
      ? activeCoords[0]
      : undefined;
    // Count ALL geo elements near the target to detect if it will be a cluster
    const nearbyTotal = targetCenter
      ? resolvedGeoElements.filter(r =>
          Math.abs(r.geo.lng - targetCenter[0]) < 0.001 && Math.abs(r.geo.lat - targetCenter[1]) < 0.001
        ).length
      : 0;
    // Zoom 22 to guarantee Math.floor > Supercluster maxZoom (20), 16 for isolated point
    const targetZoom = targetCenter && nearbyTotal > 1 ? 22 : 16;

    // Check if camera is already at target — moveend won't fire, advance directly
    if (targetCenter) {
      const cur = map.getCenter();
      const alreadyThere = Math.abs(cur.lng - targetCenter[0]) < 0.0005
        && Math.abs(cur.lat - targetCenter[1]) < 0.0005
        && Math.abs(map.getZoom() - targetZoom) < 0.5;
      if (alreadyThere) {
        if (isPlayingRef.current) {
          advanceTimeout = setTimeout(() => { if (!cancelled) advanceDate(); }, 1200);
        }
        return () => { cancelled = true; clearTimeout(advanceTimeout); };
      }
    }

    // After camera animation ends, pause for tiles to load, then advance
    // Use timestamp to ignore spurious moveend from interrupted previous animation
    const animStart = Date.now();
    const onMoveEnd = () => {
      if (cancelled) return;
      if (Date.now() - animStart < 400) return;
      map.off('moveend', onMoveEnd);
      if (isPlayingRef.current) {
        advanceTimeout = setTimeout(() => { if (!cancelled) advanceDate(); }, 800);
      }
    };

    map.on('moveend', onMoveEnd);

    // Animate: flyTo with natural arc — no maxDuration so long distances get full dezoom
    if (targetCenter) {
      map.flyTo({
        center: targetCenter,
        zoom: targetZoom,
        speed: 0.6,
        curve: 1.42,
        essential: true,
      });
    } else {
      const bounds = activeCoords.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(activeCoords[0], activeCoords[0])
      );
      map.fitBounds(bounds, { padding: 80, maxZoom: 17, duration: 3000 });
    }

    // Safety: if moveend doesn't fire within 15s, advance anyway
    const safetyTimeout = setTimeout(() => {
      if (cancelled) return;
      map.off('moveend', onMoveEnd);
      if (isPlayingRef.current) {
        advanceTimeout = setTimeout(() => { if (!cancelled) advanceDate(); }, 800);
      }
    }, 15000);

    return () => {
      cancelled = true;
      map.off('moveend', onMoveEnd);
      clearTimeout(advanceTimeout);
      clearTimeout(safetyTimeout);
    };
  }, [temporalMode, selectedDate, periodEnd, resolvedGeoElements, temporalFollowCamera, advanceDate, propertyIntervals]);

  // ── Listen for flyToPolygon events from detail panel ──────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const coords = (e as CustomEvent).detail?.coordinates as [number, number][] | undefined;
      if (!coords || coords.length < 2 || !mapRef.current) return;
      // Small delay to let mode switch render the map
      setTimeout(() => {
        const map = mapRef.current;
        if (!map) return;
        let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
        for (const [lng, lat] of coords) {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
        map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 60, maxZoom: 16 });
      }, 100);
    };
    window.addEventListener('map:flyToPolygon', handler);
    return () => window.removeEventListener('map:flyToPolygon', handler);
  }, []);

  // ── Listen for flyToElement events (from search modal) ──────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const elementId = (e as CustomEvent).detail?.elementId as string | undefined;
      if (!elementId || !mapRef.current) return;
      const target = geoElements.find(el => el.id === elementId);
      if (!target) return;
      const c = getGeoCenter(target.geo);
      mapRef.current.flyTo({ center: [c.lng, c.lat], zoom: 14 });
    };
    window.addEventListener('map:flyToElement', handler);
    return () => window.removeEventListener('map:flyToElement', handler);
  }, [geoElements]);

  // ── Listen for fitElements events (query results, several elements) ──
  useEffect(() => {
    const handler = (e: Event) => {
      const ids = new Set(((e as CustomEvent).detail?.elementIds as string[] | undefined) ?? []);
      if (!mapRef.current || ids.size === 0) return;
      const coords = geoElements.filter(el => ids.has(el.id))
        .map(el => { const c = getGeoCenter(el.geo); return [c.lng, c.lat] as [number, number]; });
      if (coords.length === 0) return;
      if (coords.length === 1) { mapRef.current.flyTo({ center: coords[0], zoom: 14 }); return; }
      const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
      mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 15 });
    };
    window.addEventListener('map:fitElements', handler);
    return () => window.removeEventListener('map:fitElements', handler);
  }, [geoElements]);

  // ── Auto-zoom to selected elements on mount ──────────────
  const didAutoZoomRef = useRef(false);
  useEffect(() => {
    if (didAutoZoomRef.current) return;
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current || geoElements.length === 0) return;
    const selIds = useSelectionStore.getState().selectedElementIds;
    if (selIds.size === 0) return;
    const selectedGeo = geoElements.filter((el) => selIds.has(el.id));
    if (selectedGeo.length === 0) return;
    didAutoZoomRef.current = true;
    // Small delay so markers are placed first
    setTimeout(() => {
      if (!mapRef.current) return;
      if (selectedGeo.length === 1) {
        const c = getGeoCenter(selectedGeo[0].geo);
        mapRef.current.flyTo({ center: [c.lng, c.lat], zoom: 14 });
      } else {
        const coords = selectedGeo.map(el => [getGeoCenter(el.geo).lng, getGeoCenter(el.geo).lat] as [number, number]);
        const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
        mapRef.current.fitBounds(bounds, { padding: 50 });
      }
    }, 300);
  }, [geoElements, clusteringVersion]);

  const showEmptyState = geoElements.length === 0 && !temporalMode && !hasZonePolygons;

  const handlePlaceSearch = async () => {
    if (!placeQuery.trim() || !mapRef.current) return;
    setPlaceSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(placeQuery)}&limit=1`,
        { headers: { 'Accept-Language': i18n.language } }
      );
      const data = await res.json();
      if (data.length > 0) {
        const { lon, lat, boundingbox } = data[0];
        const map = mapRef.current!;
        // Remove previous search marker
        placeSearchMarkerRef.current?.remove();
        // Add a temporary marker
        const el = document.createElement('div');
        el.className = 'place-search-marker';
        el.style.cssText = 'width:12px;height:12px;border-radius:50%;background:var(--color-accent, #e07a5f);border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);';
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([parseFloat(lon), parseFloat(lat)])
          .addTo(map);
        placeSearchMarkerRef.current = marker;
        // Fly to bounding box or point
        if (boundingbox) {
          const [s, n, w, e] = boundingbox.map(Number);
          map.fitBounds([[w, s], [e, n]], { padding: 60, maxZoom: 16 });
        } else {
          map.flyTo({ center: [parseFloat(lon), parseFloat(lat)], zoom: 14 });
        }
        // Auto-remove marker after 8s
        setTimeout(() => { marker.remove(); if (placeSearchMarkerRef.current === marker) placeSearchMarkerRef.current = null; }, 8000);
      }
    } catch { /* ignore */ }
    setPlaceSearching(false);
  };

  return (
    <div className="h-full flex flex-col bg-bg-secondary relative">
      {/* Toolbar */}
      <ViewToolbar
        leftContent={
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-secondary">
              {showDensity
                ? t('map.densityPoints', { count: densityPoints.length })
                : locatedCounts.kept < locatedCounts.total
                  ? t('map.elementsLocatedFiltered', { kept: locatedCounts.kept, count: locatedCounts.total })
                  : t('map.elementsLocated', { count: locatedCounts.total })}
              {geoLinks.length > 0 && (
                <span className="ml-2 text-text-tertiary">{t('map.linksCount', { count: geoLinks.length })}</span>
              )}
            </span>
          </div>
        }
        rightContent={
          <>
            {/* Place search */}
            <form
              className="flex items-center mr-2"
              onSubmit={(e) => { e.preventDefault(); handlePlaceSearch(); }}
            >
              <input
                type="text"
                value={placeQuery}
                onChange={(e) => setPlaceQuery(e.target.value)}
                placeholder={t('map.searchPlace')}
                title={t('map.searchPlaceExternal')}
                className="h-6 w-36 px-2 text-[10px] border border-border-default rounded-l bg-bg-primary text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={placeSearching || !placeQuery.trim()}
                className="h-6 px-1.5 border border-l-0 border-border-default rounded-r text-text-secondary hover:bg-bg-tertiary disabled:opacity-40"
              >
                <Search size={11} />
              </button>
            </form>

            {/* Base layer switcher. OpenFreeMap carries a variant dropdown. */}
            <div className="relative mr-2">
              <div className="flex items-center border border-border-default rounded overflow-hidden">
                {BASE_LAYERS.map(layer => (
                  <Fragment key={layer.id}>
                    <button
                      onClick={() => setActiveBaseLayer(layer.id)}
                      className={`px-2 h-6 text-[10px] ${activeBaseLayer === layer.id ? 'bg-accent text-white' : 'text-text-secondary hover:bg-bg-tertiary'}`}
                    >
                      {layer.label}
                    </button>
                    {layer.id === 'ofm' && (
                      <button
                        onClick={() => setShowOfmMenu(v => !v)}
                        title={t('map.ofmVariant', 'Variante de rendu')}
                        className={`h-6 px-1 border-r border-border-default ${activeBaseLayer === 'ofm' ? 'bg-accent text-white' : 'text-text-secondary hover:bg-bg-tertiary'}`}
                      >
                        <ChevronDown size={10} />
                      </button>
                    )}
                  </Fragment>
                ))}
              </div>
              {showOfmMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowOfmMenu(false)} />
                  <div className="absolute top-7 left-0 bg-bg-primary border border-border-default rounded shadow-md z-50 min-w-[130px]">
                    {OFM_VARIANTS.map(({ id, labelKey, fallback }) => (
                      <button
                        key={id}
                        onClick={() => { setOfmVariant(id); setShowOfmMenu(false); }}
                        className={`w-full px-3 py-1.5 text-xs text-left hover:bg-bg-tertiary ${ofmVariant === id ? 'font-medium text-text-primary' : 'text-text-secondary'}`}
                      >
                        {t(labelKey, fallback)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* 3D toggle */}
            <button
              onClick={() => setIs3D(v => !v)}
              className={`px-2 h-6 text-[10px] flex items-center gap-1 border border-border-default rounded mr-2 ${is3D ? 'bg-accent text-white' : 'text-text-secondary hover:bg-bg-tertiary'}`}
              title={t('map.toggle3D')}
            >
              {is3D ? <Globe size={11} /> : <MapIcon size={11} />}
              3D
            </button>

            {/* 3D buildings toggle */}
            <button
              onClick={() => setShow3DBuildings(v => !v)}
              className={`px-2 h-6 text-[10px] flex items-center gap-1 border border-border-default rounded mr-2 ${show3DBuildings ? 'bg-accent text-white' : 'text-text-secondary hover:bg-bg-tertiary'}`}
              title={t('map.toggle3DBuildings')}
            >
              <Building size={11} />
              {t('map.buildings')}
            </button>

            {/* Draw zone button with shape dropdown */}
            <div className="relative mr-2">
              <div className="flex items-center">
                <button
                  onClick={() => setIsDrawingZone(v => !v)}
                  className={`px-2 h-6 text-[10px] flex items-center gap-1 border border-border-default rounded-l ${isDrawingZone ? 'bg-accent text-white' : 'text-text-secondary hover:bg-bg-tertiary'}`}
                  title={isDrawingZone ? t('map.cancelDraw') : t('map.drawZone')}
                >
                  {zoneShape === 'circle' ? <Circle size={11} /> : zoneShape === 'square' ? <Square size={11} /> : <Pentagon size={11} />}
                  {t('map.zone')}
                </button>
                <button
                  onClick={() => setShowZoneShapeMenu(v => !v)}
                  className={`h-6 px-1 border border-l-0 border-border-default rounded-r ${isDrawingZone ? 'bg-accent text-white' : 'text-text-secondary hover:bg-bg-tertiary'}`}
                >
                  <ChevronDown size={10} />
                </button>
              </div>
              {showZoneShapeMenu && (
                <>
                <div className="fixed inset-0 z-40" onClick={() => setShowZoneShapeMenu(false)} />
                <div className="absolute top-7 left-0 bg-bg-primary border border-border-default rounded shadow-md z-50 min-w-[120px]">
                  {([
                    { shape: 'polygon' as const, icon: Pentagon, label: t('map.zonePolygon', 'Polygone') },
                    { shape: 'circle' as const, icon: Circle, label: t('map.zoneCircle', 'Cercle') },
                    { shape: 'square' as const, icon: Square, label: t('map.zoneSquare', 'Carré') },
                  ]).map(({ shape, icon: Icon, label }) => (
                    <button
                      key={shape}
                      onClick={() => {
                        setZoneShape(shape);
                        setShowZoneShapeMenu(false);
                        if (!isDrawingZone) setIsDrawingZone(true);
                      }}
                      className={`w-full px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-bg-tertiary ${zoneShape === shape ? 'font-medium text-text-primary' : 'text-text-secondary'}`}
                    >
                      <Icon size={12} />
                      {label}
                    </button>
                  ))}
                </div>
                </>
              )}
            </div>

            {/* Density overlay, fed by the elements shown or by their events */}
            <div className="flex items-center mr-2">
              <button
                onClick={() => useUIStore.setState((s) => ({ mapHeatmap: !s.mapHeatmap }))}
                className={`px-2 h-6 text-[10px] flex items-center gap-1 border border-border-default ${showDensity ? 'rounded-l bg-accent text-white' : 'rounded text-text-secondary hover:bg-bg-tertiary'}`}
                title={t('map.densityHint', 'Densité au lieu des marqueurs')}
              >
                <Flame size={11} />
                {t('map.density', 'Densité')}
              </button>
              {showDensity && (['elements', 'events'] as const).map((src, i) => (
                <button
                  key={src}
                  onClick={() => useUIStore.setState({ mapHeatmapSource: src })}
                  title={src === 'elements'
                    ? t('map.densityElementsHint', 'Un point par élément affiché')
                    : t('map.densityEventsHint', 'Un point par événement localisé : un élément très actif pèse plus')}
                  className={`px-2 h-6 text-[10px] border border-l-0 border-border-default ${i === 1 ? 'rounded-r' : ''} ${densitySource === src ? 'bg-bg-tertiary text-text-primary font-medium' : 'text-text-secondary hover:bg-bg-tertiary'}`}
                >
                  {src === 'elements' ? t('map.densityElements', 'Éléments') : t('map.densityEvents', 'Événements')}
                </button>
              ))}
            </div>

            {/* Temporal mode toggle */}
            {timeRange && (
              <TemporalToggleButton active={temporalMode} onClick={handleToggleTemporal} />
            )}
            {selectedElementIds.size > 0 && (
              <>
                <button
                  onClick={handleZoomToSelected}
                  className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
                  title={t('map.zoomToSelection')}
                >
                  {t('map.selection')}
                </button>
                <button
                  onClick={handleDeleteSelected}
                  className="p-1 text-text-tertiary hover:text-error hover:bg-bg-tertiary rounded"
                  title={t('map.deleteSelection')}
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
            <button
              onClick={handleFit}
              className="p-1 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
              title={t('map.fitAll')}
            >
              <Maximize2 size={14} />
            </button>
            <div className="w-px h-4 bg-border-default mx-1" />
            <button
              onClick={() => {
                const name = currentDossier?.name || 'map';
                const date = toLocalDateKey(new Date());
                exportMapToCSV(geoElements, `${name}_carte_${date}.csv`);
              }}
              disabled={geoElements.length === 0}
              className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded disabled:opacity-50 disabled:cursor-not-allowed"
              title={t('map.exportCSV')}
            >
              <Upload size={16} />
            </button>
          </>
        }
      />

      {/* Temporal slider */}
      {temporalMode && timeRange && (
        <TemporalNavigatorBar
          dates={eventDates}
          selectedDate={selectedDate}
          periodEnd={periodEnd}
          onChange={(start, end) => { setSelectedDate(start); setPeriodEnd(end); }}
          isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying(!isPlaying)}
          extraControls={
            <>
              <button
                onClick={() => setTemporalFollowCamera(!temporalFollowCamera)}
                className={`p-1 rounded ${temporalFollowCamera ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'}`}
                title={t('map.followCamera')}
              >
                <Crosshair size={14} />
              </button>
              <button
                onClick={() => setTemporalTrace(!temporalTrace)}
                className={`p-1 rounded ${temporalTrace ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'}`}
                title={t('map.temporalTrace', 'Afficher la trace (événements passés)')}
              >
                <Route size={14} />
              </button>
            </>
          }
        />
      )}

      {/* Map container */}
      <div ref={mapContainerRef} className="flex-1" style={{ isolation: 'isolate' }} data-report-capture="map" />

      {/* Density legend: the colour scale, and the intensity when it saturates
          (or stays too faint) on a dossier */}
      {showDensity && (
        <div className="absolute bottom-8 left-2 z-10 w-44 px-2 py-1.5 bg-bg-primary border border-border-default rounded text-[10px] text-text-secondary">
          <div
            className="h-2 rounded"
            style={{ background: `linear-gradient(to right, ${DENSITY_RAMP.map(([, color]) => color).join(', ')})` }}
          />
          <div className="flex justify-between mt-0.5">
            <span>{t('map.densityLow', 'Faible')}</span>
            <span>{t('map.densityHigh', 'Forte')}</span>
          </div>
          <label className="flex items-center gap-1.5 mt-1" title={t('map.densityIntensityHint', 'Baisser si tout sature, monter si tout est pâle')}>
            <span className="shrink-0">{t('map.densityIntensity', 'Intensité')}</span>
            <input
              type="range"
              min={-2}
              max={2}
              step={0.25}
              value={Math.log2(densityIntensity)}
              onChange={(e) => useUIStore.setState({ mapHeatmapIntensity: 2 ** Number(e.target.value) })}
              className="flex-1 min-w-0 w-full h-1 accent-accent cursor-pointer"
            />
          </label>
          {densitySource === 'events' && (
            <label className="flex items-center gap-1.5 mt-1 cursor-pointer" title={t('map.densityPerElementHint', "Un élément très actif (milliers de points GPS) ne domine plus la carte")}>
              <input
                type="checkbox"
                checked={densityPerElement}
                onChange={(e) => useUIStore.setState({ mapHeatmapPerElement: e.target.checked })}
                className="w-3 h-3 accent-accent"
              />
              <span>{t('map.densityPerElement', 'Pondérer par élément')}</span>
            </label>
          )}
        </div>
      )}

      {/* Empty state overlay */}
      {showEmptyState && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-secondary/90 z-10">
          <MapPin size={48} className="text-text-tertiary mb-4" />
          <p className="text-sm text-text-secondary">{t('map.noGeoElements')}</p>
          <p className="text-xs text-text-tertiary mt-2">{t('map.addLocation')}</p>
        </div>
      )}

      {/* Zone polygon layers */}
      <ZoneLayers
        map={mapRef.current}
        elements={effectiveGeoElements as Element[]}
        selectedElementIds={selectedElementIds}
        dimmedElementIds={effectiveDimmedIds}
        editingElementId={editingZoneId as any}
        isDraggingRef={isDraggingRef}
        onZoneClick={handleZoneClick}
        onZoneDoubleClick={handleZoneDoubleClick}
      />

      {/* Temporal mode: dated event list of a marker */}
      {eventPopoverElementId && eventPopoverSummary && (
        <TemporalEventsPopover
          anchorRef={eventPopoverAnchorRef}
          isOpen={eventPopover.isOpen}
          elementId={eventPopoverElementId}
          events={eventPopoverSummary.events}
          onClose={eventPopover.close}
          onPointerEnter={eventPopover.cancelClose}
          onPointerLeave={eventPopover.scheduleClose}
        />
      )}

      {/* Zone drawing tool */}
      <ZoneDrawTool
        map={mapRef.current}
        isDrawing={isDrawingZone}
        shape={zoneShape}
        onFinish={handleZoneDrawFinish}
        onCancel={handleZoneDrawCancel}
      />
      <ZoneEditTool
        map={mapRef.current}
        elementId={editingZoneId as any}
        coordinates={(() => {
          if (!editingZoneId) return [];
          const el = elements.find(e => e.id === editingZoneId);
          if (el?.geo && isGeoPolygon(el.geo)) return el.geo.coordinates;
          return [];
        })()}
        color={elements.find(e => e.id === editingZoneId)?.visual.color || '#10b981'}
        borderColor={elements.find(e => e.id === editingZoneId)?.visual.borderColor || '#059669'}
        shapeOrigin={(() => {
          if (!editingZoneId) return undefined;
          const el = elements.find(e => e.id === editingZoneId);
          return el?.geo && isGeoPolygon(el.geo) ? el.geo.shapeOrigin : undefined;
        })()}
        onSave={handleZoneEditSave}
        onCancel={handleZoneEditCancel}
      />
      {/* Event zone edit tool */}
      {eventEditZoneGeo && (
        <ZoneEditTool
          map={mapRef.current}
          elementId={null as any}
          coordinates={eventEditZoneGeo.coordinates}
          onSave={handleEventZoneEditSave}
          onCancel={handleEventZoneEditCancel}
        />
      )}

      {/* Custom styles */}
      <style>{`
        .map-marker-card,
        .map-marker-simple {
          cursor: pointer;
          transition: transform 0.15s ease;
        }
        .map-marker-card:hover,
        .map-marker-simple:hover {
          transform: scale(1.05);
        }
        .link-arrow-icon {
          background: transparent !important;
          border: none !important;
          z-index: 50 !important;
        }
        .link-arrow-icon svg {
          filter: drop-shadow(0 1px 2px rgba(0,0,0,0.4));
        }
        .custom-cluster-icon {
          background: transparent;
        }
        .cluster-icon {
          background: var(--color-accent, #e07a5f);
          border: 2px solid var(--color-bg-primary, #ffffff);
          border-radius: 50%;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          cursor: pointer;
          transition: transform 0.15s ease;
        }
        .cluster-icon:hover {
          transform: scale(1.1);
        }
        .cluster-small { font-size: 12px; }
        .cluster-medium { font-size: 13px; }
        .cluster-large { font-size: 14px; }
        .link-label-overlay {
          background: var(--color-bg-primary, #ffffff);
          border: 1px solid var(--color-border-strong, #d4cec4);
          border-radius: 3px;
          color: var(--color-text-primary, #3d3833);
          font-size: 10px;
          font-weight: 500;
          padding: 2px 6px;
          pointer-events: none;
          white-space: nowrap;
          box-shadow: 0 1px 3px rgba(0,0,0,0.15);
        }
        .maplibregl-canvas {
          outline: none;
        }
      `}</style>
    </div>
  );
}

function exportMapToCSV(geoElements: { label: string; type?: string; geo: GeoData; visual: { color: string }; tags: string[] }[], filename: string): void {
  const sorted = [...geoElements].sort((a, b) => a.label.localeCompare(b.label));
  const header = 'label,type,latitude,longitude,couleur,tags';
  const rows = sorted.map(el => {
    const c = getGeoCenter(el.geo);
    return [
    escapeCsvField(el.label),
    el.type || '',
    c.lat.toFixed(6),
    c.lng.toFixed(6),
    el.visual.color,
    escapeCsvField(el.tags.join('; ')),
  ].join(',');
  });
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, filename);
  emitExport('map-csv');
}
