import { useCallback, useEffect, type RefObject } from 'react';
import * as maplibregl from 'maplibre-gl';

import type { useSelectionStore } from '../../stores';
import type { GeoData, Link } from '../../types';
import { safeColor } from '../../utils/escapeHtml';
import { getGeoCenter, isGeoPolygon, closestPointOnPolygon, pointInPolygon } from '../../utils/geo';
import { LINK_LINES_SOURCE, LINK_ARROWS_SOURCE, ensureLinkLayers, ensureArrowImage } from './mapLayers';
import type { ClusterState, MapGeoElement, MapRef, MarkerMapRef } from './mapHookTypes';

type SelectionStore = ReturnType<typeof useSelectionStore.getState>;

export interface MapLinkLayersParams {
  mapRef: MapRef;
  mapLoadedRef: RefObject<boolean>;
  linkLabelMarkersRef: MarkerMapRef<string>;
  selectLinkRef: RefObject<(id: string) => void>;
  clusterStateRef: RefObject<Map<string, ClusterState>>;
  elementIdToFirstMarkerKeyRef: RefObject<Map<string, string>>;
  geoElementById: Map<string, MapGeoElement>;
  geoLinks: Link[];
  effectiveGeoElements: MapGeoElement[];
  effectiveDimmedIds: ReadonlySet<string>;
  clusteringVersion: number;
  anonymousMode: boolean;
  queryFilterActive: boolean;
  queryMatchLinkIds: ReadonlySet<string>;
  showDensity: boolean;
  selectLink: SelectionStore['selectLink'];
}

/**
 * Links on the map: lines and arrows in MapLibre sources, labels as DOM
 * overlays; a link joins the clusters its ends are hidden in.
 * Refs received as parameters are listed in the dependency arrays: stable,
 * they trigger nothing.
 */
export function useMapLinkLayers({
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
}: MapLinkLayersParams) {
  const getVisibleLngLat = useCallback((elementId: string): [number, number] | null => {
    const firstKey = elementIdToFirstMarkerKeyRef.current.get(elementId) ?? elementId;
    const state = clusterStateRef.current.get(firstKey);
    if (state?.clustered && state.clusterCenter) return state.clusterCenter;
    const el = geoElementById.get(elementId);
    if (!el) return null;
    const center = getGeoCenter(el.geo);
    return [center.lng, center.lat];
  }, [geoElementById, clusterStateRef, elementIdToFirstMarkerKeyRef]);

  // Check if two elements are in the same cluster (via their representative marker)
  const areInSameCluster = useCallback((id1: string, id2: string): boolean => {
    const k1 = elementIdToFirstMarkerKeyRef.current.get(id1) ?? id1;
    const k2 = elementIdToFirstMarkerKeyRef.current.get(id2) ?? id2;
    const s1 = clusterStateRef.current.get(k1);
    const s2 = clusterStateRef.current.get(k2);
    if (!s1 || !s2) return false;
    return s1.clustered && s2.clustered && s1.clusterId === s2.clusterId;
  }, [clusterStateRef, elementIdToFirstMarkerKeyRef]);

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

  useEffect(() => { selectLinkRef.current = selectLink; }, [selectLink, selectLinkRef]);

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
  }, [geoLinks, clusteringVersion, getVisibleLngLat, areInSameCluster, calculateAngle, getPointOnLine, anonymousMode, effectiveDimmedIds, effectiveGeoElements, queryFilterActive, queryMatchLinkIds, showDensity, linkLabelMarkersRef, mapLoadedRef, mapRef]);
}
