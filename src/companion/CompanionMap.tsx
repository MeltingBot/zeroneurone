/**
 * Map of the dossier for the phone: located elements as points, grouped when
 * close, links between located elements (desktop link layers), the phone's
 * own position on demand, a card for the tapped element or link.
 * Its own chunk (MapLibre), loaded when the tab opens. Reuses the desktop
 * basemaps (mapStyles.ts).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ChevronRight, Layers, X } from 'lucide-react';
import type { Element, Link } from '../types';
import { buildMapStyle, resolveLayerId } from '../components/map/mapStyles';
import {
  ensureArrowImage, ensureLinkLayers, LINK_ARROWS_SOURCE, LINK_LINE_LAYERS, LINK_LINES_SOURCE,
} from '../components/map/mapLayers';
import { linkFeatures } from './mapLinks';
import { safeDataImageUrl } from '../utils/escapeHtml';
import type { AssetEntry } from './useCompanionSession';

const SOURCE = 'elements';
const LINK_LAYERS = Object.values(LINK_LINE_LAYERS);
/** Half-size (px) of the box a tap looks for a link in: lines are thin */
const LINK_TAP_SLOP = 10;

type Selection = { kind: 'element' | 'link'; id: string } | null;

function applyLinks(map: maplibregl.Map, data: ReturnType<typeof linkFeatures>) {
  (map.getSource(LINK_LINES_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(data.lines);
  (map.getSource(LINK_ARROWS_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData({
    type: 'FeatureCollection',
    features: data.arrows.map((a) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: a.coordinates },
      properties: { icon: ensureArrowImage(map, a.color), rotate: a.rotate, opacity: 1 },
    })),
  });
}

interface Located {
  element: Element;
  lat: number;
  lng: number;
}

function located(elements: Element[]): Located[] {
  const out: Located[] = [];
  for (const element of elements) {
    const geo = element.geo;
    if (!geo) continue;
    const point = geo.type === 'point' ? geo : geo.center;
    if (Number.isFinite(point.lat) && Number.isFinite(point.lng)) out.push({ element, lat: point.lat, lng: point.lng });
  }
  return out;
}

function toGeoJson(points: Located[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: points.map(({ element, lat, lng }) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: { id: element.id, color: element.visual.color || '#ffffff' },
    })),
  };
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888888';
}

