import { useCallback, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, X, Map as MapIcon, Tag, FileText, Settings, Palette, Paperclip, Calendar, MessageSquare, ExternalLink } from 'lucide-react';
import { useInvestigationStore } from '../../stores';
import type { Element, Confidence, ElementEvent, PropertyDefinition } from '../../types';
import { TagsEditor } from './TagsEditor';
import { PropertiesEditor } from './PropertiesEditor';
import { SuggestedPropertiesPopup } from './SuggestedPropertiesPopup';
import { VisualEditor } from './VisualEditor';
import { AssetsPanel } from './AssetsPanel';
import { GeoPicker } from './GeoPicker';
import { EventsEditor } from './EventsEditor';
import { AccordionSection, MarkdownEditor } from '../common';
import { CommentsSection } from './CommentsSection';

interface ElementDetailProps {
  element: Element;
}

// Check if a string looks like a URL
function isUrl(str: string): boolean {
  if (!str) return false;
  const trimmed = str.trim();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('www.');
}

// Get a proper URL (add https:// if needed)
function toUrl(str: string): string {
  const trimmed = str.trim();
  if (trimmed.startsWith('www.')) return `https://${trimmed}`;
  return trimmed;
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export function ElementDetail({ element }: ElementDetailProps) {
  const { t } = useTranslation('panels');
  const { updateElement, currentInvestigation, addExistingTag, addSuggestedProperty, associatePropertyWithTags, comments, togglePropertyDisplay } = useInvestigationStore();

  // Count unresolved comments for this element
  const elementComments = comments.filter(c => c.targetId === element.id);
  const unresolvedCommentCount = elementComments.filter(c => !c.resolved).length;

  // Local state for inputs
  const [label, setLabel] = useState(element.label);
  const [notes, setNotes] = useState(element.notes);
  const [source, setSource] = useState(element.source);
  const [confidence, setConfidence] = useState<Confidence | null>(element.confidence);
  const [date, setDate] = useState(element.date ? formatDateTimeForInput(element.date) : '');
  const [geoLat, setGeoLat] = useState(element.geo?.lat?.toString() ?? '');
  const [geoLng, setGeoLng] = useState(element.geo?.lng?.toString() ?? '');
  const [showGeoPicker, setShowGeoPicker] = useState(false);
  const [suggestedPropsTagSet, setSuggestedPropsTagSet] = useState<string | null>(null);

  // Track which element we're editing to avoid saving to wrong element
  const editingElementIdRef = useRef<string | null>(null);

  // Ref to the container for focus management
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced values
  const debouncedLabel = useDebounce(label, 500);
  const debouncedNotes = useDebounce(notes, 500);
  const debouncedSource = useDebounce(source, 500);

  // Sync local state when element changes (different element selected)
  useEffect(() => {
    // Reset editing state and sync values when switching elements
    editingElementIdRef.current = null;
    setLabel(element.label);
    setNotes(element.notes);
    setSource(element.source);
    setConfidence(element.confidence);
    setDate(element.date ? formatDateTimeForInput(element.date) : '');
    setGeoLat(element.geo?.lat?.toString() ?? '');
    setGeoLng(element.geo?.lng?.toString() ?? '');

    // Blur any focused input inside this panel when switching elements
    // This ensures keyboard events (like Delete) go to the canvas, not the input
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && containerRef.current?.contains(activeElement)) {
      activeElement.blur();
    }
  }, [element.id]);

  // Save debounced label - only if still editing the same element
  useEffect(() => {
    if (editingElementIdRef.current === element.id && debouncedLabel !== element.label) {
      updateElement(element.id, { label: debouncedLabel });
    }
  }, [debouncedLabel, element.id, element.label, updateElement]);

  // Save debounced notes - only if still editing the same element
  useEffect(() => {
    if (editingElementIdRef.current === element.id && debouncedNotes !== element.notes) {
      updateElement(element.id, { notes: debouncedNotes });
    }
  }, [debouncedNotes, element.id, element.notes, updateElement]);

  // Save debounced source - only if still editing the same element
  useEffect(() => {
    if (editingElementIdRef.current === element.id && debouncedSource !== element.source) {
      updateElement(element.id, { source: debouncedSource });
    }
  }, [debouncedSource, element.id, element.source, updateElement]);

  // Handle confidence change
  const handleConfidenceChange = useCallback(
    (value: number) => {
      const newConfidence = Math.round(value / 10) * 10 as Confidence;
      setConfidence(newConfidence);
      updateElement(element.id, { confidence: newConfidence });
    },
    [element.id, updateElement]
  );

  // Handle date change
  const handleDateChange = useCallback(
    (value: string) => {
      setDate(value);
      const newDate = value ? new Date(value) : null;
      updateElement(element.id, { date: newDate });
    },
    [element.id, updateElement]
  );

  // Handle geo coordinates change
  const handleGeoChange = useCallback(
    (lat: string, lng: string) => {
      const latNum = parseFloat(lat);
      const lngNum = parseFloat(lng);

      // Both must be valid numbers or both empty
      if (lat === '' && lng === '') {
        updateElement(element.id, { geo: null });
      } else if (!isNaN(latNum) && !isNaN(lngNum)) {
        // Validate ranges
        if (latNum >= -90 && latNum <= 90 && lngNum >= -180 && lngNum <= 180) {
          updateElement(element.id, { geo: { lat: latNum, lng: lngNum } });
        }
      }
    },
    [element.id, updateElement]
  );

  // Clear geo coordinates
  const handleClearGeo = useCallback(() => {
    setGeoLat('');
    setGeoLng('');
    updateElement(element.id, { geo: null });
  }, [element.id, updateElement]);

  // Pending geo picker callback (for events editor)
  const pendingGeoPickerCallback = useRef<((lat: number, lng: number) => void) | null>(null);

  // Handle geo picker confirmation
  const handleGeoPickerConfirm = useCallback(
    (lat: number, lng: number) => {
      if (pendingGeoPickerCallback.current) {
        // Call the pending callback from events editor
        pendingGeoPickerCallback.current(lat, lng);
        pendingGeoPickerCallback.current = null;
      } else {
        // Default: update current geo
        setGeoLat(lat.toString());
        setGeoLng(lng.toString());
        updateElement(element.id, { geo: { lat, lng } });
      }
      setShowGeoPicker(false);
    },
    [element.id, updateElement]
  );

  // Handle opening geo picker for events editor
  const handleOpenGeoPickerForHistory = useCallback(
    (callback: (lat: number, lng: number) => void) => {
      pendingGeoPickerCallback.current = callback;
      setShowGeoPicker(true);
    },
    []
  );

  // Handle events change
  const handleEventsChange = useCallback(
    (events: ElementEvent[]) => {
      updateElement(element.id, { events });
    },
    [element.id, updateElement]
  );

  // Handle tags change
  const handleTagsChange = useCallback(
    (tags: string[]) => {
      updateElement(element.id, { tags });
    },
    [element.id, updateElement]
  );

  // Handle properties change
  const handlePropertiesChange = useCallback(
    (properties: Element['properties']) => {
      updateElement(element.id, { properties });
    },
    [element.id, updateElement]
  );

  // Handle new tag (save to investigation settings for reuse)
  const handleNewTag = useCallback(
    (tag: string) => {
      addExistingTag(tag);
    },
    [addExistingTag]
  );

  // Handle TagSet tag added (show suggested properties popup)
  const handleTagSetTagAdded = useCallback((tagSetName: string) => {
    setSuggestedPropsTagSet(tagSetName);
  }, []);

  // Handle applying suggested properties from popup
  const handleApplySuggestedProperties = useCallback(
    (properties: Element['properties']) => {
      updateElement(element.id, {
        properties: [...element.properties, ...properties],
      });
    },
    [element.id, element.properties, updateElement]
  );

  // Handle new property (save to investigation settings for reuse)
  // Also associate it with the element's tags for smart suggestions
  const handleNewProperty = useCallback(
    (propertyDef: PropertyDefinition) => {
      addSuggestedProperty(propertyDef);
      // Associate this property with the element's tags
      if (element.tags.length > 0) {
        associatePropertyWithTags(propertyDef, element.tags);
      }
    },
    [addSuggestedProperty, associatePropertyWithTags, element.tags]
  );

  // Handle visual change
  const handleVisualChange = useCallback(
    (visual: Partial<Element['visual']>) => {
      updateElement(element.id, { visual: { ...element.visual, ...visual } });
    },
    [element.id, element.visual, updateElement]
  );

  // Badges for accordion sections
  const tagsBadge = element.tags.length > 0 ? (
    <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full">
      {element.tags.length}
    </span>
  ) : null;

  const propertiesBadge = element.properties.length > 0 ? (
    <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full">
      {element.properties.length}
    </span>
  ) : null;

  const eventsBadge = (element.events?.length || 0) > 0 ? (
    <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full">
      {element.events?.length}
    </span>
  ) : null;

  const assetsBadge = element.assetIds.length > 0 ? (
    <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full">
      {element.assetIds.length}
    </span>
  ) : null;

  const hasGeo = element.geo !== null;

  // Get all elements from the store
  const elements = useInvestigationStore((state) => state.elements);

  // Compute property suggestions based on actual usage on elements
  // The type comes from the actual properties on elements (most recent/explicit wins)
  const propertySuggestions: PropertyDefinition[] = (() => {
    const tagAssociations = currentInvestigation?.settings.tagPropertyAssociations || {};

    // Collect actual property types from all elements (real data is authoritative)
    // If multiple elements have the same property with different types, prefer non-text
    const actualPropertyTypes = new Map<string, PropertyDefinition>();
    for (const el of elements) {
      for (const prop of el.properties) {
        const existing = actualPropertyTypes.get(prop.key);
        const propType = prop.type || 'text';
        // Prefer non-text types (user explicitly chose them)
        if (!existing || (existing.type === 'text' && propType !== 'text')) {
          actualPropertyTypes.set(prop.key, {
            key: prop.key,
            type: propType
          });
        }
      }
    }

    // Collect properties from the current element's tags (for ordering priority)
    // But use actual type from elements if available
    const tagBasedProperties = new Map<string, PropertyDefinition>();
    for (const tag of element.tags) {
      const props = tagAssociations[tag];
      if (props) {
        props.forEach(p => {
          if (!tagBasedProperties.has(p.key)) {
            // Use actual type from elements if available, otherwise use association type
            const actualType = actualPropertyTypes.get(p.key);
            tagBasedProperties.set(p.key, actualType || p);
          }
        });
      }
    }

    // Collect properties from other elements (excluding current)
    const usedProperties = new Map<string, PropertyDefinition>();
    for (const el of elements) {
      if (el.id === element.id) continue; // Skip current element
      for (const prop of el.properties) {
        if (!usedProperties.has(prop.key)) {
          // Use the authoritative type we computed
          const actualType = actualPropertyTypes.get(prop.key);
          usedProperties.set(prop.key, actualType || {
            key: prop.key,
            type: prop.type || 'text'
          });
        }
      }
    }

    // Merge: tag-based first (most relevant), then other used properties
    const allSuggestions: PropertyDefinition[] = [...tagBasedProperties.values()];
    for (const [key, prop] of usedProperties) {
      if (!tagBasedProperties.has(key)) {
        allSuggestions.push(prop);
      }
    }

    return allSuggestions;
  })();

  // Simplified view for annotations (just notes + border)
  if (element.isAnnotation) {
    return (
      <div ref={containerRef} className="divide-y divide-border-default">
        {/* Content */}
        <AccordionSection
          id="content"
          title={t('detail.sections.content')}
          icon={<FileText size={12} />}
          defaultOpen={true}
        >
          <div className="space-y-1.5">
            <MarkdownEditor
              value={notes}
              onChange={(value) => {
                editingElementIdRef.current = element.id;
                setNotes(value);
              }}
              placeholder={t('detail.placeholders.markdown')}
              minRows={4}
              maxRows={15}
            />
          </div>
        </AccordionSection>

        {/* Appearance */}
        <AccordionSection
          id="visual"
          title={t('detail.sections.appearance')}
          icon={<Palette size={12} />}
          defaultOpen={false}
        >
          <VisualEditor
            visual={element.visual}
            onChange={handleVisualChange}
            hideShape
          />
        </AccordionSection>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="divide-y divide-border-default">
      {/* Identity */}
      <AccordionSection
        id="identity"
        title={t('detail.sections.identity')}
        icon={<Tag size={12} />}
        badge={tagsBadge}
        defaultOpen={true}
      >
        <div className="space-y-4">
          {/* Label */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">{t('detail.labels.name')}</label>
            <input
              type="text"
              value={label}
              onChange={(e) => {
                editingElementIdRef.current = element.id;
                setLabel(e.target.value);
              }}
              placeholder={t('detail.placeholders.label')}
              className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default sketchy-border focus:outline-none focus:border-accent input-focus-glow text-text-primary placeholder:text-text-tertiary transition-all"
            />
            {!label && (
              <p className="text-xs text-warning">{t('detail.warnings.noName')}</p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">{t('detail.labels.notes')}</label>
            <MarkdownEditor
              value={notes}
              onChange={(value) => {
                editingElementIdRef.current = element.id;
                setNotes(value);
              }}
              placeholder={t('detail.placeholders.markdown')}
              minRows={3}
              maxRows={10}
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">{t('detail.labels.tags')}</label>
            <TagsEditor
              tags={element.tags}
              onChange={handleTagsChange}
              suggestions={currentInvestigation?.settings.existingTags}
              onNewTag={handleNewTag}
              onTagSetTagAdded={handleTagSetTagAdded}
            />
          </div>
        </div>
      </AccordionSection>

      {/* Metadata */}
      <AccordionSection
        id="metadata"
        title={t('detail.sections.metadata')}
        icon={<FileText size={12} />}
        defaultOpen={false}
      >
        <div className="space-y-4">
          {/* Confidence */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-text-secondary">
                {t('detail.labels.confidence')}
              </label>
              <span className="text-xs text-text-tertiary">
                {confidence !== null ? `${confidence}%` : t('detail.labels.confidenceUndefined')}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="10"
              value={confidence ?? 50}
              onChange={(e) => handleConfidenceChange(parseInt(e.target.value))}
              className="w-full h-1.5 bg-bg-tertiary rounded appearance-none cursor-pointer accent-accent"
            />
          </div>

          {/* Source */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">{t('detail.labels.source')}</label>
            <div className="relative">
              <input
                type="text"
                value={source}
                onChange={(e) => {
                  editingElementIdRef.current = element.id;
                  setSource(e.target.value);
                }}
                placeholder={t('detail.placeholders.source')}
                className={`w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default sketchy-border focus:outline-none focus:border-accent input-focus-glow text-text-primary placeholder:text-text-tertiary transition-all ${isUrl(source) ? 'pr-9' : ''}`}
              />
              {isUrl(source) && (
                <button
                  type="button"
                  onClick={() => window.open(toUrl(source), '_blank', 'noopener,noreferrer')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-tertiary hover:text-accent transition-colors"
                  title={t('detail.labels.openInNewTab')}
                >
                  <ExternalLink size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">{t('detail.labels.referenceDate')}</label>
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default sketchy-border focus:outline-none focus:border-accent input-focus-glow text-text-primary transition-all"
            />
            <p className="text-[10px] text-text-tertiary">
              {t('detail.labels.dateCollectedHelp')}. {t('detail.labels.useEventsForDates')}
            </p>
          </div>
        </div>
      </AccordionSection>

      {/* Events */}
      <AccordionSection
        id="events"
        title={t('detail.sections.events')}
        icon={<Calendar size={12} />}
        badge={eventsBadge}
        defaultOpen={false}
      >
        <div className="space-y-2">
          <p className="text-[10px] text-text-tertiary">
            {t('detail.events.description')}
          </p>
          <EventsEditor
            events={element.events || []}
            onChange={handleEventsChange}
            onOpenGeoPicker={handleOpenGeoPickerForHistory}
            suggestions={propertySuggestions}
            onNewProperty={handleNewProperty}
          />
        </div>
      </AccordionSection>

      {/* Location */}
      <AccordionSection
        id="location"
        title={t('detail.sections.location')}
        icon={<MapPin size={12} />}
        badge={hasGeo ? (
          <span className="text-[10px] bg-green-500/20 text-green-600 px-1.5 py-0.5 rounded-full">
            Geo
          </span>
        ) : null}
        defaultOpen={false}
      >
        <div className="space-y-3">
          <p className="text-[10px] text-text-tertiary">
            {t('detail.location.description')}
          </p>
          {/* Current position */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-text-secondary">
                {t('detail.location.gpsCoordinates')}
              </label>
              {(geoLat || geoLng) && (
                <button
                  onClick={handleClearGeo}
                  className="text-xs text-text-tertiary hover:text-error transition-colors flex items-center gap-0.5"
                  title={t('detail.location.removeLocation')}
                >
                  <X size={12} />
                  {t('detail.location.clearLocation')}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <input
                  type="text"
                  value={geoLat}
                  onChange={(e) => setGeoLat(e.target.value)}
                  onBlur={() => handleGeoChange(geoLat, geoLng)}
                  placeholder={t('detail.location.latitude')}
                  className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default sketchy-border focus:outline-none focus:border-accent input-focus-glow text-text-primary placeholder:text-text-tertiary transition-all"
                />
                <span className="text-[10px] text-text-tertiary">{t('detail.location.latRange')}</span>
              </div>
              <div className="flex-1">
                <input
                  type="text"
                  value={geoLng}
                  onChange={(e) => setGeoLng(e.target.value)}
                  onBlur={() => handleGeoChange(geoLat, geoLng)}
                  placeholder={t('detail.location.longitude')}
                  className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default sketchy-border focus:outline-none focus:border-accent input-focus-glow text-text-primary placeholder:text-text-tertiary transition-all"
                />
                <span className="text-[10px] text-text-tertiary">{t('detail.location.lngRange')}</span>
              </div>
            </div>
            <button
              onClick={() => {
                pendingGeoPickerCallback.current = null;
                setShowGeoPicker(true);
              }}
              className="w-full px-3 py-2 text-sm bg-bg-tertiary border border-border-default sketchy-border hover:bg-bg-secondary transition-colors flex items-center justify-center gap-2 text-text-secondary"
            >
              <MapIcon size={14} />
              {t('detail.location.pickOnMap')}
            </button>
          </div>
        </div>
      </AccordionSection>

      {/* Properties */}
      <AccordionSection
        id="properties"
        title={t('detail.sections.properties')}
        icon={<Settings size={12} />}
        badge={propertiesBadge}
        defaultOpen={false}
      >
        <PropertiesEditor
          properties={element.properties}
          onChange={handlePropertiesChange}
          suggestions={propertySuggestions}
          onNewProperty={handleNewProperty}
          displayedProperties={currentInvestigation?.settings.displayedProperties}
          onToggleDisplayProperty={togglePropertyDisplay}
        />
      </AccordionSection>

      {/* Appearance */}
      <AccordionSection
        id="appearance"
        title={t('detail.sections.appearance')}
        icon={<Palette size={12} />}
        defaultOpen={false}
      >
        <VisualEditor
          visual={element.visual}
          onChange={handleVisualChange}
        />
      </AccordionSection>

      {/* Comments */}
      <AccordionSection
        id="comments"
        title={t('detail.sections.comments')}
        icon={<MessageSquare size={12} />}
        badge={unresolvedCommentCount > 0 ? unresolvedCommentCount : undefined}
        defaultOpen={unresolvedCommentCount > 0}
      >
        <CommentsSection targetId={element.id} targetType="element" />
      </AccordionSection>

      {/* Files */}
      <AccordionSection
        id="assets"
        title={t('detail.sections.files')}
        icon={<Paperclip size={12} />}
        badge={assetsBadge}
        defaultOpen={false}
      >
        <AssetsPanel element={element} />
      </AccordionSection>

      {/* Timestamps (read-only) */}
      <div className="px-3 py-2 border-t border-border-default bg-bg-secondary/50">
        <div className="flex justify-between text-[10px] text-text-tertiary">
          <span>{t('detail.timestamps.createdAt')} {formatDateTimeDisplay(element.createdAt)}</span>
          <span>{t('detail.timestamps.updatedAt')} {formatDateTimeDisplay(element.updatedAt)}</span>
        </div>
      </div>

      {/* Geo Picker Modal */}
      {showGeoPicker && (
        <GeoPicker
          initialLat={element.geo?.lat}
          initialLng={element.geo?.lng}
          onConfirm={handleGeoPickerConfirm}
          onCancel={() => setShowGeoPicker(false)}
        />
      )}

      {/* Suggested Properties Popup */}
      {suggestedPropsTagSet && (
        <SuggestedPropertiesPopup
          tagSetName={suggestedPropsTagSet}
          existingPropertyKeys={element.properties.map((p) => p.key)}
          onApply={handleApplySuggestedProperties}
          onClose={() => setSuggestedPropsTagSet(null)}
        />
      )}
    </div>
  );
}

// Format date for datetime-local input (YYYY-MM-DDTHH:mm)
function formatDateTimeForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Format date for display (DD/MM/YYYY HH:mm)
function formatDateTimeDisplay(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}
