/** Shared dialog frame of GeoPicker and GeoRadiusPicker: title, place search, map, footer */

import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Search, Check } from 'lucide-react';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { geocodePlace } from '../../utils/geocode';

interface GeoPickerShellProps {
  title: string;
  onCancel: () => void;
  mapContainerRef: RefObject<HTMLDivElement | null>;
  /** Called with the first match of a place search */
  onPlaceFound: (lat: number, lng: number) => void;
  initialQuery?: string;
  footer: ReactNode;
}

/** Dialog frame: title, place search, map, footer. */
export function GeoPickerShell({ title, onCancel, mapContainerRef, onPlaceFound, initialQuery, footer }: GeoPickerShellProps) {
  const { t } = useTranslation('panels');
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(true, dialogRef, onCancel);

  const [searchQuery, setSearchQuery] = useState(initialQuery ?? '');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchError(null);
    try {
      const place = await geocodePlace(searchQuery);
      if (place) onPlaceFound(place.lat, place.lng);
      else setSearchError(t('detail.geoPicker.noResults'));
    } catch (error) {
      setSearchError(t('detail.geoPicker.searchError'));
      console.error('Geocoding error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-bg-primary border border-border-default sketchy-border-soft modal-shadow w-[90vw] max-w-2xl h-[80vh] max-h-[600px] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          <button
            onClick={onCancel}
            aria-label={t('common:actions.close')}
            className="p-1 hover:bg-bg-tertiary rounded transition-colors"
          >
            <X size={18} className="text-text-secondary" />
          </button>
        </div>

        <div className="px-4 py-2 border-b border-border-default">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleSearch(); }
              }}
              placeholder={t('detail.geoPicker.searchPlaceholder')}
              className="flex-1 px-3 py-2 text-sm bg-bg-secondary border border-border-default sketchy-border focus:outline-none focus:border-accent input-focus-glow text-text-primary placeholder:text-text-tertiary"
            />
            <button
              onClick={handleSearch}
              disabled={isSearching || !searchQuery.trim()}
              className="px-3 py-2 bg-accent text-white text-sm font-medium sketchy-border hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
            >
              <Search size={14} />
              {isSearching ? '...' : t('detail.geoPicker.search')}
            </button>
          </div>
          {searchError && <p className="text-xs text-error mt-1">{searchError}</p>}
        </div>

        <div ref={mapContainerRef} className="flex-1" />

        <div className="px-4 py-3 border-t border-border-default flex items-center justify-between gap-3">
          {footer}
        </div>
      </div>
    </div>
  );
}

/** Coordinates of the marker, or the hint to place it. */
export function PickedCoordinates({ lat, lng, hint }: { lat: number | null; lng: number | null; hint: string }) {
  return (
    <div className="text-xs text-text-secondary shrink-0">
      {lat !== null && lng !== null ? (
        <span>
          <strong>Lat:</strong> {lat.toFixed(6)}, <strong>Lng:</strong> {lng.toFixed(6)}
        </span>
      ) : (
        <span className="text-text-tertiary">{hint}</span>
      )}
    </div>
  );
}

/** Cancel and Confirm buttons of the footer. */
export function PickerActions({ onCancel, onConfirm, canConfirm }: { onCancel: () => void; onConfirm: () => void; canConfirm: boolean }) {
  const { t } = useTranslation('common');
  return (
    <div className="flex gap-2 shrink-0">
      <button
        onClick={onCancel}
        className="px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary sketchy-border transition-colors"
      >
        {t('actions.cancel')}
      </button>
      <button
        onClick={onConfirm}
        disabled={!canConfirm}
        className="px-3 py-1.5 bg-accent text-white text-sm font-medium sketchy-border hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
      >
        <Check size={14} />
        {t('actions.confirm')}
      </button>
    </div>
  );
}
