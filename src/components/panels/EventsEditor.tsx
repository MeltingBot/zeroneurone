import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, MapPin, Calendar, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import type { ElementEvent, PropertyDefinition } from '../../types';
import { generateUUID } from '../../utils';
import { PropertiesEditor } from './PropertiesEditor';

interface EventsEditorProps {
  events: ElementEvent[];
  onChange: (events: ElementEvent[]) => void;
  onOpenGeoPicker: (callback: (lat: number, lng: number) => void) => void;
  /** Property suggestions from the investigation */
  suggestions?: PropertyDefinition[];
  /** Callback when a new property is created */
  onNewProperty?: (propertyDef: PropertyDefinition) => void;
}

// Sub-component for a single event - manages local state for text fields
interface EventItemProps {
  event: ElementEvent;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (updates: Partial<ElementEvent>) => void;
  onRemove: () => void;
  onPickLocation: () => void;
  onClearGeo: () => void;
  suggestions: PropertyDefinition[];
  onNewProperty?: (propertyDef: PropertyDefinition) => void;
}

function EventItem({
  event,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onRemove,
  onPickLocation,
  onClearGeo,
  suggestions,
  onNewProperty,
}: EventItemProps) {
  const { t } = useTranslation('panels');

  // Local state for text fields - syncs on blur
  const [label, setLabel] = useState(event.label || '');
  const [description, setDescription] = useState(event.description || '');
  const [source, setSource] = useState(event.source || '');
  const [latStr, setLatStr] = useState(event.geo?.lat?.toFixed(6) ?? '');
  const [lngStr, setLngStr] = useState(event.geo?.lng?.toFixed(6) ?? '');

  // Sync local state when event prop changes (e.g., from undo/redo or collab)
  useEffect(() => {
    setLabel(event.label || '');
    setDescription(event.description || '');
    setSource(event.source || '');
    setLatStr(event.geo?.lat?.toFixed(6) ?? '');
    setLngStr(event.geo?.lng?.toFixed(6) ?? '');
  }, [event.id, event.label, event.description, event.source, event.geo?.lat, event.geo?.lng]);

  // Format date for date input (YYYY-MM-DD) in LOCAL timezone
  const formatDateForInput = (date: Date): string => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
      if (lat !== event.geo?.lat) {
        onUpdate({ geo: { lat, lng: event.geo?.lng ?? 0 } });
      }
    }
  };

  const handleLngBlur = () => {
    const lng = parseFloat(lngStr);
    if (!isNaN(lng) && lng >= -180 && lng <= 180) {
      if (lng !== event.geo?.lng) {
        onUpdate({ geo: { lat: event.geo?.lat ?? 0, lng } });
      }
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
            <span title={t('detail.events.hasLocation')}>
              <MapPin size={12} className="text-accent" />
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

      {/* Dates - always visible (date pickers sync immediately, no typing lag) */}
      <div className="flex items-center gap-2">
        <Calendar size={12} className="text-text-tertiary shrink-0" />
        <input
          type="date"
          value={formatDateForInput(new Date(event.date))}
          onChange={(e) => {
            if (e.target.value) {
              onUpdate({ date: new Date(e.target.value + 'T12:00:00') });
            }
          }}
          className="flex-1 px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent"
        />
        <span className="text-xs text-text-tertiary">{t('detail.events.dateTo')}</span>
        <input
          type="date"
          value={event.dateEnd ? formatDateForInput(new Date(event.dateEnd)) : ''}
          onChange={(e) => {
            onUpdate({
              dateEnd: e.target.value ? new Date(e.target.value + 'T12:00:00') : undefined,
            });
          }}
          placeholder={t('detail.events.dateEndOptional')}
          className="flex-1 px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent"
        />
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

          {/* Geo coordinates (optional) */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-text-tertiary flex items-center gap-1">
                <MapPin size={10} />
                {t('detail.events.locationOptional')}
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
}

export function EventsEditor({
  events,
  onChange,
  onOpenGeoPicker,
  suggestions = [],
  onNewProperty,
}: EventsEditorProps) {
  const { t } = useTranslation('panels');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Sort events by date (most recent first)
  const sortedEvents = [...events].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

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

  // Pick location on map
  const handlePickLocation = useCallback(
    (eventId: string) => {
      onOpenGeoPicker((lat, lng) => {
        handleUpdate(eventId, { geo: { lat, lng } });
      });
    },
    [onOpenGeoPicker, handleUpdate]
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

      {/* Events list - scrollable when many */}
      {sortedEvents.length === 0 ? (
        <p className="text-xs text-text-tertiary">{t('detail.events.noEvents')}</p>
      ) : (
        <div className="space-y-2 pl-2 border-l-2 border-border-default max-h-[400px] overflow-y-auto">
          {sortedEvents.map((event) => (
            <EventItem
              key={event.id}
              event={event}
              isExpanded={expandedEventId === event.id}
              onToggleExpand={() => toggleEventExpand(event.id)}
              onUpdate={(updates) => handleUpdate(event.id, updates)}
              onRemove={() => handleRemove(event.id)}
              onPickLocation={() => handlePickLocation(event.id)}
              onClearGeo={() => handleClearGeo(event.id)}
              suggestions={suggestions}
              onNewProperty={onNewProperty}
            />
          ))}
        </div>
      )}
    </div>
  );
}
