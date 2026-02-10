import { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { MapPin, X, Check, Map as MapIcon, Tag, FileText, Settings, Palette, Paperclip, Calendar, MessageSquare, ExternalLink, Lock, LockOpen, Layers } from 'lucide-react';
import { useInvestigationStore, useTagSetStore, useTabStore } from '../../stores';
import type { Element, Confidence, ElementEvent, PropertyDefinition } from '../../types';
import { syncService } from '../../services/syncService';
import { getYMaps } from '../../types/yjs';
import { yMapToElement } from '../../services/yjs/elementMapper';
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
  // Individual selectors — prevent re-renders when unrelated store state changes
  const updateElement = useInvestigationStore((s) => s.updateElement);
  const currentInvestigation = useInvestigationStore((s) => s.currentInvestigation);
  const addExistingTag = useInvestigationStore((s) => s.addExistingTag);
  const addSuggestedProperty = useInvestigationStore((s) => s.addSuggestedProperty);
  const associatePropertyWithTags = useInvestigationStore((s) => s.associatePropertyWithTags);
  const comments = useInvestigationStore((s) => s.comments);
  const togglePropertyDisplay = useInvestigationStore((s) => s.togglePropertyDisplay);
  const canvasTabs = useTabStore((s) => s.tabs);
  const setActiveTab = useTabStore((s) => s.setActiveTab);

  // Element's tab membership
  const elementTabs = useMemo(() => {
    return canvasTabs.filter(tab => tab.memberElementIds.includes(element.id));
  }, [canvasTabs, element.id]);

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
  // Track what was last saved locally (independent of prop update timing)
  const [lastSavedGeo, setLastSavedGeo] = useState<{ lat: number; lng: number } | null>(element.geo);
  const [showGeoPicker, setShowGeoPicker] = useState(false);
  const [suggestedPropsTagSet, setSuggestedPropsTagSet] = useState<string | null>(null);

  // Track which element we're editing to avoid saving to wrong element
  const editingElementIdRef = useRef<string | null>(null);

  // Ref to the container for focus management
  const containerRef = useRef<HTMLDivElement>(null);

  // Refs to track what we last SENT to the store - used to detect our own echoes
  // This is different from current local state: user might type more after debounce fires
  const lastSyncedLabelRef = useRef(element.label);
  const lastSyncedNotesRef = useRef(element.notes);
  const lastSyncedSourceRef = useRef(element.source);


  // Debounced values
  const debouncedLabel = useDebounce(label, 500);
  const debouncedNotes = useDebounce(notes, 500);
  const debouncedSource = useDebounce(source, 500);

  // Sync local state when element changes (different element selected)
  useEffect(() => {
    // IMPORTANT: Blur any focused input FIRST (before resetting state)
    // This ensures onBlur handlers can save with the current values
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && containerRef.current?.contains(activeElement)) {
      activeElement.blur();
    }

    // Read DIRECTLY from Y.Doc (source of truth) instead of Zustand
    // Zustand state may be stale due to 50ms throttled sync from Y.Doc
    let freshElement: Element | null = null;

    const ydoc = syncService.getYDoc();
    if (ydoc) {
      try {
        const { elements: elementsMap } = getYMaps(ydoc);
        const ymap = elementsMap.get(element.id);
        if (ymap) {
          freshElement = yMapToElement(ymap);
        }
      } catch (e) {
        console.warn('[ElementDetail] Failed to read from Y.Doc:', e);
      }
    }

    // Fallback to Zustand if Y.Doc read failed
    if (!freshElement) {
      freshElement = useInvestigationStore.getState().elements.find(el => el.id === element.id) ?? null;
    }

    if (!freshElement) return;

    // Then reset editing state and sync values for the new element
    editingElementIdRef.current = null;
    setLabel(freshElement.label);
    setNotes(freshElement.notes);
    setSource(freshElement.source);
    setConfidence(freshElement.confidence);
    setDate(freshElement.date ? formatDateTimeForInput(freshElement.date) : '');
    setGeoLat(freshElement.geo?.lat?.toString() ?? '');
    setGeoLng(freshElement.geo?.lng?.toString() ?? '');
    setLastSavedGeo(freshElement.geo ?? null);
    // Also reset lastSynced refs to prevent false "remote change" detection
    lastSyncedLabelRef.current = freshElement.label;
    lastSyncedNotesRef.current = freshElement.notes;
    lastSyncedSourceRef.current = freshElement.source;
  }, [element.id]);

  // Sync fields when changed externally (e.g., by another user via Yjs)
  // Only rely on lastSyncedRef for echo detection (no editingRef check - causes timing issues)
  useEffect(() => {
    // Our own echo coming back - ignore
    if (element.label === lastSyncedLabelRef.current) return;
    // Remote change - accept and update ref
    setLabel(element.label);
    lastSyncedLabelRef.current = element.label;
  }, [element.label, element.id]);

  useEffect(() => {
    if (element.notes === lastSyncedNotesRef.current) return;
    setNotes(element.notes);
    lastSyncedNotesRef.current = element.notes;
  }, [element.notes, element.id]);

  useEffect(() => {
    if (element.source === lastSyncedSourceRef.current) return;
    setSource(element.source);
    lastSyncedSourceRef.current = element.source;
  }, [element.source, element.id]);

  // Note: We intentionally don't sync on element.geo changes
  // The [element.id] effect handles initial load when element changes
  // Local state (geoLat, geoLng, lastSavedGeo) is managed by:
  // - User typing in inputs
  // - Map picker selection
  // - Save button (handleValidateGeoClick)
  // - Clear button (handleClearGeo)

  // Save debounced label - only if still editing the same element
  useEffect(() => {
    if (editingElementIdRef.current === element.id && debouncedLabel !== element.label) {
      // Update ref BEFORE syncing so we recognize our own echo
      lastSyncedLabelRef.current = debouncedLabel;
      updateElement(element.id, { label: debouncedLabel });
    }
  }, [debouncedLabel, element.id, element.label, updateElement]);

  // Save debounced notes - only if still editing the same element
  useEffect(() => {
    if (editingElementIdRef.current === element.id && debouncedNotes !== element.notes) {
      lastSyncedNotesRef.current = debouncedNotes;
      updateElement(element.id, { notes: debouncedNotes });
    }
  }, [debouncedNotes, element.id, element.notes, updateElement]);

  // Save debounced source - only if still editing the same element
  useEffect(() => {
    if (editingElementIdRef.current === element.id && debouncedSource !== element.source) {
      lastSyncedSourceRef.current = debouncedSource;
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

  // Clear geo coordinates
  const handleClearGeo = useCallback(() => {
    // Use flushSync to force synchronous state updates before any async operations
    // This prevents React batching from being affected by store updates
    flushSync(() => {
      setGeoLat('');
      setGeoLng('');
      setLastSavedGeo(null);
    });
    // Then update store (async, but local state is already committed)
    useInvestigationStore.getState().updateElement(element.id, { geo: null });
  }, [element.id]);

  // Validate and save geo coordinates from button click
  const handleValidateGeoClick = useCallback(() => {
    const latTrimmed = geoLat.trim();
    const lngTrimmed = geoLng.trim();

    // Both must be filled
    if (!latTrimmed || !lngTrimmed) return;

    const latNum = parseFloat(latTrimmed);
    const lngNum = parseFloat(lngTrimmed);

    // Both must be valid numbers
    if (isNaN(latNum) || isNaN(lngNum)) return;

    // Both must be in valid range
    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) return;

    const newGeo = { lat: latNum, lng: lngNum };

    // Use flushSync to force synchronous state updates before any async operations
    // This prevents React batching from being affected by store updates
    flushSync(() => {
      setGeoLat(latNum.toString());
      setGeoLng(lngNum.toString());
      setLastSavedGeo(newGeo);
    });

    // Then update store (async, but local state is already committed)
    useInvestigationStore.getState().updateElement(element.id, { geo: newGeo });
  }, [geoLat, geoLng, element.id]);

  // Pending geo picker callback (for events editor)
  const pendingGeoPickerCallback = useRef<((lat: number, lng: number) => void) | null>(null);
  const pendingGeoPickerInitialGeo = useRef<{ lat: number; lng: number } | null>(null);

  // Handle geo picker confirmation
  const handleGeoPickerConfirm = useCallback(
    (lat: number, lng: number) => {
      if (pendingGeoPickerCallback.current) {
        // Call the pending callback from events editor
        pendingGeoPickerCallback.current(lat, lng);
        pendingGeoPickerCallback.current = null;
        pendingGeoPickerInitialGeo.current = null;
      } else {
        // Save immediately when selecting from map (user expects instant feedback)
        const newGeo = { lat, lng };
        flushSync(() => {
          setGeoLat(lat.toString());
          setGeoLng(lng.toString());
          setLastSavedGeo(newGeo);
        });
        useInvestigationStore.getState().updateElement(element.id, { geo: newGeo });
      }
      setShowGeoPicker(false);
    },
    [element.id]
  );

  // Handle opening geo picker for events editor
  const handleOpenGeoPickerForHistory = useCallback(
    (callback: (lat: number, lng: number) => void, initialGeo?: { lat: number; lng: number }) => {
      pendingGeoPickerCallback.current = callback;
      pendingGeoPickerInitialGeo.current = initialGeo || null;
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
      // Pass only changed properties — store merges with current visual
      // Avoids overwriting concurrent remote changes with stale local values
      updateElement(element.id, { visual });
    },
    [element.id, updateElement]
  );

  // Handle position lock toggle
  const handleToggleLock = useCallback(() => {
    updateElement(element.id, { isPositionLocked: !element.isPositionLocked });
  }, [element.id, element.isPositionLocked, updateElement]);

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

  // Use lastSavedGeo for immediate UI feedback (instead of element.geo which may be stale)
  const hasGeo = lastSavedGeo !== null;

  // Check if current input values match the saved geo (nothing to save)
  const geoInputsMatchSaved = (() => {
    const latTrimmed = geoLat.trim();
    const lngTrimmed = geoLng.trim();

    // Both empty → matches if nothing saved
    if (!latTrimmed && !lngTrimmed) {
      return !hasGeo;
    }

    // Parse numbers
    const latNum = parseFloat(latTrimmed);
    const lngNum = parseFloat(lngTrimmed);

    // Both must be valid numbers in range to compare
    const latValid = latTrimmed && !isNaN(latNum) && latNum >= -90 && latNum <= 90;
    const lngValid = lngTrimmed && !isNaN(lngNum) && lngNum >= -180 && lngNum <= 180;

    // If both are valid, check if they match saved values
    if (latValid && lngValid && hasGeo && lastSavedGeo) {
      return latNum === lastSavedGeo.lat && lngNum === lastSavedGeo.lng;
    }

    // Any input that differs from saved state → show Save button
    return false;
  })();

  // Check if Save button can actually save (both coords valid)
  const canSaveGeo = (() => {
    const latTrimmed = geoLat.trim();
    const lngTrimmed = geoLng.trim();
    if (!latTrimmed || !lngTrimmed) return false;
    const latNum = parseFloat(latTrimmed);
    const lngNum = parseFloat(lngTrimmed);
    if (isNaN(latNum) || isNaN(lngNum)) return false;
    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) return false;
    return true;
  })();

  // Check if there's anything to clear (values in inputs OR saved geo)
  const hasGeoToClear = !!(geoLat.trim() || geoLng.trim() || hasGeo);

  // NOTE: No subscription to `elements` — reading a snapshot avoids re-rendering
  // ElementDetail on every element change (3000 elements × 50 props = 150K wasted ops).
  // propertySuggestions only needs the global set of property keys/types, which changes rarely.

  // Get TagSets to retrieve choices for 'choice' type properties
  const tagSetsMap = useTagSetStore((state) => state.tagSets);

  // Build a map of property key -> choices from TagSets and investigation suggestedProperties
  const propertyChoicesMap = useMemo(() => {
    const choicesMap = new Map<string, string[]>();
    // From TagSets
    for (const tagSet of tagSetsMap.values()) {
      for (const suggestedProp of tagSet.suggestedProperties) {
        if (suggestedProp.type === 'choice' && suggestedProp.choices) {
          choicesMap.set(suggestedProp.key, suggestedProp.choices);
        }
      }
    }
    // From investigation suggestedProperties (overrides TagSet if exists)
    const investigationSuggested = currentInvestigation?.settings.suggestedProperties || [];
    for (const prop of investigationSuggested) {
      if (prop.type === 'choice' && prop.choices) {
        choicesMap.set(prop.key, prop.choices);
      }
    }
    return choicesMap;
  }, [tagSetsMap, currentInvestigation?.settings.suggestedProperties]);

  // Compute property suggestions based on actual usage on elements
  // Uses getState() snapshot instead of reactive subscription to avoid
  // recomputing 150K iterations on every element change.
  // Only recomputes when selected element changes (id/tags) or settings change.
  const propertySuggestions: PropertyDefinition[] = useMemo(() => {
    const elements = useInvestigationStore.getState().elements;
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
          const choices = propertyChoicesMap.get(prop.key);
          actualPropertyTypes.set(prop.key, {
            key: prop.key,
            type: propType,
            ...(choices && { choices })
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
            const choices = propertyChoicesMap.get(p.key);
            tagBasedProperties.set(p.key, actualType || { ...p, ...(choices && { choices }) });
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
          const choices = propertyChoicesMap.get(prop.key);
          usedProperties.set(prop.key, actualType || {
            key: prop.key,
            type: prop.type || 'text',
            ...(choices && { choices })
          });
        }
      }
    }

    // Merge: tag-based first (most relevant), then other used properties, then investigation suggestions
    const allSuggestions: PropertyDefinition[] = [...tagBasedProperties.values()];
    const addedKeys = new Set(tagBasedProperties.keys());

    for (const [key, prop] of usedProperties) {
      if (!addedKeys.has(key)) {
        allSuggestions.push(prop);
        addedKeys.add(key);
      }
    }

    // Add investigation suggestedProperties (these have choices saved by user)
    const investigationSuggested = currentInvestigation?.settings.suggestedProperties || [];
    for (const prop of investigationSuggested) {
      if (!addedKeys.has(prop.key)) {
        allSuggestions.push(prop);
        addedKeys.add(prop.key);
      }
    }

    // Add TagSet suggested properties for the current element's tags
    // This ensures choices from TagSets are always available, even if the property
    // hasn't been added to tagPropertyAssociations yet
    for (const tag of element.tags) {
      // Find TagSet with this name
      for (const tagSet of tagSetsMap.values()) {
        if (tagSet.name === tag) {
          for (const suggestedProp of tagSet.suggestedProperties) {
            if (!addedKeys.has(suggestedProp.key)) {
              allSuggestions.push(suggestedProp);
              addedKeys.add(suggestedProp.key);
            }
          }
          break;
        }
      }
    }

    return allSuggestions;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element.id, element.tags, currentInvestigation?.settings.tagPropertyAssociations, currentInvestigation?.settings.suggestedProperties, propertyChoicesMap, tagSetsMap]);

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
              onBlur={(e) => {
                // Save immediately on blur (don't wait for debounce)
                if (e.target.value !== element.label) {
                  // Update ref BEFORE saving so we recognize our own echo
                  lastSyncedLabelRef.current = e.target.value;
                  updateElement(element.id, { label: e.target.value });
                }
                editingElementIdRef.current = null;
              }}
              placeholder={t('detail.placeholders.label')}
              className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default sketchy-border focus:outline-none focus:border-accent input-focus-glow text-text-primary placeholder:text-text-tertiary transition-all"
              data-testid="element-label-input"
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

          {/* Tab membership */}
          {elementTabs.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <Layers size={10} className="text-text-tertiary" />
              {elementTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="px-1.5 py-0.5 text-[10px] bg-accent/10 text-accent rounded border border-accent/20 hover:bg-accent/20 transition-colors"
                  title={t('detail.hints.goToTab', { name: tab.name })}
                >
                  {tab.name}
                </button>
              ))}
            </div>
          )}
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
              {hasGeoToClear && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleValidateGeoClick}
                    disabled={geoInputsMatchSaved || !canSaveGeo}
                    className={`text-xs transition-colors flex items-center gap-1 ${
                      !geoInputsMatchSaved && canSaveGeo
                        ? 'text-success hover:text-success/80'
                        : 'text-text-tertiary/30 cursor-not-allowed'
                    }`}
                    title={t('detail.location.saveLocation')}
                  >
                    <Check size={12} />
                    {t('detail.location.saveLocation')}
                  </button>
                  <button
                    type="button"
                    onClick={handleClearGeo}
                    className="text-xs transition-colors flex items-center gap-0.5 text-text-tertiary hover:text-error"
                    title={t('detail.location.removeLocation')}
                  >
                    <X size={12} />
                    {t('detail.location.clearLocation')}
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <input
                  type="text"
                  value={geoLat}
                  onChange={(e) => setGeoLat(e.target.value)}
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
        <div className="space-y-4">
          {/* Position Lock */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">
              {element.isPositionLocked
                ? t('detail.appearance.positionLock')
                : t('detail.appearance.positionUnlocked')}
            </span>
            <button
              onClick={handleToggleLock}
              className={`p-1.5 rounded transition-colors ${
                element.isPositionLocked
                  ? 'bg-accent/20 text-accent'
                  : 'text-text-tertiary hover:bg-bg-tertiary'
              }`}
              title={element.isPositionLocked
                ? t('detail.appearance.positionUnlocked')
                : t('detail.appearance.positionLock')}
            >
              {element.isPositionLocked ? <Lock size={14} /> : <LockOpen size={14} />}
            </button>
          </div>

          <VisualEditor
            visual={element.visual}
            onChange={handleVisualChange}
          />
        </div>
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
          initialLat={(() => {
            // If opened from event, use event's geo
            if (pendingGeoPickerInitialGeo.current) return pendingGeoPickerInitialGeo.current.lat;
            // Otherwise use element's geo input value or lastSavedGeo
            const latNum = parseFloat(geoLat);
            if (!isNaN(latNum) && latNum >= -90 && latNum <= 90) return latNum;
            return lastSavedGeo?.lat;
          })()}
          initialLng={(() => {
            // If opened from event, use event's geo
            if (pendingGeoPickerInitialGeo.current) return pendingGeoPickerInitialGeo.current.lng;
            // Otherwise use element's geo input value or lastSavedGeo
            const lngNum = parseFloat(geoLng);
            if (!isNaN(lngNum) && lngNum >= -180 && lngNum <= 180) return lngNum;
            return lastSavedGeo?.lng;
          })()}
          onConfirm={handleGeoPickerConfirm}
          onCancel={() => {
            pendingGeoPickerCallback.current = null;
            pendingGeoPickerInitialGeo.current = null;
            setShowGeoPicker(false);
          }}
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
// Pads year to 4 digits for historical dates (e.g., year 938 → "0938")
function formatDateTimeForInput(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
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
