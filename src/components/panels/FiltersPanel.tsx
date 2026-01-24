import { useMemo, useCallback } from 'react';
import {
  X,
  Filter,
  RotateCcw,
  Eye,
  EyeOff,
  CircleOff,
  Link2,
  Tag,
  MapPin,
  Calendar,
  AlertCircle,
  MessageSquare,
} from 'lucide-react';
import { useInvestigationStore, useViewStore, useInsightsStore } from '../../stores';
import { ProgressiveList } from '../common/ProgressiveList';
import type { Confidence } from '../../types';

// Quick filter definitions
interface QuickFilter {
  id: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  apply: (params: QuickFilterParams) => void;
  isActive: (params: QuickFilterParams) => boolean;
}

interface QuickFilterParams {
  filters: ReturnType<typeof useViewStore>['filters'];
  setFilters: ReturnType<typeof useViewStore>['setFilters'];
  clearFilters: ReturnType<typeof useViewStore>['clearFilters'];
  isolated: string[];
  hideElements: ReturnType<typeof useViewStore>['hideElements'];
  showAllElements: ReturnType<typeof useViewStore>['showAllElements'];
  hiddenElementIds: Set<string>;
  elements: ReturnType<typeof useInvestigationStore>['elements'];
  comments: ReturnType<typeof useInvestigationStore>['comments'];
}

const QUICK_FILTERS: QuickFilter[] = [
  {
    id: 'isolated',
    label: 'Isolés',
    icon: <CircleOff size={12} />,
    description: 'Éléments sans connexion',
    apply: ({ isolated, hideElements, hiddenElementIds, showAllElements }) => {
      // Toggle: if all isolated are hidden, show them; otherwise hide them
      const allHidden = isolated.every((id) => hiddenElementIds.has(id));
      if (allHidden) {
        showAllElements();
      } else {
        hideElements(isolated);
      }
    },
    isActive: ({ isolated, hiddenElementIds }) => {
      return isolated.length > 0 && isolated.every((id) => hiddenElementIds.has(id));
    },
  },
  {
    id: 'no-tags',
    label: 'Sans tags',
    icon: <Tag size={12} />,
    description: 'Éléments sans aucun tag',
    apply: ({ elements, hideElements, hiddenElementIds, showAllElements }) => {
      const noTagElements = elements.filter((el) => el.tags.length === 0).map((el) => el.id);
      const allHidden = noTagElements.every((id) => hiddenElementIds.has(id));
      if (allHidden) {
        showAllElements();
      } else {
        hideElements(noTagElements);
      }
    },
    isActive: ({ elements, hiddenElementIds }) => {
      const noTagElements = elements.filter((el) => el.tags.length === 0).map((el) => el.id);
      return noTagElements.length > 0 && noTagElements.every((id) => hiddenElementIds.has(id));
    },
  },
  {
    id: 'no-geo',
    label: 'Sans geo',
    icon: <MapPin size={12} />,
    description: 'Éléments sans coordonnées',
    apply: ({ elements, hideElements, hiddenElementIds, showAllElements }) => {
      const noGeoElements = elements
        .filter((el) => !el.geo || (el.geo.lat === 0 && el.geo.lng === 0))
        .map((el) => el.id);
      const allHidden = noGeoElements.every((id) => hiddenElementIds.has(id));
      if (allHidden) {
        showAllElements();
      } else {
        hideElements(noGeoElements);
      }
    },
    isActive: ({ elements, hiddenElementIds }) => {
      const noGeoElements = elements
        .filter((el) => !el.geo || (el.geo.lat === 0 && el.geo.lng === 0))
        .map((el) => el.id);
      return noGeoElements.length > 0 && noGeoElements.every((id) => hiddenElementIds.has(id));
    },
  },
  {
    id: 'no-date',
    label: 'Sans date',
    icon: <Calendar size={12} />,
    description: 'Éléments sans date',
    apply: ({ elements, hideElements, hiddenElementIds, showAllElements }) => {
      const noDateElements = elements
        .filter((el) => !el.date && (!el.dateRange || (!el.dateRange.start && !el.dateRange.end)))
        .map((el) => el.id);
      const allHidden = noDateElements.every((id) => hiddenElementIds.has(id));
      if (allHidden) {
        showAllElements();
      } else {
        hideElements(noDateElements);
      }
    },
    isActive: ({ elements, hiddenElementIds }) => {
      const noDateElements = elements
        .filter((el) => !el.date && (!el.dateRange || (!el.dateRange.start && !el.dateRange.end)))
        .map((el) => el.id);
      return noDateElements.length > 0 && noDateElements.every((id) => hiddenElementIds.has(id));
    },
  },
  {
    id: 'low-confidence',
    label: 'Confiance faible',
    icon: <AlertCircle size={12} />,
    description: 'Confiance < 50%',
    apply: ({ setFilters, filters }) => {
      if (filters.minConfidence === 50) {
        setFilters({ minConfidence: null });
      } else {
        setFilters({ minConfidence: 50 });
      }
    },
    isActive: ({ filters }) => filters.minConfidence === 50,
  },
  {
    id: 'has-comments',
    label: 'Commentaires',
    icon: <MessageSquare size={12} />,
    description: 'Éléments avec commentaires non résolus',
    apply: ({ elements, comments, hideElements, hiddenElementIds, showAllElements }) => {
      // Get element IDs that have unresolved comments
      const elementsWithUnresolvedComments = new Set(
        comments.filter(c => !c.resolved && c.targetType === 'element').map(c => c.targetId)
      );
      // Get elements WITHOUT unresolved comments
      const elementsWithoutUnresolved = elements
        .filter(el => !elementsWithUnresolvedComments.has(el.id))
        .map(el => el.id);
      // Toggle: if all without comments are hidden, show them; otherwise hide them
      const allHidden = elementsWithoutUnresolved.every(id => hiddenElementIds.has(id));
      if (allHidden) {
        showAllElements();
      } else {
        hideElements(elementsWithoutUnresolved);
      }
    },
    isActive: ({ elements, comments, hiddenElementIds }) => {
      const elementsWithUnresolvedComments = new Set(
        comments.filter(c => !c.resolved && c.targetType === 'element').map(c => c.targetId)
      );
      const elementsWithoutUnresolved = elements
        .filter(el => !elementsWithUnresolvedComments.has(el.id))
        .map(el => el.id);
      return elementsWithoutUnresolved.length > 0 && elementsWithoutUnresolved.every(id => hiddenElementIds.has(id));
    },
  },
];

