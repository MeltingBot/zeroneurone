import { useEffect, useCallback, useRef } from 'react';
import type maplibregl from 'maplibre-gl';
import type { Element, ElementId, GeoPolygon } from '../../types';
import { isGeoPolygon } from '../../utils/geo';
import { useDossierStore } from '../../stores';

// MapLibre source/layer IDs for zone polygons
const ZONE_SOURCE = 'zones-source';
const ZONE_FILL_LAYER = 'zones-fill';
const ZONE_OUTLINE_LAYER = 'zones-outline';
const ZONE_EXTRUSION_LAYER = 'zones-extrusion';

interface ZoneLayersProps {
  map: maplibregl.Map | null;
  elements: Element[];
  selectedElementIds: Set<ElementId>;
  dimmedElementIds: Set<ElementId>;
  editingElementId?: ElementId | null;
  /** Ref that is true while a marker drag is in progress — skip store-driven refreshes */
  isDraggingRef?: React.RefObject<boolean>;
  onZoneClick: (elementId: ElementId) => void;
  onZoneDoubleClick?: (elementId: ElementId) => void;
}

/** Resolve CSS variable to computed hex value. MapLibre cannot parse var(). */
export function resolveCssColor(value: string, fallback: string): string {
  if (!value || !value.startsWith('var(')) return value || fallback;
  const varName = value.slice(4, -1).trim(); // "var(--color-node-purple)" → "--color-node-purple"
  const resolved = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return resolved || fallback;
}

