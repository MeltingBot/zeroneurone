/** Map with one draggable marker, shared by GeoPicker and GeoRadiusPicker */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const FRANCE_CENTER: [number, number] = [1.888334, 46.603354];

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'osm-tiles', type: 'raster', source: 'osm' }],
};

interface PickerMapOptions {
  initialLat?: number;
  initialLng?: number;
  /** Zoom when opened on initial coordinates (France overview otherwise) */
  initialZoom: number;
  /** Called once the map style is loaded */
  onLoad?: (map: maplibregl.Map) => void;
}

/** A map with one draggable marker, placed by clicking or by `placeMarker`. */
export function usePickerMap({ initialLat, initialLng, initialZoom, onLoad }: PickerMapOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onLoadRef = useRef(onLoad);
  useEffect(() => {
    onLoadRef.current = onLoad;
  });

  const [selectedLat, setSelectedLat] = useState<number | null>(initialLat ?? null);
  const [selectedLng, setSelectedLng] = useState<number | null>(initialLng ?? null);

  const placeMarker = useCallback((lat: number, lng: number) => {
    const map = mapRef.current;
    if (!map) return;
    setSelectedLat(lat);
    setSelectedLng(lng);
    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat]);
      return;
    }
    const marker = new maplibregl.Marker({ draggable: true }).setLngLat([lng, lat]).addTo(map);
    marker.on('dragend', () => {
      const pos = marker.getLngLat();
      setSelectedLat(pos.lat);
      setSelectedLng(pos.lng);
    });
    markerRef.current = marker;
  }, []);

  // Created once: the initial values only position the map when it opens
  const initialRef = useRef({ initialLat, initialLng, initialZoom });
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const { initialLat: lat, initialLng: lng, initialZoom: zoom } = initialRef.current;
    // 0 is a valid coordinate (equator, Greenwich meridian)
    const hasInitial = lat != null && lng != null;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: hasInitial ? [lng, lat] : FRANCE_CENTER,
      zoom: hasInitial ? zoom : 6,
    });
    mapRef.current = map;
    if (hasInitial) placeMarker(lat, lng);
    map.on('load', () => onLoadRef.current?.(map));
    map.on('click', (e: maplibregl.MapMouseEvent) => placeMarker(e.lngLat.lat, e.lngLat.lng));

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [placeMarker]);

  return { containerRef, mapRef, selectedLat, selectedLng, placeMarker };
}
