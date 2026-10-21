import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  X,
  Loader2,
} from 'lucide-react';
import { useDossierStore, useSelectionStore, useTagSetStore, useHistoryStore } from '../../stores';
import type {
  Element,
  ElementShape,
  Link,
  ElementVisual,
  LinkDirection,
  LinkStyle,
  Confidence,
  Evaluation,
  Property,
  FontSize,
} from '../../types';
import { DEFAULT_COLORS, FONT_SIZE_PX } from '../../types';
import { AccordionSection } from '../common';
import { TagsEditor } from './TagsEditor';
import { PropertiesEditor } from './PropertiesEditor';
import { EvaluationInput } from './EvaluationInput';
import { getModelScale } from '../../utils/evaluation';
import { useEvaluationModel } from '../../hooks/useEvaluationModel';
import { SuggestedPropertiesPopup } from './SuggestedPropertiesPopup';

const ELEMENT_SHAPES: { value: ElementShape; label: string }[] = [
  { value: 'circle', label: '○' },
  { value: 'square', label: '□' },
  { value: 'diamond', label: '◇' },
  { value: 'rectangle', label: '▭' },
];

const LINK_DIRECTION_DEFS: { value: LinkDirection; icon: typeof Minus; labelKey: string }[] = [
  { value: 'none', icon: Minus, labelKey: 'directionNone' },
  { value: 'forward', icon: ArrowRight, labelKey: 'directionForward' },
  { value: 'backward', icon: ArrowLeft, labelKey: 'directionBackward' },
  { value: 'both', icon: ArrowLeftRight, labelKey: 'directionBoth' },
];

const LINK_STYLE_VALUES: LinkStyle[] = ['solid', 'dashed', 'dotted'];

const LINK_THICKNESSES = [1, 2, 3, 4, 5];

const FONT_SIZES: { value: FontSize; label: string }[] = [
  { value: 'xs', label: 'XS' },
  { value: 'sm', label: 'S' },
  { value: 'md', label: 'M' },
  { value: 'lg', label: 'L' },
  { value: 'xl', label: 'XL' },
];

/** `target` taking the value, type and source zone of `source` */
function withValueOf(target: Property, source: Property): Property {
  return { key: target.key, value: source.value, type: source.type, ...(source.timeZone ? { timeZone: source.timeZone } : {}) };
}

/**
 * Applies a tag change to many items in as few store calls as possible: items
 * that end up with the same tag list are updated together, unchanged ones skipped.
 */
async function updateTagsGrouped<T extends { id: string; tags: string[] }, C>(
  items: T[],
  nextTags: (tags: string[]) => string[],
  update: (ids: T['id'][], changes: C) => Promise<void>,
): Promise<void> {
  const groups = new Map<string, { tags: string[]; ids: T['id'][] }>();
  for (const item of items) {
    const tags = nextTags(item.tags);
    if (tags.length === item.tags.length && tags.every((tag, i) => tag === item.tags[i])) continue;
    const key = JSON.stringify(tags);
    const group = groups.get(key) ?? { tags, ids: [] };
    group.ids.push(item.id);
    groups.set(key, group);
  }
  for (const { tags, ids } of groups.values()) {
    await update(ids, { tags } as C);
  }
}

