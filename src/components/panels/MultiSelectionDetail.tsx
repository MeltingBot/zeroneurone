import { useState, useCallback, useMemo } from 'react';
import {
  Layers,
  Tag,
  Settings,
  Palette,
  Percent,
  ArrowRight,
  ArrowLeft,
  ArrowLeftRight,
  Minus,
  Plus,
  X,
} from 'lucide-react';
import { useInvestigationStore, useSelectionStore } from '../../stores';
import type {
  Element,
  Link,
  ElementShape,
  LinkDirection,
  LinkStyle,
  Confidence,
  Property,
} from '../../types';
import { DEFAULT_COLORS } from '../../types';
import { AccordionSection } from '../common';
import { TagsEditor } from './TagsEditor';

const ELEMENT_SHAPES: { value: ElementShape; label: string }[] = [
  { value: 'circle', label: '○' },
  { value: 'square', label: '□' },
  { value: 'diamond', label: '◇' },
  { value: 'rectangle', label: '▭' },
  { value: 'hexagon', label: '⬡' },
];

const LINK_DIRECTIONS: { value: LinkDirection; icon: typeof Minus; label: string }[] = [
  { value: 'none', icon: Minus, label: 'Sans flèche' },
  { value: 'forward', icon: ArrowRight, label: 'Vers la cible' },
  { value: 'backward', icon: ArrowLeft, label: 'Vers la source' },
  { value: 'both', icon: ArrowLeftRight, label: 'Bidirectionnel' },
];

const LINK_STYLES: { value: LinkStyle; label: string }[] = [
  { value: 'solid', label: 'Continu' },
  { value: 'dashed', label: 'Tirets' },
  { value: 'dotted', label: 'Pointillé' },
];

const LINK_THICKNESSES = [1, 2, 3, 4, 5];

