import { useState, useCallback } from 'react';
import { Plus, Trash2, MapPin, Calendar, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import type { ElementEvent } from '../../types';
import { generateUUID } from '../../utils';

interface EventsEditorProps {
  events: ElementEvent[];
  onChange: (events: ElementEvent[]) => void;
  onOpenGeoPicker: (callback: (lat: number, lng: number) => void) => void;
}

export function EventsEditor({
  events,
  onChange,
  onOpenGeoPicker,
}: EventsEditorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
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
    setIsExpanded(true);
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

  // Format date for date input (YYYY-MM-DD) in LOCAL timezone
  const formatDateForInput = (date: Date): string => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary"
        >
          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          Historique / Événements ({events.length})
        </button>
        <button
          onClick={handleAdd}
          className="p-1 text-text-tertiary hover:text-accent hover:bg-bg-tertiary rounded"
          title="Ajouter un événement"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Expanded list */}
      {isExpanded && (
        <div className="space-y-2 pl-2 border-l-2 border-border-default">
          {sortedEvents.length === 0 ? (
            <p className="text-xs text-text-tertiary py-2">
              Aucun événement. Ajoutez des événements pour suivre l'historique.
            </p>
          ) : (
            sortedEvents.map((event) => {
              const isEventExpanded = expandedEventId === event.id;

              return (
                <div
                  key={event.id}
                  className="bg-bg-secondary border border-border-default rounded p-2 space-y-2"
                >
                  {/* Event header - always visible */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleEventExpand(event.id)}
                      className="flex-1 flex items-center gap-2 text-left"
                    >
                      <input
                        type="text"
                        value={event.label || ''}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleUpdate(event.id, { label: e.target.value });
                        }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Label (ex: Escale Marseille, Site piraté...)"
                        className="flex-1 px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent"
                      />
                    </button>
                    <div className="flex items-center gap-1">
                      {event.geo && (
                        <span title="A une position">
                          <MapPin size={12} className="text-accent" />
                        </span>
                      )}
                      {event.description && (
                        <span title="A une description">
                          <FileText size={12} className="text-text-tertiary" />
                        </span>
                      )}
                      <button
                        onClick={() => toggleEventExpand(event.id)}
                        className="p-1 text-text-tertiary hover:text-text-primary"
                      >
                        {isEventExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      <button
                        onClick={() => handleRemove(event.id)}
                        className="p-1 text-text-tertiary hover:text-error hover:bg-pastel-pink rounded"
                        title="Supprimer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Dates - always visible */}
                  <div className="flex items-center gap-2">
                    <Calendar size={12} className="text-text-tertiary shrink-0" />
                    <input
                      type="date"
                      value={formatDateForInput(new Date(event.date))}
                      onChange={(e) => {
                        if (e.target.value) {
                          handleUpdate(event.id, {
                            date: new Date(e.target.value + 'T12:00:00'),
                          });
                        }
                      }}
                      className="flex-1 px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent"
                    />
                    <span className="text-xs text-text-tertiary">à</span>
                    <input
                      type="date"
                      value={event.dateEnd ? formatDateForInput(new Date(event.dateEnd)) : ''}
                      onChange={(e) => {
                        handleUpdate(event.id, {
                          dateEnd: e.target.value ? new Date(e.target.value + 'T12:00:00') : undefined,
                        });
                      }}
                      placeholder="Fin (optionnel)"
                      className="flex-1 px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent"
                    />
                  </div>

                  {/* Expanded details */}
                  {isEventExpanded && (
                    <div className="space-y-2 pt-2 border-t border-border-default">
                      {/* Description */}
                      <div>
                        <label className="text-[10px] text-text-tertiary">Description</label>
                        <textarea
                          value={event.description || ''}
                          onChange={(e) =>
                            handleUpdate(event.id, { description: e.target.value || undefined })
                          }
                          placeholder="Description détaillée..."
                          rows={2}
                          className="w-full px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent resize-y"
                        />
                      </div>

                      {/* Source */}
                      <div>
                        <label className="text-[10px] text-text-tertiary">Source</label>
                        <input
                          type="text"
                          value={event.source || ''}
                          onChange={(e) =>
                            handleUpdate(event.id, { source: e.target.value || undefined })
                          }
                          placeholder="Source de l'information..."
                          className="w-full px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent"
                        />
                      </div>

                      {/* Geo coordinates (optional) */}
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] text-text-tertiary flex items-center gap-1">
                            <MapPin size={10} />
                            Localisation (optionnel)
                          </label>
                          {event.geo && (
                            <button
                              onClick={() => handleClearGeo(event.id)}
                              className="text-[10px] text-text-tertiary hover:text-error"
                            >
                              Effacer
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            type="text"
                            value={event.geo?.lat?.toFixed(6) ?? ''}
                            onChange={(e) => {
                              const lat = parseFloat(e.target.value);
                              if (!isNaN(lat) && lat >= -90 && lat <= 90) {
                                handleUpdate(event.id, {
                                  geo: { lat, lng: event.geo?.lng ?? 0 },
                                });
                              }
                            }}
                            className="w-20 px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent"
                            placeholder="Lat"
                          />
                          <input
                            type="text"
                            value={event.geo?.lng?.toFixed(6) ?? ''}
                            onChange={(e) => {
                              const lng = parseFloat(e.target.value);
                              if (!isNaN(lng) && lng >= -180 && lng <= 180) {
                                handleUpdate(event.id, {
                                  geo: { lat: event.geo?.lat ?? 0, lng },
                                });
                              }
                            }}
                            className="w-20 px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent"
                            placeholder="Lng"
                          />
                          <button
                            onClick={() => handlePickLocation(event.id)}
                            className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded border border-border-default"
                          >
                            Carte
                          </button>
                        </div>
                      </div>

                      {/* Properties (key-value pairs) */}
                      <div>
                        <label className="text-[10px] text-text-tertiary">Propriétés additionnelles</label>
                        <EventPropertiesEditor
                          properties={event.properties || {}}
                          onChange={(properties) =>
                            handleUpdate(event.id, {
                              properties: Object.keys(properties).length > 0 ? properties : undefined,
                            })
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// Sub-component for event properties
interface EventPropertiesEditorProps {
  properties: Record<string, string>;
  onChange: (properties: Record<string, string>) => void;
}

function EventPropertiesEditor({ properties, onChange }: EventPropertiesEditorProps) {
  const entries = Object.entries(properties);

  const handleAddProperty = () => {
    onChange({ ...properties, '': '' });
  };

  const handleRemoveProperty = (key: string) => {
    const newProps = { ...properties };
    delete newProps[key];
    onChange(newProps);
  };

  const handleUpdateKey = (oldKey: string, newKey: string) => {
    if (oldKey === newKey) return;
    const newProps: Record<string, string> = {};
    for (const [k, v] of Object.entries(properties)) {
      newProps[k === oldKey ? newKey : k] = v;
    }
    onChange(newProps);
  };

  const handleUpdateValue = (key: string, value: string) => {
    onChange({ ...properties, [key]: value });
  };

  return (
    <div className="space-y-1">
      {entries.map(([key, value], index) => (
        <div key={index} className="flex items-center gap-1">
          <input
            type="text"
            value={key}
            onChange={(e) => handleUpdateKey(key, e.target.value)}
            placeholder="Clé"
            className="w-24 px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent"
          />
          <span className="text-text-tertiary">:</span>
          <input
            type="text"
            value={value}
            onChange={(e) => handleUpdateValue(key, e.target.value)}
            placeholder="Valeur"
            className="flex-1 px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent"
          />
          <button
            onClick={() => handleRemoveProperty(key)}
            className="p-1 text-text-tertiary hover:text-error"
          >
            <Trash2 size={10} />
          </button>
        </div>
      ))}
      <button
        onClick={handleAddProperty}
        className="text-xs text-text-tertiary hover:text-accent flex items-center gap-1"
      >
        <Plus size={10} />
        Ajouter une propriété
      </button>
    </div>
  );
}