/** Build GeoJSON FeatureCollection from polygon elements */
function buildFeatureCollection(
  elements: Element[],
  selectedElementIds: Set<ElementId>,
  dimmedElementIds: Set<ElementId>,
  editingElementId?: ElementId | null,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (const el of elements) {
    if (!el.geo || !isGeoPolygon(el.geo)) continue;
    if (editingElementId && el.id === editingElementId) continue;
    const geo = el.geo as GeoPolygon;
    const isSelected = selectedElementIds.has(el.id);
    const isDimmed = dimmedElementIds.has(el.id);

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[...geo.coordinates, geo.coordinates[0]]], // close ring
      },
      properties: {
        id: el.id,
        color: resolveCssColor(el.visual.color, '#10b981'),
        borderColor: resolveCssColor(el.visual.borderColor, '#059669'),
        isSelected,
        isDimmed,
        altitude: geo.altitude ?? 0,
        extrude: !!(geo.extrude && geo.altitude),
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

/**
 * Renders polygon zones on the MapLibre map using fill + outline layers.
 * The marker already displays the zone label, so no symbol layer is needed.
 */
export function ZoneLayers({ map, elements, selectedElementIds, dimmedElementIds, editingElementId, isDraggingRef, onZoneClick, onZoneDoubleClick }: ZoneLayersProps) {

  // ── Helper to add fill + outline + extrusion layers ────────────────
  const addLayers = useCallback((m: maplibregl.Map) => {
    // Flat fill for all zones (always visible, even extruded ones need a base)
    m.addLayer({
      id: ZONE_FILL_LAYER,
      type: 'fill',
      source: ZONE_SOURCE,
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': [
          'case',
          ['get', 'isDimmed'], 0.05,
          ['get', 'isSelected'], 0.35,
          0.2,
        ],
      },
    });

    // 3D extrusion for zones with extrude: true (may fail on globe projection)
    try {
      m.addLayer({
        id: ZONE_EXTRUSION_LAYER,
        type: 'fill-extrusion',
        source: ZONE_SOURCE,
        filter: ['all', ['==', ['get', 'extrude'], true], ['>', ['get', 'altitude'], 0]],
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': ['*', ['get', 'altitude'], 100],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.4,
        },
      });
    } catch { /* fill-extrusion not supported on globe projection */ }

    // Outline for all zones
    m.addLayer({
      id: ZONE_OUTLINE_LAYER,
      type: 'line',
      source: ZONE_SOURCE,
      paint: {
        'line-color': ['get', 'borderColor'],
        'line-width': ['case', ['get', 'isSelected'], 3, 2],
        'line-opacity': ['case', ['get', 'isDimmed'], 0.3, 1],
      },
    });
  }, []);

  // ── Setup source & layers ──────────────────────────────────────────
  useEffect(() => {
    if (!map) return;

    const setup = () => {
      if (map.getSource(ZONE_SOURCE)) return;
      map.addSource(ZONE_SOURCE, { type: 'geojson', data: buildFeatureCollection(elements, selectedElementIds, dimmedElementIds, editingElementId) });
      addLayers(map);
    };

    if (map.isStyleLoaded()) {
      setup();
    } else {
      map.once('style.load', setup);
    }

    return () => {
      try {
        if (map.getLayer(ZONE_OUTLINE_LAYER)) map.removeLayer(ZONE_OUTLINE_LAYER);
        if (map.getLayer(ZONE_EXTRUSION_LAYER)) map.removeLayer(ZONE_EXTRUSION_LAYER);
        if (map.getLayer(ZONE_FILL_LAYER)) map.removeLayer(ZONE_FILL_LAYER);
        if (map.getSource(ZONE_SOURCE)) map.removeSource(ZONE_SOURCE);
      } catch { /* map may already be destroyed */ }
    };
  }, [map]);

  // ── Keep refs for imperative store subscription ──────────────────
  const selectedRef = useRef(selectedElementIds);
  const dimmedRef = useRef(dimmedElementIds);
  const editingRef = useRef(editingElementId);
  const elementsRef = useRef(elements);
  selectedRef.current = selectedElementIds;
  dimmedRef.current = dimmedElementIds;
  editingRef.current = editingElementId;
  elementsRef.current = elements;

  // ── Update data via imperative store subscription ─────────────────
  // This bypasses React rendering to guarantee MapLibre gets updated
  // immediately when any element visual property changes.
  useEffect(() => {
    if (!map) return;

    const refresh = () => {
      // Skip store-driven refresh while dragging — MapView handles zone source directly
      if (isDraggingRef?.current) return;
      const src = map.getSource(ZONE_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      // Use elements from props (includes draggedPositions and event polygon overrides)
      // Merge with store elements only for visual property updates (color, border, etc.)
      const storeEls = useDossierStore.getState().elements;
      const storeVisualMap = new Map(storeEls.map(e => [e.id, e.visual]));
      const mergedEls = elementsRef.current.map(el => {
        const storeVisual = storeVisualMap.get(el.id);
        return storeVisual ? { ...el, visual: storeVisual } : el;
      });
      const fc = buildFeatureCollection(mergedEls, selectedRef.current, dimmedRef.current, editingRef.current);
      src.setData(fc);
      map.triggerRepaint();
    };

    // Subscribe to ALL store changes (elements array reference changes on any element update)
    const unsub = useDossierStore.subscribe(refresh);

    // Also run on selection/dimmed/editing changes (from props)
    refresh();

    return unsub;
  }, [map, elements, selectedElementIds, dimmedElementIds, editingElementId]);

  // ── Re-add layers after style change (base layer switch) ──────────
  useEffect(() => {
    if (!map) return;
    const onStyleLoad = () => {
      if (!map.getSource(ZONE_SOURCE)) {
        const els = elementsRef.current;
        map.addSource(ZONE_SOURCE, { type: 'geojson', data: buildFeatureCollection(els, selectedRef.current, dimmedRef.current, editingRef.current) });
        addLayers(map);
      }
    };
    map.on('style.load', onStyleLoad);
    return () => { map.off('style.load', onStyleLoad); };
  }, [map, addLayers]);

  // ── Click handler on zone fill ─────────────────────────────────────
  useEffect(() => {
    if (!map) return;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, { layers: [ZONE_FILL_LAYER] });
      if (features.length > 0) {
        const id = features[0].properties?.id;
        if (id) {
          e.preventDefault();
          onZoneClick(id as ElementId);
        }
      }
    };

    // Use the map-level dblclick to check zone hit and prevent zoom
    const onDblClick = (e: maplibregl.MapMouseEvent) => {
      if (!onZoneDoubleClick) return;
      const features = map.queryRenderedFeatures(e.point, { layers: [ZONE_FILL_LAYER] });
      if (features.length > 0) {
        const id = features[0].properties?.id;
        if (id) {
          e.preventDefault(); // prevents default map dblclick zoom
          onZoneDoubleClick(id as ElementId);
        }
      }
    };


    const onMouseEnter = () => { map.getCanvas().style.cursor = 'pointer'; };
    const onMouseLeave = () => { map.getCanvas().style.cursor = ''; };

    map.on('click', ZONE_FILL_LAYER, onClick);
    map.on('dblclick', ZONE_FILL_LAYER, onDblClick);
    map.on('mouseenter', ZONE_FILL_LAYER, onMouseEnter);
    map.on('mouseleave', ZONE_FILL_LAYER, onMouseLeave);

    return () => {
      map.off('click', ZONE_FILL_LAYER, onClick);
      map.off('dblclick', ZONE_FILL_LAYER, onDblClick);
      map.off('mouseenter', ZONE_FILL_LAYER, onMouseEnter);
      map.off('mouseleave', ZONE_FILL_LAYER, onMouseLeave);
    };
  }, [map, onZoneClick, onZoneDoubleClick]);

  return null;
}
