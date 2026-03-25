import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Supercluster from 'supercluster';
import { useDossierStore, useSelectionStore, useUIStore, useViewStore, useInsightsStore, useTabStore } from '../../stores';
import { useHistoryStore } from '../../stores/historyStore';
import { getDimmedElementIds, getNeighborIds } from '../../utils/filterUtils';
import { toPng } from 'html-to-image';
import type { Element, GeoData, GeoPolygon } from '../../types';
import { getGeoCenter, isGeoPolygon, closestPointOnPolygon, pointInPolygon, computePolygonCenter, computePolygonAreaKm2 } from '../../utils/geo';
import { MapPin, Clock, Play, Pause, SkipBack, SkipForward, Download, Globe, Map as MapIcon, Search, Building, Pentagon, Trash2, Circle, Square, ChevronDown, Maximize2, Crosshair } from 'lucide-react';
import { ViewToolbar } from '../common/ViewToolbar';

import { ZoneDrawTool } from './ZoneDrawTool';
import { ZoneEditTool } from './ZoneEditTool';
import { ZoneLayers, resolveCssColor } from './ZoneLayers';

// Element with geo coordinates (resolved for a specific time)
interface ResolvedGeoElement {
  element: Element;
  geo: { lat: number; lng: number };
  /** Full GeoData (point or polygon) — used by ZoneLayers for temporal zone geometry */
  geoData?: GeoData;
  fromEvent: boolean;
  eventLabel?: string;
}

// Link layer managed via MapLibre layers + markers
interface LinkLayer {
  sourceId: string;
  outlineLayerId: string;
  lineLayerId: string;
  labelMarker?: maplibregl.Marker;
  arrowStart?: maplibregl.Marker;
  arrowEnd?: maplibregl.Marker;
}

// Supercluster point feature
interface PointFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { elementId: string };
}

// Cluster lookup: for each element, where it visually appears
interface ClusterState {
  clustered: boolean;
  clusterCenter?: [number, number]; // [lng, lat]
  clusterId?: number;
}

// Raster tile sources
const TILE_SOURCES: Record<string, { tiles: string[]; attribution: string; maxzoom: number; tileSize?: number; subdomains?: string }> = {
  osm: {
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxzoom: 19,
  },
  osmFr: {
    tiles: ['https://a.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', 'https://b.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', 'https://c.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png'],
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://www.openstreetmap.fr">OSM France</a>',
    maxzoom: 19,
  },
  osmDe: {
    tiles: ['https://a.tile.openstreetmap.de/{z}/{x}/{y}.png', 'https://b.tile.openstreetmap.de/{z}/{x}/{y}.png', 'https://c.tile.openstreetmap.de/{z}/{x}/{y}.png'],
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://www.openstreetmap.de">OSM Deutschland</a>',
    maxzoom: 19,
  },
  cartoLight: {
    tiles: ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', 'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', 'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', 'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'],
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxzoom: 20,
  },
  cartoDark: {
    tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', 'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', 'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', 'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'],
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxzoom: 20,
  },
  satellite: {
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    attribution: '&copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
    maxzoom: 18,
  },
};

const BASE_LAYERS = [
  { id: 'osm', label: 'OSM' },
  { id: 'osmLocalized', label: 'OSM FR/DE' },
  { id: 'carto', label: 'CartoDB' },
  { id: 'satellite', label: 'Satellite' },
];

function resolveLayerId(id: string, isDark: boolean, lang?: string): string {
  if (id === 'carto') return isDark ? 'cartoDark' : 'cartoLight';
  if (id === 'osmLocalized') {
    const l = lang?.substring(0, 2);
    if (l === 'fr') return 'osmFr';
    if (l === 'de') return 'osmDe';
    return 'osm';
  }
  return id;
}

function buildMapStyle(activeLayerId: string, enable3D: boolean): maplibregl.StyleSpecification {
  const src = TILE_SOURCES[activeLayerId];
  const sources: maplibregl.StyleSpecification['sources'] = {
    'base-tiles': {
      type: 'raster',
      tiles: src.tiles,
      tileSize: 256,
      attribution: src.attribution,
      maxzoom: src.maxzoom,
    },
  };
  if (enable3D) {
    sources['terrain-dem'] = {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      tileSize: 256,
      encoding: 'terrarium',
    };
  }
  return {
    version: 8,
    sources,
    layers: [
      { id: 'base-layer', type: 'raster', source: 'base-tiles' },
    ],
  };
}

function add3DBuildingsLayer(map: maplibregl.Map) {
  if (map.getSource('openmaptiles')) return;
  map.addSource('openmaptiles', {
    type: 'vector',
    url: 'https://tiles.openfreemap.org/planet',
  });
  // Find the first link layer to insert buildings below it
  const firstLinkLayer = map.getStyle().layers.find(l => l.id.startsWith('link-'));
  map.addLayer(
    {
      id: '3d-buildings',
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 14,
      paint: {
        'fill-extrusion-color': '#d4cfc8',
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 5],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.85,
      },
    },
    firstLinkLayer?.id,
  );
}

// Spiderfy: offset markers at the same position
function computeSpiderfyOffsets(elements: { id: string; lng: number; lat: number }[], zoom: number): Map<string, [number, number]> {
  const offsets = new Map<string, [number, number]>();
  const groups = new Map<string, string[]>();

  // Group by position (rounded to ~1m precision at high zoom)
  elements.forEach(el => {
    const key = `${el.lat.toFixed(5)},${el.lng.toFixed(5)}`;
    const group = groups.get(key) || [];
    group.push(el.id);
    groups.set(key, group);
  });

  // For groups with >1 element, apply spiral offset
  const pixelToDeg = 360 / (256 * Math.pow(2, zoom)); // approximate degrees per pixel at this zoom
  groups.forEach(ids => {
    if (ids.length <= 1) return;
    const radius = 25 * pixelToDeg; // 25px radius
    ids.forEach((id, i) => {
      if (i === 0) return; // keep first at original position
      const angle = (2 * Math.PI * i) / ids.length;
      const spiralRadius = radius * (1 + i * 0.2);
      offsets.set(id, [
        Math.cos(angle) * spiralRadius,
        Math.sin(angle) * spiralRadius,
      ]);
    });
  });
  return offsets;
}