export function FiltersPanel() {
  const { elements, comments } = useInvestigationStore();
  const {
    filters,
    setFilters,
    clearFilters,
    addIncludeTag,
    removeIncludeTag,
    hasActiveFilters,
    hiddenElementIds,
    hideElements,
    showElement,
    showAllElements,
  } = useViewStore();
  const { isolated } = useInsightsStore();

  const isActive = hasActiveFilters();

  // Count visible vs total elements
  const visibleCount = useMemo(() => {
    return elements.filter((el) => !hiddenElementIds.has(el.id)).length;
  }, [elements, hiddenElementIds]);

  // Count elements matching current filters
  const matchingCount = useMemo(() => {
    return elements.filter((el) => {
      // Check hidden
      if (hiddenElementIds.has(el.id)) return false;

      // Check text search
      if (filters.textSearch) {
        const searchLower = filters.textSearch.toLowerCase();
        const matchesLabel = el.label.toLowerCase().includes(searchLower);
        const matchesNotes = el.notes.toLowerCase().includes(searchLower);
        if (!matchesLabel && !matchesNotes) return false;
      }

      // Check tags
      if (filters.includeTags.length > 0) {
        const hasTag = filters.includeTags.some((tag) => el.tags.includes(tag));
        if (!hasTag) return false;
      }

      // Check property
      if (filters.hasProperty) {
        const hasProp = el.properties.some((p) => p.key === filters.hasProperty);
        if (!hasProp) return false;
      }

      // Check confidence
      if (filters.minConfidence !== null) {
        if (el.confidence === null || el.confidence < filters.minConfidence) return false;
      }

      return true;
    }).length;
  }, [elements, hiddenElementIds, filters]);

  // Get all unique tags from elements with counts
  const tagsWithCounts = useMemo(() => {
    const tagMap = new Map<string, number>();
    elements.forEach((el) => {
      el.tags.forEach((tag) => {
        tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
      });
    });
    return Array.from(tagMap.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }, [elements]);

  // Get all unique property keys from elements
  const allPropertyKeys = useMemo(() => {
    const keySet = new Set<string>();
    elements.forEach((el) => el.properties.forEach((prop) => keySet.add(prop.key)));
    return Array.from(keySet).sort();
  }, [elements]);

  // Quick filter params
  const quickFilterParams: QuickFilterParams = useMemo(
    () => ({
      filters,
      setFilters,
      clearFilters,
      isolated,
      hideElements,
      showAllElements,
      hiddenElementIds,
      elements,
      comments,
    }),
    [filters, setFilters, clearFilters, isolated, hideElements, showAllElements, hiddenElementIds, elements, comments]
  );

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

  // Handle confidence filter change
  const handleConfidenceChange = useCallback(
    (value: string) => {
      const confidence = value ? (parseInt(value) as Confidence) : null;
      setFilters({ minConfidence: confidence });
    },
    [setFilters]
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
              {matchingCount}/{elements.length} éléments
            </span>
          </div>
          {(isActive || hiddenElementIds.size > 0) && (
            <button
              onClick={() => {
                clearFilters();
                showAllElements();
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
            >
              <RotateCcw size={12} />
              Tout effacer
            </button>
          )}
        </div>
        {hiddenElementIds.size > 0 && (
          <p className="text-[10px] text-text-tertiary mt-1">
            {hiddenElementIds.size} élément{hiddenElementIds.size > 1 ? 's' : ''} masqué{hiddenElementIds.size > 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Quick filters */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-text-secondary">
            Filtres rapides
          </label>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_FILTERS.map((qf) => {
              const active = qf.isActive(quickFilterParams);
              return (
                <button
                  key={qf.id}
                  onClick={() => qf.apply(quickFilterParams)}
                  className={`flex items-center gap-1 px-2 py-1.5 text-xs rounded border transition-colors ${
                    active
                      ? 'bg-accent text-white border-accent'
                      : 'bg-bg-secondary text-text-secondary border-border-default hover:border-accent hover:text-text-primary'
                  }`}
                  title={qf.description}
                >
                  {qf.icon}
                  {qf.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Text search */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">
            Recherche texte
          </label>
          <div className="relative">
            <input
              type="text"
              value={filters.textSearch}
              onChange={(e) => handleTextSearchChange(e.target.value)}
              placeholder="Filtrer par nom ou notes..."
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

        {/* Tags filter */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">
            Tags ({tagsWithCounts.length})
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
            <p className="text-xs text-text-tertiary">Aucun tag disponible</p>
          )}
        </div>

        {/* Property filter */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">
            Possède la propriété
          </label>
          <select
            value={filters.hasProperty || ''}
            onChange={(e) => handlePropertyChange(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary"
          >
            <option value="">Toutes</option>
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
                Afficher en badge sur les éléments
              </span>
            </label>
          )}
        </div>

        {/* Confidence filter */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-text-secondary">
              Confiance minimum
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
            <span>Toutes</span>
            <span>100%</span>
          </div>
        </div>

        {/* Active filters summary */}
        {isActive && (
          <div className="p-2 bg-accent/5 border border-accent/20 rounded">
            <div className="flex items-center gap-1 text-xs text-accent mb-1">
              <Filter size={10} />
              Filtres actifs
            </div>
            <div className="flex flex-wrap gap-1">
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
              {filters.minConfidence !== null && (
                <FilterBadge
                  label={`≥${filters.minConfidence}%`}
                  onRemove={() => setFilters({ minConfidence: null })}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Hidden elements section */}
      {hiddenElementIds.size > 0 && (
        <div className="border-t border-border-default p-3 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <EyeOff size={12} className="text-text-secondary" />
              <span className="text-xs font-medium text-text-primary">
                Masqués ({hiddenElementIds.size})
              </span>
            </div>
            <button
              onClick={showAllElements}
              className="flex items-center gap-1 px-2 py-1 text-[10px] text-accent hover:bg-accent/10 rounded"
            >
              <Eye size={10} />
              Tout afficher
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
                    {element.label || 'Sans nom'}
                  </span>
                  <button
                    onClick={() => showElement(id)}
                    className="text-accent hover:bg-accent/10 p-1 rounded"
                    title="Afficher"
                  >
                    <Eye size={12} />
                  </button>
                </div>
              );
            }}
          />
        </div>
      )}
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
