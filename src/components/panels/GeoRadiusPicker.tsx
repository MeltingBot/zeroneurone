import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Search, Check } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { generateCirclePolygon } from '../../utils/geo';

const CIRCLE_SOURCE = 'near-circle';
const CIRCLE_FILL = 'near-circle-fill';
const CIRCLE_LINE = 'near-circle-line';

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
  const { t } = useTranslation(['panels', 'common']);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const circleReadyRef = useRef(false);

  const [selectedLat, setSelectedLat] = useState<number | null>(initialLat ?? null);
  const [selectedLng, setSelectedLng] = useState<number | null>(initialLng ?? null);

  // Radius state — keep display value in user's chosen unit
  const initRadius = initialRadiusKm != null
    ? (initialUnit === 'm' ? String(Math.round(initialRadiusKm * 1000)) : String(initialRadiusKm))
    : '10';
  const [radius, setRadius] = useState(initRadius);
  const [unit, setUnit] = useState<'km' | 'm'>(initialUnit ?? 'km');

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Convert display radius to km
  const radiusKm = useCallback(() => {
    const r = parseFloat(radius) || 10;
    return unit === 'm' ? r / 1000 : r;
  }, [radius, unit]);

  // Update circle preview on map
  const updateCircle = useCallback((lat: number, lng: number, rKm: number) => {
    const map = mapRef.current;
    if (!map || !circleReadyRef.current) return;

    const coords = generateCirclePolygon([lng, lat], rKm);
    const source = map.getSource(CIRCLE_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    source.setData({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[...coords, coords[0]]],
        },
        properties: {},
      }],
    });
  }, []);

  // Update marker position
  const updateMarker = useCallback((lat: number, lng: number) => {
    if (!mapRef.current) return;

    setSelectedLat(lat);
    setSelectedLng(lng);

    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat]);
    } else {
      markerRef.current = new maplibregl.Marker({ draggable: true })
        .setLngLat([lng, lat])
        .addTo(mapRef.current);

      markerRef.current.on('dragend', () => {
        const pos = markerRef.current?.getLngLat();
        if (pos) {
          setSelectedLat(pos.lat);
          setSelectedLng(pos.lng);
        }
      });
    }
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const defaultCenter: [number, number] = initialLat != null && initialLng != null
      ? [initialLng, initialLat]
      : [1.888334, 46.603354];
    const defaultZoom = initialLat != null && initialLng != null ? 10 : 6;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
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
      },
      center: defaultCenter,
      zoom: defaultZoom,
    });

    mapRef.current = map;

    map.on('load', () => {
      // Add circle preview layers
      map.addSource(CIRCLE_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: CIRCLE_FILL,
        type: 'fill',
        source: CIRCLE_SOURCE,
        paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.1 },
      });
      map.addLayer({
        id: CIRCLE_LINE,
        type: 'line',
        source: CIRCLE_SOURCE,
        paint: {
          'line-color': '#2563eb',
          'line-width': 2,
          'line-dasharray': [4, 2],
        },
      });

      circleReadyRef.current = true;

      // If initial values, place marker and draw circle
      if (initialLat != null && initialLng != null) {
        updateMarker(initialLat, initialLng);
        const rKm = initialRadiusKm ?? 10;
        updateCircle(initialLat, initialLng, rKm);
      }
    });

    // Click on map to place/move marker
    map.on('click', (e: maplibregl.MapMouseEvent) => {
      updateMarker(e.lngLat.lat, e.lngLat.lng);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleReadyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update circle when marker moves or radius changes
  useEffect(() => {
    if (selectedLat != null && selectedLng != null) {
      updateCircle(selectedLat, selectedLng, radiusKm());
    }
  }, [selectedLat, selectedLng, radiusKm, updateCircle]);

  // Search for location using Nominatim
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !mapRef.current) return;

    setIsSearching(true);
    setSearchError(null);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`,
        { headers: { 'Accept-Language': 'fr' } },
      );
      const results = await response.json();

      if (results.length > 0) {
        const { lat, lon } = results[0];
        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lon);
        updateMarker(latNum, lngNum);
        mapRef.current.flyTo({ center: [lngNum, latNum], zoom: 12 });
      } else {
        setSearchError(t('panels:detail.geoPicker.noResults'));
      }
    } catch {
      setSearchError(t('panels:detail.geoPicker.searchError'));
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, updateMarker, t]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSearch(); }
  };

  const handleConfirm = () => {
    if (selectedLat != null && selectedLng != null) {
      onConfirm(selectedLat, selectedLng, radiusKm());
    }
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50">
      <div className="bg-bg-primary border border-border-default sketchy-border-soft modal-shadow w-[90vw] max-w-2xl h-[80vh] max-h-[600px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <h2 className="text-sm font-semibold text-text-primary">
            {t('panels:query.nearPickerTitle')}
          </h2>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-bg-tertiary rounded transition-colors"
          >
            <X size={18} className="text-text-secondary" />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-4 py-2 border-b border-border-default">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={t('panels:detail.geoPicker.searchPlaceholder')}
              className="flex-1 px-3 py-2 text-sm bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary placeholder:text-text-tertiary"
            />
            <button
              onClick={handleSearch}
              disabled={isSearching || !searchQuery.trim()}
              className="px-3 py-2 bg-accent text-white text-sm font-medium rounded hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
            >
              <Search size={14} />
              {isSearching ? '...' : t('panels:detail.geoPicker.search')}
            </button>
          </div>
          {searchError && (
            <p className="text-xs text-error mt-1">{searchError}</p>
          )}
        </div>

        {/* Map */}
        <div ref={mapContainerRef} className="flex-1" />

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border-default flex items-center justify-between gap-3">
          {/* Coordinates display */}
          <div className="text-xs text-text-secondary shrink-0">
            {selectedLat != null && selectedLng != null ? (
              <span>
                <strong>Lat:</strong> {selectedLat.toFixed(6)}, <strong>Lng:</strong> {selectedLng.toFixed(6)}
              </span>
            ) : (
              <span className="text-text-tertiary">{t('panels:query.nearPickerClickToPlace')}</span>
            )}
          </div>

          {/* Radius input */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-xs text-text-secondary">{t('panels:query.nearPickerRadius')}:</span>
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

          {/* Actions */}
          <div className="flex gap-2 shrink-0">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary rounded transition-colors"
            >
              {t('common:actions.cancel')}
            </button>
            <button
              onClick={handleConfirm}
              disabled={selectedLat == null || selectedLng == null}
              className="px-3 py-1.5 bg-accent text-white text-sm font-medium rounded hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
            >
              <Check size={14} />
              {t('common:actions.confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
