import { useCallback, useState, useEffect, useRef } from 'react';
import { ArrowRight, ArrowLeft, ArrowLeftRight, Minus, Link2, FileText, Settings, Palette, Calendar, Tag, MessageSquare, ExternalLink } from 'lucide-react';
import { useInvestigationStore } from '../../stores';
import type { Link, LinkStyle, LinkDirection, Confidence, Property } from '../../types';
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

const STYLES: { value: LinkStyle; label: string }[] = [
  { value: 'solid', label: 'Continu' },
  { value: 'dashed', label: 'Tirets' },
  { value: 'dotted', label: 'Pointille' },
];

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
  const { updateLink, elements, currentInvestigation, addSuggestedProperty, addExistingTag, comments } = useInvestigationStore();
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

  // Debounced values
  const debouncedLabel = useDebounce(label, 500);
  const debouncedNotes = useDebounce(notes, 500);
  const debouncedSource = useDebounce(source, 500);

  // Find connected elements
  const fromElement = elements.find((el) => el.id === link.fromId);
  const toElement = elements.find((el) => el.id === link.toId);

  // Reset local state when link changes
  useEffect(() => {
    editingLinkIdRef.current = null;
    setLabel(link.label);
    setNotes(link.notes);
    setSource(link.source);

    // Blur any focused input inside this panel when switching links
    // This ensures keyboard events (like Delete) go to the canvas, not the input
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && containerRef.current?.contains(activeElement)) {
      activeElement.blur();
    }
  }, [link.id]);

  // Save debounced values only if still editing the same link
  useEffect(() => {
    if (editingLinkIdRef.current === link.id && debouncedLabel !== link.label) {
      updateLink(link.id, { label: debouncedLabel });
    }
  }, [debouncedLabel, link.id, link.label, updateLink]);

  useEffect(() => {
    if (editingLinkIdRef.current === link.id && debouncedNotes !== link.notes) {
      updateLink(link.id, { notes: debouncedNotes });
    }
  }, [debouncedNotes, link.id, link.notes, updateLink]);

  useEffect(() => {
    if (editingLinkIdRef.current === link.id && debouncedSource !== link.source) {
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

  // Handle new property key (save to investigation settings for reuse)
  const handleNewProperty = useCallback(
    (key: string) => {
      addSuggestedProperty(key);
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

  return (
    <div ref={containerRef} className="divide-y divide-border-default">
      {/* Connexion */}
      <AccordionSection
        id="connection"
        title="Connexion"
        icon={<Link2 size={12} />}
        defaultOpen={true}
      >
        <div className="space-y-4">
          {/* Connection info */}
          <div className="p-2 bg-bg-secondary rounded border border-border-default">
            <div className="text-xs text-text-tertiary mb-1">Elements lies</div>
            <div className="flex items-center gap-2 text-sm text-text-primary">
              <span className="truncate flex-1">{fromElement?.label || 'Element supprime'}</span>
              <span className="text-text-tertiary flex-shrink-0">
                {(link.direction || (link.directed ? 'forward' : 'none')) === 'none' && '—'}
                {(link.direction || (link.directed ? 'forward' : 'none')) === 'forward' && '→'}
                {(link.direction || (link.directed ? 'forward' : 'none')) === 'backward' && '←'}
                {(link.direction || (link.directed ? 'forward' : 'none')) === 'both' && '↔'}
              </span>
              <span className="truncate flex-1 text-right">{toElement?.label || 'Element supprime'}</span>
            </div>
          </div>

          {/* Label */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">Libelle</label>
            <input
              type="text"
              value={label}
              onChange={(e) => {
                editingLinkIdRef.current = link.id;
                setLabel(e.target.value);
              }}
              placeholder="Relation non nommee"
              className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary placeholder:text-text-tertiary"
            />
          </div>

          {/* Direction selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">Direction</label>
            <div className="flex gap-1">
              {[
                { value: 'none' as LinkDirection, icon: Minus, label: 'Sans fleche' },
                { value: 'forward' as LinkDirection, icon: ArrowRight, label: 'Vers la cible' },
                { value: 'backward' as LinkDirection, icon: ArrowLeft, label: 'Vers la source' },
                { value: 'both' as LinkDirection, icon: ArrowLeftRight, label: 'Bidirectionnel' },
              ].map(({ value, icon: Icon, label }) => {
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
                    title={label}
                  >
                    <Icon size={16} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* Notes */}
      <AccordionSection
        id="notes"
        title="Notes"
        icon={<FileText size={12} />}
        badge={notes ? (
          <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full">1</span>
        ) : null}
        defaultOpen={false}
      >
        <MarkdownEditor
          value={notes}
          onChange={(value) => {
            editingLinkIdRef.current = link.id;
            setNotes(value);
          }}
          placeholder="Markdown: **gras**, *italique*, [lien](url), listes..."
          minRows={4}
          maxRows={10}
        />
      </AccordionSection>

      {/* Tags */}
      <AccordionSection
        id="tags"
        title="Tags"
        icon={<Tag size={12} />}
        badge={tagsBadge}
        defaultOpen={false}
      >
        <TagsEditor
          tags={link.tags}
          onChange={handleTagsChange}
          suggestions={currentInvestigation?.settings.existingTags}
          onNewTag={handleNewTag}
          onTagSetTagAdded={handleTagSetTagAdded}
        />
      </AccordionSection>

      {/* Métadonnées */}
      <AccordionSection
        id="metadata"
        title="Métadonnées"
        icon={<Calendar size={12} />}
        badge={hasPeriod ? (
          <span className="text-[10px] bg-green-500/20 text-green-600 px-1.5 py-0.5 rounded-full">
            Periode
          </span>
        ) : null}
        defaultOpen={false}
      >
        <div className="space-y-4">
          {/* Confidence */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-text-secondary">
                Confiance
              </label>
              <span className="text-xs text-text-tertiary">
                {link.confidence !== null ? `${link.confidence}%` : 'Non definie'}
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
            <label className="text-xs font-medium text-text-secondary">Source</label>
            <div className="relative">
              <input
                type="text"
                value={source}
                onChange={(e) => {
                  editingLinkIdRef.current = link.id;
                  setSource(e.target.value);
                }}
                placeholder="Source de l'information..."
                className={`w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary placeholder:text-text-tertiary ${isUrl(source) ? 'pr-9' : ''}`}
              />
              {isUrl(source) && (
                <button
                  type="button"
                  onClick={() => window.open(toUrl(source), '_blank', 'noopener,noreferrer')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-tertiary hover:text-accent transition-colors"
                  title="Ouvrir dans un nouvel onglet"
                >
                  <ExternalLink size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Period (start/end) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">Periode de la relation</label>
            <div className="space-y-2">
              <div>
                <span className="text-[10px] text-text-tertiary">Debut</span>
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
                <span className="text-[10px] text-text-tertiary">Fin (laisser vide si en cours)</span>
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

      {/* Propriétés */}
      <AccordionSection
        id="properties"
        title="Propriétés"
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

      {/* Commentaires */}
      <AccordionSection
        id="comments"
        title="Commentaires"
        icon={<MessageSquare size={12} />}
        badge={unresolvedCommentCount > 0 ? unresolvedCommentCount : undefined}
        defaultOpen={unresolvedCommentCount > 0}
      >
        <CommentsSection targetId={link.id} targetType="link" />
      </AccordionSection>

      {/* Apparence */}
      <AccordionSection
        id="appearance"
        title="Apparence"
        icon={<Palette size={12} />}
        defaultOpen={false}
      >
        <div className="space-y-4">
          {/* Color */}
          <div className="space-y-1.5">
            <label className="text-xs text-text-tertiary">Couleur</label>
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
                aria-label="Gris par defaut"
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
                  aria-label={`Couleur ${color}`}
                />
              ))}
              <input
                type="color"
                value={link.visual.color}
                onChange={(e) => handleColorChange(e.target.value)}
                className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                aria-label="Couleur personnalisee"
              />
            </div>
          </div>

          {/* Style */}
          <div className="space-y-1.5">
            <label className="text-xs text-text-tertiary">Style</label>
            <div className="flex gap-2">
              {STYLES.map((style) => (
                <button
                  key={style.value}
                  onClick={() => handleStyleChange(style.value)}
                  className={`flex-1 px-2 py-1.5 text-xs rounded border ${
                    link.visual.style === style.value
                      ? 'bg-accent text-white border-accent'
                      : 'bg-bg-secondary text-text-secondary border-border-default hover:border-accent'
                  }`}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>

          {/* Thickness */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-text-tertiary">Epaisseur</label>
              <span className="text-xs text-text-tertiary">{link.visual.thickness}px</span>
            </div>
            <div className="flex gap-1">
              {THICKNESSES.map((t) => (
                <button
                  key={t}
                  onClick={() => handleThicknessChange(t)}
                  className={`flex-1 h-8 rounded border flex items-center justify-center ${
                    link.visual.thickness === t
                      ? 'bg-accent border-accent'
                      : 'bg-bg-secondary border-border-default hover:border-accent'
                  }`}
                >
                  <div
                    className="rounded-full"
                    style={{
                      width: '100%',
                      height: t,
                      backgroundColor: link.visual.thickness === t ? 'white' : link.visual.color,
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* Timestamps (read-only) */}
      <div className="px-3 py-2 border-t border-border-default bg-bg-secondary/50">
        <div className="flex justify-between text-[10px] text-text-tertiary">
          <span>Cree le {formatDateTimeDisplay(link.createdAt)}</span>
          <span>Modifie le {formatDateTimeDisplay(link.updatedAt)}</span>
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