export function MultiSelectionDetail() {
  const {
    elements,
    links,
    updateElements,
    updateLinks,
    currentInvestigation,
    addExistingTag,
  } = useInvestigationStore();

  const { selectedElementIds, selectedLinkIds } = useSelectionStore();

  // Get selected items
  const selectedElements = useMemo(
    () => elements.filter((el) => selectedElementIds.has(el.id)),
    [elements, selectedElementIds]
  );

  const selectedLinks = useMemo(
    () => links.filter((link) => selectedLinkIds.has(link.id)),
    [links, selectedLinkIds]
  );

  const elementCount = selectedElements.length;
  const linkCount = selectedLinks.length;
  const totalCount = elementCount + linkCount;

  // Collect all existing tags from selection
  const allSelectedTags = useMemo(() => {
    const tags = new Set<string>();
    selectedElements.forEach((el) => el.tags.forEach((t) => tags.add(t)));
    selectedLinks.forEach((link) => link.tags.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [selectedElements, selectedLinks]);

  // State for adding new property
  const [newPropertyKey, setNewPropertyKey] = useState('');
  const [newPropertyValue, setNewPropertyValue] = useState('');

  // ============================================================================
  // HANDLERS - Tags
  // ============================================================================

  const handleAddTag = useCallback(
    async (tag: string) => {
      const elementIds = Array.from(selectedElementIds);
      const linkIds = Array.from(selectedLinkIds);

      // Add tag to elements
      if (elementIds.length > 0) {
        const updates = selectedElements.map((el) => ({
          id: el.id,
          tags: el.tags.includes(tag) ? el.tags : [...el.tags, tag],
        }));
        // Update each element with its specific new tags array
        for (const update of updates) {
          await updateElements([update.id], { tags: update.tags });
        }
      }

      // Add tag to links
      if (linkIds.length > 0) {
        const updates = selectedLinks.map((link) => ({
          id: link.id,
          tags: link.tags.includes(tag) ? link.tags : [...link.tags, tag],
        }));
        for (const update of updates) {
          await updateLinks([update.id], { tags: update.tags });
        }
      }

      // Save to investigation suggestions
      addExistingTag(tag);
    },
    [selectedElementIds, selectedLinkIds, selectedElements, selectedLinks, updateElements, updateLinks, addExistingTag]
  );

  const handleRemoveTag = useCallback(
    async (tagToRemove: string) => {
      const elementIds = Array.from(selectedElementIds);
      const linkIds = Array.from(selectedLinkIds);

      // Remove tag from elements
      if (elementIds.length > 0) {
        for (const el of selectedElements) {
          if (el.tags.includes(tagToRemove)) {
            await updateElements([el.id], { tags: el.tags.filter((t) => t !== tagToRemove) });
          }
        }
      }

      // Remove tag from links
      if (linkIds.length > 0) {
        for (const link of selectedLinks) {
          if (link.tags.includes(tagToRemove)) {
            await updateLinks([link.id], { tags: link.tags.filter((t) => t !== tagToRemove) });
          }
        }
      }
    },
    [selectedElementIds, selectedLinkIds, selectedElements, selectedLinks, updateElements, updateLinks]
  );

  // ============================================================================
  // HANDLERS - Properties
  // ============================================================================

  const handleAddProperty = useCallback(async () => {
    if (!newPropertyKey.trim()) return;

    const newProp: Property = {
      key: newPropertyKey.trim(),
      value: newPropertyValue || null,
      type: 'text',
    };

    const elementIds = Array.from(selectedElementIds);
    const linkIds = Array.from(selectedLinkIds);

    // Add property to elements (only if they don't already have it)
    if (elementIds.length > 0) {
      for (const el of selectedElements) {
        if (!el.properties.some((p) => p.key === newProp.key)) {
          await updateElements([el.id], { properties: [...el.properties, newProp] });
        }
      }
    }

    // Add property to links
    if (linkIds.length > 0) {
      for (const link of selectedLinks) {
        if (!link.properties.some((p) => p.key === newProp.key)) {
          await updateLinks([link.id], { properties: [...link.properties, newProp] });
        }
      }
    }

    setNewPropertyKey('');
    setNewPropertyValue('');
  }, [newPropertyKey, newPropertyValue, selectedElementIds, selectedLinkIds, selectedElements, selectedLinks, updateElements, updateLinks]);

  // ============================================================================
  // HANDLERS - Confidence
  // ============================================================================

  const handleConfidenceChange = useCallback(
    async (value: number) => {
      const confidence = Math.round(value / 10) * 10 as Confidence;
      const elementIds = Array.from(selectedElementIds);
      const linkIds = Array.from(selectedLinkIds);

      if (elementIds.length > 0) {
        await updateElements(elementIds, { confidence });
      }
      if (linkIds.length > 0) {
        await updateLinks(linkIds, { confidence });
      }
    },
    [selectedElementIds, selectedLinkIds, updateElements, updateLinks]
  );

  // ============================================================================
  // HANDLERS - Color (common to both)
  // ============================================================================

  const handleColorChange = useCallback(
    async (color: string) => {
      const elementIds = Array.from(selectedElementIds);
      const linkIds = Array.from(selectedLinkIds);

      if (elementIds.length > 0) {
        for (const el of selectedElements) {
          await updateElements([el.id], { visual: { ...el.visual, color } });
        }
      }
      if (linkIds.length > 0) {
        for (const link of selectedLinks) {
          await updateLinks([link.id], { visual: { ...link.visual, color } });
        }
      }
    },
    [selectedElementIds, selectedLinkIds, selectedElements, selectedLinks, updateElements, updateLinks]
  );

  // ============================================================================
  // HANDLERS - Element-specific
  // ============================================================================

  const handleShapeChange = useCallback(
    async (shape: ElementShape) => {
      const elementIds = Array.from(selectedElementIds);
      if (elementIds.length > 0) {
        for (const el of selectedElements) {
          await updateElements([el.id], { visual: { ...el.visual, shape } });
        }
      }
    },
    [selectedElementIds, selectedElements, updateElements]
  );


  const handleBorderColorChange = useCallback(
    async (borderColor: string) => {
      const elementIds = Array.from(selectedElementIds);
      if (elementIds.length > 0) {
        for (const el of selectedElements) {
          await updateElements([el.id], { visual: { ...el.visual, borderColor } });
        }
      }
    },
    [selectedElementIds, selectedElements, updateElements]
  );

  // ============================================================================
  // HANDLERS - Link-specific
  // ============================================================================

  const handleDirectionChange = useCallback(
    async (direction: LinkDirection) => {
      const linkIds = Array.from(selectedLinkIds);
      if (linkIds.length > 0) {
        await updateLinks(linkIds, { direction, directed: direction !== 'none' });
      }
    },
    [selectedLinkIds, updateLinks]
  );

  const handleStyleChange = useCallback(
    async (style: LinkStyle) => {
      const linkIds = Array.from(selectedLinkIds);
      if (linkIds.length > 0) {
        for (const link of selectedLinks) {
          await updateLinks([link.id], { visual: { ...link.visual, style } });
        }
      }
    },
    [selectedLinkIds, selectedLinks, updateLinks]
  );

  const handleThicknessChange = useCallback(
    async (thickness: number) => {
      const linkIds = Array.from(selectedLinkIds);
      if (linkIds.length > 0) {
        for (const link of selectedLinks) {
          await updateLinks([link.id], { visual: { ...link.visual, thickness } });
        }
      }
    },
    [selectedLinkIds, selectedLinks, updateLinks]
  );

  return (
    <div className="divide-y divide-border-default">
      {/* Header */}
      <div className="px-3 py-2 bg-bg-secondary">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-accent" />
          <span className="text-sm font-medium text-text-primary">
            Modification en masse
          </span>
        </div>
        <div className="text-xs text-text-secondary mt-1">
          {elementCount > 0 && (
            <span className="inline-flex items-center gap-1 mr-2">
              <span className="w-2 h-2 rounded-full bg-accent" />
              {elementCount} élément{elementCount > 1 ? 's' : ''}
            </span>
          )}
          {linkCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="w-4 h-0.5 bg-accent" />
              {linkCount} lien{linkCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Tags - Common */}
      <AccordionSection
        id="bulk-tags"
        title="Tags"
        icon={<Tag size={12} />}
        badge={allSelectedTags.length > 0 ? (
          <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full">
            {allSelectedTags.length}
          </span>
        ) : null}
        defaultOpen={true}
      >
        <div className="space-y-3">
          <p className="text-[10px] text-text-tertiary">
            Ajouter ou retirer des tags sur tous les éléments sélectionnés
          </p>

          {/* Current tags in selection */}
          {allSelectedTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {allSelectedTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-bg-tertiary text-text-secondary rounded"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-error"
                    title="Retirer de la sélection"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Add tag */}
          <TagsEditor
            tags={[]}
            onChange={(newTags) => {
              if (newTags.length > 0) {
                handleAddTag(newTags[newTags.length - 1]);
              }
            }}
            suggestions={currentInvestigation?.settings.existingTags}
            onNewTag={handleAddTag}
          />
        </div>
      </AccordionSection>

      {/* Properties - Common */}
      <AccordionSection
        id="bulk-properties"
        title="Propriétés"
        icon={<Settings size={12} />}
        defaultOpen={false}
      >
        <div className="space-y-3">
          <p className="text-[10px] text-text-tertiary">
            Ajouter une propriété à tous les éléments sélectionnés
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={newPropertyKey}
              onChange={(e) => setNewPropertyKey(e.target.value)}
              placeholder="Nom..."
              className="flex-1 px-2 py-1.5 text-xs bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary placeholder:text-text-tertiary"
            />
            <input
              type="text"
              value={newPropertyValue}
              onChange={(e) => setNewPropertyValue(e.target.value)}
              placeholder="Valeur..."
              className="flex-1 px-2 py-1.5 text-xs bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary placeholder:text-text-tertiary"
            />
            <button
              onClick={handleAddProperty}
              disabled={!newPropertyKey.trim()}
              className="px-2 py-1.5 text-xs font-medium bg-accent text-white rounded hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      </AccordionSection>

      {/* Confidence - Common */}
      <AccordionSection
        id="bulk-confidence"
        title="Confiance"
        icon={<Percent size={12} />}
        defaultOpen={false}
      >
        <div className="space-y-2">
          <p className="text-[10px] text-text-tertiary">
            Définir le niveau de confiance pour tous
          </p>
          <input
            type="range"
            min="0"
            max="100"
            step="10"
            defaultValue={50}
            onChange={(e) => handleConfidenceChange(parseInt(e.target.value))}
            className="w-full h-1.5 bg-bg-tertiary rounded appearance-none cursor-pointer accent-accent"
          />
          <div className="flex justify-between text-[10px] text-text-tertiary">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>
      </AccordionSection>

      {/* Color - Common */}
      <AccordionSection
        id="bulk-color"
        title="Couleur"
        icon={<Palette size={12} />}
        defaultOpen={false}
      >
        <div className="space-y-2">
          <p className="text-[10px] text-text-tertiary">
            Définir la couleur pour tous
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DEFAULT_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => handleColorChange(color)}
                className="w-6 h-6 rounded border-2 border-transparent hover:border-accent transition-colors"
                style={{ backgroundColor: color }}
                aria-label={`Couleur ${color}`}
              />
            ))}
            <input
              type="color"
              onChange={(e) => handleColorChange(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer border-0 p-0"
              aria-label="Couleur personnalisée"
            />
          </div>
        </div>
      </AccordionSection>

      {/* Elements-only section */}
      {elementCount > 0 && (
        <AccordionSection
          id="bulk-elements"
          title={`Éléments (${elementCount})`}
          icon={<span className="w-3 h-3 rounded-full border-2 border-current" />}
          defaultOpen={false}
        >
          <div className="space-y-4">
            {/* Shape */}
            <div className="space-y-1.5">
              <label className="text-xs text-text-tertiary">Forme</label>
              <div className="flex gap-1">
                {ELEMENT_SHAPES.map((shape) => (
                  <button
                    key={shape.value}
                    onClick={() => handleShapeChange(shape.value)}
                    className="flex-1 px-2 py-1.5 text-sm rounded border bg-bg-secondary text-text-secondary border-border-default hover:border-accent transition-colors"
                  >
                    {shape.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Border Color */}
            <div className="space-y-1.5">
              <label className="text-xs text-text-tertiary">Couleur de bordure</label>
              <div className="flex flex-wrap gap-1.5">
                {DEFAULT_COLORS.slice(0, 8).map((color) => (
                  <button
                    key={color}
                    onClick={() => handleBorderColorChange(color)}
                    className="w-5 h-5 rounded border border-border-default hover:border-accent transition-colors"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>
        </AccordionSection>
      )}

      {/* Links-only section */}
      {linkCount > 0 && (
        <AccordionSection
          id="bulk-links"
          title={`Liens (${linkCount})`}
          icon={<span className="w-4 h-0.5 bg-current" />}
          defaultOpen={false}
        >
          <div className="space-y-4">
            {/* Direction */}
            <div className="space-y-1.5">
              <label className="text-xs text-text-tertiary">Direction</label>
              <div className="flex gap-1">
                {LINK_DIRECTIONS.map(({ value, icon: Icon, label }) => (
                  <button
                    key={value}
                    onClick={() => handleDirectionChange(value)}
                    className="flex-1 flex items-center justify-center p-2 rounded border bg-bg-secondary text-text-secondary border-border-default hover:border-accent transition-colors"
                    title={label}
                  >
                    <Icon size={16} />
                  </button>
                ))}
              </div>
            </div>

            {/* Style */}
            <div className="space-y-1.5">
              <label className="text-xs text-text-tertiary">Style</label>
              <div className="flex gap-2">
                {LINK_STYLES.map((style) => (
                  <button
                    key={style.value}
                    onClick={() => handleStyleChange(style.value)}
                    className="flex-1 px-2 py-1.5 text-xs rounded border bg-bg-secondary text-text-secondary border-border-default hover:border-accent transition-colors"
                  >
                    {style.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Thickness */}
            <div className="space-y-1.5">
              <label className="text-xs text-text-tertiary">Épaisseur</label>
              <div className="flex gap-1">
                {LINK_THICKNESSES.map((t) => (
                  <button
                    key={t}
                    onClick={() => handleThicknessChange(t)}
                    className="flex-1 h-8 rounded border flex items-center justify-center bg-bg-secondary border-border-default hover:border-accent transition-colors"
                  >
                    <div
                      className="rounded-full bg-text-secondary"
                      style={{ width: '100%', height: t }}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </AccordionSection>
      )}
    </div>
  );
}
