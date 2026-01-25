import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Search, Check } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icon issue with bundlers
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// @ts-expect-error - Leaflet internal
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

interface GeoPickerProps {
  initialLat?: number;
  initialLng?: number;
  onConfirm: (lat: number, lng: number) => void;
  onCancel: () => void;
}

export function GeoPicker({ initialLat, initialLng, onConfirm, onCancel }: GeoPickerProps) {
  const { t } = useTranslation(['panels', 'common']);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [selectedLat, setSelectedLat] = useState<number | null>(initialLat ?? null);
  const [selectedLng, setSelectedLng] = useState<number | null>(initialLng ?? null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Update marker position
  const updateMarker = useCallback((lat: number, lng: number) => {
    if (!mapRef.current) return;

    setSelectedLat(lat);
    setSelectedLng(lng);

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      markerRef.current = L.marker([lat, lng], {
        draggable: true,
      }).addTo(mapRef.current);

      // Update coordinates when marker is dragged
      markerRef.current.on('dragend', () => {
        const pos = markerRef.current?.getLatLng();
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

    // Default center: France or initial coordinates
    const defaultCenter: [number, number] = initialLat && initialLng
      ? [initialLat, initialLng]
      : [46.603354, 1.888334];
    const defaultZoom = initialLat && initialLng ? 12 : 6;

    mapRef.current = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: defaultZoom,
    });

    // Add tile layer (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapRef.current);

    // Add initial marker if coordinates provided
    if (initialLat && initialLng) {
      updateMarker(initialLat, initialLng);
    }

    // Click on map to place/move marker
    mapRef.current.on('click', (e: L.LeafletMouseEvent) => {
      updateMarker(e.latlng.lat, e.latlng.lng);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markerRef.current = null;
    };
  }, [initialLat, initialLng, updateMarker]);

  // Search for location using Nominatim (OpenStreetMap geocoding)
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !mapRef.current) return;

    setIsSearching(true);
    setSearchError(null);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`,
        {
          headers: {
            'Accept-Language': 'fr',
          },
        }
      );

      const results = await response.json();

      if (results.length > 0) {
        const { lat, lon } = results[0];
        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lon);

        updateMarker(latNum, lngNum);
        mapRef.current.setView([latNum, lngNum], 14);
      } else {
        setSearchError(t('panels:detail.geoPicker.noResults'));
      }
    } catch (error) {
      setSearchError(t('panels:detail.geoPicker.searchError'));
      console.error('Geocoding error:', error);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, updateMarker, t]);

  // Handle Enter key in search
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  // Confirm selection
  const handleConfirm = () => {
    if (selectedLat !== null && selectedLng !== null) {
      onConfirm(selectedLat, selectedLng);
    }
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50">
      <div className="bg-bg-primary border border-border-default sketchy-border-soft modal-shadow w-[90vw] max-w-2xl h-[80vh] max-h-[600px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <h2 className="text-sm font-semibold text-text-primary">
            {t('panels:detail.geoPicker.title')}
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
              className="flex-1 px-3 py-2 text-sm bg-bg-secondary border border-border-default sketchy-border focus:outline-none focus:border-accent input-focus-glow text-text-primary placeholder:text-text-tertiary"
            />
            <button
              onClick={handleSearch}
              disabled={isSearching || !searchQuery.trim()}
              className="px-3 py-2 bg-accent text-white text-sm font-medium sketchy-border hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
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

        {/* Footer with coordinates and actions */}
        <div className="px-4 py-3 border-t border-border-default flex items-center justify-between">
          <div className="text-xs text-text-secondary">
            {selectedLat !== null && selectedLng !== null ? (
              <span>
                <strong>Lat:</strong> {selectedLat.toFixed(6)}, <strong>Lng:</strong> {selectedLng.toFixed(6)}
              </span>
            ) : (
              <span className="text-text-tertiary">{t('panels:detail.geoPicker.clickToPlace')}</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary sketchy-border transition-colors"
            >
              {t('common:actions.cancel')}
            </button>
            <button
              onClick={handleConfirm}
              disabled={selectedLat === null || selectedLng === null}
              className="px-3 py-1.5 bg-accent text-white text-sm font-medium sketchy-border hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
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
