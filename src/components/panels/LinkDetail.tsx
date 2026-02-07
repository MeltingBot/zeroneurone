import { useCallback, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ArrowLeft, ArrowLeftRight, Minus, Link2, Settings, Palette, Calendar, MessageSquare, ExternalLink } from 'lucide-react';
import { useInvestigationStore } from '../../stores';
import type { Link, LinkStyle, LinkDirection, Confidence, Property, PropertyDefinition } from '../../types';
import { PropertiesEditor } from './PropertiesEditor';
import { TagsEditor } from './TagsEditor';
import { SuggestedPropertiesPopup } from './SuggestedPropertiesPopup';
import { DEFAULT_COLORS } from '../../types';
import { AccordionSection, MarkdownEditor } from '../common';
import { CommentsSection } from './CommentsSection';

interface LinkDetailProps {
  link: Link;
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

const STYLE_VALUES: LinkStyle[] = ['solid', 'dashed', 'dotted'];

const THICKNESSES = [1, 2, 3, 4, 5];

// Format date for datetime-local input (YYYY-MM-DDTHH:mm) in LOCAL timezone
function formatDateTimeForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function LinkDetail({ link }: LinkDetailProps) {
  const { t } = useTranslation('panels');
  const { t: tCommon } = useTranslation('common');
  // Individual selectors — prevent re-renders when unrelated state changes
  const updateLink = useInvestigationStore((s) => s.updateLink);
  const elements = useInvestigationStore((s) => s.elements);
  const currentInvestigation = useInvestigationStore((s) => s.currentInvestigation);
  const addSuggestedProperty = useInvestigationStore((s) => s.addSuggestedProperty);
  const addExistingTag = useInvestigationStore((s) => s.addExistingTag);
  const comments = useInvestigationStore((s) => s.comments);
  // Note: currentInvestigation is used for suggestions in PropertiesEditor

  // Count unresolved comments for this link
  const linkComments = comments.filter(c => c.targetId === link.id);
  const unresolvedCommentCount = linkComments.filter(c => !c.resolved).length;

  // Local state for inputs
  const [label, setLabel] = useState(link.label);
  const [notes, setNotes] = useState(link.notes);
  const [source, setSource] = useState(link.source);

  // State for suggested properties popup
  const [suggestedPropsTagSet, setSuggestedPropsTagSet] = useState<string | null>(null);

  // Track which link we're editing to prevent cross-link saves
  const editingLinkIdRef = useRef<string | null>(null);

  // Ref to the container for focus management
  const containerRef = useRef<HTMLDivElement>(null);

  // Refs to track what we last SENT to the store - used to detect our own echoes
  // This is different from current local state: user might type more after debounce fires
  const lastSyncedLabelRef = useRef(link.label);
  const lastSyncedNotesRef = useRef(link.notes);
  const lastSyncedSourceRef = useRef(link.source);

  // Debounced values
  const debouncedLabel = useDebounce(label, 500);
  const debouncedNotes = useDebounce(notes, 500);
  const debouncedSource = useDebounce(source, 500);

  // Find connected elements
  const fromElement = elements.find((el) => el.id === link.fromId);
  const toElement = elements.find((el) => el.id === link.toId);

  // Reset local state AND refs when link changes
  useEffect(() => {
    editingLinkIdRef.current = null;
    setLabel(link.label);
    setNotes(link.notes);
    setSource(link.source);
    // Also reset lastSynced refs to prevent false "remote change" detection
    lastSyncedLabelRef.current = link.label;
    lastSyncedNotesRef.current = link.notes;
    lastSyncedSourceRef.current = link.source;

    // Blur any focused input inside this panel when switching links
    // This ensures keyboard events (like Delete) go to the canvas, not the input
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && containerRef.current?.contains(activeElement)) {
      activeElement.blur();
    }
  }, [link.id]);

  // Sync fields when changed externally (e.g., by another user via Yjs)
  // Only rely on lastSyncedRef for echo detection (no editingRef check - causes timing issues)
  useEffect(() => {
    // Our own echo coming back - ignore
    if (link.label === lastSyncedLabelRef.current) return;
    // Remote change - accept and update ref
    setLabel(link.label);
    lastSyncedLabelRef.current = link.label;
  }, [link.label, link.id]);

