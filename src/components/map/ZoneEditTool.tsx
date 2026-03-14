import { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { computePolygonCenter, generateCirclePolygon } from '../../utils/geo';
import type { ElementId } from '../../types';

// MapLibre source/layer IDs for the edit overlay
const EDIT_SOURCE = 'zone-edit-source';
const EDIT_FILL_LAYER = 'zone-edit-fill';
const EDIT_LINE_LAYER = 'zone-edit-line';
const EDIT_POINTS_LAYER = 'zone-edit-points';
const EDIT_MIDPOINTS_LAYER = 'zone-edit-midpoints';

interface ZoneEditToolProps {
  map: maplibregl.Map | null;
  elementId: ElementId | null;
  coordinates: [number, number][];
  color?: string;
  borderColor?: string;
  shapeOrigin?: 'circle';
  onSave: (newCoordinates: [number, number][]) => void;
  onCancel: () => void;
}

/**
 * Manages polygon vertex editing on a MapLibre map.
 * - For regular polygons: drag vertices, insert via midpoints, delete via right-click
 * - For circle/square shapes: drag handle to resize uniformly
 */
export function ZoneEditTool({ map, elementId, coordinates, color: rawColor = '#10b981', borderColor: rawBorderColor = '#059669', shapeOrigin, onSave, onCancel }: ZoneEditToolProps) {
  const color = rawColor.startsWith('var(')
    ? (getComputedStyle(document.documentElement).getPropertyValue(rawColor.slice(4, -1).trim()).trim() || '#10b981')
    : rawColor;
  const borderColor = rawBorderColor.startsWith('var(')
    ? (getComputedStyle(document.documentElement).getPropertyValue(rawBorderColor.slice(4, -1).trim()).trim() || '#059669')
    : rawBorderColor;
  const verticesRef = useRef<[number, number][]>([]);
  const originalRef = useRef<[number, number][]>([]);
  const draggingIndexRef = useRef<number | null>(null);
  // For resize mode (circle/square)
  const resizeDragging = useRef(false);
  const resizeCenterRef = useRef<[number, number] | null>(null);
  const tooltipRef = useRef<maplibregl.Popup | null>(null);

  // ── Ensure source & layers exist ──────────────────────────────────
  const ensureLayers = useCallback(() => {
    if (!map) return;
    try {
      if (map.getSource(EDIT_SOURCE)) return;
      map.addSource(EDIT_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: EDIT_FILL_LAYER, type: 'fill', source: EDIT_SOURCE,
        filter: ['==', '$type', 'Polygon'],
        paint: { 'fill-color': '#10b981', 'fill-opacity': 0.15 },
      });
      map.addLayer({
        id: EDIT_LINE_LAYER, type: 'line', source: EDIT_SOURCE,
        filter: ['all', ['==', '$type', 'LineString']],
        paint: { 'line-color': '#10b981', 'line-width': 2, 'line-dasharray': [4, 2] },
      });
      map.addLayer({
        id: EDIT_MIDPOINTS_LAYER, type: 'circle', source: EDIT_SOURCE,
        filter: ['all', ['==', '$type', 'Point'], ['==', 'isMidpoint', true]],
        paint: { 'circle-radius': 4, 'circle-color': '#10b981', 'circle-opacity': 0.5, 'circle-stroke-width': 1.5, 'circle-stroke-color': '#ffffff' },
      });
      map.addLayer({
        id: EDIT_POINTS_LAYER, type: 'circle', source: EDIT_SOURCE,
        filter: ['all', ['==', '$type', 'Point'], ['==', 'isVertex', true]],
        paint: { 'circle-radius': 6, 'circle-color': '#10b981', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' },
      });
    } catch { /* layers may already exist */ }
  }, [map]);

  useEffect(() => {
    if (!map) return;
    if (map.isStyleLoaded()) ensureLayers();
    map.on('style.load', ensureLayers);
    return () => {
      map.off('style.load', ensureLayers);
      try {
        if (map.getLayer(EDIT_POINTS_LAYER)) map.removeLayer(EDIT_POINTS_LAYER);
        if (map.getLayer(EDIT_MIDPOINTS_LAYER)) map.removeLayer(EDIT_MIDPOINTS_LAYER);
        if (map.getLayer(EDIT_LINE_LAYER)) map.removeLayer(EDIT_LINE_LAYER);
        if (map.getLayer(EDIT_FILL_LAYER)) map.removeLayer(EDIT_FILL_LAYER);
        if (map.getSource(EDIT_SOURCE)) map.removeSource(EDIT_SOURCE);
      } catch { /* map may already be destroyed */ }
    };
  }, [map, ensureLayers]);

  // ── Update paint colors when element changes ──────────────────────
  useEffect(() => {
    if (!map) return;
    try {
      if (map.getLayer(EDIT_FILL_LAYER)) map.setPaintProperty(EDIT_FILL_LAYER, 'fill-color', color);
      if (map.getLayer(EDIT_LINE_LAYER)) map.setPaintProperty(EDIT_LINE_LAYER, 'line-color', borderColor);
      if (map.getLayer(EDIT_MIDPOINTS_LAYER)) map.setPaintProperty(EDIT_MIDPOINTS_LAYER, 'circle-color', color);
      if (map.getLayer(EDIT_POINTS_LAYER)) map.setPaintProperty(EDIT_POINTS_LAYER, 'circle-color', color);
    } catch { /* layers may not exist yet */ }
  }, [map, color, borderColor]);

  // ── Distance in km ────────────────────────────────────────────────
  const distanceKm = useCallback((a: [number, number], b: [number, number]) => {
    const dLat = b[1] - a[1];
    const dLng = b[0] - a[0];
    const latRad = (a[1] * Math.PI) / 180;
    const latKm = dLat * 111.32;
    const lngKm = dLng * 111.32 * Math.cos(latRad);
    return Math.sqrt(latKm * latKm + lngKm * lngKm);
  }, []);

  // ── Update GeoJSON source ─────────────────────────────────────────
  const updateSource = useCallback(() => {
    if (!map) return;
    const src = map.getSource(EDIT_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    const verts = verticesRef.current;
    const features: GeoJSON.Feature[] = [];

    if (shapeOrigin) {
      // Resize mode: show shape + 4 cardinal handles
      if (verts.length >= 3) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[...verts, verts[0]]] },
          properties: {},
        });
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [...verts, verts[0]] },
          properties: {},
        });
      }

      // Show handles at N, E, S, W cardinal points on perimeter
      if (verts.length >= 4 && resizeCenterRef.current) {
        const center = resizeCenterRef.current;
        // Find the vertex closest to each cardinal direction
        const cardinals = [0, 90, 180, 270]; // E, N, W, S in degrees
        for (const angle of cardinals) {
          const rad = (angle * Math.PI) / 180;
          const dirLng = Math.cos(rad);
          const dirLat = Math.sin(rad);
          let bestIdx = 0;
          let bestDot = -Infinity;
          for (let i = 0; i < verts.length; i++) {
            const dx = verts[i][0] - center[0];
            const dy = verts[i][1] - center[1];
            const dot = dx * dirLng + dy * dirLat;
            if (dot > bestDot) { bestDot = dot; bestIdx = i; }
          }
          features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: verts[bestIdx] },
            properties: { index: bestIdx, isVertex: true, isMidpoint: false },
          });
        }
        // Center point marker
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: center },
          properties: { isVertex: false, isMidpoint: true },
        });
      }
    } else {
      // Vertex edit mode (original behavior)
      verts.forEach(([lng, lat], i) => {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: { index: i, isVertex: true, isMidpoint: false },
        });
      });

      for (let i = 0; i < verts.length; i++) {
        const a = verts[i];
        const b = verts[(i + 1) % verts.length];
        const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: mid },
          properties: { insertAfter: i, isVertex: false, isMidpoint: true },
        });
      }

      if (verts.length >= 2) {
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [...verts, verts[0]] },
          properties: {},
        });
      }

      if (verts.length >= 3) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[...verts, verts[0]]] },
          properties: {},
        });
      }
    }

    src.setData({ type: 'FeatureCollection', features });
  }, [map, shapeOrigin]);

  // ── Load coordinates when editing starts ──────────────────────────
  useEffect(() => {
    if (coordinates.length === 0) {
      verticesRef.current = [];
      originalRef.current = [];
      resizeCenterRef.current = null;
      updateSource();
      return;
    }
    verticesRef.current = coordinates.map(c => [...c] as [number, number]);
    originalRef.current = coordinates.map(c => [...c] as [number, number]);
    if (shapeOrigin) {
      const center = computePolygonCenter(coordinates);
      resizeCenterRef.current = [center.lng, center.lat];
    }
    updateSource();
  }, [elementId, coordinates, updateSource, shapeOrigin]);

  // ── Remove tooltip helper ─────────────────────────────────────────
  const removeTooltip = useCallback(() => {
    if (tooltipRef.current) {
      tooltipRef.current.remove();
      tooltipRef.current = null;
    }
  }, []);

  // ── Interaction handlers ──────────────────────────────────────────
  useEffect(() => {
    if (!map || coordinates.length === 0) {
      if (map) map.getCanvas().style.cursor = '';
      return;
    }

    // Ensure layers exist before starting edit
    ensureLayers();

    map.getCanvas().style.cursor = 'default';
    map.doubleClickZoom.disable();
    const disableDrag = () => map.dragPan.disable();
    const enableDrag = () => map.dragPan.enable();

    // Safe query helper — returns [] if layer doesn't exist
    const queryFeatures = (point: maplibregl.PointLike, layers: string[]) => {
      try { return map.queryRenderedFeatures(point, { layers }); }
      catch { return []; }
    };

    if (shapeOrigin) {
      // ── RESIZE MODE ─────────────────────────────────────────────
      const onMouseDown = (e: maplibregl.MapMouseEvent) => {
        if (e.originalEvent.button === 2) return;
        const hitVertex = queryFeatures(e.point, [EDIT_POINTS_LAYER]);
        if (hitVertex.length > 0) {
          e.preventDefault();
          resizeDragging.current = true;
          disableDrag();
          map.getCanvas().style.cursor = 'grabbing';
        }
      };

      const onMouseMove = (e: maplibregl.MapMouseEvent) => {
        if (!resizeDragging.current || !resizeCenterRef.current) {
          const hitVertex = queryFeatures(e.point, [EDIT_POINTS_LAYER]);
          map.getCanvas().style.cursor = hitVertex.length > 0 ? 'grab' : 'default';
          return;
        }

        const mouse: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        const dist = distanceKm(resizeCenterRef.current, mouse);
        if (dist < 0.01) return;

        const newCoords = generateCirclePolygon(resizeCenterRef.current, dist);
        verticesRef.current = newCoords;
        updateSource();

        // Update tooltip
        const label = dist < 1
          ? `${(dist * 1000).toFixed(0)} m`
          : `${dist.toFixed(2)} km`;
        if (!tooltipRef.current) {
          tooltipRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'zone-draw-tooltip', offset: [0, -20] });
          tooltipRef.current.setLngLat(mouse).setHTML(`<span>${label}</span>`).addTo(map);
        } else {
          tooltipRef.current.setLngLat(mouse).setHTML(`<span>${label}</span>`);
        }
      };

      const onMouseUp = () => {
        if (resizeDragging.current) {
          resizeDragging.current = false;
          enableDrag();
          map.getCanvas().style.cursor = 'default';
          removeTooltip();
        }
      };

      const onClick = (e: maplibregl.MapMouseEvent) => {
        const hitVertex = queryFeatures(e.point, [EDIT_POINTS_LAYER]);
        if (hitVertex.length > 0) return;
        const hitFill = queryFeatures(e.point, [EDIT_FILL_LAYER]);
        if (hitFill.length > 0) return;
        removeTooltip();
        onSave(verticesRef.current);
      };

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          removeTooltip();
          onCancel();
        }
      };

      map.on('mousedown', onMouseDown);
      map.on('mousemove', onMouseMove);
      map.on('mouseup', onMouseUp);
      map.on('click', onClick);
      document.addEventListener('keydown', onKeyDown);

      return () => {
        map.off('mousedown', onMouseDown);
        map.off('mousemove', onMouseMove);
        map.off('mouseup', onMouseUp);
        map.off('click', onClick);
        document.removeEventListener('keydown', onKeyDown);
        map.getCanvas().style.cursor = '';
        enableDrag();
        map.doubleClickZoom.enable();
        removeTooltip();
      };
    }

    // ── VERTEX EDIT MODE (original) ─────────────────────────────────
    const onMouseDown = (e: maplibregl.MapMouseEvent) => {
      if (e.originalEvent.button === 2) return;
      const vertexFeatures = queryFeatures(e.point, [EDIT_POINTS_LAYER]);
      if (vertexFeatures.length > 0) {
        const idx = vertexFeatures[0].properties?.index;
        if (typeof idx === 'number') {
          e.preventDefault();
          draggingIndexRef.current = idx;
          disableDrag();
          map.getCanvas().style.cursor = 'grabbing';
          return;
        }
      }

      const midFeatures = queryFeatures(e.point, [EDIT_MIDPOINTS_LAYER]);
      if (midFeatures.length > 0) {
        const insertAfter = midFeatures[0].properties?.insertAfter;
        if (typeof insertAfter === 'number') {
          e.preventDefault();
          const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
          verticesRef.current.splice(insertAfter + 1, 0, lngLat);
          draggingIndexRef.current = insertAfter + 1;
          disableDrag();
          map.getCanvas().style.cursor = 'grabbing';
          updateSource();
          return;
        }
      }
    };

    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (draggingIndexRef.current !== null) {
        const idx = draggingIndexRef.current;
        verticesRef.current[idx] = [e.lngLat.lng, e.lngLat.lat];
        updateSource();
        return;
      }

      const vertexHit = queryFeatures(e.point, [EDIT_POINTS_LAYER]);
      if (vertexHit.length > 0) { map.getCanvas().style.cursor = 'grab'; return; }
      const midHit = queryFeatures(e.point, [EDIT_MIDPOINTS_LAYER]);
      if (midHit.length > 0) { map.getCanvas().style.cursor = 'crosshair'; return; }
      map.getCanvas().style.cursor = 'default';
    };

    const onMouseUp = () => {
      if (draggingIndexRef.current !== null) {
        draggingIndexRef.current = null;
        enableDrag();
        map.getCanvas().style.cursor = 'default';
      }
    };

    const onContextMenu = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      e.originalEvent.preventDefault();
      if (verticesRef.current.length <= 3) return;
      const verts = verticesRef.current;
      let closestIdx = -1;
      let closestDist = Infinity;
      for (let i = 0; i < verts.length; i++) {
        const px = map.project({ lng: verts[i][0], lat: verts[i][1] });
        const d = Math.hypot(px.x - e.point.x, px.y - e.point.y);
        if (d < closestDist) { closestDist = d; closestIdx = i; }
      }
      if (closestIdx >= 0 && closestDist < 15) {
        verts.splice(closestIdx, 1);
        updateSource();
      }
    };

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const hitVertex = queryFeatures(e.point, [EDIT_POINTS_LAYER]);
      const hitMid = queryFeatures(e.point, [EDIT_MIDPOINTS_LAYER]);
      if (hitVertex.length > 0 || hitMid.length > 0) return;
      const hitFill = queryFeatures(e.point, [EDIT_FILL_LAYER]);
      if (hitFill.length > 0) return;
      onSave(verticesRef.current);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };

    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
    map.on('contextmenu', onContextMenu);
    map.on('click', onClick);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      map.off('contextmenu', onContextMenu);
      map.off('click', onClick);
      document.removeEventListener('keydown', onKeyDown);
      map.getCanvas().style.cursor = '';
      enableDrag();
      map.doubleClickZoom.enable();
    };
  }, [map, coordinates.length, updateSource, onSave, onCancel, shapeOrigin, distanceKm, removeTooltip, ensureLayers]);

  return null;
}
