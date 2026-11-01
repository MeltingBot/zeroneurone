import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type * as maplibregl from 'maplibre-gl';
import { generateCirclePolygon } from '../../utils/geo';
import { GeoPickerShell, PickedCoordinates, PickerActions } from './GeoPickerShell';
import { usePickerMap } from '../../hooks/usePickerMap';

const CIRCLE_SOURCE = 'near-circle';
const CIRCLE_FILL = 'near-circle-fill';
const CIRCLE_LINE = 'near-circle-line';
// MapLibre paint properties do not read CSS variables: accent of index.css
const CIRCLE_COLOR = '#e07a5f';

interface GeoRadiusPickerProps {
  initialLat?: number;
  initialLng?: number;
  initialRadiusKm?: number;
  initialUnit?: 'km' | 'm';
  onConfirm: (lat: number, lng: number, radiusKm: number) => void;
  onCancel: () => void;
}

export function GeoRadiusPicker({
  initialLat,
  initialLng,
  initialRadiusKm,
  initialUnit,
  onConfirm,
  onCancel,
}: GeoRadiusPickerProps) {
  const { t } = useTranslation('panels');
  const circleReadyRef = useRef(false);

  // Radius kept in the unit the user chose
  const [radius, setRadius] = useState(() => initialRadiusKm != null
    ? (initialUnit === 'm' ? String(Math.round(initialRadiusKm * 1000)) : String(initialRadiusKm))
    : '10');
  const [unit, setUnit] = useState<'km' | 'm'>(initialUnit ?? 'km');
  const radiusKm = useCallback(() => {
    const r = parseFloat(radius) || 10;
    return unit === 'm' ? r / 1000 : r;
  }, [radius, unit]);

  const drawCircle = useCallback((map: maplibregl.Map, lat: number, lng: number, rKm: number) => {
    if (!circleReadyRef.current) return;
    const source = map.getSource(CIRCLE_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    const coords = generateCirclePolygon([lng, lat], rKm);
    source.setData({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]]] },
        properties: {},
      }],
    });
  }, []);

  const { containerRef, mapRef, selectedLat, selectedLng, placeMarker } = usePickerMap({
    initialLat,
    initialLng,
    initialZoom: 10,
    onLoad: (map) => {
      map.addSource(CIRCLE_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: CIRCLE_FILL,
        type: 'fill',
        source: CIRCLE_SOURCE,
        paint: { 'fill-color': CIRCLE_COLOR, 'fill-opacity': 0.1 },
      });
      map.addLayer({
        id: CIRCLE_LINE,
        type: 'line',
        source: CIRCLE_SOURCE,
        paint: { 'line-color': CIRCLE_COLOR, 'line-width': 2, 'line-dasharray': [4, 2] },
      });
      circleReadyRef.current = true;
      if (initialLat != null && initialLng != null) {
        drawCircle(map, initialLat, initialLng, initialRadiusKm ?? 10);
      }
    },
  });

  // Redraw when the marker moves or the radius changes
  useEffect(() => {
    if (mapRef.current && selectedLat != null && selectedLng != null) {
      drawCircle(mapRef.current, selectedLat, selectedLng, radiusKm());
    }
  }, [selectedLat, selectedLng, radiusKm, drawCircle, mapRef]);

  const handleConfirm = () => {
    if (selectedLat != null && selectedLng != null) onConfirm(selectedLat, selectedLng, radiusKm());
  };

  return (
    <GeoPickerShell
      title={t('query.nearPickerTitle')}
      onCancel={onCancel}
      mapContainerRef={containerRef}
      onPlaceFound={(lat, lng) => {
        placeMarker(lat, lng);
        mapRef.current?.flyTo({ center: [lng, lat], zoom: 12 });
      }}
      footer={
        <>
          <PickedCoordinates lat={selectedLat} lng={selectedLng} hint={t('query.nearPickerClickToPlace')} />
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-xs text-text-secondary">{t('query.nearPickerRadius')}:</span>
            <input
              type="number"
              min="0"
              step="any"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              className="w-16 px-2 py-1 text-xs rounded border border-border-default bg-bg-primary text-text-primary outline-none focus:border-accent"
            />
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as 'km' | 'm')}
              className="w-14 px-1 py-1 text-xs rounded border border-border-default bg-bg-primary text-text-primary outline-none focus:border-accent"
            >
              <option value="km">km</option>
              <option value="m">m</option>
            </select>
          </div>
          <PickerActions
            onCancel={onCancel}
            onConfirm={handleConfirm}
            canConfirm={selectedLat != null && selectedLng != null}
          />
        </>
      }
    />
  );
}