export function MapView() {
  const { t, i18n } = useTranslation('pages');
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const clusterMarkersRef = useRef<Map<number, maplibregl.Marker>>(new Map());
  const linkLayersRef = useRef<Map<string, LinkLayer>>(new Map());
  const superclusterRef = useRef<Supercluster<{ elementId: string }, Supercluster.AnyProps> | null>(null);
  const clusterStateRef = useRef<Map<string, ClusterState>>(new Map());
  const mapLoadedRef = useRef(false);

  // Track clustering state for dynamic link positioning
  const [clusteringVersion, setClusteringVersion] = useState(0);

  // Place search (Nominatim)
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeSearching, setPlaceSearching] = useState(false);
  const placeSearchMarkerRef = useRef<maplibregl.Marker | null>(null);

  // Map preferences (persisted in uiStore)
  const activeBaseLayer = useUIStore((s) => s.mapBaseLayer);
  const setActiveBaseLayer = (id: string) => useUIStore.setState({ mapBaseLayer: id });
  const is3D = useUIStore((s) => s.map3D);
  const setIs3D = (v: boolean | ((prev: boolean) => boolean)) => useUIStore.setState((s) => ({ map3D: typeof v === 'function' ? v(s.map3D) : v }));
  const show3DBuildings = useUIStore((s) => s.map3DBuildings);
  const setShow3DBuildings = (v: boolean | ((prev: boolean) => boolean)) => useUIStore.setState((s) => ({ map3DBuildings: typeof v === 'function' ? v(s.map3DBuildings) : v }));
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [temporalFollowCamera, setTemporalFollowCamera] = useState(false);
  const isPlayingRef = useRef(false);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  const { elements, links, assets, comments, updateElement, createElement, deleteElements, currentDossier } = useDossierStore();
  const pushAction = useHistoryStore((s) => s.pushAction);
  const { selectedElementIds, selectElement, selectLink, clearSelection } = useSelectionStore();
  const themeMode = useUIStore((state) => state.themeMode);
  const hideMedia = useUIStore((state) => state.hideMedia);
  const anonymousMode = useUIStore((state) => state.anonymousMode);
  const showCommentBadges = useUIStore((state) => state.showCommentBadges);
  const registerCaptureHandler = useUIStore((state) => state.registerCaptureHandler);
  const unregisterCaptureHandler = useUIStore((state) => state.unregisterCaptureHandler);
  const { filters, hiddenElementIds, focusElementId, focusDepth } = useViewStore();
  const { highlightedElementIds: insightsHighlightedIds } = useInsightsStore();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const tabMemberSet = useTabStore((s) => s.memberSet);
  const tabGhostIds = useTabStore((s) => s.ghostIds);

  // Calculate dimmed element IDs based on filters, focus, and insights highlighting
  const dimmedElementIds = useMemo(() => {
    if (insightsHighlightedIds.size > 0) {
      const dimmed = new Set<string>();
      elements.forEach((el) => {
        if (!insightsHighlightedIds.has(el.id)) dimmed.add(el.id);
      });
      return dimmed;
    }
    if (focusElementId) {
      const visibleIds = getNeighborIds(focusElementId, links, focusDepth);
      const dimmed = new Set<string>();
      elements.forEach((el) => {
        if (!visibleIds.has(el.id)) dimmed.add(el.id);
      });
      return dimmed;
    }
    return getDimmedElementIds(elements, filters, hiddenElementIds);
  }, [elements, links, filters, hiddenElementIds, focusElementId, focusDepth, insightsHighlightedIds]);

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

  // Normalize a date to noon local time
  // Normalize to start of hour (preserves hour-level precision, unlike toNoonLocal)
  const toHourStart = useCallback((d: Date | string | number): Date => {
    const date = new Date(d);
    date.setMinutes(0, 0, 0);
    return date;
  }, []);

  // Compare two dates at day level
  const dayStart = useCallback((d: Date | string | number): number => {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }, []);

  // Calculate time range and collect all unique event dates
  const { timeRange, eventDates } = useMemo(() => {
    const allDates: Date[] = [];
    elements.forEach((el) => {
      const hasBaseGeo = !!el.geo;
      const hasEventGeo = el.events?.some((e) => e.geo);
      if (hasBaseGeo || hasEventGeo) {
        if (el.events && el.events.length > 0) {
          el.events.forEach((event) => {
            if (event.geo || hasBaseGeo) {
              if (event.date) allDates.push(new Date(event.date));
              if (event.dateEnd) allDates.push(new Date(event.dateEnd));
            }
          });
        }
        if (hasBaseGeo) {
          if (el.date) allDates.push(new Date(el.date));
          if (el.dateRange?.start) allDates.push(new Date(el.dateRange.start));
          if (el.dateRange?.end) allDates.push(new Date(el.dateRange.end));
        }
      }
    });
    links.forEach((link) => {
      if (link.date) allDates.push(new Date(link.date));
      if (link.dateRange?.start) allDates.push(new Date(link.dateRange.start));
      if (link.dateRange?.end) allDates.push(new Date(link.dateRange.end));
    });
    if (allDates.length === 0) return { timeRange: null, eventDates: [] };
    const uniqueTimestamps = [...new Set(allDates.map((d) => toHourStart(d).getTime()))].sort((a, b) => a - b);
    const sortedDates = uniqueTimestamps.map((t) => new Date(t));
    return {
      timeRange: { min: sortedDates[0], max: sortedDates[sortedDates.length - 1] },
      eventDates: sortedDates,
    };
  }, [elements, links, toHourStart]);

  // Get position for an element at a specific time
  const getPositionAtTime = useCallback(
    (element: Element, date: Date | null): { geo: { lat: number; lng: number }; geoData?: GeoData; label?: string } | null => {
      if (!date || !temporalMode) {
        // Check events for the most recent polygon geo (zone evolution)
        const geoEvents = (element.events || [])
          .filter((e) => e.geo && e.date)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const mostRecentEventGeo = geoEvents.length > 0 ? geoEvents[geoEvents.length - 1] : null;

        if (element.geo) {
          // If an event has polygon geo, use it for zone rendering (geoData) while keeping marker at element position
          const effectiveGeoData = (mostRecentEventGeo?.geo && isGeoPolygon(mostRecentEventGeo.geo))
            ? mostRecentEventGeo.geo
            : element.geo;
          return { geo: getGeoCenter(element.geo), geoData: effectiveGeoData };
        }
        if (mostRecentEventGeo) {
          return { geo: getGeoCenter(mostRecentEventGeo.geo!), geoData: mostRecentEventGeo.geo!, label: mostRecentEventGeo.label };
        }
        return null;
      }
      const targetDay = dayStart(date);
      const hasBaseGeo = !!element.geo;
      const datedEvents = (element.events || [])
        .filter((e) => e.date)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      if (datedEvents.length > 0) {
        const firstEventDay = dayStart(datedEvents[0].date);
        if (targetDay < firstEventDay) return null;
        let activeEvent = datedEvents[0];
        for (const event of datedEvents) {
          if (dayStart(event.date) <= targetDay) activeEvent = event;
          else break;
        }
        const eventGeo = activeEvent.geo;
        if (eventGeo) return { geo: getGeoCenter(eventGeo), geoData: eventGeo, label: activeEvent.label };
        if (element.geo) return { geo: getGeoCenter(element.geo), geoData: element.geo, label: activeEvent.label };
        return null;
      }
      if (hasBaseGeo) {
        if (element.dateRange?.start) {
          const elStartDay = dayStart(element.dateRange.start);
          const elEndDay = element.dateRange.end ? dayStart(element.dateRange.end) : Infinity;
          if (targetDay < elStartDay || targetDay > elEndDay) return null;
        } else if (element.date) {
          if (targetDay !== dayStart(element.date)) return null;
        }
        return element.geo ? { geo: getGeoCenter(element.geo), geoData: element.geo } : null;
      }
      return null;
    },
    [temporalMode, dayStart]
  );

  // Get any geo position for an element (for link-pulled visibility)
  const getAnyGeoPosition = useCallback(
    (element: Element): { geo: { lat: number; lng: number }; geoData?: GeoData; label?: string } | null => {
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
          return { geo: getGeoCenter(closest.geo!), geoData: closest.geo!, label: closest.label };
        }
        const mostRecent = geoEvents[geoEvents.length - 1];
        return { geo: getGeoCenter(mostRecent.geo!), geoData: mostRecent.geo!, label: mostRecent.label };
      }
      return null;
    },
    [temporalMode, selectedDate]
  );

  // Check if a link is active at the selected time
  const isLinkActiveAtTime = useCallback(
    (link: typeof links[0]): boolean => {
      if (!temporalMode || !selectedDate) return true;
      const targetTime = selectedDate.getTime();
      if (link.date) {
        const linkDate = new Date(link.date).getTime();
        const linkEnd = linkDate + 24 * 60 * 60 * 1000 - 1;
        if (targetTime >= linkDate && targetTime <= linkEnd) return true;
      }
      if (link.dateRange?.start) {
        const linkStart = new Date(link.dateRange.start).getTime();
        const linkEnd = link.dateRange.end ? new Date(link.dateRange.end).getTime() + 24 * 60 * 60 * 1000 - 1 : Infinity;
        if (targetTime >= linkStart && targetTime <= linkEnd) return true;
        return false;
      }
      return true;
    },
    [temporalMode, selectedDate]
  );

  // Calculate visibility windows for each element based on links
  const elementLinkVisibility = useMemo(() => {
    const visibilityMap = new Map<string, { from: number; until: number }[]>();
    links.forEach((link) => {
      let linkFrom: number | null = null;
      let linkUntil: number | null = null;
      if (link.date) {
        linkFrom = new Date(link.date).getTime();
        linkUntil = linkFrom + 24 * 60 * 60 * 1000 - 1;
      }
      if (link.dateRange?.start) {
        const rangeStart = new Date(link.dateRange.start).getTime();
        const rangeEnd = link.dateRange.end ? new Date(link.dateRange.end).getTime() + 24 * 60 * 60 * 1000 - 1 : Infinity;
        if (linkFrom !== null) {
          linkFrom = Math.min(linkFrom, rangeStart);
          linkUntil = Math.max(linkUntil!, rangeEnd);
        } else {
          linkFrom = rangeStart;
          linkUntil = rangeEnd;
        }
      }
      if (linkFrom !== null && linkUntil !== null) {
        [link.fromId, link.toId].forEach((elId) => {
          const existing = visibilityMap.get(elId) || [];
          existing.push({ from: linkFrom!, until: linkUntil! });
          visibilityMap.set(elId, existing);
        });
      }
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

  // Get elements with resolved geo positions (considering temporal mode)
  const resolvedGeoElements = useMemo((): ResolvedGeoElement[] => {
    const result: ResolvedGeoElement[] = [];
    if (!temporalMode || !selectedDate) {
      elements.forEach((el) => {
        if (hiddenElementIds.has(el.id)) return;
        if (activeTabId !== null && !tabMemberSet.has(el.id) && !tabGhostIds.has(el.id)) return;
        const position = getPositionAtTime(el, null);
        if (position) {
          result.push({ element: el, geo: position.geo, geoData: position.geoData, fromEvent: !!position.label, eventLabel: position.label });
        }
      });
      return result;
    }
    const targetDay = dayStart(selectedDate);
    elements.forEach((el) => {
      if (hiddenElementIds.has(el.id)) return;
      if (activeTabId !== null && !tabMemberSet.has(el.id) && !tabGhostIds.has(el.id)) return;
      const visibleViaActiveLink = isVisibleViaLink(el.id, selectedDate.getTime());
      const datedEvents = (el.events || []).filter((e) => e.date).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      let visibleByOwnData = false;
      if (datedEvents.length > 0) {
        const firstEventDay = dayStart(datedEvents[0].date);
        const lastEventDay = dayStart(datedEvents[datedEvents.length - 1].date);
        if (targetDay >= firstEventDay && targetDay <= lastEventDay) visibleByOwnData = true;
      } else if (el.geo) {
        if (el.dateRange?.start) {
          const elStartDay = dayStart(el.dateRange.start);
          const elEndDay = el.dateRange.end ? dayStart(el.dateRange.end) : Infinity;
          if (targetDay >= elStartDay && targetDay <= elEndDay) visibleByOwnData = true;
        } else if (el.date) {
          if (targetDay === dayStart(el.date)) visibleByOwnData = true;
        }
      }
      if (visibleByOwnData || visibleViaActiveLink) {
        const position = getPositionAtTime(el, selectedDate) || getAnyGeoPosition(el);
        if (position) {
          result.push({ element: el, geo: position.geo, geoData: position.geoData, fromEvent: !!position.label, eventLabel: position.label });
        }
      }
    });
    return result;
  }, [elements, selectedDate, getPositionAtTime, getAnyGeoPosition, hiddenElementIds, temporalMode, isVisibleViaLink, dayStart, activeTabId, tabMemberSet, tabGhostIds]);

  // Legacy geoElements for compatibility (preserves full GeoData including polygons)
  const geoElements = useMemo(() => {
    return resolvedGeoElements.map((r) => ({ ...r.element, geo: r.geoData || { type: 'point' as const, ...r.geo } }));
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

  const geoElementIds = useMemo(() => new Set(geoElements.map(el => el.id)), [geoElements]);

  // Filter links where both elements have geo and are active
  const geoLinks = useMemo(() => {
    return links.filter(link => {
      if (!geoElementIds.has(link.fromId) || !geoElementIds.has(link.toId)) return false;
      if (temporalMode && selectedDate) return isLinkActiveAtTime(link);
      return true;
    });
  }, [links, geoElementIds, temporalMode, selectedDate, isLinkActiveAtTime]);

  // Get thumbnail for element
  const getThumbnail = useCallback((element: Element): string | null => {
    const firstAssetId = element.assetIds?.[0];
    if (!firstAssetId) return null;
    return assetMap.get(firstAssetId) ?? null;
  }, [assetMap]);

  // Create custom marker HTML
  const createMarkerHtml = useCallback((element: Element, isSelected: boolean, isDimmed: boolean, unresolvedCommentCount?: number): string => {
    const color = element.visual.color || '#f5f5f4';
    const borderColor = element.visual.borderColor || '#a8a29e';
    const thumbnail = getThumbnail(element);
    const label = element.label || t('map.unnamed');
    const truncatedLabel = label.length > 12 ? label.substring(0, 10) + '...' : label;
    const displayLabel = anonymousMode
      ? '<span style="display:inline-block;background:var(--color-text-primary,#3d3833);border-radius:2px;width:2.5em;height:0.8em;"></span>'
      : isSelected ? label : truncatedLabel;
    const selectedStyle = isSelected
      ? 'box-shadow: 0 0 0 2px var(--color-accent, #e07a5f), 0 2px 6px rgba(0,0,0,0.3);'
      : 'box-shadow: 0 1px 4px rgba(0,0,0,0.2);';
    const dimmedStyle = isDimmed ? 'opacity: 0.3;' : '';
    const commentBadge = showCommentBadges && unresolvedCommentCount && unresolvedCommentCount > 0
      ? `<div style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;background-color:#f59e0b;color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;box-shadow:0 1px 3px rgba(0,0,0,0.3);z-index:10;">${unresolvedCommentCount}</div>`
      : '';

    if (thumbnail) {
      const blurStyle = hideMedia ? 'filter: blur(8px);' : '';
      const cardWidth = isSelected ? 'min-width:48px' : 'width:48px';
      const labelOverflow = isSelected ? 'white-space:nowrap' : 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      return `
        <div class="map-marker-card" style="position:relative;background:var(--color-bg-primary, #ffffff);border:1px solid ${isSelected ? 'var(--color-accent, #e07a5f)' : borderColor};border-radius:4px;overflow:visible;${selectedStyle}${dimmedStyle}${cardWidth};">
          ${commentBadge}
          <div style="width:100%;min-width:48px;height:36px;background-image:url(${thumbnail});background-size:cover;background-position:center;background-color:var(--color-bg-secondary, #f7f4ef);border-radius:4px 4px 0 0;${blurStyle}"></div>
          <div style="padding:2px 3px;background:var(--color-bg-primary, #ffffff);border-top:1px solid var(--color-border-default, #e8e3db);">
            <span style="font-size:9px;font-weight:500;color:var(--color-text-primary, #3d3833);display:block;text-align:center;${labelOverflow}">${displayLabel}</span>
          </div>
        </div>`;
    } else {
      return `
        <div class="map-marker-simple" style="position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;${dimmedStyle}">
          ${commentBadge}
          <div style="width:16px;height:16px;background-color:${color};border:2px solid ${isSelected ? 'var(--color-accent, #e07a5f)' : borderColor};border-radius:50%;${selectedStyle}"></div>
          <div style="background:var(--color-bg-primary, #ffffff);border:1px solid var(--color-border-default, #e8e3db);border-radius:3px;padding:1px 4px;box-shadow:0 1px 2px rgba(0,0,0,0.1);">
            <span style="font-size:9px;font-weight:500;color:var(--color-text-primary, #3d3833);white-space:nowrap;">${displayLabel}</span>
          </div>
        </div>`;
    }
  }, [getThumbnail, anonymousMode, hideMedia, showCommentBadges, t]);

  // Create marker DOM element
  const createMarkerElement = useCallback((element: Element, isSelected: boolean, isDimmed: boolean, commentCount?: number): HTMLDivElement => {
    const el = document.createElement('div');
    el.innerHTML = createMarkerHtml(element, isSelected, isDimmed, commentCount);
    el.style.cursor = 'pointer';
    return el;
  }, [createMarkerHtml]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const { mapBaseLayer: initLayer, map3D: init3D, themeMode: initTheme } = useUIStore.getState();
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: buildMapStyle(resolveLayerId(initLayer, initTheme === 'dark', i18n.language), init3D),
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
      if (!(e.originalEvent.target as HTMLElement).closest('.map-marker-card, .map-marker-simple, .cluster-icon')) {
        clearSelection();
      }
    });

    map.on('zoomend', () => {
      setClusteringVersion(v => v + 1);
    });

    map.on('moveend', () => {
      setClusteringVersion(v => v + 1);
    });

    map.on('load', () => {
      mapLoadedRef.current = true;
      const { map3D: load3D, map3DBuildings: loadBuildings } = useUIStore.getState();
      if (load3D) {
        map.setProjection({ type: 'globe' });
        map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 });
      }
      if (loadBuildings) {
        add3DBuildingsLayer(map);
      }
      setClusteringVersion(v => v + 1);
    });

    mapRef.current = map;

    return () => {
      mapLoadedRef.current = false;
      // Clean up markers
      markersRef.current.forEach(m => m.remove());
      markersRef.current.clear();
      clusterMarkersRef.current.forEach(m => m.remove());
      clusterMarkersRef.current.clear();
      // Clean up link layers
      linkLayersRef.current.forEach(ll => {
        ll.labelMarker?.remove();
        ll.arrowStart?.remove();
        ll.arrowEnd?.remove();
        try {
          if (map.getLayer(ll.lineLayerId)) map.removeLayer(ll.lineLayerId);
          if (map.getLayer(ll.outlineLayerId)) map.removeLayer(ll.outlineLayerId);
          if (map.getSource(ll.sourceId)) map.removeSource(ll.sourceId);
        } catch { /* map already removed */ }
      });
      linkLayersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, [clearSelection]);

  // Switch base layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // setStyle removes all sources/layers — clear link refs so the effect recreates them
    linkLayersRef.current.forEach(ll => {
      ll.labelMarker?.remove();
      ll.arrowStart?.remove();
      ll.arrowEnd?.remove();
    });
    linkLayersRef.current.clear();
    map.setStyle(buildMapStyle(resolveLayerId(activeBaseLayer, themeMode === 'dark', i18n.language), is3DRef.current));
    // Re-flag as loaded after style switch
    map.once('style.load', () => {
      mapLoadedRef.current = true;
      if (is3DRef.current) {
        map.setProjection({ type: 'globe' });
        map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 });
      }
      if (show3DBuildingsRef.current) {
        add3DBuildingsLayer(map);
      }
      setClusteringVersion(v => v + 1);
    });
  }, [activeBaseLayer, themeMode, i18n.language]);

  // Toggle 3D mode (projection + terrain + pitch) without full style reload
  const is3DInitRef = useRef(true); // skip first render (handled by init)
  useEffect(() => {
    if (is3DInitRef.current) { is3DInitRef.current = false; return; }
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    if (is3D) {
      // Add terrain source if missing
      if (!map.getSource('terrain-dem')) {
        map.addSource('terrain-dem', {
          type: 'raster-dem',
          tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
          tileSize: 256,
          encoding: 'terrarium',
        });
      }
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
        if (map.getSource('openmaptiles')) map.removeSource('openmaptiles');
      }
    }
  }, [is3D]);

  // Toggle 3D buildings layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    if (show3DBuildings) {
      add3DBuildingsLayer(map);
    } else if (map.getLayer('3d-buildings')) {
      map.removeLayer('3d-buildings');
      if (map.getSource('openmaptiles')) map.removeSource('openmaptiles');
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

  // Rebuild Supercluster and update markers
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const zoom = Math.floor(map.getZoom());

    // Build supercluster index
    const sc = new Supercluster<{ elementId: string }>({
      radius: 50,
      maxZoom: 20,
    });

    const points: PointFeature[] = effectiveGeoElements.map(el => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [getGeoCenter(el.geo).lng, getGeoCenter(el.geo).lat] },
      properties: { elementId: el.id },
    }));

    sc.load(points);
    superclusterRef.current = sc;

    // Get clusters at current zoom
    const clusters = sc.getClusters([-180, -90, 180, 90], zoom);

    // Build cluster state lookup
    const newClusterState = new Map<string, ClusterState>();
    const activeClusters = new Map<number, { center: [number, number]; count: number }>();

    clusters.forEach(feature => {
      const props = feature.properties as Record<string, unknown>;
      if (props.cluster) {
        const clusterId = props.cluster_id as number;
        const center = feature.geometry.coordinates as [number, number];
        const count = props.point_count as number;
        activeClusters.set(clusterId, { center, count });

        // Get all leaves (element IDs) in this cluster
        const leaves = sc.getLeaves(clusterId, Infinity);
        leaves.forEach(leaf => {
          newClusterState.set(leaf.properties.elementId, {
            clustered: true,
            clusterCenter: center,
            clusterId,
          });
        });
      } else {
        newClusterState.set(feature.properties.elementId, { clustered: false });
      }
    });

    clusterStateRef.current = newClusterState;

    // Compute spiderfy offsets for unclustered elements at same position
    const unclusteredElements = effectiveGeoElements.filter(el => {
      const state = newClusterState.get(el.id);
      return state && !state.clustered;
    });
    const spiderfyOffsets = computeSpiderfyOffsets(
      unclusteredElements.map(el => { const c = getGeoCenter(el.geo); return { id: el.id, lng: c.lng, lat: c.lat }; }),
      zoom
    );

    // Update element markers
    const existingMarkers = markersRef.current;
    const currentIds = new Set(effectiveGeoElements.map(el => el.id));

    // Remove markers for elements no longer present
    existingMarkers.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        existingMarkers.delete(id);
      }
    });

    // Add/update element markers
    effectiveGeoElements.forEach((element) => {
      const isSelected = selectedElementIds.has(element.id);
      const isDimmed = effectiveDimmedIds.has(element.id);
      const commentCount = unresolvedCommentCounts.get(element.id);
      const state = newClusterState.get(element.id);
      const isClustered = state?.clustered ?? false;

      const existingMarker = existingMarkers.get(element.id);
      const offset = spiderfyOffsets.get(element.id);
      const center = getGeoCenter(element.geo);
      const lng = center.lng + (offset ? offset[0] : 0);
      const lat = center.lat + (offset ? offset[1] : 0);

      if (existingMarker) {
        // Update position
        existingMarker.setLngLat([lng, lat]);
        // Update draggability
        existingMarker.setDraggable(!element.isPositionLocked && !eventZoneIds.has(element.id));
        // Update visibility (hide if clustered)
        const el = existingMarker.getElement();
        const isBeingEdited = editingZoneId === element.id;
        el.style.display = (isClustered || isBeingEdited) ? 'none' : '';
        el.innerHTML = createMarkerHtml(element, isSelected, isDimmed, commentCount);
        el.setAttribute('title', anonymousMode ? '' : (element.label || ''));
      } else {
        // Create new marker
        const markerEl = createMarkerElement(element, isSelected, isDimmed, commentCount);
        const isBeingEdited = editingZoneId === element.id;
        markerEl.style.display = (isClustered || isBeingEdited) ? 'none' : '';
        markerEl.setAttribute('title', anonymousMode ? '' : (element.label || ''));

        const isDraggable = !element.isPositionLocked && !eventZoneIds.has(element.id);
        const marker = new maplibregl.Marker({ element: markerEl, anchor: 'top', offset: [0, -8], draggable: isDraggable })
          .setLngLat([lng, lat])
          .addTo(map);

        // Click to select
        const markerId = element.id;
        markerEl.addEventListener('click', (e) => {
          e.stopPropagation();
          selectElement(markerId);
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

        existingMarkers.set(element.id, marker);
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
    activeClusters.forEach(({ center, count }, clusterId) => {
      let size = 'small';
      let dimension = 30;
      if (count >= 10) { size = 'large'; dimension = 44; }
      else if (count >= 5) { size = 'medium'; dimension = 36; }

      const existingCluster = existingClusterMarkers.get(clusterId);
      if (existingCluster) {
        existingCluster.setLngLat(center);
        const el = existingCluster.getElement();
        el.innerHTML = `<div class="cluster-icon cluster-${size}" style="width:${dimension}px;height:${dimension}px;"><span>${count}</span></div>`;
      } else {
        const el = document.createElement('div');
        el.className = 'custom-cluster-icon';
        el.innerHTML = `<div class="cluster-icon cluster-${size}" style="width:${dimension}px;height:${dimension}px;"><span>${count}</span></div>`;
        el.style.cursor = 'pointer';

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const expansionZoom = sc.getClusterExpansionZoom(clusterId);
          map.flyTo({ center: center as [number, number], zoom: expansionZoom });
        });

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(center)
          .addTo(map);
        existingClusterMarkers.set(clusterId, marker);
      }
    });

  }, [effectiveGeoElements, selectedElementIds, effectiveDimmedIds, unresolvedCommentCounts, createMarkerHtml, createMarkerElement, selectElement, updateElement, pushAction, anonymousMode, hideMedia, clusteringVersion, editingZoneId, eventZoneIds]);

  // Get visible position for an element (considering clustering)
  const getVisibleLngLat = useCallback((elementId: string): [number, number] | null => {
    const state = clusterStateRef.current.get(elementId);
    if (state?.clustered && state.clusterCenter) return state.clusterCenter;
    const el = effectiveGeoElements.find(e => e.id === elementId);
    if (!el) return null;
    return [getGeoCenter(el.geo).lng, getGeoCenter(el.geo).lat];
  }, [effectiveGeoElements]);

  // Check if two elements are in the same cluster
  const areInSameCluster = useCallback((id1: string, id2: string): boolean => {
    const s1 = clusterStateRef.current.get(id1);
    const s2 = clusterStateRef.current.get(id2);
    if (!s1 || !s2) return false;
    return s1.clustered && s2.clustered && s1.clusterId === s2.clusterId;
  }, []);

  // Calculate angle between two points (degrees)
  const calculateAngle = useCallback((from: [number, number], to: [number, number]): number => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    return Math.atan2(dy, dx) * (180 / Math.PI);
  }, []);

  // Create arrow marker element
  const createArrowElement = useCallback((color: string, angle: number, size: number = 20): HTMLDivElement => {
    const el = document.createElement('div');
    el.className = 'link-arrow-icon';
    el.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 20 20" style="transform: rotate(${-angle + 90}deg);"><path d="M10 2 L18 18 L10 13 L2 18 Z" fill="${color}" stroke="white" stroke-width="2" stroke-linejoin="round"/></svg>`;
    el.style.pointerEvents = 'none';
    return el;
  }, []);

  // Get position along line (0 = start, 1 = end)
  const getPointOnLine = useCallback((from: [number, number], to: [number, number], ratio: number): [number, number] => {
    return [
      from[0] + (to[0] - from[0]) * ratio,
      from[1] + (to[1] - from[1]) * ratio,
    ];
  }, []);

  // Update links - uses MapLibre GeoJSON sources + layers
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return;

    const map = mapRef.current;
    const existingLinkLayers = linkLayersRef.current;
    const currentLinkIds = new Set(geoLinks.map((l) => l.id));

    // Remove link layers that no longer exist
    existingLinkLayers.forEach((ll, id) => {
      if (!currentLinkIds.has(id)) {
        ll.labelMarker?.remove();
        ll.arrowStart?.remove();
        ll.arrowEnd?.remove();
        try {
          if (map.getLayer(ll.lineLayerId)) map.removeLayer(ll.lineLayerId);
          if (map.getLayer(ll.outlineLayerId)) map.removeLayer(ll.outlineLayerId);
          if (map.getSource(ll.sourceId)) map.removeSource(ll.sourceId);
        } catch { /* ignore */ }
        existingLinkLayers.delete(id);
      }
    });

    // Build element geo lookup for polygon edge snapping
    const elementGeoMap = new Map<string, GeoData>();
    effectiveGeoElements.forEach(el => { if (el.geo) elementGeoMap.set(el.id, el.geo); });

    // Add or update link layers
    geoLinks.forEach((link) => {
      let fromLngLat = getVisibleLngLat(link.fromId);
      let toLngLat = getVisibleLngLat(link.toId);
      if (!fromLngLat || !toLngLat) return;

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

      const isLinkDimmed = effectiveDimmedIds.has(link.fromId) || effectiveDimmedIds.has(link.toId);
      const linkOpacity = isLinkDimmed ? 0.3 : 1;

      // Skip if both in same cluster
      if (areInSameCluster(link.fromId, link.toId)) {
        const existing = existingLinkLayers.get(link.id);
        if (existing) {
          try {
            if (map.getLayer(existing.outlineLayerId)) map.setPaintProperty(existing.outlineLayerId, 'line-opacity', 0);
            if (map.getLayer(existing.lineLayerId)) map.setPaintProperty(existing.lineLayerId, 'line-opacity', 0);
          } catch { /* ignore */ }
          existing.labelMarker?.getElement()?.style.setProperty('display', 'none');
          if (existing.arrowStart) existing.arrowStart.getElement().style.display = 'none';
          if (existing.arrowEnd) existing.arrowEnd.getElement().style.display = 'none';
        }
        return;
      }

      const color = link.visual.color || '#6b6560';
      const weight = Math.max(2, (link.visual.thickness || 2));
      const dashArray = link.visual.style === 'dashed' ? [10, 6] :
                       link.visual.style === 'dotted' ? [3, 6] : undefined;
      const direction = link.direction || (link.directed ? 'forward' : 'none');
      const needsEndArrow = direction === 'forward' || direction === 'both';
      const needsStartArrow = direction === 'backward' || direction === 'both';
      const angle = calculateAngle(fromLngLat, toLngLat);

      const tooltipContent = link.label
        ? (anonymousMode
            ? '\u2588\u2588\u2588'
            : link.label)
        : null;

      const geojsonData: GeoJSON.Feature<GeoJSON.LineString> = {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [fromLngLat, toLngLat] },
        properties: {},
      };

      const existingLL = existingLinkLayers.get(link.id);

      if (existingLL) {
        // Update existing
        try {
          const src = map.getSource(existingLL.sourceId) as maplibregl.GeoJSONSource;
          if (src) src.setData(geojsonData);

          if (map.getLayer(existingLL.outlineLayerId)) {
            map.setPaintProperty(existingLL.outlineLayerId, 'line-width', weight + 4);
            map.setPaintProperty(existingLL.outlineLayerId, 'line-opacity', 0.9 * linkOpacity);
          }
          if (map.getLayer(existingLL.lineLayerId)) {
            map.setPaintProperty(existingLL.lineLayerId, 'line-color', color);
            map.setPaintProperty(existingLL.lineLayerId, 'line-width', weight);
            map.setPaintProperty(existingLL.lineLayerId, 'line-opacity', linkOpacity);
            if (dashArray) map.setPaintProperty(existingLL.lineLayerId, 'line-dasharray', dashArray);
          }
        } catch { /* source/layer may not exist after style change */ }

        // Update label
        const midpoint = getPointOnLine(fromLngLat, toLngLat, 0.5);
        if (tooltipContent) {
          if (existingLL.labelMarker) {
            existingLL.labelMarker.setLngLat(midpoint);
            existingLL.labelMarker.getElement().textContent = tooltipContent;
            existingLL.labelMarker.getElement().style.display = '';
          } else {
            const labelEl = document.createElement('div');
            labelEl.className = 'link-label-overlay';
            labelEl.textContent = tooltipContent;
            existingLL.labelMarker = new maplibregl.Marker({ element: labelEl, anchor: 'center' })
              .setLngLat(midpoint)
              .addTo(map);
          }
        } else if (existingLL.labelMarker) {
          existingLL.labelMarker.remove();
          existingLL.labelMarker = undefined;
        }

        // Update arrows
        if (needsEndArrow) {
          const endPos = getPointOnLine(fromLngLat, toLngLat, 0.92);
          if (existingLL.arrowEnd) {
            existingLL.arrowEnd.setLngLat(endPos);
            existingLL.arrowEnd.getElement().innerHTML = createArrowElement(color, angle).innerHTML;
            existingLL.arrowEnd.getElement().style.display = '';
          } else {
            existingLL.arrowEnd = new maplibregl.Marker({ element: createArrowElement(color, angle), anchor: 'center' })
              .setLngLat(endPos).addTo(map);
          }
        } else if (existingLL.arrowEnd) {
          existingLL.arrowEnd.remove();
          existingLL.arrowEnd = undefined;
        }

        if (needsStartArrow) {
          const startPos = getPointOnLine(fromLngLat, toLngLat, 0.08);
          if (existingLL.arrowStart) {
            existingLL.arrowStart.setLngLat(startPos);
            existingLL.arrowStart.getElement().innerHTML = createArrowElement(color, angle + 180).innerHTML;
            existingLL.arrowStart.getElement().style.display = '';
          } else {
            existingLL.arrowStart = new maplibregl.Marker({ element: createArrowElement(color, angle + 180), anchor: 'center' })
              .setLngLat(startPos).addTo(map);
          }
        } else if (existingLL.arrowStart) {
          existingLL.arrowStart.remove();
          existingLL.arrowStart = undefined;
        }
      } else {
        // Create new link layers
        const sourceId = `link-src-${link.id}`;
        const outlineLayerId = `link-outline-${link.id}`;
        const lineLayerId = `link-line-${link.id}`;

        try {
          map.addSource(sourceId, { type: 'geojson', data: geojsonData });

          map.addLayer({
            id: outlineLayerId,
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': '#ffffff',
              'line-width': weight + 4,
              'line-opacity': 0.9 * linkOpacity,
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' },
          });

          map.addLayer({
            id: lineLayerId,
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': color,
              'line-width': weight,
              'line-opacity': linkOpacity,
              ...(dashArray ? { 'line-dasharray': dashArray } : {}),
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' },
          });

          // Click handler on line
          map.on('click', lineLayerId, (e) => {
            e.preventDefault();
            selectLink(link.id);
          });
          map.on('mouseenter', lineLayerId, () => { map.getCanvas().style.cursor = 'pointer'; });
          map.on('mouseleave', lineLayerId, () => { map.getCanvas().style.cursor = ''; });
        } catch (err) {
          console.warn('Failed to add link layer', link.id, err);
          return;
        }

        // Label marker
        let labelMarker: maplibregl.Marker | undefined;
        if (tooltipContent) {
          const labelEl = document.createElement('div');
          labelEl.className = 'link-label-overlay';
          labelEl.textContent = tooltipContent;
          const midpoint = getPointOnLine(fromLngLat, toLngLat, 0.5);
          labelMarker = new maplibregl.Marker({ element: labelEl, anchor: 'center' })
            .setLngLat(midpoint)
            .addTo(map);
        }

        // Arrow markers
        let arrowEnd: maplibregl.Marker | undefined;
        let arrowStart: maplibregl.Marker | undefined;
        if (needsEndArrow) {
          const endPos = getPointOnLine(fromLngLat, toLngLat, 0.92);
          arrowEnd = new maplibregl.Marker({ element: createArrowElement(color, angle), anchor: 'center' })
            .setLngLat(endPos).addTo(map);
        }
        if (needsStartArrow) {
          const startPos = getPointOnLine(fromLngLat, toLngLat, 0.08);
          arrowStart = new maplibregl.Marker({ element: createArrowElement(color, angle + 180), anchor: 'center' })
            .setLngLat(startPos).addTo(map);
        }

        existingLinkLayers.set(link.id, { sourceId, outlineLayerId, lineLayerId, labelMarker, arrowStart, arrowEnd });
      }
    });
  }, [geoLinks, selectLink, clusteringVersion, getVisibleLngLat, areInSameCluster, calculateAngle, createArrowElement, getPointOnLine, anonymousMode, effectiveDimmedIds, effectiveGeoElements]);

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

  // Format date for display (handles BC/negative years and hour precision)
  const formatDate = (date: Date) => {
    const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-US';
    const year = date.getFullYear();
    const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;
    if (year <= 0) {
      // BC date: getFullYear() gives the astronomical year (0 = 1 BC, -1 = 2 BC, etc.)
      const monthDay = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' }).format(
        new Date(2000, date.getMonth(), date.getDate())
      );
      const timePart = hasTime ? ` ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` : '';
      return `${monthDay} ${year}${timePart}`;
    }
    return date.toLocaleDateString(locale, {
      day: '2-digit', month: 'short', year: 'numeric',
      ...(hasTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    });
  };

  // Format date for <input type="date"> — only supports years 1–9999
  const formatDateForInput = (date: Date): string => {
    const y = date.getFullYear();
    if (y < 1 || y > 9999) return '';
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${String(y).padStart(4, '0')}-${m}-${d}`;
  };

  // Get current event index from selected date
  const currentEventIndex = useMemo(() => {
    if (eventDates.length === 0 || !selectedDate) return 0;
    const selectedTime = selectedDate.getTime();
    let closestIdx = 0;
    let closestDiff = Math.abs(eventDates[0].getTime() - selectedTime);
    for (let i = 1; i < eventDates.length; i++) {
      const diff = Math.abs(eventDates[i].getTime() - selectedTime);
      if (diff < closestDiff) { closestDiff = diff; closestIdx = i; }
    }
    return closestIdx;
  }, [eventDates, selectedDate]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (eventDates.length === 0) return;
    const index = parseInt(e.target.value);
    setSelectedDate(eventDates[index]);
  };

  const handleToggleTemporal = () => {
    if (!temporalMode && eventDates.length > 0) {
      setTemporalMode(true);
      const now = Date.now();
      let closestDate = eventDates[0];
      let closestDiff = Math.abs(eventDates[0].getTime() - now);
      for (const ed of eventDates) {
        const diff = Math.abs(ed.getTime() - now);
        if (diff < closestDiff) { closestDiff = diff; closestDate = ed; }
      }
      setSelectedDate(closestDate);
    } else {
      setTemporalMode(false);
      setSelectedDate(null);
      setIsPlaying(false);
    }
  };

  const handleStep = (direction: 'forward' | 'backward') => {
    if (eventDates.length === 0) return;
    const newIndex = direction === 'forward'
      ? Math.min(currentEventIndex + 1, eventDates.length - 1)
      : Math.max(currentEventIndex - 1, 0);
    setSelectedDate(eventDates[newIndex]);
  };

  // Play animation — fixed interval only when follow camera is OFF
  // When follow camera is ON, advancement is chained via moveend below
  // This interval handles the non-follow-camera case + kick-starts the chain
  const advanceDate = useCallback(() => {
    setSelectedDate((prev) => {
      if (!prev) return eventDates[0];
      let currentIdx = 0;
      for (let i = 0; i < eventDates.length; i++) {
        if (eventDates[i].getTime() <= prev.getTime()) currentIdx = i;
      }
      const nextIdx = currentIdx + 1;
      if (nextIdx >= eventDates.length) { setIsPlaying(false); return eventDates[eventDates.length - 1]; }
      return eventDates[nextIdx];
    });
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
    const targetDay = dayStart(selectedDate);
    let cancelled = false;
    let advanceTimeout: ReturnType<typeof setTimeout>;

    // Find elements that have an event specifically on this date
    const activeCoords: [number, number][] = [];
    for (const r of resolvedGeoElements) {
      const el = r.element;
      const hasEventToday = (el.events || []).some(e => e.date && dayStart(e.date) === targetDay);
      const startsToday = (el.date && dayStart(el.date) === targetDay) ||
        (el.dateRange?.start && dayStart(el.dateRange.start) === targetDay);
      if (hasEventToday || startsToday) {
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
  }, [temporalMode, selectedDate, resolvedGeoElements, temporalFollowCamera, dayStart, advanceDate]);

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
        el.style.cssText = 'width:12px;height:12px;border-radius:50%;background:#2563eb;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);';
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
              {t('map.elementsLocated', { count: geoElements.length })}
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

            {/* Base layer switcher */}
            <div className="flex items-center border border-border-default rounded overflow-hidden mr-2">
              {BASE_LAYERS.map(layer => (
                <button
                  key={layer.id}
                  onClick={() => setActiveBaseLayer(layer.id)}
                  className={`px-2 h-6 text-[10px] ${activeBaseLayer === layer.id ? 'bg-accent text-white' : 'text-text-secondary hover:bg-bg-tertiary'}`}
                >
                  {layer.label}
                </button>
              ))}
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

            {/* Temporal mode toggle */}
            {timeRange && (
              <button
                onClick={handleToggleTemporal}
                className={`px-2 py-1 text-xs flex items-center gap-1 rounded transition-colors ${
                  temporalMode ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
                }`}
                title={t('map.temporalMode')}
              >
                <Clock size={12} />
                {t('map.temporal')}
              </button>
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
                const date = new Date().toISOString().slice(0, 10);
                exportMapToCSV(geoElements, `${name}_carte_${date}.csv`);
              }}
              disabled={geoElements.length === 0}
              className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded disabled:opacity-50 disabled:cursor-not-allowed"
              title={t('map.exportCSV')}
            >
              <Download size={16} />
            </button>
          </>
        }
      />

      {/* Temporal slider */}
      {temporalMode && timeRange && (
        <div className="px-4 py-2 border-b border-border-default bg-bg-primary flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleStep('backward')}
              className="p-1 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
              title={t('map.stepBack')}
            >
              <SkipBack size={14} />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`p-1 rounded ${isPlaying ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'}`}
              title={isPlaying ? t('map.pause') : t('map.play')}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button
              onClick={() => handleStep('forward')}
              className="p-1 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
              title={t('map.stepForward')}
            >
              <SkipForward size={14} />
            </button>
            <button
              onClick={() => setTemporalFollowCamera(!temporalFollowCamera)}
              className={`p-1 rounded ${temporalFollowCamera ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'}`}
              title={t('map.followCamera')}
            >
              <Crosshair size={14} />
            </button>
          </div>
          <span className="text-xs text-text-tertiary whitespace-nowrap">{formatDate(timeRange.min)}</span>
          <input
            type="range"
            min="0"
            max={Math.max(0, eventDates.length - 1)}
            value={currentEventIndex}
            onChange={handleSliderChange}
            className="flex-1 h-1.5 bg-bg-tertiary rounded appearance-none cursor-pointer accent-accent"
          />
          <span className="text-xs text-text-tertiary whitespace-nowrap">{formatDate(timeRange.max)}</span>
          <span className="text-[10px] text-text-tertiary whitespace-nowrap">
            {currentEventIndex + 1}/{eventDates.length}
          </span>
          {selectedDate && (
            selectedDate.getFullYear() >= 1 && selectedDate.getFullYear() <= 9999 ? (
              <input
                type="date"
                value={formatDateForInput(selectedDate)}
                onChange={(e) => {
                  const dateStr = e.target.value;
                  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                    const newDate = new Date(dateStr + 'T12:00:00');
                    if (!isNaN(newDate.getTime())) setSelectedDate(newDate);
                  }
                }}
                className="text-xs font-medium text-accent bg-transparent border border-border-default rounded px-2 py-0.5 min-w-28"
              />
            ) : (
              <span className="text-xs font-medium text-accent border border-border-default rounded px-2 py-0.5 whitespace-nowrap">
                {formatDate(selectedDate)}
              </span>
            )
          )}
        </div>
      )}

      {/* Map container */}
      <div ref={mapContainerRef} className="flex-1" style={{ isolation: 'isolate' }} data-report-capture="map" />

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

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function exportMapToCSV(geoElements: { label: string; type?: string; geo: GeoData; visual: { color: string }; tags: string[] }[], filename: string): void {
  const sorted = [...geoElements].sort((a, b) => a.label.localeCompare(b.label));
  const header = 'label,type,latitude,longitude,couleur,tags';
  const rows = sorted.map(el => {
    const c = getGeoCenter(el.geo);
    return [
    escapeCSV(el.label),
    el.type || '',
    c.lat.toFixed(6),
    c.lng.toFixed(6),
    el.visual.color,
    escapeCSV(el.tags.join('; ')),
  ].join(',');
  });
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