  useEffect(() => {
    if (link.notes === lastSyncedNotesRef.current) return;
    setNotes(link.notes);
    lastSyncedNotesRef.current = link.notes;
  }, [link.notes, link.id]);

  useEffect(() => {
    if (link.source === lastSyncedSourceRef.current) return;
    setSource(link.source);
    lastSyncedSourceRef.current = link.source;
  }, [link.source, link.id]);

  // Save debounced values only if still editing the same link
  useEffect(() => {
    if (editingLinkIdRef.current === link.id && debouncedLabel !== link.label) {
      // Update ref BEFORE syncing so we recognize our own echo
      lastSyncedLabelRef.current = debouncedLabel;
      updateLink(link.id, { label: debouncedLabel });
    }
  }, [debouncedLabel, link.id, link.label, updateLink]);

  useEffect(() => {
    if (editingLinkIdRef.current === link.id && debouncedNotes !== link.notes) {
      lastSyncedNotesRef.current = debouncedNotes;
      updateLink(link.id, { notes: debouncedNotes });
    }
  }, [debouncedNotes, link.id, link.notes, updateLink]);

  useEffect(() => {
    if (editingLinkIdRef.current === link.id && debouncedSource !== link.source) {
      lastSyncedSourceRef.current = debouncedSource;
      updateLink(link.id, { source: debouncedSource });
    }
  }, [debouncedSource, link.id, link.source, updateLink]);

  // Handle direction change
  const handleDirectionChange = useCallback(
    (direction: LinkDirection) => {
      updateLink(link.id, { direction, directed: direction !== 'none' });
    },
    [link.id, updateLink]
  );

  // Handle confidence change
  const handleConfidenceChange = useCallback(
    (value: number) => {
      const newConfidence = Math.round(value / 10) * 10 as Confidence;
      updateLink(link.id, { confidence: newConfidence });
    },
    [link.id, updateLink]
  );

  // Handle visual changes
  const handleColorChange = useCallback(
    (color: string) => {
      updateLink(link.id, { visual: { ...link.visual, color } });
    },
    [link.id, link.visual, updateLink]
  );

  const handleStyleChange = useCallback(
    (style: LinkStyle) => {
      updateLink(link.id, { visual: { ...link.visual, style } });
    },
    [link.id, link.visual, updateLink]
  );

  const handleThicknessChange = useCallback(
    (thickness: number) => {
      updateLink(link.id, { visual: { ...link.visual, thickness } });
    },
    [link.id, link.visual, updateLink]
  );

  // Handle properties change
  const handlePropertiesChange = useCallback(
    (properties: Link['properties']) => {
      updateLink(link.id, { properties });
    },
    [link.id, updateLink]
  );

  // Handle new property (save to investigation settings for reuse)
  const handleNewProperty = useCallback(
    (propertyDef: PropertyDefinition) => {
      addSuggestedProperty(propertyDef);
    },
    [addSuggestedProperty]
  );

  // Handle tags change
  const handleTagsChange = useCallback(
    (tags: string[]) => {
      updateLink(link.id, { tags });
    },
    [link.id, updateLink]
  );

  // Handle new tag (save to investigation settings for reuse)
  const handleNewTag = useCallback(
    (tag: string) => {
      addExistingTag(tag);
    },
    [addExistingTag]
  );

  // Handle TagSet tag added (to show suggested properties popup)
  const handleTagSetTagAdded = useCallback((tagSetName: string) => {
    setSuggestedPropsTagSet(tagSetName);
  }, []);

  // Handle applying suggested properties from TagSet
  const handleApplySuggestedProperties = useCallback(
    (properties: Property[]) => {
      updateLink(link.id, {
        properties: [...link.properties, ...properties],
      });
    },
    [link.id, link.properties, updateLink]
  );

  // Badges for accordion sections
  const tagsBadge = link.tags.length > 0 ? (
    <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full">
      {link.tags.length}
    </span>
  ) : null;

  const propertiesBadge = link.properties.length > 0 ? (
    <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full">
      {link.properties.length}
    </span>
  ) : null;

  const hasPeriod = link.dateRange?.start !== null;

