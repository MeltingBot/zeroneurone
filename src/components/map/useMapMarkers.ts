import { useCallback, useEffect, useMemo, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { TFunction } from 'i18next';
import * as maplibregl from 'maplibre-gl';
import Supercluster from 'supercluster';

import { useDossierStore, useSelectionStore } from '../../stores';
import type { useHistoryStore } from '../../stores/historyStore';
import type { Element, GeoData } from '../../types';
import { escapeHtml, safeColor, safeDataImageUrl } from '../../utils/escapeHtml';
import { getGeoCenter, isGeoPolygon } from '../../utils/geo';
import type { TemporalEventSummary } from '../../utils/temporalUtils';
import { resolveCssColor } from './ZoneLayers';
import { breadcrumbSize, computeSpiderfyOffsets, spreadAround } from './mapGeometry';
import type { ClusterMeta, ClusterState, EventPopoverHandlers, MapGeoElement, MapRef, MarkerMapRef } from './mapHookTypes';

type DossierStore = ReturnType<typeof useDossierStore.getState>;
type SelectionStore = ReturnType<typeof useSelectionStore.getState>;
type HistoryStore = ReturnType<typeof useHistoryStore.getState>;

// Supercluster point feature
interface PointFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { elementId: string; markerKey: string };
}

export interface MapMarkersParams {
  mapRef: MapRef;
  markersRef: MarkerMapRef<string>;
  clusterMarkersRef: MarkerMapRef<number>;
  offMapMarkersRef: MarkerMapRef<string>;
  markerOffsetsRef: RefObject<Map<string, [number, number]>>;
  superclusterRef: RefObject<Supercluster<{ elementId: string }, Supercluster.AnyProps> | null>;
  clusterStateRef: RefObject<Map<string, ClusterState>>;
  elementIdToFirstMarkerKeyRef: RefObject<Map<string, string>>;
  clusterMetaRef: RefObject<Map<number, ClusterMeta>>;
  forceSpiderfyKeysRef: RefObject<Set<string>>;
  toggleOffMapRef: RefObject<(elementId: string) => void>;
  /** Right-click on an element marker: its menu at the pointer */
  openElementMenuRef: RefObject<(elementId: string, x: number, y: number) => void>;
  eventPopoverHandlersRef: RefObject<EventPopoverHandlers>;
  dragStartGeoRef: RefObject<{ id: string; geo: GeoData } | null>;
  isDraggingRef: RefObject<boolean>;
  effectiveGeoElementsRef: RefObject<MapGeoElement[]>;
  effectiveGeoElements: MapGeoElement[];
  selectedElementIds: ReadonlySet<string>;
  effectiveDimmedIds: ReadonlySet<string>;
  assetMap: Map<string, string | null>;
  unresolvedCommentCounts: Map<string, number>;
  temporalEventSummaries: Map<string, TemporalEventSummary>;
  offMapNeighbors: Map<string, Element[]>;
  offMapExpanded: Set<string>;
  setOffMapExpanded: Dispatch<SetStateAction<Set<string>>>;
  editingZoneId: string | null;
  eventZoneIds: ReadonlySet<string>;
  showDensity: boolean;
  anonymousMode: boolean;
  hideMedia: boolean;
  showCommentBadges: boolean;
  clusteringVersion: number;
  setClusteringVersion: Dispatch<SetStateAction<number>>;
  setDraggedPositions: Dispatch<SetStateAction<Map<string, GeoData>>>;
  selectElement: SelectionStore['selectElement'];
  setFocusedEventId: SelectionStore['setFocusedEventId'];
  updateElement: DossierStore['updateElement'];
  pushAction: HistoryStore['pushAction'];
  t: TFunction<'pages'>;
}

/**
 * Element and cluster markers (DOM overlays on MapLibre), their clicks and
 * drags, and the unlocated neighbours unfolded around a marker.
 * Refs and setters received as parameters are listed in the dependency
 * arrays: stable, they trigger nothing.
 */
