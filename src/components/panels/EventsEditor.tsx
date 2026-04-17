import { useState, useCallback, useEffect, useMemo, useRef, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Plus, Trash2, MapPin, Calendar, ChevronDown, ChevronUp, FileText, ArrowUpRight, Hexagon, Copy, PenTool, Code, Check, X } from 'lucide-react';
import type { ElementEvent, PropertyDefinition, GeoData, GeoPolygon } from '../../types';
import { generateUUID } from '../../utils';
import { PropertiesEditor } from './PropertiesEditor';
import { isGeoPolygon, getGeoCenter, computePolygonAreaKm2, computePolygonCenter } from '../../utils/geo';

interface EventsEditorProps {
  events: ElementEvent[];
  onChange: (events: ElementEvent[]) => void;
  onOpenGeoPicker: (callback: (lat: number, lng: number) => void, initialGeo?: { lat: number; lng: number }) => void;
  /** Property suggestions from the dossier */
  suggestions?: PropertyDefinition[];
  /** Callback when a new property is created */
  onNewProperty?: (propertyDef: PropertyDefinition) => void;
  /** Callback to extract an event as a new element */
  onExtractToElement?: (event: ElementEvent) => void;
  /** Whether the parent element is a polygon zone */
  isZone?: boolean;
  /** Current zone geometry (for "inherit" action) */
  currentZoneGeo?: GeoData | null;
  /** Callback to draw/edit a zone on the map */
  onDrawZone?: (callback: (geo: GeoData) => void, existingGeo?: GeoPolygon) => void;
}

// Sub-component for a single event - manages local state for text fields
interface EventItemProps {
  event: ElementEvent;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (updates: Partial<ElementEvent>) => void;
  onRemove: () => void;
  onExtract?: () => void;
  onPickLocation: () => void;
  onClearGeo: () => void;
  suggestions: PropertyDefinition[];
  onNewProperty?: (propertyDef: PropertyDefinition) => void;
  isZone?: boolean;
  onInheritZone?: () => void;
  onDrawZone?: () => void;
}

