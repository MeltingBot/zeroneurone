import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Supercluster from 'supercluster';
import { useDossierStore, useSelectionStore, useUIStore, useViewStore, useInsightsStore, useTabStore } from '../../stores';
import { useHistoryStore } from '../../stores/historyStore';
import { getDimmedElementIds, getNeighborIds } from '../../utils/filterUtils';
import { toPng } from 'html-to-image';
import type { Element } from '../../types';
import { MapPin, Clock, Play, Pause, SkipBack, SkipForward, Download, Globe, Map as MapIcon, Search, Building } from 'lucide-react';
import { ViewToolbar } from '../common/ViewToolbar';

// Element with geo coordinates (resolved for a specific time)
interface ResolvedGeoElement {
  element: Element;
  geo: { lat: number; lng: number };
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
  osmLatin: {
    tiles: ['https://a.tile.openstreetmap.de/{z}/{x}/{y}.png', 'https://b.tile.openstreetmap.de/{z}/{x}/{y}.png', 'https://c.tile.openstreetmap.de/{z}/{x}/{y}.png'],
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
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
  { id: 'osm', label: 'OpenStreetMap' },
  { id: 'osmLatin', label: 'OSM Latin' },
  { id: 'carto', label: 'CartoDB' },
  { id: 'satellite', label: 'Satellite' },
];

function resolveLayerId(id: string, isDark: boolean): string {
  if (id === 'carto') return isDark ? 'cartoDark' : 'cartoLight';
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
        'fill-extrusion-opacity': 0.7,
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

  // Track active base layer
  const [activeBaseLayer, setActiveBaseLayer] = useState('osmLatin');
  // 3D mode (globe + pitch + terrain)
  const [is3D, setIs3D] = useState(true);
  const [show3DBuildings, setShow3DBuildings] = useState(true);
  const show3DBuildingsRef = useRef(true);
  useEffect(() => { show3DBuildingsRef.current = show3DBuildings; }, [show3DBuildings]);
  const is3DRef = useRef(true);
  useEffect(() => { is3DRef.current = is3D; }, [is3D]);

  // Track manually dragged positions
  const [draggedPositions, setDraggedPositions] = useState<Map<string, { lat: number; lng: number }>>(new Map());

  // Temporal mode state
  const [temporalMode, setTemporalMode] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const { elements, links, assets, comments, updateElement, currentDossier } = useDossierStore();
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
  const toNoonLocal = useCallback((d: Date | string | number): Date => {
    const date = new Date(d);
    date.setHours(12, 0, 0, 0);
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
    const uniqueTimestamps = [...new Set(allDates.map((d) => toNoonLocal(d).getTime()))].sort((a, b) => a - b);
    const sortedDates = uniqueTimestamps.map((t) => new Date(t));
    return {
      timeRange: { min: sortedDates[0], max: sortedDates[sortedDates.length - 1] },
      eventDates: sortedDates,
    };
  }, [elements, links, toNoonLocal]);

  // Get position for an element at a specific time
  const getPositionAtTime = useCallback(
    (element: Element, date: Date | null): { geo: { lat: number; lng: number }; label?: string } | null => {
      if (!date || !temporalMode) {
        if (element.geo) return { geo: element.geo };
        const geoEvents = (element.events || [])
          .filter((e) => e.geo && e.date)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        if (geoEvents.length > 0) {
          const mostRecent = geoEvents[geoEvents.length - 1];
          return { geo: { lat: mostRecent.geo!.lat, lng: mostRecent.geo!.lng }, label: mostRecent.label };
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
        const eventGeo = activeEvent.geo || element.geo;
        if (eventGeo) return { geo: { lat: eventGeo.lat, lng: eventGeo.lng }, label: activeEvent.label };
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
        return element.geo ? { geo: element.geo } : null;
      }
      return null;
    },
    [temporalMode, dayStart]
  );

  // Get any geo position for an element (for link-pulled visibility)
  const getAnyGeoPosition = useCallback(
    (element: Element): { geo: { lat: number; lng: number }; label?: string } | null => {
      if (element.geo) return { geo: element.geo };
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
          return { geo: { lat: closest.geo!.lat, lng: closest.geo!.lng }, label: closest.label };
        }
        const mostRecent = geoEvents[geoEvents.length - 1];
        return { geo: { lat: mostRecent.geo!.lat, lng: mostRecent.geo!.lng }, label: mostRecent.label };
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
          result.push({ element: el, geo: position.geo, fromEvent: !!position.label, eventLabel: position.label });
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
          result.push({ element: el, geo: position.geo, fromEvent: !!position.label, eventLabel: position.label });
        }
      }
    });
    return result;
  }, [elements, selectedDate, getPositionAtTime, getAnyGeoPosition, hiddenElementIds, temporalMode, isVisibleViaLink, dayStart, activeTabId, tabMemberSet, tabGhostIds]);

  // Legacy geoElements for compatibility
  const geoElements = useMemo(() => {
    return resolvedGeoElements.map((r) => ({ ...r.element, geo: r.geo }));
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
      : truncatedLabel;
    const selectedStyle = isSelected
      ? 'box-shadow: 0 0 0 2px var(--color-accent, #e07a5f), 0 2px 6px rgba(0,0,0,0.3);'
      : 'box-shadow: 0 1px 4px rgba(0,0,0,0.2);';
    const dimmedStyle = isDimmed ? 'opacity: 0.3;' : '';
    const commentBadge = showCommentBadges && unresolvedCommentCount && unresolvedCommentCount > 0
      ? `<div style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;background-color:#f59e0b;color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;box-shadow:0 1px 3px rgba(0,0,0,0.3);z-index:10;">${unresolvedCommentCount}</div>`
      : '';

    if (thumbnail) {
      const blurStyle = hideMedia ? 'filter: blur(8px);' : '';
      return `
        <div class="map-marker-card" style="position:relative;background:var(--color-bg-primary, #ffffff);border:1px solid ${isSelected ? 'var(--color-accent, #e07a5f)' : borderColor};border-radius:4px;overflow:visible;${selectedStyle}${dimmedStyle}width:48px;">
          ${commentBadge}
          <div style="width:48px;height:36px;background-image:url(${thumbnail});background-size:cover;background-position:center;background-color:var(--color-bg-secondary, #f7f4ef);border-radius:4px 4px 0 0;${blurStyle}"></div>
          <div style="padding:2px 3px;background:var(--color-bg-primary, #ffffff);border-top:1px solid var(--color-border-default, #e8e3db);">
            <span style="font-size:9px;font-weight:500;color:var(--color-text-primary, #3d3833);display:block;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${displayLabel}</span>
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

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: buildMapStyle(resolveLayerId('osmLatin', themeMode === 'dark'), true),
      center: [1.888334, 46.603354], // Center of France [lng, lat]
      zoom: 6,
      pitch: 45,
      maxPitch: 70,
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
      map.setProjection({ type: 'globe' });
      map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 });
      add3DBuildingsLayer(map);
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
    map.setStyle(buildMapStyle(resolveLayerId(activeBaseLayer, themeMode === 'dark'), is3DRef.current));
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
  }, [activeBaseLayer, themeMode]);

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
    } else {
      map.setTerrain(null as unknown as maplibregl.TerrainSpecification);
      map.setProjection({ type: 'mercator' });
      map.easeTo({ pitch: 0, duration: 600 });
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
  const dragStartGeoRef = useRef<{ id: string; geo: { lat: number; lng: number } } | null>(null);

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
    return geoElements.map((element) => {
      const draggedPos = draggedPositions.get(element.id);
      if (draggedPos) return { ...element, geo: draggedPos };
      return element;
    });
  }, [geoElements, draggedPositions]);

  // Rebuild Supercluster and update markers
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const zoom = Math.floor(map.getZoom());

    // Build supercluster index
    const sc = new Supercluster<{ elementId: string }>({
      radius: 50,
      maxZoom: 18,
    });

    const points: PointFeature[] = effectiveGeoElements.map(el => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [el.geo.lng, el.geo.lat] },
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
      unclusteredElements.map(el => ({ id: el.id, lng: el.geo.lng, lat: el.geo.lat })),
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
      const lng = element.geo.lng + (offset ? offset[0] : 0);
      const lat = element.geo.lat + (offset ? offset[1] : 0);

      if (existingMarker) {
        // Update position
        existingMarker.setLngLat([lng, lat]);
        // Update visibility (hide if clustered)
        const el = existingMarker.getElement();
        el.style.display = isClustered ? 'none' : '';
        el.innerHTML = createMarkerHtml(element, isSelected, isDimmed, commentCount);
        el.setAttribute('title', anonymousMode ? '' : (element.label || ''));
      } else {
        // Create new marker
        const markerEl = createMarkerElement(element, isSelected, isDimmed, commentCount);
        markerEl.style.display = isClustered ? 'none' : '';
        markerEl.setAttribute('title', anonymousMode ? '' : (element.label || ''));

        const marker = new maplibregl.Marker({ element: markerEl, anchor: 'bottom', draggable: true })
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
          const pos = marker.getLngLat();
          dragStartGeoRef.current = { id: markerId, geo: { lat: pos.lat, lng: pos.lng } };
        });
        marker.on('dragend', () => {
          const newPos = marker.getLngLat();
          const newGeo = { lat: newPos.lat, lng: newPos.lng };
          const dragStart = dragStartGeoRef.current;
          const oldGeo = dragStart?.id === markerId ? dragStart.geo : null;

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

  }, [effectiveGeoElements, selectedElementIds, effectiveDimmedIds, unresolvedCommentCounts, createMarkerHtml, createMarkerElement, selectElement, updateElement, pushAction, anonymousMode, hideMedia, clusteringVersion]);

  // Get visible position for an element (considering clustering)
  const getVisibleLngLat = useCallback((elementId: string): [number, number] | null => {
    const state = clusterStateRef.current.get(elementId);
    if (!state) return null;
    if (state.clustered && state.clusterCenter) return state.clusterCenter;
    const el = effectiveGeoElements.find(e => e.id === elementId);
    if (!el) return null;
    return [el.geo.lng, el.geo.lat];
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

    // Add or update link layers
    geoLinks.forEach((link) => {
      const fromLngLat = getVisibleLngLat(link.fromId);
      const toLngLat = getVisibleLngLat(link.toId);
      if (!fromLngLat || !toLngLat) return;

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
  }, [geoLinks, selectLink, clusteringVersion, getVisibleLngLat, areInSameCluster, calculateAngle, createArrowElement, getPointOnLine, anonymousMode, effectiveDimmedIds]);

  // Fit map to markers
  const handleFit = useCallback(() => {
    if (!mapRef.current || geoElements.length === 0) return;
    const coords = geoElements.map(el => [el.geo.lng, el.geo.lat] as [number, number]);
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
      mapRef.current.flyTo({ center: [selectedGeoElements[0].geo.lng, selectedGeoElements[0].geo.lat], zoom: 14 });
    } else {
      const coords = selectedGeoElements.map(el => [el.geo.lng, el.geo.lat] as [number, number]);
      const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
      mapRef.current.fitBounds(bounds, { padding: 50 });
    }
  }, [geoElements, selectedElementIds]);

  // Register capture handler for report screenshots
  useEffect(() => {
    const captureHandler = async (): Promise<string | null> => {
      if (!mapRef.current) return null;

      // Fit bounds
      if (geoElements.length > 0) {
        const coords = geoElements.map(el => [el.geo.lng, el.geo.lat] as [number, number]);
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

  // Format date for display
  const formatDate = (date: Date) => {
    return date.toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-US', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
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

  // Play animation
  useEffect(() => {
    if (!isPlaying || eventDates.length === 0) return;
    const interval = setInterval(() => {
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
    }, 800);
    return () => clearInterval(interval);
  }, [isPlaying, eventDates]);

  // No geo elements — show empty state
  if (geoElements.length === 0 && !temporalMode) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-bg-secondary">
        <MapPin size={48} className="text-text-tertiary mb-4" />
        <p className="text-sm text-text-secondary">{t('map.noGeoElements')}</p>
        <p className="text-xs text-text-tertiary mt-2">{t('map.addLocation')}</p>
      </div>
    );
  }

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
    <div className="h-full flex flex-col bg-bg-secondary">
      {/* Toolbar */}
      <ViewToolbar
        leftContent={
          <span className="text-xs text-text-secondary">
            {t('map.elementsLocated', { count: geoElements.length })}
            {geoLinks.length > 0 && (
              <span className="ml-2 text-text-tertiary">{t('map.linksCount', { count: geoLinks.length })}</span>
            )}
          </span>
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
            {is3D && (
              <button
                onClick={() => setShow3DBuildings(v => !v)}
                className={`px-2 h-6 text-[10px] flex items-center gap-1 border border-border-default rounded mr-2 ${show3DBuildings ? 'bg-accent text-white' : 'text-text-secondary hover:bg-bg-tertiary'}`}
                title={t('map.toggle3DBuildings')}
              >
                <Building size={11} />
                {t('map.buildings')}
              </button>
            )}

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
              <button
                onClick={handleZoomToSelected}
                className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
                title={t('map.zoomToSelection')}
              >
                {t('map.selection')}
              </button>
            )}
            <button
              onClick={handleFit}
              className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
              title={t('map.fitAll')}
            >
              {t('map.fit')}
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
            <input
              type="date"
              value={selectedDate.toISOString().split('T')[0]}
              onChange={(e) => {
                const dateStr = e.target.value;
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                  const newDate = new Date(dateStr + 'T12:00:00');
                  if (!isNaN(newDate.getTime())) setSelectedDate(newDate);
                }
              }}
              className="text-xs font-medium text-accent bg-transparent border border-border-default rounded px-2 py-0.5 min-w-28"
            />
          )}
        </div>
      )}

      {/* Map container */}
      <div ref={mapContainerRef} className="flex-1" style={{ isolation: 'isolate' }} data-report-capture="map" />

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

function exportMapToCSV(geoElements: { label: string; type?: string; geo: { lat: number; lng: number }; visual: { color: string }; tags: string[] }[], filename: string): void {
  const sorted = [...geoElements].sort((a, b) => a.label.localeCompare(b.label));
  const header = 'label,type,latitude,longitude,couleur,tags';
  const rows = sorted.map(el => [
    escapeCSV(el.label),
    el.type || '',
    el.geo.lat.toFixed(6),
    el.geo.lng.toFixed(6),
    el.visual.color,
    escapeCSV(el.tags.join('; ')),
  ].join(','));
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