export function useMapMarkers({
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
}: MapMarkersParams) {
  const getThumbnail = useCallback((element: Element): string | null => {
    const firstAssetId = element.assetIds?.[0];
    if (!firstAssetId) return null;
    return assetMap.get(firstAssetId) ?? null;
  }, [assetMap]);

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

  const createMarkerElement = useCallback((element: Element, isSelected: boolean, isDimmed: boolean, commentCount?: number, isBreadcrumb?: boolean, eventSummary?: TemporalEventSummary, offMap?: { count: number; expanded: boolean }): HTMLDivElement => {
    const el = document.createElement('div');
    el.innerHTML = createMarkerHtml(element, isSelected, isDimmed, commentCount, isBreadcrumb, eventSummary, offMap);
    el.style.cursor = 'pointer';
    return el;
  }, [createMarkerHtml]);

  // Rebuild Supercluster, then the element and cluster markers
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
      unclusteredElements
        .filter(el => !el._isBreadcrumb)
        .map(el => { const c = getGeoCenter(el.geo); return { id: el._markerKey, lng: c.lng, lat: c.lat, tall: !!getThumbnail(el) }; }),
    );

    // Members of a cluster the user force-expanded are spread explicitly around the cluster
    // center (they may not share the exact coordinate that the automatic spiderfy groups by).
    if (forced.size > 0) {
      const forcedEls = effectiveGeoElements.filter(el => forced.has(el._markerKey));
      const grid = spreadAround(forcedEls.length, forcedEls.some(el => !!getThumbnail(el)));
      forcedEls.forEach((el, i) => spiderfyOffsets.set(el._markerKey, grid[i]));
    }

    const existingMarkers = markersRef.current;
    const currentKeys = new Set(effectiveGeoElements.map(el => el._markerKey));

    existingMarkers.forEach((marker, key) => {
      if (!currentKeys.has(key)) {
        marker.remove();
        existingMarkers.delete(key);
      }
    });

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
        existingMarker.setDraggable(!isEventMarker && !element.isPositionLocked && !eventZoneIds.has(element.id));
        // Update visibility (hide if clustered)
        const el = existingMarker.getElement();
        const isBeingEdited = editingZoneId === element.id;
        el.style.display = (isClustered || isBeingEdited) ? 'none' : '';
        el.innerHTML = createMarkerHtml(element, isSelected, isDimmed, commentCount, element._isBreadcrumb, eventSummary, offMap);
        el.setAttribute('title', markerTitle);
      } else {
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
        // Right-click: the element's menu. Part of a multiple selection, the
        // menu acts on it; otherwise the element becomes the selection.
        markerEl.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!useSelectionStore.getState().selectedElementIds.has(markerId)) {
            selectElement(markerId);
            setFocusedEventId(markerEventId ?? null);
          }
          openElementMenuRef.current(markerId, e.clientX, e.clientY);
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

    const existingClusterMarkers = clusterMarkersRef.current;
    const activeClusterIds = new Set(activeClusters.keys());

    existingClusterMarkers.forEach((marker, id) => {
      if (!activeClusterIds.has(id)) {
        marker.remove();
        existingClusterMarkers.delete(id);
      }
    });

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

  }, [effectiveGeoElements, selectedElementIds, effectiveDimmedIds, unresolvedCommentCounts, createMarkerHtml, createMarkerElement, getThumbnail, selectElement, setFocusedEventId, updateElement, pushAction, anonymousMode, hideMedia, clusteringVersion, editingZoneId, eventZoneIds, temporalEventSummaries, showDensity, offMapNeighbors, offMapExpanded, t, clusterMarkersRef, clusterMetaRef, clusterStateRef, dragStartGeoRef, effectiveGeoElementsRef, elementIdToFirstMarkerKeyRef, eventPopoverHandlersRef, forceSpiderfyKeysRef, isDraggingRef, mapRef, markerOffsetsRef, markersRef, setClusteringVersion, setDraggedPositions, superclusterRef, toggleOffMapRef, openElementMenuRef]);

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
  }, [offMapExpanded, offMapNeighbors, geoElementById, clusteringVersion, selectedElementIds, anonymousMode, showDensity, selectElement, t, clusterStateRef, elementIdToFirstMarkerKeyRef, mapRef, markerOffsetsRef, offMapMarkersRef]);

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
  }, [offMapNeighbors, setOffMapExpanded]);

  return { geoElementById };
}