export default function CompanionMap({ elements, links, assets, onOpen }: {
  elements: Element[];
  links: Link[];
  assets: Map<string, AssetEntry>;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation('companion');
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [selected, setSelected] = useState<Selection>(null);
  const [satellite, setSatellite] = useState(false);
  const points = useMemo(() => located(elements), [elements]);
  /** Latest points, for the map's load handler */
  const pointsRef = useRef(points);
  const linkData = useMemo(() => {
    const positions = new Map(points.map((p) => [p.element.id, [p.lng, p.lat] as [number, number]]));
    return linkFeatures(links, positions);
  }, [points, links]);
  const linkDataRef = useRef(linkData);
  const fitted = useRef(false);

  // Create the map; recreated when the basemap changes
  useEffect(() => {
    if (!containerRef.current) return;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const layerId = satellite ? 'satellite' : resolveLayerId('ofm', dark, 'auto');
    // Switching basemap: same view on a new map (both cannot share the container)
    const previous = mapRef.current;
    const view = previous ? { center: previous.getCenter(), zoom: previous.getZoom() } : null;
    previous?.remove();
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildMapStyle(layerId, false),
      center: view ? view.center : [2.35, 46.6],
      zoom: view ? view.zoom : 4,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showAccuracyCircle: true,
    }), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      const accent = cssVar('--color-accent');
      const border = cssVar('--color-text-primary');
      // Links first: drawn under the points
      ensureLinkLayers(map);
      applyLinks(map, linkDataRef.current);
      map.addSource(SOURCE, {
        type: 'geojson',
        data: toGeoJson(pointsRef.current),
        cluster: true,
        clusterRadius: 44,
        clusterMaxZoom: 16,
      });
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: SOURCE,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': accent,
          'circle-opacity': 0.9,
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });
      // Counts need the style's glyphs: the vector basemap has them, the
      // satellite raster does not (clusters are then sized circles only)
      if (map.getStyle().glyphs) {
        map.addLayer({
          id: 'cluster-count',
          type: 'symbol',
          source: SOURCE,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-font': ['Noto Sans Bold'],
            'text-size': 12,
            'text-allow-overlap': true,
          },
          paint: { 'text-color': '#ffffff' },
        });
      }
      map.addLayer({
        id: 'points',
        type: 'circle',
        source: SOURCE,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': 9,
          'circle-stroke-width': 2,
          'circle-stroke-color': border,
        },
      });
      map.addLayer({
        id: 'points-selected',
        type: 'circle',
        source: SOURCE,
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-color': 'transparent',
          'circle-radius': 15,
          'circle-stroke-width': 3,
          'circle-stroke-color': accent,
        },
      });

      if (!fitted.current && pointsRef.current.length > 0) {
        fitted.current = true;
        const bounds = new maplibregl.LngLatBounds();
        for (const p of pointsRef.current) bounds.extend([p.lng, p.lat]);
        map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 });
      }
    });

    map.on('click', 'clusters', (e) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const source = map.getSource(SOURCE) as maplibregl.GeoJSONSource;
      const center = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
      void source.getClusterExpansionZoom(feature.properties.cluster_id as number)
        .then((zoom) => map.easeTo({ center, zoom: zoom + 0.5 }));
    });
    map.on('click', 'points', (e) => {
      const id = e.features?.[0]?.properties.id as string | undefined;
      if (id) setSelected({ kind: 'element', id });
    });
    map.on('click', (e) => {
      if (map.queryRenderedFeatures(e.point, { layers: ['points', 'clusters'] }).length > 0) return;
      const { x, y } = e.point;
      const box: [maplibregl.PointLike, maplibregl.PointLike] = [[x - LINK_TAP_SLOP, y - LINK_TAP_SLOP], [x + LINK_TAP_SLOP, y + LINK_TAP_SLOP]];
      const linkId = map.queryRenderedFeatures(box, { layers: LINK_LAYERS.filter((l) => map.getLayer(l)) })[0]?.properties.linkId as string | undefined;
      setSelected(linkId ? { kind: 'link', id: linkId } : null);
    });
    for (const layer of ['points', 'clusters']) {
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
    }

  }, [satellite]);

  useEffect(() => () => {
    mapRef.current?.remove();
    mapRef.current = null;
  }, []);

  // Follow the dossier
  useEffect(() => {
    pointsRef.current = points;
    const source = mapRef.current?.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined;
    source?.setData(toGeoJson(points));
  }, [points]);

  useEffect(() => {
    linkDataRef.current = linkData;
    const map = mapRef.current;
    if (map?.getSource(LINK_LINES_SOURCE)) applyLinks(map, linkData);
  }, [linkData]);

  useEffect(() => {
    const map = mapRef.current;
    const id = selected?.kind === 'element' ? selected.id : '';
    if (map?.getLayer('points-selected')) map.setFilter('points-selected', ['==', ['get', 'id'], id]);
  }, [selected]);

  const byId = useMemo(() => new Map(elements.map((e) => [e.id, e])), [elements]);
  const element = selected?.kind === 'element' ? byId.get(selected.id) ?? null : null;
  const link = selected?.kind === 'link' ? links.find((l) => l.id === selected.id) ?? null : null;
  const thumb = element ? firstThumb(element, assets) : null;

  return (
    <div className="absolute inset-0">
      {/* Sized, not positioned: MapLibre's stylesheet makes its container relative */}
      <div ref={containerRef} className="w-full h-full" />
      <button
        type="button"
        onClick={() => setSatellite((v) => !v)}
        aria-pressed={satellite}
        aria-label={t('map.satellite')}
        title={t('map.satellite')}
        className={`absolute top-2.5 left-2.5 w-[29px] h-[29px] flex items-center justify-center rounded bg-white shadow border border-black/10 ${satellite ? 'text-accent' : 'text-[#333]'}`}
      >
        <Layers size={16} />
      </button>
      {points.length === 0 && (
        <p className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded bg-bg-primary border border-border-default text-xs text-text-secondary">
          {t('map.empty')}
        </p>
      )}
      {element && (
        <div className="absolute left-2 right-2 bottom-2 flex items-center gap-3 p-2 rounded sketchy-border-soft bg-bg-primary border border-border-default shadow-lg">
          {thumb && <img src={thumb} alt="" className="w-12 h-12 rounded object-cover flex-shrink-0" />}
          <button type="button" className="flex-1 min-w-0 flex items-center gap-2 text-left min-h-12" onClick={() => onOpen(element.id)}>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium truncate">{element.label || t('element.untitled')}</span>
              {element.tags.length > 0 && <span className="block text-xs text-text-tertiary truncate">{element.tags.join(', ')}</span>}
            </span>
            <ChevronRight size={18} className="text-text-tertiary flex-shrink-0" />
          </button>
          <button type="button" className="w-9 h-9 flex items-center justify-center text-text-tertiary" onClick={() => setSelected(null)} aria-label={t('close')}>
            <X size={16} />
          </button>
        </div>
      )}
      {link && (
        <div className="absolute left-2 right-2 bottom-2 p-2 rounded sketchy-border-soft bg-bg-primary border border-border-default shadow-lg">
          <div className="flex items-center gap-2 px-1">
            <span className="flex-1 min-w-0 text-sm font-medium truncate">{link.label || '—'}</span>
            <button type="button" className="w-9 h-9 flex items-center justify-center text-text-tertiary" onClick={() => setSelected(null)} aria-label={t('close')}>
              <X size={16} />
            </button>
          </div>
          {[link.fromId, link.toId].map((endId, i) => {
            const end = byId.get(endId);
            if (!end) return null;
            return (
              <button
                key={`${endId}-${i}`}
                type="button"
                className="w-full min-h-11 flex items-center gap-2 px-1 text-left border-t border-border-default"
                onClick={() => onOpen(end.id)}
              >
                <span className="text-text-tertiary text-sm w-4 text-center">{i === 0 ? '·' : link.direction === 'none' ? '—' : '→'}</span>
                <span className="flex-1 min-w-0 text-sm truncate">{end.label || t('element.untitled')}</span>
                <ChevronRight size={16} className="text-text-tertiary flex-shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function firstThumb(element: Element, assets: Map<string, AssetEntry>): string | null {
  for (const id of element.assetIds) {
    const url = assets.get(id)?.thumbnailDataUrl;
    if (url) return safeDataImageUrl(url);
  }
  return null;
}
