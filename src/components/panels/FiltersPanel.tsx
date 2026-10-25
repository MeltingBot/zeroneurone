import { useMemo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Filter,
  RotateCcw,
  Eye,
  EyeOff,
  CircleOff,
  Tag,
  MapPin,
  Calendar,
  AlertCircle,
  MessageSquare,
  MousePointer2,
  SquareDashed,
  Plus,
  Check,
} from 'lucide-react';
import { useDossierStore, useViewStore, useInsightsStore, useHistoryStore, useUIStore, useQueryStore, useTabStore, useSelectionStore } from '../../stores';
import { useFilterOutcome, useShownSelection } from '../../hooks/useFilterOutcome';
import { ProgressiveList } from '../common/ProgressiveList';
import { TagDot } from '../common/TagDot';
import { useTagColors } from '../../hooks/useTagColors';
import type { Confidence, Element, Comment, EvaluationModel, ViewFilters } from '../../types';
import { datePropertyRules, elementDateIntervals } from '../../utils/temporalUtils';
import { EVALUATION_GRIDS, getModelScale, matchesEvaluationFilters } from '../../utils/evaluation';
import { useEvaluationModel } from '../../hooks/useEvaluationModel';
import { getGeoCenter } from '../../utils/geo';

// Quick filters: each names a set of elements of the view (labels from the
// translations); the mode chosen next to them says what a click does with it
type QuickMode = 'hide' | 'only' | 'select';
const QUICK_MODES: QuickMode[] = ['hide', 'only', 'select'];
const QUICK_MODE_KEY = 'zn:filters:quickMode';

interface QuickFilterParams {
  /** Elements the view covers: the open tab, or the whole dossier */
  scope: Element[];
  isolated: string[];
  comments: Comment[];
  filters: ViewFilters;
  evaluationModel: EvaluationModel;
}

interface QuickFilterDef {
  id: string;
  labelKey: string;
  descKey: string;
  icon: React.ReactNode;
  ids: (params: QuickFilterParams) => string[];
  /** Evaluation models the filter is offered in (all when absent) */
  models?: EvaluationModel[];
}

/** Elements with no date at all, as the timeline and the map date them
 *  (period, events, date properties kept in the filters panel) */
function undatedElementIds(elements: Element[], filters: ViewFilters): string[] {
  const rules = datePropertyRules(filters);
  return elements.filter((el) => elementDateIntervals(el, rules).length === 0).map((el) => el.id);
}

const QUICK_FILTER_DEFS: QuickFilterDef[] = [
  {
    id: 'isolated',
    labelKey: 'isolated',
    descKey: 'isolatedDesc',
    icon: <CircleOff size={12} />,
    ids: ({ scope, isolated }) => {
      const set = new Set(isolated);
      return scope.filter((el) => set.has(el.id)).map((el) => el.id);
    },
  },
  {
    id: 'no-tags',
    labelKey: 'noTags',
    descKey: 'noTagsDesc',
    icon: <Tag size={12} />,
    ids: ({ scope }) => scope.filter((el) => el.tags.length === 0).map((el) => el.id),
  },
  {
    id: 'no-geo',
    labelKey: 'noGeo',
    descKey: 'noGeoDesc',
    icon: <MapPin size={12} />,
    ids: ({ scope }) => scope
      .filter((el) => {
        if (!el.geo) return true;
        const c = getGeoCenter(el.geo);
        return c.lat === 0 && c.lng === 0;
      })
      .map((el) => el.id),
  },
  {
    id: 'no-date',
    labelKey: 'noDate',
    descKey: 'noDateDesc',
    icon: <Calendar size={12} />,
    ids: ({ scope, filters }) => undatedElementIds(scope, filters),
  },
  {
    id: 'low-confidence',
    labelKey: 'lowConfidence',
    descKey: 'lowConfidenceDesc',
    icon: <AlertCircle size={12} />,
    // Same rule as the confidence filter: unknown counts as low
    ids: ({ scope }) => scope.filter((el) => el.confidence === null || el.confidence < 50).map((el) => el.id),
    models: ['zeroneurone'],
  },
  {
    id: 'reliable-sources',
    labelKey: 'reliableSources',
    descKey: 'reliableSourcesDesc',
    icon: <AlertCircle size={12} />,
    ids: ({ scope, evaluationModel }) => {
      const scale = getModelScale(evaluationModel);
      if (!scale) return [];
      const reliable = EVALUATION_GRIDS[scale].reliableSources;
      return scope.filter((el) => matchesEvaluationFilters(el.evaluation, evaluationModel, reliable, null)).map((el) => el.id);
    },
    models: ['europol', 'admiralty'],
  },
  {
    id: 'has-comments',
    labelKey: 'hasComments',
    descKey: 'hasCommentsDesc',
    icon: <MessageSquare size={12} />,
    ids: ({ scope, comments }) => {
      const commented = new Set(comments.filter((c) => !c.resolved && c.targetType === 'element').map((c) => c.targetId));
      return scope.filter((el) => commented.has(el.id)).map((el) => el.id);
    },
  },
];