  // Direction options with icons
  const directionOptions: { value: LinkDirection; icon: typeof Minus; labelKey: string }[] = [
    { value: 'none', icon: Minus, labelKey: 'directionNone' },
    { value: 'forward', icon: ArrowRight, labelKey: 'directionForward' },
    { value: 'backward', icon: ArrowLeft, labelKey: 'directionBackward' },
    { value: 'both', icon: ArrowLeftRight, labelKey: 'directionBoth' },
  ];

  return (
    <div ref={containerRef} className="divide-y divide-border-default">
      {/* Connection */}
      <AccordionSection
        id="connection"
        title={t('detail.sections.connection')}
        icon={<Link2 size={12} />}
        badge={tagsBadge}
        defaultOpen={true}
      >
        <div className="space-y-4">
          {/* Connection info */}
          <div className="p-2 bg-bg-secondary rounded border border-border-default">
            <div className="text-xs text-text-tertiary mb-1">{t('detail.link.linkedElements')}</div>
            <div className="flex items-center gap-2 text-sm text-text-primary">
              <span className="truncate flex-1">{fromElement?.label || t('detail.link.deletedElement')}</span>
              <span className="text-text-tertiary flex-shrink-0">
                {(link.direction || (link.directed ? 'forward' : 'none')) === 'none' && '—'}
                {(link.direction || (link.directed ? 'forward' : 'none')) === 'forward' && '→'}
                {(link.direction || (link.directed ? 'forward' : 'none')) === 'backward' && '←'}
                {(link.direction || (link.directed ? 'forward' : 'none')) === 'both' && '↔'}
              </span>
              <span className="truncate flex-1 text-right">{toElement?.label || t('detail.link.deletedElement')}</span>
            </div>
          </div>

          {/* Label */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">{t('detail.labels.label')}</label>
            <input
              type="text"
              value={label}
              onChange={(e) => {
                editingLinkIdRef.current = link.id;
                setLabel(e.target.value);
              }}
              placeholder={t('detail.placeholders.linkLabel')}
              className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary placeholder:text-text-tertiary"
            />
          </div>

          {/* Direction selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">{t('detail.labels.direction')}</label>
            <div className="flex gap-1">
              {directionOptions.map(({ value, icon: Icon, labelKey }) => {
                const currentDirection = link.direction || (link.directed ? 'forward' : 'none');
                const isSelected = currentDirection === value;
                return (
                  <button
                    key={value}
                    onClick={() => handleDirectionChange(value)}
                    className={`flex-1 flex items-center justify-center p-2 rounded border transition-colors ${
                      isSelected
                        ? 'bg-accent text-white border-accent'
                        : 'bg-bg-secondary text-text-secondary border-border-default hover:border-accent'
                    }`}
                    title={t(`detail.labels.${labelKey}`)}
                  >
                    <Icon size={16} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">{t('detail.labels.notes')}</label>
            <MarkdownEditor
              value={notes}
              onChange={(value) => {
                editingLinkIdRef.current = link.id;
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
              tags={link.tags}
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
        icon={<Calendar size={12} />}
        badge={hasPeriod ? (
          <span className="text-[10px] bg-green-500/20 text-green-600 px-1.5 py-0.5 rounded-full">
            {tCommon('labels.date')}
          </span>
        ) : null}
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
                {link.confidence !== null ? `${link.confidence}%` : t('detail.labels.confidenceUndefined')}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="10"
              value={link.confidence ?? 50}
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
                  editingLinkIdRef.current = link.id;
                  setSource(e.target.value);
                }}
                placeholder={t('detail.placeholders.source')}
                className={`w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary placeholder:text-text-tertiary ${isUrl(source) ? 'pr-9' : ''}`}
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

          {/* Period (start/end) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">{t('detail.link.relationPeriod')}</label>
            <div className="space-y-2">
              <div>
                <span className="text-[10px] text-text-tertiary">{t('detail.link.periodStart')}</span>
                <input
                  type="datetime-local"
                  value={link.dateRange?.start ? formatDateTimeForInput(new Date(link.dateRange.start)) : ''}
                  onChange={(e) => {
                    const newDate = e.target.value ? new Date(e.target.value) : null;
                    updateLink(link.id, {
                      dateRange: {
                        start: newDate,
                        end: link.dateRange?.end ?? null,
                      },
                    });
                  }}
                  className="w-full px-2 py-2 text-sm bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary"
                />
              </div>
              <div>
                <span className="text-[10px] text-text-tertiary">{t('detail.link.periodEnd')}</span>
                <input
                  type="datetime-local"
                  value={link.dateRange?.end ? formatDateTimeForInput(new Date(link.dateRange.end)) : ''}
                  onChange={(e) => {
                    const newDate = e.target.value ? new Date(e.target.value) : null;
                    updateLink(link.id, {
                      dateRange: {
                        start: link.dateRange?.start ?? null,
                        end: newDate,
                      },
                    });
                  }}
                  className="w-full px-2 py-2 text-sm bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary"
                />
              </div>
            </div>
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
          properties={link.properties}
          onChange={handlePropertiesChange}
          suggestions={currentInvestigation?.settings.suggestedProperties}
          onNewProperty={handleNewProperty}
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
          {/* Color */}
          <div className="space-y-1.5">
            <label className="text-xs text-text-tertiary">{t('detail.appearance.color')}</label>
            <div className="flex flex-wrap gap-1.5">
              {/* Default gray */}
              <button
                onClick={() => handleColorChange('#6b7280')}
                className={`w-6 h-6 rounded border-2 ${
                  link.visual.color === '#6b7280'
                    ? 'border-accent'
                    : 'border-border-default'
                }`}
                style={{ backgroundColor: '#6b7280' }}
                aria-label={t('detail.appearance.defaultGray')}
              />
              {DEFAULT_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => handleColorChange(color)}
                  className={`w-6 h-6 rounded border-2 ${
                    link.visual.color === color
                      ? 'border-accent'
                      : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={`${t('detail.appearance.color')} ${color}`}
                />
              ))}
              <input
                type="color"
                value={link.visual.color}
                onChange={(e) => handleColorChange(e.target.value)}
                className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                aria-label={t('detail.appearance.customColor')}
              />
            </div>
          </div>

          {/* Style */}
          <div className="space-y-1.5">
            <label className="text-xs text-text-tertiary">{t('detail.appearance.style')}</label>
            <div className="flex gap-2">
              {STYLE_VALUES.map((style) => (
                <button
                  key={style}
                  onClick={() => handleStyleChange(style)}
                  className={`flex-1 px-2 py-1.5 text-xs rounded border ${
                    link.visual.style === style
                      ? 'bg-accent text-white border-accent'
                      : 'bg-bg-secondary text-text-secondary border-border-default hover:border-accent'
                  }`}
                >
                  {tCommon(`linkStyles.${style}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Thickness */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-text-tertiary">{t('detail.appearance.thickness')}</label>
              <span className="text-xs text-text-tertiary">{link.visual.thickness}px</span>
            </div>
            <div className="flex gap-1">
              {THICKNESSES.map((thickness) => (
                <button
                  key={thickness}
                  onClick={() => handleThicknessChange(thickness)}
                  className={`flex-1 h-8 rounded border flex items-center justify-center ${
                    link.visual.thickness === thickness
                      ? 'bg-accent border-accent'
                      : 'bg-bg-secondary border-border-default hover:border-accent'
                  }`}
                >
                  <div
                    className="rounded-full"
                    style={{
                      width: '100%',
                      height: thickness,
                      backgroundColor: link.visual.thickness === thickness ? 'white' : link.visual.color,
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
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
        <CommentsSection targetId={link.id} targetType="link" />
      </AccordionSection>

      {/* Timestamps (read-only) */}
      <div className="px-3 py-2 border-t border-border-default bg-bg-secondary/50">
        <div className="flex justify-between text-[10px] text-text-tertiary">
          <span>{t('detail.timestamps.createdAt')} {formatDateTimeDisplay(link.createdAt)}</span>
          <span>{t('detail.timestamps.updatedAt')} {formatDateTimeDisplay(link.updatedAt)}</span>
        </div>
      </div>

      {/* Suggested Properties Popup */}
      {suggestedPropsTagSet && (
        <SuggestedPropertiesPopup
          tagSetName={suggestedPropsTagSet}
          existingPropertyKeys={link.properties.map((p) => p.key)}
          onApply={handleApplySuggestedProperties}
          onClose={() => setSuggestedPropsTagSet(null)}
        />
      )}
    </div>
  );
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