const EventItem = memo(function EventItem({
  event,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onRemove,
  onExtract,
  onPickLocation,
  onClearGeo,
  suggestions,
  onNewProperty,
  isZone,
  onInheritZone,
  onDrawZone,
}: EventItemProps) {
  const { t } = useTranslation('panels');

  const eventGeoIsPolygon = event.geo && isGeoPolygon(event.geo);
  const eventCenter = event.geo ? getGeoCenter(event.geo) : null;

  // GeoJSON edit mode
  const [geoJsonEditing, setGeoJsonEditing] = useState(false);
  const [geoJsonText, setGeoJsonText] = useState('');
  const [geoJsonError, setGeoJsonError] = useState('');

  // Local state for text fields - syncs on blur
  const [label, setLabel] = useState(event.label || '');
  const [description, setDescription] = useState(event.description || '');
  const [source, setSource] = useState(event.source || '');
  const [latStr, setLatStr] = useState(eventCenter?.lat?.toFixed(6) ?? '');
  const [lngStr, setLngStr] = useState(eventCenter?.lng?.toFixed(6) ?? '');
  const [altStr, setAltStr] = useState(event.geo?.altitude?.toString() ?? '');

  // Local state for dates - syncs on blur to prevent re-sorting during editing
  const [localDate, setLocalDate] = useState(event.date);
  const [localDateEnd, setLocalDateEnd] = useState(event.dateEnd);

  // Sync local state when event prop changes (e.g., from undo/redo or collab)
  useEffect(() => {
    setLabel(event.label || '');
    setDescription(event.description || '');
    setSource(event.source || '');
    const center = event.geo ? getGeoCenter(event.geo) : null;
    setLatStr(center?.lat?.toFixed(6) ?? '');
    setLngStr(center?.lng?.toFixed(6) ?? '');
    setAltStr(event.geo?.altitude?.toString() ?? '');
    setLocalDate(event.date);
    setLocalDateEnd(event.dateEnd);
  }, [event.id, event.label, event.description, event.source, event.geo, event.date, event.dateEnd]);

  const formatDateForInput = (date: Date): string => {
    const d = new Date(date);
    const year = String(d.getFullYear()).padStart(4, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatTimeForInput = (date: Date): string => {
    const d = new Date(date);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // Blur handlers - sync to parent
  const handleLabelBlur = () => {
    if (label !== (event.label || '')) {
      onUpdate({ label });
    }
  };

  const handleDescriptionBlur = () => {
    const newVal = description || undefined;
    if (newVal !== event.description) {
      onUpdate({ description: newVal });
    }
  };

  const handleSourceBlur = () => {
    const newVal = source || undefined;
    if (newVal !== event.source) {
      onUpdate({ source: newVal });
    }
  };

  const handleLatBlur = () => {
    const lat = parseFloat(latStr);
    if (!isNaN(lat) && lat >= -90 && lat <= 90) {
      if (lat !== eventCenter?.lat) {
        if (eventGeoIsPolygon) {
          // Translate the polygon by the lat delta
          const poly = event.geo as GeoPolygon;
          const dLat = lat - (eventCenter?.lat ?? 0);
          const newCoords = poly.coordinates.map(([lng, lt]) => [lng, lt + dLat] as [number, number]);
          onUpdate({ geo: { ...poly, coordinates: newCoords, center: computePolygonCenter(newCoords) } });
        } else {
          const altitude = event.geo?.altitude;
          onUpdate({ geo: { type: 'point', lat, lng: eventCenter?.lng ?? 0, ...(altitude !== undefined ? { altitude } : {}) } });
        }
      }
    }
  };

  const handleLngBlur = () => {
    const lng = parseFloat(lngStr);
    if (!isNaN(lng) && lng >= -180 && lng <= 180) {
      if (lng !== eventCenter?.lng) {
        if (eventGeoIsPolygon) {
          // Translate the polygon by the lng delta
          const poly = event.geo as GeoPolygon;
          const dLng = lng - (eventCenter?.lng ?? 0);
          const newCoords = poly.coordinates.map(([ln, lat]) => [ln + dLng, lat] as [number, number]);
          onUpdate({ geo: { ...poly, coordinates: newCoords, center: computePolygonCenter(newCoords) } });
        } else {
          const altitude = event.geo?.altitude;
          onUpdate({ geo: { type: 'point', lat: eventCenter?.lat ?? 0, lng, ...(altitude !== undefined ? { altitude } : {}) } });
        }
      }
    }
  };

  const handleOpenGeoJsonEditor = () => {
    if (eventGeoIsPolygon) {
      const coords = (event.geo as Extract<GeoData, { type: 'polygon' }>).coordinates;
      // Format as GeoJSON Polygon geometry
      const geojson = {
        type: 'Polygon',
        coordinates: [[...coords.map(([lng, lat]) => [lng, lat]), [coords[0][0], coords[0][1]]]],
      };
      setGeoJsonText(JSON.stringify(geojson, null, 2));
    } else {
      setGeoJsonText('{\n  "type": "Polygon",\n  "coordinates": [[\n    [lng, lat],\n    [lng, lat],\n    [lng, lat],\n    [lng, lat]\n  ]]\n}');
    }
    setGeoJsonError('');
    setGeoJsonEditing(true);
  };

  const handleApplyGeoJson = () => {
    try {
      const parsed = JSON.parse(geoJsonText);
      let coords: [number, number][];
      // Accept GeoJSON Geometry, Feature, or FeatureCollection
      let geometry = parsed;
      if (parsed.type === 'Feature') geometry = parsed.geometry;
      else if (parsed.type === 'FeatureCollection' && parsed.features?.length > 0) geometry = parsed.features[0].geometry;

      if (geometry?.type === 'Polygon' && Array.isArray(geometry.coordinates?.[0])) {
        const ring: number[][] = geometry.coordinates[0];
        // Remove closing point if same as first
        const rawCoords = ring.length > 1 &&
          ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
          ? ring.slice(0, -1)
          : ring;
        if (rawCoords.length < 3) {
          setGeoJsonError(t('detail.events.geoJsonMinPoints'));
          return;
        }
        coords = rawCoords.map(c => [c[0], c[1]] as [number, number]);
      } else {
        setGeoJsonError(t('detail.events.geoJsonInvalidType'));
        return;
      }
      const center = computePolygonCenter(coords);
      onUpdate({ geo: { type: 'polygon', coordinates: coords, center } });
      setGeoJsonEditing(false);
      setGeoJsonError('');
    } catch {
      setGeoJsonError(t('detail.events.geoJsonParseError'));
    }
  };

  return (
    <div className="bg-bg-secondary border border-border-default rounded p-2 space-y-2">
      {/* Event header - always visible */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={handleLabelBlur}
          placeholder={t('detail.events.labelPlaceholder')}
          className="flex-1 px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent"
        />
        <div className="flex items-center gap-1">
          {event.geo && (
            <span title={eventGeoIsPolygon ? t('detail.events.hasZone') : t('detail.events.hasLocation')}>
              {eventGeoIsPolygon ? (
                <Hexagon size={12} className="text-accent" />
              ) : (
                <MapPin size={12} className="text-accent" />
              )}
            </span>
          )}
          {event.description && (
            <span title={t('detail.events.hasDescription')}>
              <FileText size={12} className="text-text-tertiary" />
            </span>
          )}
          <button
            type="button"
            onClick={onToggleExpand}
            className="p-1 text-text-tertiary hover:text-text-primary"
          >
            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {onExtract && (
            <button
              type="button"
              onClick={onExtract}
              className="p-1 text-text-tertiary hover:text-accent rounded"
              title={t('detail.events.extractToElement')}
            >
              <ArrowUpRight size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="p-1 text-text-tertiary hover:text-error hover:bg-pastel-pink rounded"
            title={t('detail.events.delete')}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Dates - always visible, syncs on blur to prevent re-sorting during editing */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Calendar size={12} className="text-text-tertiary shrink-0" />
          <span className="text-[10px] text-text-tertiary w-8">{t('detail.events.dateFrom')}</span>
          <input
            type="date"
            value={formatDateForInput(new Date(localDate))}
            onChange={(e) => {
              if (!e.target.value) return;
              const existingTime = formatTimeForInput(new Date(localDate));
              setLocalDate(new Date(`${e.target.value}T${existingTime}`));
            }}
            onBlur={() => {
              const d = new Date(localDate);
              if (!isNaN(d.getTime()) && d.getTime() !== new Date(event.date).getTime()) {
                onUpdate({ date: d });
              }
            }}
            className="flex-1 px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent"
          />
          <input
            type="time"
            value={formatTimeForInput(new Date(localDate))}
            onChange={(e) => {
              const existingDate = formatDateForInput(new Date(localDate));
              setLocalDate(new Date(`${existingDate}T${e.target.value || '00:00'}`));
            }}
            onBlur={() => {
              const d = new Date(localDate);
              if (!isNaN(d.getTime()) && d.getTime() !== new Date(event.date).getTime()) {
                onUpdate({ date: d });
              }
            }}
            className="w-20 px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3" /> {/* Spacer to align with calendar icon */}
          <span className="text-[10px] text-text-tertiary w-8">{t('detail.events.dateTo')}</span>
          <input
            type="date"
            value={localDateEnd ? formatDateForInput(new Date(localDateEnd)) : ''}
            onChange={(e) => {
              if (!e.target.value) {
                setLocalDateEnd(undefined);
                onUpdate({ dateEnd: undefined });
                return;
              }
              const existingTime = localDateEnd ? formatTimeForInput(new Date(localDateEnd)) : '00:00';
              setLocalDateEnd(new Date(`${e.target.value}T${existingTime}`));
            }}
            onBlur={() => {
              if (!localDateEnd) return;
              const d = new Date(localDateEnd);
              const oldEnd = event.dateEnd ? new Date(event.dateEnd).getTime() : null;
              if (!isNaN(d.getTime()) && d.getTime() !== oldEnd) {
                onUpdate({ dateEnd: d });
              }
            }}
            className="flex-1 px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent"
          />
          <input
            type="time"
            value={localDateEnd ? formatTimeForInput(new Date(localDateEnd)) : ''}
            onChange={(e) => {
              if (!localDateEnd) return;
              const existingDate = formatDateForInput(new Date(localDateEnd));
              setLocalDateEnd(new Date(`${existingDate}T${e.target.value || '00:00'}`));
            }}
            onBlur={() => {
              if (!localDateEnd) return;
              const d = new Date(localDateEnd);
              const oldEnd = event.dateEnd ? new Date(event.dateEnd).getTime() : null;
              if (!isNaN(d.getTime()) && d.getTime() !== oldEnd) {
                onUpdate({ dateEnd: d });
              }
            }}
            className="w-20 px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="space-y-2 pt-2 border-t border-border-default">
          {/* Description */}
          <div>
            <label className="text-[10px] text-text-tertiary">{t('detail.events.descriptionLabel')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescriptionBlur}
              placeholder={t('detail.events.descriptionPlaceholder')}
              rows={2}
              className="w-full px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent resize-y"
            />
          </div>

          {/* Source */}
          <div>
            <label className="text-[10px] text-text-tertiary">{t('detail.events.sourceLabel')}</label>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              onBlur={handleSourceBlur}
              placeholder={t('detail.events.sourcePlaceholder')}
              className="w-full px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent"
            />
          </div>

          {/* Geo section - adapts for zones vs points */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-text-tertiary flex items-center gap-1">
                {isZone ? <Hexagon size={10} /> : <MapPin size={10} />}
                {isZone ? t('detail.events.zoneOptional') : t('detail.events.locationOptional')}
              </label>
              {event.geo && (
                <button
                  type="button"
                  onClick={onClearGeo}
                  className="text-[10px] text-text-tertiary hover:text-error"
                >
                  {t('detail.events.clearLocation')}
                </button>
              )}
            </div>

            {/* Polygon summary (shown whenever event has polygon geo) */}
            {eventGeoIsPolygon && (
              <div className="text-[10px] text-text-secondary bg-bg-tertiary px-2 py-1 rounded mt-1">
                {t('detail.events.zoneInfo', {
                  points: (event.geo as Extract<GeoData, { type: 'polygon' }>).coordinates.length,
                  area: computePolygonAreaKm2((event.geo as Extract<GeoData, { type: 'polygon' }>).coordinates),
                })}
              </div>
            )}

            {/* Zone actions: inherit + draw + edit GeoJSON */}
            {!geoJsonEditing && (
              <div className="flex items-center gap-1 mt-1">
                {onInheritZone && (
                  <button
                    type="button"
                    onClick={onInheritZone}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded border border-border-default"
                  >
                    <Copy size={10} />
                    {t('detail.events.inheritZone')}
                  </button>
                )}
                {onDrawZone && (
                  <button
                    type="button"
                    onClick={onDrawZone}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded border border-border-default"
                  >
                    <PenTool size={10} />
                    {t('detail.events.drawZone')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleOpenGeoJsonEditor}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded border border-border-default"
                >
                  <Code size={10} />
                  {t('detail.events.editGeoJson')}
                </button>
              </div>
            )}

            {/* GeoJSON editor */}
            {geoJsonEditing && (
              <div className="space-y-1 mt-1">
                <textarea
                  value={geoJsonText}
                  onChange={(e) => { setGeoJsonText(e.target.value); setGeoJsonError(''); }}
                  className="w-full h-32 px-2 py-1 text-[10px] font-mono bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent resize-y"
                  placeholder='{"type":"Polygon","coordinates":[[[lng,lat],...]]}'
                  spellCheck={false}
                />
                {geoJsonError && (
                  <p className="text-[10px] text-error">{geoJsonError}</p>
                )}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleApplyGeoJson}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] text-white bg-accent hover:bg-accent/90 rounded"
                  >
                    <Check size={10} />
                    {t('detail.events.applyGeoJson')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setGeoJsonEditing(false); setGeoJsonError(''); }}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded border border-border-default"
                  >
                    <X size={10} />
                    {t('detail.properties.cancel')}
                  </button>
                </div>
              </div>
            )}

            {/* Point: lat/lng inputs + pick on map */}
            <div className="flex items-center gap-2 mt-1">
                <input
                  type="text"
                  value={latStr}
                  onChange={(e) => setLatStr(e.target.value)}
                  onBlur={handleLatBlur}
                  className="w-20 px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent"
                  placeholder={t('detail.location.latitude')}
                />
                <input
                  type="text"
                  value={lngStr}
                  onChange={(e) => setLngStr(e.target.value)}
                  onBlur={handleLngBlur}
                  className="w-20 px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent"
                  placeholder={t('detail.location.longitude')}
                />
                <button
                  type="button"
                  onClick={onPickLocation}
                  className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded border border-border-default"
                >
                  {t('detail.events.pickOnMap')}
                </button>
              </div>

            {/* Altitude + 3D toggle (shown when event has any geo) */}
            {event.geo && (
              <div className="flex items-center gap-1 mt-1">
                <button
                  type="button"
                  onClick={() => onUpdate({ geo: { ...event.geo!, extrude: !event.geo!.extrude } })}
                  className={`px-1.5 py-1 text-[10px] rounded border ${event.geo.extrude ? 'bg-accent text-white border-accent' : 'text-text-tertiary border-border-default hover:text-text-secondary'}`}
                  title={t('detail.location.extrude')}
                >
                  3D
                </button>
                <input
                  type="text"
                  value={altStr}
                  onChange={(e) => setAltStr(e.target.value)}
                  onBlur={() => {
                    if (!event.geo) return;
                    const alt = altStr.trim() ? parseFloat(altStr.trim()) : undefined;
                    const altitude = (alt !== undefined && !isNaN(alt)) ? alt : undefined;
                    if (altitude !== event.geo.altitude) {
                      onUpdate({ geo: { ...event.geo, altitude } });
                    }
                  }}
                  placeholder={t('detail.location.altitude')}
                  className="w-16 px-2 py-1 text-[10px] bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent"
                />
                <span className="text-[10px] text-text-tertiary">{t('detail.location.altUnit')}</span>
              </div>
            )}
          </div>

          {/* Properties */}
          <div>
            <label className="text-[10px] text-text-tertiary">{t('detail.properties.title')}</label>
            <PropertiesEditor
              properties={event.properties || []}
              onChange={(properties) =>
                onUpdate({ properties: properties.length > 0 ? properties : undefined })
              }
              suggestions={suggestions}
              onNewProperty={onNewProperty}
            />
          </div>
        </div>
      )}
    </div>
  );
});

export function EventsEditor({
  events,
  onChange,
  onOpenGeoPicker,
  suggestions = [],
  onNewProperty,
  onExtractToElement,
  isZone,
  currentZoneGeo,
  onDrawZone,
}: EventsEditorProps) {
  const { t } = useTranslation('panels');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const scrollParentRef = useRef<HTMLDivElement>(null);

  // Sort events by date (most recent first). Memoized: sorting 6k+ events each render is expensive.
  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [events]
  );

  // Virtualize the list: only render visible rows (needed for dossiers with thousands of events).
  // estimateSize = collapsed height; measureElement picks up the real height (incl. expanded state).
  const rowVirtualizer = useVirtualizer({
    count: sortedEvents.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 96,
    overscan: 4,
    getItemKey: (index) => sortedEvents[index].id,
  });

  // Add new event
  const handleAdd = useCallback(() => {
    const newEvent: ElementEvent = {
      id: generateUUID(),
      date: new Date(),
      label: '',
    };
    onChange([...events, newEvent]);
    setExpandedEventId(newEvent.id);
  }, [events, onChange]);

  // Remove event
  const handleRemove = useCallback(
    (eventId: string) => {
      const newEvents = events.filter((e) => e.id !== eventId);
      onChange(newEvents);
      if (expandedEventId === eventId) {
        setExpandedEventId(null);
      }
    },
    [events, expandedEventId, onChange]
  );

  // Update event
  const handleUpdate = useCallback(
    (eventId: string, updates: Partial<ElementEvent>) => {
      const newEvents = events.map((e) =>
        e.id === eventId ? { ...e, ...updates } : e
      );
      onChange(newEvents);
    },
    [events, onChange]
  );

  // Pick location on map (point or translate polygon center)
  const handlePickLocation = useCallback(
    (eventId: string) => {
      const event = events.find((e) => e.id === eventId);
      const center = event?.geo ? getGeoCenter(event.geo) : undefined;
      onOpenGeoPicker((lat, lng) => {
        if (event?.geo && isGeoPolygon(event.geo)) {
          // Translate polygon to new center
          const poly = event.geo as GeoPolygon;
          const oldCenter = getGeoCenter(poly);
          const dLat = lat - oldCenter.lat;
          const dLng = lng - oldCenter.lng;
          const newCoords = poly.coordinates.map(([ln, lt]) => [ln + dLng, lt + dLat] as [number, number]);
          handleUpdate(eventId, { geo: { ...poly, coordinates: newCoords, center: { lat, lng } } });
        } else {
          handleUpdate(eventId, { geo: { type: 'point', lat, lng } });
        }
      }, center);
    },
    [onOpenGeoPicker, handleUpdate, events]
  );

  // Inherit current zone geometry
  const handleInheritZone = useCallback(
    (eventId: string) => {
      if (currentZoneGeo) {
        handleUpdate(eventId, { geo: structuredClone(currentZoneGeo) });
      }
    },
    [currentZoneGeo, handleUpdate]
  );

  // Draw or edit zone on map
  const handleDrawZone = useCallback(
    (eventId: string) => {
      if (onDrawZone) {
        const event = events.find((e) => e.id === eventId);
        const existingPoly = (event?.geo && isGeoPolygon(event.geo)) ? event.geo as GeoPolygon : undefined;
        onDrawZone((geo) => {
          handleUpdate(eventId, { geo });
        }, existingPoly);
      }
    },
    [onDrawZone, handleUpdate, events]
  );

  // Clear geo from event
  const handleClearGeo = useCallback(
    (eventId: string) => {
      const event = events.find((e) => e.id === eventId);
      if (event) {
        const { geo, ...rest } = event;
        const newEvents = events.map((e) => (e.id === eventId ? rest as ElementEvent : e));
        onChange(newEvents);
      }
    },
    [events, onChange]
  );

  // Toggle event expansion
  const toggleEventExpand = (eventId: string) => {
    setExpandedEventId(expandedEventId === eventId ? null : eventId);
  };

  return (
    <div className="space-y-2">
      {/* Add button - always at top */}
      <button
        type="button"
        onClick={handleAdd}
        className="flex items-center gap-1 px-2 py-1 text-xs text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary rounded border border-dashed border-border-default w-full justify-center"
      >
        <Plus size={12} />
        {t('detail.events.add')}
      </button>

      {/* Events list - virtualized when many */}
      {sortedEvents.length === 0 ? (
        <p className="text-xs text-text-tertiary">{t('detail.events.noEvents')}</p>
      ) : (
        <div
          ref={scrollParentRef}
          className="pl-2 border-l-2 border-border-default max-h-[400px] overflow-y-auto"
        >
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              position: 'relative',
              width: '100%',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const event = sortedEvents[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    paddingBottom: 8,
                  }}
                >
                  <EventItem
                    event={event}
                    isExpanded={expandedEventId === event.id}
                    onToggleExpand={() => toggleEventExpand(event.id)}
                    onUpdate={(updates) => handleUpdate(event.id, updates)}
                    onRemove={() => handleRemove(event.id)}
                    onExtract={onExtractToElement ? () => onExtractToElement(event) : undefined}
                    onPickLocation={() => handlePickLocation(event.id)}
                    onClearGeo={() => handleClearGeo(event.id)}
                    suggestions={suggestions}
                    onNewProperty={onNewProperty}
                    isZone={isZone}
                    onInheritZone={isZone && currentZoneGeo ? () => handleInheritZone(event.id) : undefined}
                    onDrawZone={onDrawZone ? () => handleDrawZone(event.id) : undefined}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