function readQuickMode(): QuickMode {
  try {
    const stored = localStorage.getItem(QUICK_MODE_KEY);
    return QUICK_MODES.includes(stored as QuickMode) ? (stored as QuickMode) : 'hide';
  } catch {
    return 'hide';
  }
}

/** Date property keys selected in the filters panel (empty: all of them) */
function selectedDateKeys(dateKeys: string[], included?: string[], excluded?: string[]): string[] {
  if (included && included.length > 0) return dateKeys.filter((key) => included.includes(key));
  // Former form (the keys left out), from a view saved with it
  if (excluded && excluded.length > 0) return dateKeys.filter((key) => !excluded.includes(key));
  return [];
}

export function FiltersPanel() {
  const { t } = useTranslation('panels');
  const { t: tCommon } = useTranslation('common');
  const { elements, comments } = useDossierStore();
  const {
    filters,
    setFilters,
    clearFilters,
    addIncludeTag,
    removeIncludeTag,
    hasActiveFilters,
    hiddenElementIds,
    hideElements,
    showElements,
    showElement,
    showAllElements,
  } = useViewStore();
  const { isolated } = useInsightsStore();

  const isActive = hasActiveFilters();
  // Tabs filter: in the "All" view only (a tab already narrows the views)
  const canvasTabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const includeTabs = filters.includeTabs ?? [];
  const handleTabToggle = useCallback((tabId: string) => {
    const current = useViewStore.getState().filters.includeTabs ?? [];
    setFilters({ includeTabs: current.includes(tabId) ? current.filter((id) => id !== tabId) : [...current, tabId] });
  }, [setFilters]);
  const hideFilteredOut = useUIStore((s) => s.hideFilteredOut);
  const evaluationModel = useEvaluationModel();
  const evaluationScale = getModelScale(evaluationModel);

  const toggleEvaluationCode = useCallback(
    (axis: 'evaluationSources' | 'evaluationInfos', code: string) => {
      const current = filters[axis] ?? [];
      const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
      setFilters({ [axis]: next.length > 0 ? next : null });
    },
    [filters, setFilters]
  );

  // Elements the views show: kept by the filters and by the query applied on
  // the canvas, counted as the views do
  const outcome = useFilterOutcome();
  const matchingIds = outcome.shownIds;
  const queryActive = outcome.queryCount !== null;
  const queryOutputMode = useQueryStore((s) => s.outputMode);

  const matchingCount = matchingIds.length;

  // One toggle, shared with the query panel: deselects once everything shown
  // is selected, selects otherwise
  const { allSelected: allMatchingSelected, toggle: toggleMatchingSelection } = useShownSelection(outcome);

  // Counted on what the view covers: the open tab (and combined ones), like
  // the element total above; the whole dossier in "All"
  const tabMemberSet = useTabStore((s) => s.memberSet);
  const scopeElements = useMemo(
    () => (activeTabId !== null ? elements.filter((el) => tabMemberSet.has(el.id)) : elements),
    [elements, activeTabId, tabMemberSet]
  );

  const tagColors = useTagColors();

  // Get all unique tags from elements with counts
  const tagsWithCounts = useMemo(() => {
    const tagMap = new Map<string, number>();
    scopeElements.forEach((el) => {
      el.tags.forEach((tag) => {
        tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
      });
    });
    return Array.from(tagMap.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }, [scopeElements]);

  // Get all unique property keys from elements
  const allPropertyKeys = useMemo(() => {
    const keySet = new Set<string>();
    scopeElements.forEach((el) => el.properties.forEach((prop) => keySet.add(prop.key)));
    return Array.from(keySet).sort();
  }, [scopeElements]);

  // Date/datetime property keys, with how many elements fill them: they date
  // the elements on the timeline and the map (a birth date is rarely an event)
  // The keys come from the whole dossier (the choice is one for every view:
  // a key missing from this tab must stay chosen), the counts from the view
  const datePropertyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const scope = activeTabId !== null ? tabMemberSet : null;
    elements.forEach((el) => el.properties.forEach((prop) => {
      if ((prop.type === 'date' || prop.type === 'datetime') && prop.value) {
        const inView = !scope || scope.has(el.id);
        counts.set(prop.key, (counts.get(prop.key) || 0) + (inView ? 1 : 0));
      }
    }));
    return Array.from(counts.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [elements, activeTabId, tabMemberSet]);
  // Like the tags: no date property selected means all of them date the
  // elements; selecting some keeps only those. The selection itself is
  // stored, so a date property imported later is not counted unasked.
  const dateKeys = useMemo(() => datePropertyCounts.map(({ key }) => key), [datePropertyCounts]);
  const includedDateProperties = filters.includedDateProperties;
  const excludedDateProperties = filters.excludedDateProperties;
  const selectedDateProperties = useMemo(
    () => selectedDateKeys(dateKeys, includedDateProperties, excludedDateProperties),
    [dateKeys, includedDateProperties, excludedDateProperties]
  );
  const toggleDateProperty = useCallback((key: string) => {
    // Read the store, not the render: quick successive clicks stay right
    const current = useViewStore.getState().filters;
    const before = selectedDateKeys(dateKeys, current.includedDateProperties, current.excludedDateProperties);
    const selected = before.includes(key) ? before.filter((k) => k !== key) : [...before, key];
    setFilters({ includedDateProperties: selected, excludedDateProperties: [] });
  }, [dateKeys, setFilters]);
  const clearDateProperties = useCallback(
    () => setFilters({ includedDateProperties: [], excludedDateProperties: [] }),
    [setFilters]
  );
  // A former choice leaving every key out reads as no selection: all dates
  const allDatesExcluded = !(includedDateProperties?.length) && dateKeys.length > 0
    && dateKeys.every((key) => excludedDateProperties?.includes(key));
  useEffect(() => {
    if (allDatesExcluded) clearDateProperties();
  }, [allDatesExcluded, clearDateProperties]);

  // Quick filter params
  const quickFilterParams: QuickFilterParams = useMemo(
    () => ({ scope: scopeElements, isolated, comments, filters, evaluationModel }),
    [scopeElements, isolated, comments, filters, evaluationModel]
  );

  // Quick filters: the set of each chip, and what a click does with it
  const [quickMode, setQuickModeState] = useState<QuickMode>(readQuickMode);
  const setQuickMode = (mode: QuickMode) => {
    setQuickModeState(mode);
    try { localStorage.setItem(QUICK_MODE_KEY, mode); } catch { /* per-viewer convenience */ }
  };
  const { selectedElementIds, selectElements, clearSelection } = useSelectionStore();
  const quickSets = useMemo(
    () => QUICK_FILTER_DEFS
      .filter((qf) => !qf.models || qf.models.includes(evaluationModel))
      .map((qf) => ({ qf, ids: qf.ids(quickFilterParams) })),
    [quickFilterParams, evaluationModel]
  );
  const othersOf = (ids: string[]) => {
    const set = new Set(ids);
    return scopeElements.filter((el) => !set.has(el.id)).map((el) => el.id);
  };
  const quickActive = (ids: string[]): boolean => {
    if (ids.length === 0) return false;
    if (quickMode === 'hide') return ids.every((id) => hiddenElementIds.has(id));
    if (quickMode === 'select') return selectedElementIds.size === ids.length && ids.every((id) => selectedElementIds.has(id));
    const others = othersOf(ids);
    return others.length > 0 && others.every((id) => hiddenElementIds.has(id)) && ids.every((id) => !hiddenElementIds.has(id));
  };
  // A second click undoes what the chip did, and only that (elements hidden
  // by hand stay hidden)
  const applyQuick = (ids: string[]) => {
    const active = quickActive(ids);
    if (quickMode === 'hide') {
      if (active) showElements(ids); else hideElements(ids);
    } else if (quickMode === 'select') {
      if (active) clearSelection(); else selectElements(ids);
    } else {
      const others = othersOf(ids);
      if (active) showElements(others);
      else { showElements(ids); hideElements(others); }
    }
  };

  // Handle tag toggle
  const handleTagToggle = useCallback(
    (tag: string) => {
      if (filters.includeTags.includes(tag)) {
        removeIncludeTag(tag);
      } else {
        addIncludeTag(tag);
      }
    },
    [filters.includeTags, addIncludeTag, removeIncludeTag]
  );

  // Handle property filter change
  const handlePropertyChange = useCallback(
    (value: string) => {
      // Clear badge if changing/clearing property filter
      if (!value || value !== filters.badgePropertyKey) {
        setFilters({ hasProperty: value || null, badgePropertyKey: null });
      } else {
        setFilters({ hasProperty: value || null });
      }
    },
    [setFilters, filters.badgePropertyKey]
  );

  // Handle text search change
  const handleTextSearchChange = useCallback(
    (value: string) => {
      setFilters({ textSearch: value });
    },
    [setFilters]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Filter count header */}
      <div className="p-3 bg-bg-secondary border-b border-border-default">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-text-secondary" />
            <span className="text-sm font-medium text-text-primary">
              {t('filters.elementsCount', { matching: matchingCount, total: activeTabId !== null ? outcome.total : elements.length })}
            </span>
            {/* Hidden count on the same line: hiding never shifts the panel down */}
            {hiddenElementIds.size > 0 && (
              <span
                className="flex items-center gap-0.5 text-xs text-text-tertiary"
                title={t('filters.hiddenCount', { count: hiddenElementIds.size })}
                data-testid="filters-hidden-count"
              >
                <EyeOff size={12} />
                {hiddenElementIds.size}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {matchingCount > 0 && (
              <>
                <button
                  onClick={toggleMatchingSelection}
                  aria-pressed={allMatchingSelected}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
                  title={t(allMatchingSelected ? 'filters.deselectMatchingDesc' : 'filters.selectMatchingDesc')}
                >
                  {allMatchingSelected ? <SquareDashed size={12} /> : <MousePointer2 size={12} />}
                  {t(allMatchingSelected ? 'filters.deselectMatching' : 'filters.selectMatching')}
                </button>
              </>
            )}
            {(isActive || hiddenElementIds.size > 0 || queryActive) && (
              <button
                onClick={() => {
                  useHistoryStore.getState().pushAction({
                    type: 'clear-filters',
                    undo: { snapshot: { filters: { ...filters }, hiddenElementIds: Array.from(hiddenElementIds) } },
                    redo: {},
                  });
                  clearFilters();
                  showAllElements();
                  // The query applied on the views counts as a filter here: its
                  // filter goes too (the query itself stays in its panel)
                  if (queryActive) {
                    useQueryStore.getState().setOutputMode(queryOutputMode === 'both' ? 'table' : 'none');
                  }
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
              >
                <RotateCcw size={12} />
                {t('filters.clearAll')}
              </button>
            )}
          </div>
        </div>
        {/* Filters and query both narrow the views: say what each keeps */}
        {queryActive && outcome.filterCount < outcome.total && (
          <div className="mt-1 text-xs text-text-tertiary">
            {t('filters.countBreakdown', { filters: outcome.filterCount, query: outcome.queryCount })}
          </div>
        )}
      </div>

      {/* Active filters summary: on top, out of the scrolled list, always in sight */}
      {(isActive || queryActive) && (
        <div className="mx-3 mt-3 p-2 bg-accent/5 border border-accent/20 rounded" data-testid="active-filters">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1 text-xs text-accent">
              <Filter size={10} />
              {t('filters.activeFilters')}
            </div>
            <button
              onClick={() => useUIStore.setState((s) => ({ hideFilteredOut: !s.hideFilteredOut }))}
              aria-pressed={hideFilteredOut}
              title={t('filters.hideFilteredOutHint')}
              className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border ${
                hideFilteredOut
                  ? 'bg-accent text-white border-accent'
                  : 'text-text-secondary border-border-default hover:border-accent'
              }`}
            >
              {t('filters.hideFilteredOut')}
            </button>
          </div>
          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
            {queryActive && (
              <FilterBadge
                label={t('filters.queryBadge')}
                onRemove={() => useQueryStore.getState().setOutputMode(queryOutputMode === 'both' ? 'table' : 'none')}
              />
            )}
            {filters.textSearch && (
              <FilterBadge
                label={`"${filters.textSearch}"`}
                onRemove={() => handleTextSearchChange('')}
              />
            )}
            {filters.includeTags.map((tag) => (
              <FilterBadge
                key={tag}
                label={tag}
                onRemove={() => removeIncludeTag(tag)}
              />
            ))}
            {filters.hasProperty && (
              <FilterBadge
                label={filters.hasProperty}
                onRemove={() => handlePropertyChange('')}
              />
            )}
            {selectedDateProperties.length > 0 && (
              <FilterBadge
                label={t('filters.dateProperties.badge', {
                  kept: selectedDateProperties.length,
                  total: datePropertyCounts.length,
                })}
                onRemove={clearDateProperties}
              />
            )}
            {filters.minConfidence !== null && evaluationModel === 'zeroneurone' && (
              <FilterBadge
                label={`≥${filters.minConfidence}%`}
                onRemove={() => setFilters({ minConfidence: null })}
              />
            )}
            {evaluationScale && (filters.evaluationSources?.length ?? 0) > 0 && (
              <FilterBadge
                label={`${tCommon('evaluation.sourceShort')} ${filters.evaluationSources!.join(', ')}`}
                onRemove={() => setFilters({ evaluationSources: null })}
              />
            )}
            {evaluationScale && (filters.evaluationInfos?.length ?? 0) > 0 && (
              <FilterBadge
                label={`${tCommon('evaluation.infoShort')} ${filters.evaluationInfos!.join(', ')}`}
                onRemove={() => setFilters({ evaluationInfos: null })}
              />
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Quick filters: a set each; the mode says what a click does with it */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-text-secondary">
              {t('filters.sections.quickFilters')}
            </label>
            <div className="flex items-center rounded border border-border-default overflow-hidden" role="radiogroup" aria-label={t('filters.quickMode.label')}>
              {QUICK_MODES.map((mode) => {
                const Icon = mode === 'hide' ? EyeOff : mode === 'only' ? Eye : MousePointer2;
                return (
                  <button
                    key={mode}
                    role="radio"
                    aria-checked={quickMode === mode}
                    onClick={() => setQuickMode(mode)}
                    title={t(`filters.quickMode.${mode}`)}
                    aria-label={t(`filters.quickMode.${mode}`)}
                    data-testid={`quick-mode-${mode}`}
                    className={`p-1 ${quickMode === mode ? 'bg-bg-tertiary text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`}
                  >
                    <Icon size={12} />
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {quickSets.map(({ qf, ids }) => {
              const active = quickActive(ids);
              return (
                <button
                  key={qf.id}
                  onClick={() => applyQuick(ids)}
                  disabled={ids.length === 0}
                  className={`flex items-center gap-1 px-2 py-1.5 text-xs rounded border transition-colors disabled:opacity-40 ${
                    active
                      ? 'bg-accent text-white border-accent'
                      : 'bg-bg-secondary text-text-secondary border-border-default hover:border-accent hover:text-text-primary'
                  }`}
                  title={`${t(`filters.quick.${qf.descKey}`)} · ${t(`filters.quickMode.${quickMode}`)}`}
                >
                  {qf.icon}
                  {t(`filters.quick.${qf.labelKey}`)}
                  <span className={active ? 'text-white/80' : 'text-text-tertiary'}>{ids.length}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Text search */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">
            {t('filters.sections.textSearch')}
          </label>
          <div className="relative">
            <input
              type="text"
              value={filters.textSearch}
              onChange={(e) => handleTextSearchChange(e.target.value)}
              placeholder={t('filters.placeholders.textSearch')}
              className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary placeholder:text-text-tertiary pr-8"
            />
            {filters.textSearch && (
              <button
                onClick={() => handleTextSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Tabs filter ("All" view) */}
        {activeTabId === null && canvasTabs.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">
              {t('filters.sections.tabs')}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {canvasTabs.map((tab) => {
                const isSelected = includeTabs.includes(tab.id);
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabToggle(tab.id)}
                    aria-pressed={isSelected}
                    className={`flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors ${
                      isSelected
                        ? 'bg-accent text-white border-accent'
                        : 'bg-bg-secondary text-text-secondary border-border-default hover:border-accent'
                    }`}
                  >
                    {tab.name}
                    <span className={`text-[10px] ${isSelected ? 'text-white/70' : 'text-text-tertiary'}`}>
                      {tab.memberElementIds.length}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Tags filter */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">
            {t('filters.sections.tags')} ({tagsWithCounts.length})
          </label>
          {tagsWithCounts.length > 0 ? (
            <ProgressiveList
              items={tagsWithCounts}
              initialCount={30}
              increment={30}
              className="flex flex-wrap gap-1.5"
              renderItem={({ tag, count }) => {
                const isSelected = filters.includeTags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => handleTagToggle(tag)}
                    className={`flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors ${
                      isSelected
                        ? 'bg-accent text-white border-accent'
                        : 'bg-bg-secondary text-text-secondary border-border-default hover:border-accent'
                    }`}
                  >
                    <TagDot color={tagColors.get(tag)} />
                    {tag}
                    <span
                      className={`text-[10px] ${
                        isSelected ? 'text-white/70' : 'text-text-tertiary'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              }}
            />
          ) : (
            <p className="text-xs text-text-tertiary">{t('filters.tags.noTags')}</p>
          )}
        </div>

        {/* Property filter */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">
            {t('filters.property.hasProperty')}
          </label>
          <select
            value={filters.hasProperty || ''}
            onChange={(e) => handlePropertyChange(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary"
          >
            <option value="">{t('filters.placeholders.allProperties')}</option>
            {allPropertyKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
          {filters.hasProperty && (
            <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.badgePropertyKey === filters.hasProperty}
                onChange={(e) => {
                  setFilters({
                    badgePropertyKey: e.target.checked ? filters.hasProperty : null
                  });
                }}
                className="w-3.5 h-3.5 rounded border-border-default text-accent focus:ring-accent focus:ring-offset-0"
              />
              <span className="text-xs text-text-secondary">
                {t('filters.property.showAsBadge')}
              </span>
            </label>
          )}
        </div>

        {/* Date properties that date the elements on the timeline and the map */}
        {datePropertyCounts.length > 0 && (
          <div className="space-y-1.5" data-testid="filters-date-properties">
            <label className="text-xs font-medium text-text-secondary">
              {t('filters.dateProperties.title')} ({datePropertyCounts.length})
            </label>
            <div className="flex flex-wrap gap-1.5">
              {datePropertyCounts.map(({ key, count }) => {
                const isSelected = selectedDateProperties.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleDateProperty(key)}
                    aria-pressed={isSelected}
                    className={`flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors ${
                      isSelected
                        ? 'bg-accent text-white border-accent'
                        : 'bg-bg-secondary text-text-secondary border-border-default hover:border-accent'
                    }`}
                  >
                    {key}
                    <span className={`text-[10px] ${isSelected ? 'text-white/70' : 'text-text-tertiary'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            {dateKeys.length >= 2 && (
              <DateRangesEditor
                dateKeys={dateKeys}
                ranges={filters.dateRangeProperties ?? []}
                onChange={(dateRangeProperties) => setFilters({ dateRangeProperties })}
              />
            )}
          </div>
        )}

        {/* Grading filter (Europol / Admiralty) or confidence filter */}
        {evaluationScale ? (
          <div className="space-y-2">
            {(['evaluationSources', 'evaluationInfos'] as const).map((axis) => {
              const codes = axis === 'evaluationSources'
                ? EVALUATION_GRIDS[evaluationScale].sources
                : EVALUATION_GRIDS[evaluationScale].infos;
              const selected = filters[axis] ?? [];
              return (
                <div key={axis} className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary">
                    {tCommon(axis === 'evaluationSources' ? 'evaluation.sourceLabel' : 'evaluation.infoLabel')}
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {codes.map((code) => {
                      const on = selected.includes(code);
                      return (
                        <button
                          key={code}
                          onClick={() => toggleEvaluationCode(axis, code)}
                          title={tCommon(`evaluation.${evaluationScale}.${axis === 'evaluationSources' ? 'sources' : 'infos'}.${code}`)}
                          className={`min-w-7 px-2 py-1 text-xs font-medium rounded border transition-colors ${
                            on
                              ? 'bg-accent text-white border-accent'
                              : 'bg-bg-secondary text-text-secondary border-border-default hover:border-accent hover:text-text-primary'
                          }`}
                        >
                          {code}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <p className="text-[10px] text-text-tertiary">{t('filters.evaluation.hint')}</p>
          </div>
        ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-text-secondary">
              {t('filters.confidence.minimum')}
            </label>
            {filters.minConfidence !== null && (
              <span className="text-xs text-accent">{filters.minConfidence}%+</span>
            )}
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="10"
            value={filters.minConfidence ?? 0}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              setFilters({ minConfidence: val === 0 ? null : (val as Confidence) });
            }}
            className="w-full h-1.5 bg-bg-tertiary rounded appearance-none cursor-pointer accent-accent"
          />
          <div className="flex justify-between text-[10px] text-text-tertiary">
            <span>{t('filters.placeholders.all')}</span>
            <span>100%</span>
          </div>
        </div>
        )}

      </div>

      {/* Hidden elements section */}
      {hiddenElementIds.size > 0 && (
        <HiddenElementsSection
          hiddenElementIds={hiddenElementIds}
          elements={elements}
          showElement={showElement}
          showAllElements={showAllElements}
        />
      )}
    </div>
  );
}

// Hidden elements section (extracted to use translations)
interface HiddenElementsSectionProps {
  hiddenElementIds: Set<string>;
  elements: Element[];
  showElement: (id: string) => void;
  showAllElements: () => void;
}

function HiddenElementsSection({
  hiddenElementIds,
  elements,
  showElement,
  showAllElements,
}: HiddenElementsSectionProps) {
  const { t } = useTranslation('panels');

  return (
    <div className="border-t border-border-default p-3 max-h-48 overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <EyeOff size={12} className="text-text-secondary" />
          <span className="text-xs font-medium text-text-primary">
            {t('filters.hiddenElements.title')} ({hiddenElementIds.size})
          </span>
        </div>
        <button
          onClick={showAllElements}
          className="flex items-center gap-1 px-2 py-1 text-[10px] text-accent hover:bg-accent/10 rounded"
        >
          <Eye size={10} />
          {t('filters.hiddenElements.showAll')}
        </button>
      </div>
      <ProgressiveList
        items={Array.from(hiddenElementIds)}
        initialCount={20}
        increment={20}
        className="space-y-1"
        renderItem={(id) => {
          const element = elements.find((el) => el.id === id);
          if (!element) return null;
          return (
            <div
              key={id}
              className="flex items-center justify-between p-1.5 bg-bg-secondary rounded text-xs"
            >
              <span className="text-text-primary truncate flex-1">
                {element.label || t('filters.noName')}
              </span>
              <button
                onClick={() => showElement(id)}
                className="text-accent hover:bg-accent/10 p-1 rounded"
                title={t('filters.show')}
              >
                <Eye size={12} />
              </button>
            </div>
          );
        }}
      />
    </div>
  );
}

// Filter badge component
interface FilterBadgeProps {
  label: string;
  onRemove: () => void;
}

function FilterBadge({ label, onRemove }: FilterBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-accent/10 text-accent text-[10px] rounded">
      {label}
      <button onClick={onRemove} className="hover:text-accent/70">
        <X size={10} />
      </button>
    </span>
  );
}

type DateRange = { start: string; end: string };

/** Pairs of date properties read as one period (start → end), e.g. the start
 *  and end of the facts: one bar on the timeline, one span on the map */
function DateRangesEditor({ dateKeys, ranges, onChange }: {
  dateKeys: string[];
  ranges: DateRange[];
  onChange: (ranges: DateRange[]) => void;
}) {
  const { t } = useTranslation('panels');
  const [adding, setAdding] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const selectClass = 'flex-1 min-w-0 px-1.5 py-1 text-xs rounded border border-border-default bg-bg-primary text-text-primary focus:outline-none focus:border-accent';

  const add = () => {
    if (!start || !end || start === end) return;
    if (!ranges.some((r) => r.start === start && r.end === end)) onChange([...ranges, { start, end }]);
    setAdding(false);
    setStart('');
    setEnd('');
  };

  return (
    <div className="space-y-1 pt-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-text-tertiary">{t('filters.dateProperties.ranges')}</span>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-0.5 text-[10px] text-text-secondary hover:text-text-primary"
            title={t('filters.dateProperties.rangesHint')}
          >
            <Plus size={10} />
            {t('filters.dateProperties.addRange')}
          </button>
        )}
      </div>
      {ranges.map((range) => (
        <div
          key={`${range.start}→${range.end}`}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border-default bg-bg-secondary text-text-primary"
        >
          <span className="truncate">{range.start} → {range.end}</span>
          <button
            onClick={() => onChange(ranges.filter((r) => r !== range))}
            className="ml-auto shrink-0 text-text-tertiary hover:text-text-primary"
            aria-label={t('filters.dateProperties.removeRange')}
          >
            <X size={12} />
          </button>
        </div>
      ))}
      {adding && (
        <div className="flex items-center gap-1">
          <select value={start} onChange={(e) => setStart(e.target.value)} className={selectClass} aria-label={t('filters.dateProperties.rangeStart')}>
            <option value="">{t('filters.dateProperties.rangeStart')}</option>
            {dateKeys.map((key) => <option key={key} value={key}>{key}</option>)}
          </select>
          <span className="text-xs text-text-tertiary">→</span>
          <select value={end} onChange={(e) => setEnd(e.target.value)} className={selectClass} aria-label={t('filters.dateProperties.rangeEnd')}>
            <option value="">{t('filters.dateProperties.rangeEnd')}</option>
            {dateKeys.filter((key) => key !== start).map((key) => <option key={key} value={key}>{key}</option>)}
          </select>
          <button
            onClick={add}
            disabled={!start || !end}
            className="shrink-0 p-1 rounded text-text-secondary hover:text-text-primary disabled:opacity-40"
            aria-label={t('filters.dateProperties.addRange')}
          >
            <Check size={12} />
          </button>
          <button
            onClick={() => setAdding(false)}
            className="shrink-0 p-1 rounded text-text-secondary hover:text-text-primary"
            aria-label={t('filters.dateProperties.cancelRange')}
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
