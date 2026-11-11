/**
 * Placing a position by touching the map, not only from the phone's GPS:
 * a tap sets the pin, which can then be dragged; the dossier's located
 * elements are shown as small dots to find one's way. Its own chunk
 * (MapLibre), loaded when it opens.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Check, Layers, Trash2, X } from 'lucide-react';
import { buildMapStyle, resolveLayerId } from '../components/map/mapStyles';
import { IconAction } from './IconAction';

export interface LatLng {
  lat: number;
  lng: number;
}

const AROUND = 'around';

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888888';
}

export default function MapPicker({ initial, around, onPick, onRemove, onClose }: {
  /** Current position, shown and centred on */
  initial: LatLng | null;
  /** Other located points of the dossier, for context */
  around: LatLng[];
  onPick: (point: LatLng) => void;
  /** Offered when there is a position to take away */
  onRemove?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('companion');
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [point, setPoint] = useState<LatLng | null>(initial);
  const pointRef = useRef(point);
  useEffect(() => { pointRef.current = point; }, [point]);
  const [satellite, setSatellite] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const previous = mapRef.current;
    const view = previous ? { center: previous.getCenter(), zoom: previous.getZoom() } : null;
    previous?.remove();
    const start = pointRef.current;
    const map = new maplibregl.Map({
      container,
      style: buildMapStyle(satellite ? 'satellite' : resolveLayerId('ofm', dark, 'auto'), false),
      center: view ? view.center : start ? [start.lng, start.lat] : [2.35, 46.6],
      zoom: view ? view.zoom : start ? 15 : 4,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }), 'top-right');
    mapRef.current = map;

    const place = (at: LatLng) => {
      let marker = markerRef.current;
      if (!marker) {
        const created = new maplibregl.Marker({ color: cssVar('--color-accent'), draggable: true });
        created.on('dragend', () => {
          const ll = created.getLngLat();
          setPoint({ lat: ll.lat, lng: ll.lng });
        });
        markerRef.current = created;
        marker = created;
      }
      marker.setLngLat([at.lng, at.lat]).addTo(map);
    };
    if (start) place(start);
    map.on('click', (e) => {
      const at = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      place(at);
      setPoint(at);
    });

    map.on('load', () => {
      map.addSource(AROUND, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: around.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: {} })),
        },
      });
      map.addLayer({
        id: AROUND,
        type: 'circle',
        source: AROUND,
        paint: { 'circle-radius': 4, 'circle-color': cssVar('--color-text-tertiary'), 'circle-stroke-width': 1, 'circle-stroke-color': '#ffffff' },
      });
      // Nothing placed yet: the dossier's located elements in view
      if (!start && !view && around.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        for (const p of around) bounds.extend([p.lng, p.lat]);
        map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 });
      }
    });

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
    };
  }, [satellite, around]);

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);

  // In the body: above the dossier's tab bar whatever the page around it
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-bg-primary" role="dialog" aria-label={t('position.pick')}>
      <header className="flex items-center gap-2 px-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 border-b border-border-default">
        <IconAction icon={X} label={t('cancel')} onClick={onClose} />
        <span className="flex-1 min-w-0 text-sm font-semibold truncate">{t('position.pick')}</span>
        {onRemove && (
          <IconAction icon={Trash2} label={t('position.remove')} variant="danger" onClick={() => { onRemove(); onClose(); }} />
        )}
        <IconAction
          icon={Check}
          label={t('edit.save')}
          variant="primary"
          disabled={!point}
          onClick={() => { if (point) { onPick(point); onClose(); } }}
        />
      </header>
      <div className="relative flex-1 min-h-0">
        {/* Sized, not positioned: MapLibre's stylesheet makes its container relative */}
        <div ref={containerRef} className="w-full h-full" data-testid="map-picker" />
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
        <p className="absolute top-2.5 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded bg-bg-primary border border-border-default text-xs text-text-secondary tabular-nums whitespace-nowrap">
          {point ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : t('position.tap')}
        </p>
      </div>
    </div>,
    document.body,
  );
}