export function MultiSelectionDetail() {
  const { t } = useTranslation('panels');
  const { t: tCommon } = useTranslation('common');
  const {
    elements,
    links,
    updateElements,
    updateLinks,
    currentDossier,
    addExistingTag,
  } = useDossierStore();

  const { selectedElementIds, selectedLinkIds } = useSelectionStore();
  const pushAction = useHistoryStore((s) => s.pushAction);

  // Runs a bulk edit as ONE undoable step. `run` receives recording versions of
  // updateElements/updateLinks: before each call, the current value of every
  // field it touches is saved (earliest wins), so undo restores the selection
  // as it was; redo replays the calls in order. Values are read from the store
  // state at the start — the Y.js → store sync is deferred to the next frame.
  const withUndo = useCallback(
    async (run: (update: {
      updateElements: typeof updateElements;
      updateLinks: typeof updateLinks;
    }) => Promise<void>) => {
      const state = useDossierStore.getState();
      const elementById = new Map(state.elements.map((el) => [el.id, el]));
      const linkById = new Map(state.links.map((link) => [link.id, link]));
      const undoElements = new Map<string, Record<string, unknown>>();
      const undoLinks = new Map<string, Record<string, unknown>>();
      const calls: { kind: 'elements' | 'links'; ids: string[]; changes: Record<string, unknown> }[] = [];

      const saveBefore = (
        undo: Map<string, Record<string, unknown>>,
        item: Record<string, unknown> | undefined,
        id: string,
        changes: Record<string, unknown>,
      ) => {
        if (!item) return;
        const prev = undo.get(id) ?? {};
        for (const key of Object.keys(changes)) {
          if (key === 'visual') {
            // Visual is merged key by key: save only the keys being changed
            // (undefined when absent, which the merge writes back as absent)
            const prevVisual = (prev.visual ?? {}) as Record<string, unknown>;
            const itemVisual = (item.visual ?? {}) as Record<string, unknown>;
            for (const vKey of Object.keys(changes.visual as object)) {
              if (!(vKey in prevVisual)) prevVisual[vKey] = itemVisual[vKey];
            }
            prev.visual = prevVisual;
          } else if (!(key in prev)) {
            // The store skips undefined fields: restore "unset" as null
            prev[key] = item[key] === undefined ? null : structuredClone(item[key]);
          }
        }
        undo.set(id, prev);
      };

      await run({
        updateElements: async (ids, changes) => {
          ids.forEach((id) => saveBefore(undoElements, elementById.get(id) as unknown as Record<string, unknown>, id, changes as Record<string, unknown>));
          calls.push({ kind: 'elements', ids: [...ids], changes: structuredClone(changes) as Record<string, unknown> });
          await updateElements(ids, changes);
        },
        updateLinks: async (ids, changes) => {
          ids.forEach((id) => saveBefore(undoLinks, linkById.get(id) as unknown as Record<string, unknown>, id, changes as Record<string, unknown>));
          calls.push({ kind: 'links', ids: [...ids], changes: structuredClone(changes) as Record<string, unknown> });
          await updateLinks(ids, changes);
        },
      });

      if (calls.length === 0) return;
      pushAction({
        type: 'update-bulk',
        undo: {
          bulkElements: [...undoElements].map(([id, changes]) => ({ id, changes: changes as Partial<Element> })),
          bulkLinks: [...undoLinks].map(([id, changes]) => ({ id, changes: changes as Partial<Link> })),
        },
        redo: { bulkCalls: calls as { kind: 'elements' | 'links'; ids: string[]; changes: Partial<Element> }[] },
      });
    },
    [updateElements, updateLinks, pushAction]
  );

  // Get selected items
  const selectedElements = useMemo(
    () => elements.filter((el) => selectedElementIds.has(el.id)),
    [elements, selectedElementIds]
  );

  const selectedLinks = useMemo(
    () => links.filter((link) => selectedLinkIds.has(link.id)),
    [links, selectedLinkIds]
  );

  // Tag being added to or removed from the selection: shown on its chip while
  // the update runs (several seconds on a few hundred items)
  const [pendingTag, setPendingTag] = useState<string | null>(null);

  const elementCount = selectedElements.length;
  const linkCount = selectedLinks.length;

  // Collect all existing tags from selection
  const allSelectedTags = useMemo(() => {
    const tags = new Set<string>();
    selectedElements.forEach((el) => el.tags.forEach((t) => tags.add(t)));
    selectedLinks.forEach((link) => link.tags.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [selectedElements, selectedLinks]);

  // A tag being added shows its chip (with the pending mark) right away
  const chipTags = useMemo(
    () => pendingTag && !allSelectedTags.includes(pendingTag)
      ? [...allSelectedTags, pendingTag].sort()
      : allSelectedTags,
    [allSelectedTags, pendingTag]
  );

  // Common properties: only those with the same key, type AND value across ALL selected items
  const mergedProperties = useMemo(() => {
    const allItems = [...selectedElements, ...selectedLinks];
    if (allItems.length === 0) return [];

    // Start with the first item's properties, then intersect
    const first = allItems[0];
    return first.properties.filter(prop =>
      allItems.every(item =>
        item.properties.some(p =>
          p.key === prop.key &&
          p.type === prop.type &&
          String(p.value ?? '') === String(prop.value ?? '') &&
          p.timeZone === prop.timeZone
        )
      )
    );
  }, [selectedElements, selectedLinks]);

  // ============================================================================
  // HANDLERS - Tags
  // ============================================================================

  // Suggested-properties popup (shown after adding a TagSet tag to the selection)
  const [suggestedPropsTagSet, setSuggestedPropsTagSet] = useState<string | null>(null);

  const withPendingTag = useCallback(async (tag: string, run: () => Promise<void>) => {
    setPendingTag(tag);
    try {
      await run();
    } finally {
      setPendingTag(null);
    }
  }, []);

  const handleAddTag = useCallback(
    (tag: string) => withPendingTag(tag, () => withUndo(async ({ updateElements, updateLinks }) => {
      await updateTagsGrouped(selectedElements, (tags) => tags.includes(tag) ? tags : [...tags, tag], updateElements);
      await updateTagsGrouped(selectedLinks, (tags) => tags.includes(tag) ? tags : [...tags, tag], updateLinks);

      // Save to dossier suggestions
      addExistingTag(tag);

      // If the tag maps to a TagSet with suggested properties or a defaultVisual,
      // offer to apply them to every selected item (same UX as single-element).
      const tagSet = useTagSetStore.getState().getByName(tag);
      const dv = tagSet?.defaultVisual;
      const hasVisual = !!(dv && (dv.color || dv.shape || dv.icon));
      if (tagSet && (tagSet.suggestedProperties.length > 0 || hasVisual)) {
        setSuggestedPropsTagSet(tag);
      }
    })),
    [selectedElements, selectedLinks, addExistingTag, withUndo, withPendingTag]
  );

  // Apply chosen suggested properties to every selected element/link (skipping
  // items that already have a property with the same key). Optionally also apply
  // the tag's appearance (color/shape/icon) to every selected element.
  const handleApplySuggestedProperties = useCallback(
    (properties: Property[], applyVisual?: boolean) => withUndo(async ({ updateElements, updateLinks }) => {
      const dv = applyVisual
        ? useTagSetStore.getState().getByName(suggestedPropsTagSet ?? '')?.defaultVisual
        : null;
      const overlay: Partial<ElementVisual> = {};
      if (dv?.color) overlay.color = dv.color;
      if (dv?.shape) overlay.shape = dv.shape;
      if (dv?.icon) overlay.icon = dv.icon;
      const hasOverlay = Object.keys(overlay).length > 0;

      for (const el of selectedElements) {
        const toAdd = properties.filter(p => !el.properties.some(ep => ep.key === p.key));
        const changes: Record<string, unknown> = {};
        if (toAdd.length > 0) changes.properties = [...el.properties, ...toAdd];
        if (hasOverlay) changes.visual = { ...el.visual, ...overlay };
        if (Object.keys(changes).length > 0) {
          await updateElements([el.id], changes);
        }
      }
      // Links only receive properties (they have no shape/icon).
      for (const link of selectedLinks) {
        const toAdd = properties.filter(p => !link.properties.some(lp => lp.key === p.key));
        if (toAdd.length > 0) {
          await updateLinks([link.id], { properties: [...link.properties, ...toAdd] });
        }
      }
    }),
    [selectedElements, selectedLinks, suggestedPropsTagSet, withUndo]
  );

  const handleRemoveTag = useCallback(
    (tagToRemove: string) => withPendingTag(tagToRemove, () => withUndo(async ({ updateElements, updateLinks }) => {
      await updateTagsGrouped(selectedElements, (tags) => tags.filter((t) => t !== tagToRemove), updateElements);
      await updateTagsGrouped(selectedLinks, (tags) => tags.filter((t) => t !== tagToRemove), updateLinks);
    })),
    [selectedElements, selectedLinks, withUndo, withPendingTag]
  );

  // ============================================================================
  // HANDLERS - Properties (bulk via PropertiesEditor)
  // ============================================================================

  const handleBulkPropertiesChange = useCallback((newProperties: Property[]) => withUndo(async ({ updateElements, updateLinks }) => {
    const allItems = [...selectedElements, ...selectedLinks];
    if (allItems.length === 0) return;

    // Determine what changed: added, updated, or removed
    const oldKeys = new Set(mergedProperties.map(p => p.key));
    const newKeys = new Set(newProperties.map(p => p.key));

    // Removed properties
    const removedKeys = [...oldKeys].filter(k => !newKeys.has(k));

    // Added or updated properties
    const changedProps = newProperties.filter(p => {
      const old = mergedProperties.find(o => o.key === p.key);
      return !old || old.value !== p.value || old.type !== p.type || old.timeZone !== p.timeZone;
    });

    // Apply removals
    for (const key of removedKeys) {
      for (const el of selectedElements) {
        if (el.properties.some(p => p.key === key)) {
          await updateElements([el.id], { properties: el.properties.filter(p => p.key !== key) });
        }
      }
      for (const link of selectedLinks) {
        if (link.properties.some(p => p.key === key)) {
          await updateLinks([link.id], { properties: link.properties.filter(p => p.key !== key) });
        }
      }
    }

    // Apply additions/updates
    for (const prop of changedProps) {
      for (const el of selectedElements) {
        const existing = el.properties.find(p => p.key === prop.key);
        if (existing) {
          // Update value
          await updateElements([el.id], {
            properties: el.properties.map(p => p.key === prop.key ? withValueOf(p, prop) : p),
          });
        } else {
          // Add
          await updateElements([el.id], { properties: [...el.properties, prop] });
        }
      }
      for (const link of selectedLinks) {
        const existing = link.properties.find(p => p.key === prop.key);
        if (existing) {
          await updateLinks([link.id], {
            properties: link.properties.map(p => p.key === prop.key ? withValueOf(p, prop) : p),
          });
        } else {
          await updateLinks([link.id], { properties: [...link.properties, prop] });
        }
      }
    }
  }), [mergedProperties, selectedElements, selectedLinks, withUndo]);

  // ============================================================================
  // HANDLERS - Confidence
  // ============================================================================

  const handleConfidenceChange = useCallback(
    (value: number | null) => withUndo(async ({ updateElements, updateLinks }) => {
      // null resets the confidence to "not set" on the whole selection
      const confidence = value === null ? null : Math.round(value / 10) * 10 as Confidence;
      const elementIds = Array.from(selectedElementIds);
      const linkIds = Array.from(selectedLinkIds);

      if (elementIds.length > 0) {
        await updateElements(elementIds, { confidence });
      }
      if (linkIds.length > 0) {
        await updateLinks(linkIds, { confidence });
      }
    }),
    [selectedElementIds, selectedLinkIds, withUndo]
  );

  // Two-axis grading: the composed value is applied as a whole to the selection
  const evaluationScale = getModelScale(useEvaluationModel());
  const [bulkEvaluation, setBulkEvaluation] = useState<Evaluation | null>(null);
  const handleEvaluationChange = useCallback(
    (evaluation: Evaluation | null) => withUndo(async ({ updateElements, updateLinks }) => {
      setBulkEvaluation(evaluation);
      const elementIds = Array.from(selectedElementIds);
      const linkIds = Array.from(selectedLinkIds);

      if (elementIds.length > 0) {
        await updateElements(elementIds, { evaluation });
      }
      if (linkIds.length > 0) {
        await updateLinks(linkIds, { evaluation });
      }
    }),
    [selectedElementIds, selectedLinkIds, withUndo]
  );

  // ============================================================================
  // HANDLERS - Color (common to both)
  // ============================================================================

  const handleColorChange = useCallback(
    (color: string) => withUndo(async ({ updateElements, updateLinks }) => {
      // Pass only changed property — store/Y.Map merge with current visual
      const elementIds = Array.from(selectedElementIds);
      const linkIds = Array.from(selectedLinkIds);
      if (elementIds.length > 0) {
        await updateElements(elementIds, { visual: { color } });
      }
      if (linkIds.length > 0) {
        await updateLinks(linkIds, { visual: { color } });
      }
    }),
    [selectedElementIds, selectedLinkIds, withUndo]
  );

  // ============================================================================
  // HANDLERS - Font size (common to both)
  // ============================================================================

  const handleFontSizeChange = useCallback(
    (fontSize: FontSize) => withUndo(async ({ updateElements, updateLinks }) => {
      const elementIds = Array.from(selectedElementIds);
      const linkIds = Array.from(selectedLinkIds);
      if (elementIds.length > 0) {
        await updateElements(elementIds, { visual: { fontSize } });
      }
      if (linkIds.length > 0) {
        await updateLinks(linkIds, { visual: { fontSize } });
      }
    }),
    [selectedElementIds, selectedLinkIds, withUndo]
  );

  // ============================================================================
  // HANDLERS - Element-specific
  // ============================================================================

  const handleShapeChange = useCallback(
    (shape: ElementShape) => withUndo(async ({ updateElements }) => {
      const elementIds = Array.from(selectedElementIds);
      if (elementIds.length > 0) {
        await updateElements(elementIds, { visual: { shape, customWidth: undefined, customHeight: undefined } });
      }
    }),
    [selectedElementIds, withUndo]
  );


  const handleBorderColorChange = useCallback(
    (borderColor: string) => withUndo(async ({ updateElements }) => {
      const elementIds = Array.from(selectedElementIds);
      if (elementIds.length > 0) {
        await updateElements(elementIds, { visual: { borderColor } });
      }
    }),
    [selectedElementIds, withUndo]
  );

  // ============================================================================
  // HANDLERS - Link-specific
  // ============================================================================

  const handleDirectionChange = useCallback(
    (direction: LinkDirection) => withUndo(async ({ updateLinks }) => {
      const linkIds = Array.from(selectedLinkIds);
      if (linkIds.length > 0) {
        await updateLinks(linkIds, { direction, directed: direction !== 'none' });
      }
    }),
    [selectedLinkIds, withUndo]
  );

  // Label shared by every selected link, null when they differ
  const commonLinkLabel = useMemo(() => {
    const labels = new Set(selectedLinks.map((link) => link.label));
    return labels.size === 1 ? [...labels][0] : null;
  }, [selectedLinks]);

  const handleLabelCommit = useCallback(
    (label: string) => withUndo(async ({ updateLinks }) => {
      const linkIds = Array.from(selectedLinkIds);
      if (linkIds.length > 0) {
        await updateLinks(linkIds, { label });
      }
    }),
    [selectedLinkIds, withUndo]
  );

  const handleStyleChange = useCallback(
    (style: LinkStyle) => withUndo(async ({ updateLinks }) => {
      const linkIds = Array.from(selectedLinkIds);
      if (linkIds.length > 0) {
        await updateLinks(linkIds, { visual: { style } });
      }
    }),
    [selectedLinkIds, withUndo]
  );

  const handleThicknessChange = useCallback(
    (thickness: number) => withUndo(async ({ updateLinks }) => {
      const linkIds = Array.from(selectedLinkIds);
      if (linkIds.length > 0) {
        await updateLinks(linkIds, { visual: { thickness } });
      }
    }),
    [selectedLinkIds, withUndo]
  );

  return (
    <div className="divide-y divide-border-default">
      {/* Header */}
      <div className="px-3 py-2 bg-bg-secondary">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-accent" />
          <span className="text-sm font-medium text-text-primary">
            {t('detail.multi.title')}
          </span>
        </div>
        <div className="text-xs text-text-secondary mt-1">
          {elementCount > 0 && (
            <span className="inline-flex items-center gap-1 mr-2">
              <span className="w-2 h-2 rounded-full bg-accent" />
              {t('detail.multi.elements', { count: elementCount })}
            </span>
          )}
          {linkCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="w-4 h-0.5 bg-accent" />
              {t('detail.multi.links', { count: linkCount })}
            </span>
          )}
        </div>
      </div>

      {/* Tags - Common */}
      <AccordionSection
        id="bulk-tags"
        title={tCommon('labels.tags')}
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
            {t('detail.multi.addOrRemoveTags')}
          </p>

          {/* Current tags in selection */}
          {chipTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {chipTags.map((tag) => (
                <span
                  key={tag}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-bg-tertiary text-text-secondary rounded ${tag === pendingTag ? 'opacity-60' : ''}`}
                  aria-busy={tag === pendingTag}
                >
                  {tag}
                  {tag === pendingTag ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      disabled={pendingTag !== null}
                      className="hover:text-error disabled:opacity-40 disabled:hover:text-text-secondary"
                      title={t('detail.multi.removeFromSelection')}
                    >
                      <X size={10} />
                    </button>
                  )}
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
            suggestions={currentDossier?.settings.existingTags}
            onNewTag={handleAddTag}
          />
        </div>
      </AccordionSection>

      {/* Properties - Common */}
      <AccordionSection
        id="bulk-properties"
        title={t('detail.sections.properties')}
        icon={<Settings size={12} />}
        defaultOpen={false}
      >
        <div className="space-y-3">
          <p className="text-[10px] text-text-tertiary">
            {t('detail.multi.addPropertyToAll')}
          </p>
          <PropertiesEditor
            properties={mergedProperties}
            onChange={handleBulkPropertiesChange}
            suggestions={currentDossier?.settings?.suggestedProperties}
          />
        </div>
      </AccordionSection>

      {/* Evaluation - Common (grading models) */}
      {evaluationScale ? (
      <AccordionSection
        id="bulk-evaluation"
        title={tCommon('evaluation.label')}
        icon={<Percent size={12} />}
        defaultOpen={false}
      >
        <div className="space-y-2">
          <p className="text-[10px] text-text-tertiary">
            {t('detail.multi.setEvaluationAll')}
          </p>
          <EvaluationInput
            value={bulkEvaluation}
            scale={evaluationScale}
            onChange={handleEvaluationChange}
          />
        </div>
      </AccordionSection>
      ) : (
      /* Confidence - Common */
      <AccordionSection
        id="bulk-confidence"
        title={t('detail.labels.confidence')}
        icon={<Percent size={12} />}
        defaultOpen={false}
      >
        <div className="space-y-2">
          <p className="text-[10px] text-text-tertiary">
            {t('detail.multi.setConfidenceAll')}
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
          <button
            onClick={() => handleConfidenceChange(null)}
            className="px-1.5 py-0.5 text-xs text-text-secondary border border-border-default rounded hover:bg-bg-secondary"
          >
            {t('detail.multi.clearConfidenceAll')}
          </button>
        </div>
      </AccordionSection>
      )}

      {/* Color - Common */}
      <AccordionSection
        id="bulk-color"
        title={t('detail.appearance.color')}
        icon={<Palette size={12} />}
        defaultOpen={false}
      >
        <div className="space-y-2">
          <p className="text-[10px] text-text-tertiary">
            {t('detail.multi.setColorAll')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DEFAULT_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => handleColorChange(color)}
                className="w-6 h-6 rounded border-2 border-transparent hover:border-accent transition-colors"
                style={{ backgroundColor: color }}
                aria-label={`${t('detail.appearance.color')} ${color}`}
              />
            ))}
            <input
              type="color"
              onChange={(e) => handleColorChange(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer border-0 p-0"
              aria-label={t('detail.appearance.customColor')}
            />
          </div>
        </div>
      </AccordionSection>

      {/* Font size - Common */}
      <AccordionSection
        id="bulk-fontsize"
        title={t('detail.appearance.textSize')}
        icon={<span className="text-[10px] font-bold">A</span>}
        defaultOpen={false}
      >
        <div className="space-y-2">
          <p className="text-[10px] text-text-tertiary">
            {t('detail.multi.setTextSizeAll')}
          </p>
          <div className="flex gap-1">
            {FONT_SIZES.map((fs) => (
              <button
                key={fs.value}
                onClick={() => handleFontSizeChange(fs.value)}
                className="flex-1 h-8 rounded border flex items-center justify-center bg-bg-secondary text-text-secondary border-border-default hover:border-accent transition-colors"
                style={{ fontSize: FONT_SIZE_PX[fs.value] }}
              >
                {fs.label}
              </button>
            ))}
          </div>
        </div>
      </AccordionSection>

      {/* Elements-only section */}
      {elementCount > 0 && (
        <AccordionSection
          id="bulk-elements"
          title={t('detail.multi.elementsSection', { count: elementCount })}
          icon={<span className="w-3 h-3 rounded-full border-2 border-current" />}
          defaultOpen={false}
        >
          <div className="space-y-4">
            {/* Shape */}
            <div className="space-y-1.5">
              <label className="text-xs text-text-tertiary">{t('detail.appearance.shape')}</label>
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
              <label className="text-xs text-text-tertiary">{t('detail.appearance.borderColor')}</label>
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
          title={t('detail.multi.linksSection', { count: linkCount })}
          icon={<span className="w-4 h-0.5 bg-current" />}
          defaultOpen={elementCount === 0}
        >
          <div className="space-y-4">
            {/* Label */}
            <div className="space-y-1.5">
              <label className="text-xs text-text-tertiary">{t('detail.labels.label')}</label>
              <BulkTextInput
                key={`${[...selectedLinkIds].join(',')}|${commonLinkLabel ?? ''}`}
                initial={commonLinkLabel}
                placeholder={t('detail.multi.mixedValues')}
                onCommit={handleLabelCommit}
              />
            </div>

            {/* Direction */}
            <div className="space-y-1.5">
              <label className="text-xs text-text-tertiary">{t('detail.labels.direction')}</label>
              <div className="flex gap-1">
                {LINK_DIRECTION_DEFS.map(({ value, icon: Icon, labelKey }) => (
                  <button
                    key={value}
                    onClick={() => handleDirectionChange(value)}
                    className="flex-1 flex items-center justify-center p-2 rounded border bg-bg-secondary text-text-secondary border-border-default hover:border-accent transition-colors"
                    title={t(`detail.labels.${labelKey}`)}
                  >
                    <Icon size={16} />
                  </button>
                ))}
              </div>
            </div>

            {/* Style */}
            <div className="space-y-1.5">
              <label className="text-xs text-text-tertiary">{t('detail.appearance.style')}</label>
              <div className="flex gap-2">
                {LINK_STYLE_VALUES.map((style) => (
                  <button
                    key={style}
                    onClick={() => handleStyleChange(style)}
                    className="flex-1 px-2 py-1.5 text-xs rounded border bg-bg-secondary text-text-secondary border-border-default hover:border-accent transition-colors"
                  >
                    {tCommon(`linkStyles.${style}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* Thickness */}
            <div className="space-y-1.5">
              <label className="text-xs text-text-tertiary">{t('detail.appearance.thickness')}</label>
              <div className="flex gap-1">
                {LINK_THICKNESSES.map((thickness) => (
                  <button
                    key={thickness}
                    onClick={() => handleThicknessChange(thickness)}
                    className="flex-1 h-8 rounded border flex items-center justify-center bg-bg-secondary border-border-default hover:border-accent transition-colors"
                  >
                    <div
                      className="rounded-full bg-text-secondary"
                      style={{ width: '100%', height: thickness }}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </AccordionSection>
      )}

      {/* Suggested properties from the added TagSet → apply to all selected items */}
      {suggestedPropsTagSet && (
        <SuggestedPropertiesPopup
          tagSetName={suggestedPropsTagSet}
          existingPropertyKeys={[]}
          onApply={handleApplySuggestedProperties}
          onClose={() => setSuggestedPropsTagSet(null)}
          targetCount={selectedElements.length + selectedLinks.length}
          showApplyVisual
        />
      )}
    </div>
  );
}

/**
 * Text field applied to the whole selection on blur or Enter. `initial` is the
 * value shared by every item, or null when they differ (the field then starts
 * empty and leaving it empty changes nothing). Escape reverts.
 */
function BulkTextInput({ initial, placeholder, onCommit }: {
  initial: string | null;
  placeholder: string;
  onCommit: (value: string) => void;
}) {
  const [value, setValue] = useState(initial ?? '');
  const commit = () => {
    const next = value.trim();
    if (initial === null ? next !== '' : next !== initial) onCommit(next);
  };
  return (
    <input
      type="text"
      value={value}
      placeholder={initial === null ? placeholder : undefined}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'Escape') setValue(initial ?? '');
      }}
      className="w-full px-2 py-1.5 text-sm rounded border border-border-default bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
    />
  );
}
