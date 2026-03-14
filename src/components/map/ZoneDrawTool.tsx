import { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { computePolygonCenter, computePolygonAreaKm2, generateCirclePolygon, generateSquarePolygon } from '../../utils/geo';
import type { GeoPolygon } from '../../types';

// MapLibre source/layer IDs for the drawing overlay
const DRAW_SOURCE = 'zone-draw-source';
const DRAW_LINE_LAYER = 'zone-draw-line';
const DRAW_FILL_LAYER = 'zone-draw-fill';
const DRAW_POINTS_LAYER = 'zone-draw-points';

export type ZoneShape = 'polygon' | 'circle' | 'square';

interface ZoneDrawToolProps {
  map: maplibregl.Map | null;
  isDrawing: boolean;
  shape?: ZoneShape;
  onFinish: (geo: GeoPolygon, areaKm2: number) => void;
  onCancel: () => void;
}

/**
 * Manages the polygon/circle/square drawing interaction on a MapLibre map.
 * - polygon: click vertices, close on double-click or first vertex click
 * - circle: 1st click = center, mouse move = radius preview, 2nd click = finalize
 * - square: 1st click = center, mouse move = half-side preview, 2nd click = finalize
 */
export function ZoneDrawTool({ map, isDrawing, shape = 'polygon', onFinish, onCancel }: ZoneDrawToolProps) {
  const verticesRef = useRef<[number, number][]>([]);
  const mousePositionRef = useRef<[number, number] | null>(null);
  const centerRef = useRef<[number, number] | null>(null);
  const tooltipRef = useRef<maplibregl.Popup | null>(null);

  // ── Ensure source & layers exist ──────────────────────────────────
  const ensureLayers = useCallback(() => {
    if (!map) return;
    try {
      if (map.getSource(DRAW_SOURCE)) return;
      map.addSource(DRAW_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: DRAW_FILL_LAYER, type: 'fill', source: DRAW_SOURCE,
        filter: ['==', '$type', 'Polygon'],
        paint: { 'fill-color': '#10b981', 'fill-opacity': 0.15 },
      });
      map.addLayer({
        id: DRAW_LINE_LAYER, type: 'line', source: DRAW_SOURCE,
        filter: ['==', '$type', 'LineString'],
        paint: { 'line-color': '#10b981', 'line-width': 2, 'line-dasharray': [4, 2] },
      });
      map.addLayer({
        id: DRAW_POINTS_LAYER, type: 'circle', source: DRAW_SOURCE,
        filter: ['==', '$type', 'Point'],
        paint: { 'circle-radius': ['case', ['get', 'isFirst'], 7, 5], 'circle-color': '#10b981', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' },
      });
    } catch { /* layers may already exist */ }
  }, [map]);

  // Setup on mount + re-create after style reload
  useEffect(() => {
    if (!map) return;
    if (map.isStyleLoaded()) ensureLayers();
    map.on('style.load', ensureLayers);
    return () => {
      map.off('style.load', ensureLayers);
      try {
        if (map.getLayer(DRAW_POINTS_LAYER)) map.removeLayer(DRAW_POINTS_LAYER);
        if (map.getLayer(DRAW_LINE_LAYER)) map.removeLayer(DRAW_LINE_LAYER);
        if (map.getLayer(DRAW_FILL_LAYER)) map.removeLayer(DRAW_FILL_LAYER);
        if (map.getSource(DRAW_SOURCE)) map.removeSource(DRAW_SOURCE);
      } catch { /* map may already be destroyed */ }
    };
  }, [map, ensureLayers]);

  // ── Compute distance in km between two [lng, lat] points ────────
  const distanceKm = useCallback((a: [number, number], b: [number, number]) => {
    const dLat = b[1] - a[1]; // degrees
    const dLng = b[0] - a[0]; // degrees
    const latRad = (a[1] * Math.PI) / 180;
    const latKm = dLat * 111.32;
    const lngKm = dLng * 111.32 * Math.cos(latRad);
    return Math.sqrt(latKm * latKm + lngKm * lngKm);
  }, []);

  // ── Update the GeoJSON source with current vertices + mouse cursor ─
  const updateSource = useCallback(() => {
    if (!map) return;
    const src = map.getSource(DRAW_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    const features: GeoJSON.Feature[] = [];
    const center = centerRef.current;
    const mouse = mousePositionRef.current;

    if ((shape === 'circle' || shape === 'square') && center) {
      // Show center point
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: center },
        properties: { isFirst: true },
      });

      // Preview shape with mouse position
      if (mouse) {
        const dist = distanceKm(center, mouse);
        const previewCoords = shape === 'circle'
          ? generateCirclePolygon(center, dist)
          : generateSquarePolygon(center, dist);

        // Update tooltip with distance info
        const label = shape === 'circle'
          ? `r = ${dist < 1 ? (dist * 1000).toFixed(0) + ' m' : dist.toFixed(2) + ' km'}`
          : `${dist < 1 ? (dist * 1000).toFixed(0) + ' m' : dist.toFixed(2) + ' km'}`;
        if (!tooltipRef.current) {
          tooltipRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'zone-draw-tooltip', offset: [0, -20] });
          tooltipRef.current.setLngLat(mouse as [number, number]).setHTML(`<span>${label}</span>`).addTo(map);
        } else {
          tooltipRef.current.setLngLat(mouse as [number, number]).setHTML(`<span>${label}</span>`);
        }

        features.push({
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[...previewCoords, previewCoords[0]]],
          },
          properties: {},
        });
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [...previewCoords, previewCoords[0]],
          },
          properties: {},
        });
      }
    } else {
      // Polygon mode: existing behavior
      const verts = verticesRef.current;

      verts.forEach(([lng, lat], i) => {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: { index: i, isFirst: i === 0 },
        });
      });

      const lineCoords = [...verts];
      if (mouse && verts.length > 0) {
        lineCoords.push(mouse);
      }

      if (lineCoords.length >= 2) {
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: lineCoords },
          properties: {},
        });
      }

      if (lineCoords.length >= 3) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[...lineCoords, lineCoords[0]]],
          },
          properties: {},
        });
      }
    }

    src.setData({ type: 'FeatureCollection', features });
  }, [map, shape, distanceKm]);

  // ── Clear drawing state ────────────────────────────────────────────
  const clearDraw = useCallback(() => {
    verticesRef.current = [];
    mousePositionRef.current = null;
    centerRef.current = null;
    if (tooltipRef.current) {
      tooltipRef.current.remove();
      tooltipRef.current = null;
    }
    updateSource();
  }, [updateSource]);

  // ── Finalize the polygon ───────────────────────────────────────────
  const finalize = useCallback((coords?: [number, number][], origin?: 'circle', radiusKm?: number) => {
    const verts = coords || verticesRef.current;
    if (verts.length < 3) {
      clearDraw();
      onCancel();
      return;
    }

    const center = computePolygonCenter(verts);
    const areaKm2 = computePolygonAreaKm2(verts);
    const geo: GeoPolygon = {
      type: 'polygon',
      coordinates: verts,
      center,
      ...(origin ? { shapeOrigin: origin } : {}),
      ...(radiusKm ? { radius: Math.round(radiusKm * 1000) / 1000 } : {}),
    };

    clearDraw();
    onFinish(geo, areaKm2);
  }, [clearDraw, onFinish, onCancel]);

  // ── Drawing interaction handlers ───────────────────────────────────
  useEffect(() => {
    if (!map || !isDrawing) {
      if (map) {
        map.getCanvas().style.cursor = '';
        clearDraw();
      }
      return;
    }

    // Reset drawing state when starting a new draw session
    verticesRef.current = [];
    centerRef.current = null;
    mousePositionRef.current = null;

    // Ensure source & layers exist (may be missing after style reload)
    ensureLayers();

    map.getCanvas().style.cursor = 'crosshair';
    map.doubleClickZoom.disable();

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      if (shape === 'circle' || shape === 'square') {
        if (!centerRef.current) {
          // First click: set center
          centerRef.current = lngLat;
          updateSource();
        } else {
          // Second click: finalize
          const dist = distanceKm(centerRef.current, lngLat);
          if (dist < 0.01) return;
          const coords = shape === 'circle'
            ? generateCirclePolygon(centerRef.current, dist)
            : generateSquarePolygon(centerRef.current, dist);
          finalize(coords, shape === 'circle' ? 'circle' : undefined, shape === 'circle' ? dist : undefined);
        }
        return;
      }

      // Polygon mode
      const verts = verticesRef.current;
      if (verts.length >= 3) {
        const first = verts[0];
        const pixel = map.project(e.lngLat);
        const firstPixel = map.project({ lng: first[0], lat: first[1] });
        const dist = Math.hypot(pixel.x - firstPixel.x, pixel.y - firstPixel.y);
        if (dist < 12) {
          finalize();
          return;
        }
      }
      verts.push(lngLat);
      updateSource();
    };

    const onDblClick = (e: maplibregl.MapMouseEvent) => {
      if (shape !== 'polygon') return;
      e.preventDefault();
      if (verticesRef.current.length > 3) {
        verticesRef.current.pop();
      }
      finalize();
    };

    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      mousePositionRef.current = [e.lngLat.lng, e.lngLat.lat];
      // For circle/square: update preview only after center is set
      if ((shape === 'circle' || shape === 'square') && !centerRef.current) return;
      updateSource();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearDraw();
        onCancel();
      }
    };

    map.on('click', onClick);
    map.on('dblclick', onDblClick);
    map.on('mousemove', onMouseMove);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      map.off('click', onClick);
      map.off('dblclick', onDblClick);
      map.off('mousemove', onMouseMove);
      document.removeEventListener('keydown', onKeyDown);
      map.getCanvas().style.cursor = '';
      map.doubleClickZoom.enable();
    };
  }, [map, isDrawing, shape, updateSource, clearDraw, finalize, onCancel, distanceKm, ensureLayers]);

  return null;
}
