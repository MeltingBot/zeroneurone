import { Fragment, useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Supercluster from 'supercluster';
import { useDossierStore, useSelectionStore, useUIStore, useViewStore, useInsightsStore, useTabStore, useQueryStore } from '../../stores';
import { useHistoryStore } from '../../stores/historyStore';
import { useEvaluationModel } from '../../hooks/useEvaluationModel';
import { getDimmedElementIds } from '../../utils/filterUtils';
import type { Element, GeoData, GeoPolygon } from '../../types';
import { getGeoCenter, isGeoPolygon, isGeoInRange, computePolygonCenter, computePolygonAreaKm2 } from '../../utils/geo';
import { MapPin, Upload, Globe, Map as MapIcon, Search, Building, Pentagon, Trash2, Circle, Square, ChevronDown, Maximize2, Crosshair, Route, Flame } from 'lucide-react';
import { ViewToolbar } from '../common/ViewToolbar';
import { DropdownPortal } from '../common/DropdownPortal';

import { ZoneDrawTool } from './ZoneDrawTool';
import { ZoneEditTool } from './ZoneEditTool';
import { ZoneLayers } from './ZoneLayers';
import { MapElementMenu } from './MapElementMenu';
import { TemporalNavigatorBar, TemporalToggleButton } from '../common/TemporalNavigatorBar';
import { toMinuteStart, eventInterval, overlaps, navigatorWindow, closestDateIndex, computeCanvasTemporalClassification, summarizeActiveEvents, type TemporalEventSummary } from '../../utils/temporalUtils';
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
import { LINK_OUTLINE_LAYER, DENSITY_RAMP, DENSITY_SOURCE, DENSITY_LAYER, densityPointWeight, ensureDensityLayer } from './mapLayers';
import { useMapTemporalGeo } from './useMapTemporalGeo';
import { useMapMarkers } from './useMapMarkers';
import { useMapLinkLayers } from './useMapLinkLayers';
import { useMapPlayback } from './useMapPlayback';
import type { ClusterState } from './mapHookTypes';
import { useShallow } from 'zustand/react/shallow';

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
  const ofmMenuButtonRef = useRef<HTMLButtonElement>(null);
  const closeOfmMenu = useCallback(() => setShowOfmMenu(false), []);
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
  const zoneShapeButtonRef = useRef<HTMLButtonElement>(null);
  const closeZoneShapeMenu = useCallback(() => setShowZoneShapeMenu(false), []);
  const zoneShape = useUIStore((s) => s.zoneShape);
  const setZoneShape = useUIStore((s) => s.setZoneShape);
  // Zone editing mode (editing polygon vertices)
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);

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

  const { elements, links, assets, comments, updateElement, createElement, deleteElements, currentDossier } = useDossierStore(useShallow((s) => ({ elements: s.elements, links: s.links, assets: s.assets, comments: s.comments, updateElement: s.updateElement, createElement: s.createElement, deleteElements: s.deleteElements, currentDossier: s.currentDossier })));
  const evaluationModel = useEvaluationModel();
  const pushAction = useHistoryStore((s) => s.pushAction);
  const { selectedElementIds, selectElement, selectLink, clearSelection, setFocusedEventId } = useSelectionStore(useShallow((s) => ({ selectedElementIds: s.selectedElementIds, selectElement: s.selectElement, selectLink: s.selectLink, clearSelection: s.clearSelection, setFocusedEventId: s.setFocusedEventId })));
  const themeMode = useUIStore((state) => state.themeMode);
  const hideMedia = useUIStore((state) => state.hideMedia);
  const anonymousMode = useUIStore((state) => state.anonymousMode);
  const showCommentBadges = useUIStore((state) => state.showCommentBadges);
  const registerCaptureHandler = useUIStore((state) => state.registerCaptureHandler);
  const unregisterCaptureHandler = useUIStore((state) => state.unregisterCaptureHandler);
  const { filters, hiddenElementIds } = useViewStore(useShallow((s) => ({ filters: s.filters, hiddenElementIds: s.hiddenElementIds })));
  // Hidden by hand, or outside the filters when the user chose to hide them
  const viewHiddenIds = useHiddenElementIds();
  const { highlightedElementIds: insightsHighlightedIds } = useInsightsStore(useShallow((s) => ({ highlightedElementIds: s.highlightedElementIds })));
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

  const assetMap = useMemo(() => {
    const map = new Map<string, string | null>();
    assets.forEach((asset) => {
      map.set(asset.id, asset.thumbnailDataUrl);
    });
    return map;
  }, [assets]);

  const unresolvedCommentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    comments.forEach((comment) => {
      if (comment.targetType === 'element' && !comment.resolved) {
        counts.set(comment.targetId, (counts.get(comment.targetId) || 0) + 1);
      }
    });
    return counts;
  }, [comments]);

  const {
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
  } = useMapTemporalGeo({
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
  });

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
  // Element menu (right-click on a marker); a new key per opening remounts it
  const [elementMenu, setElementMenu] = useState<{ x: number; y: number; elementId: string; key: number } | null>(null);
  const openElementMenuRef = useRef((elementId: string, x: number, y: number) => {
    setElementMenu({ x, y, elementId, key: Date.now() });
  });
  const closeElementMenu = useCallback(() => setElementMenu(null), []);
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

    // The element menu and the event list are anchored to a marker: close them when the map moves
    map.on('movestart', () => {
      setElementMenu(null);
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

  const { geoElementById } = useMapMarkers({
    mapRef,
    markersRef,
    clusterMarkersRef,
    offMapMarkersRef,
    markerOffsetsRef,
    superclusterRef,
    clusterStateRef,
    elementIdToFirstMarkerKeyRef,
    clusterMetaRef,
    forceSpiderfyKeysRef,
    toggleOffMapRef,
    openElementMenuRef,
    eventPopoverHandlersRef,
    dragStartGeoRef,
    isDraggingRef,
    effectiveGeoElementsRef,
    effectiveGeoElements,
    selectedElementIds,
    effectiveDimmedIds,
    assetMap,
    unresolvedCommentCounts,
    temporalEventSummaries,
    offMapNeighbors,
    offMapExpanded,
    setOffMapExpanded,
    editingZoneId,
    eventZoneIds,
    showDensity,
    anonymousMode,
    hideMedia,
    showCommentBadges,
    clusteringVersion,
    setClusteringVersion,
    setDraggedPositions,
    selectElement,
    setFocusedEventId,
    updateElement,
    pushAction,
    t,
  });

  useMapLinkLayers({
    mapRef,
    mapLoadedRef,
    linkLabelMarkersRef,
    selectLinkRef,
    clusterStateRef,
    elementIdToFirstMarkerKeyRef,
    geoElementById,
    geoLinks,
    effectiveGeoElements,
    effectiveDimmedIds,
    clusteringVersion,
    anonymousMode,
    queryFilterActive,
    queryMatchLinkIds,
    showDensity,
    selectLink,
  });

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

  const handleFit = useCallback(() => {
    if (!mapRef.current || geoElements.length === 0) return;
    const coords = geoElements.map(el => [getGeoCenter(el.geo).lng, getGeoCenter(el.geo).lat] as [number, number]);
    const bounds = coords.reduce(
      (b, c) => b.extend(c),
      new maplibregl.LngLatBounds(coords[0], coords[0])
    );
    mapRef.current.fitBounds(bounds, { padding: 50 });
  }, [geoElements]);

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

  const handleZoneClick = useCallback((elementId: string) => {
    selectElement(elementId as any);
  }, [selectElement]);

  // Zone double-click: enter polygon edit mode (not for event-based zones)
  const handleZoneDoubleClick = useCallback((elementId: string) => {
    if (eventZoneIds.has(elementId)) return;
    setEditingZoneId(elementId);
  }, [eventZoneIds]);

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

  const handleZoneEditCancel = useCallback(() => {
    setEditingZoneId(null);
  }, []);

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

  useMapPlayback({
    mapRef,
    eventDates,
    temporalMode,
    selectedDate,
    setSelectedDate,
    periodEnd,
    setPeriodEnd,
    isPlaying,
    setIsPlaying,
    isPlayingRef,
    temporalFollowCamera,
    resolvedGeoElements,
    propertyIntervals,
  });

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
    // Decided once, when the map first shows elements: a selection made later
    // on the map must not make it fly at the next change of an element
    didAutoZoomRef.current = true;
    const selIds = useSelectionStore.getState().selectedElementIds;
    if (selIds.size === 0) return;
    const selectedGeo = geoElements.filter((el) => selIds.has(el.id));
    if (selectedGeo.length === 0) return;
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
        placeSearchMarkerRef.current?.remove();
        const el = document.createElement('div');
        el.className = 'place-search-marker';
        el.style.cssText = 'width:12px;height:12px;border-radius:50%;background:var(--color-accent, #e07a5f);border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);';
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([parseFloat(lon), parseFloat(lat)])
          .addTo(map);
        placeSearchMarkerRef.current = marker;
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
                        ref={ofmMenuButtonRef}
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
              <DropdownPortal anchorRef={ofmMenuButtonRef} isOpen={showOfmMenu} onClose={closeOfmMenu} className="min-w-[130px]">
                    {OFM_VARIANTS.map(({ id, labelKey, fallback }) => (
                      <button
                        key={id}
                        onClick={() => { setOfmVariant(id); setShowOfmMenu(false); }}
                        className={`w-full px-3 py-1.5 text-xs text-left hover:bg-bg-tertiary ${ofmVariant === id ? 'font-medium text-text-primary' : 'text-text-secondary'}`}
                      >
                        {t(labelKey, fallback)}
                      </button>
                    ))}
              </DropdownPortal>
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
                  ref={zoneShapeButtonRef}
                  onClick={() => setShowZoneShapeMenu(v => !v)}
                  className={`h-6 px-1 border border-l-0 border-border-default rounded-r ${isDrawingZone ? 'bg-accent text-white' : 'text-text-secondary hover:bg-bg-tertiary'}`}
                >
                  <ChevronDown size={10} />
                </button>
              </div>
              <DropdownPortal anchorRef={zoneShapeButtonRef} isOpen={showZoneShapeMenu} onClose={closeZoneShapeMenu} className="min-w-[120px]">
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
              </DropdownPortal>
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
      {elementMenu && (
        <MapElementMenu
          key={elementMenu.key}
          x={elementMenu.x}
          y={elementMenu.y}
          elementId={elementMenu.elementId}
          onClose={closeElementMenu}
        />
      )}
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
