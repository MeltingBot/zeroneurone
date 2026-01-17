import { useMemo, useCallback } from 'react';
import { X, Filter, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { useInvestigationStore, useViewStore } from '../../stores';
import type { Confidence } from '../../types';

export function FiltersPanel() {
  const { elements } = useInvestigationStore();
  const {
    filters,
    setFilters,
    clearFilters,
    addIncludeTag,
    removeIncludeTag,
    hasActiveFilters,
    hiddenElementIds,
    showElement,
    showAllElements,
  } = useViewStore();

  const isActive = hasActiveFilters();

  // Get all unique tags from elements
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    elements.forEach((el) => el.tags.forEach((tag) => tagSet.add(tag)));
    return Array.from(tagSet).sort();
  }, [elements]);

  // Get all unique property keys from elements
  const allPropertyKeys = useMemo(() => {
    const keySet = new Set<string>();
    elements.forEach((el) => el.properties.forEach((prop) => keySet.add(prop.key)));
    return Array.from(keySet).sort();
  }, [elements]);

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
      setFilters({ hasProperty: value || null });
    },
    [setFilters]
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
    <div className="p-4 space-y-6">
      {/* Header with clear button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">Filtres</h3>
          {isActive && (
            <span className="px-1.5 py-0.5 text-xs bg-accent/20 text-accent rounded">
              Actif
            </span>
          )}
        </div>
        {isActive && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
          >
            <RotateCcw size={12} />
            Effacer
          </button>
        )}
      </div>

      {/* Text search */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-secondary">
          Recherche texte
        </label>
        <input
          type="text"
          value={filters.textSearch}
          onChange={(e) => handleTextSearchChange(e.target.value)}
          placeholder="Filtrer par texte..."
          className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary placeholder:text-text-tertiary"
        />
      </div>

      {/* Tags filter */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-secondary">
          Tags inclus
        </label>
        {allTags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((tag) => {
              const isSelected = filters.includeTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => handleTagToggle(tag)}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${
                    isSelected
                      ? 'bg-accent text-white border-accent'
                      : 'bg-bg-secondary text-text-secondary border-border-default hover:border-accent'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-text-tertiary">Aucun tag disponible</p>
        )}

        {/* Selected tags */}
        {filters.includeTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {filters.includeTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent/20 text-accent text-xs rounded"
              >
                {tag}
                <button
                  onClick={() => removeIncludeTag(tag)}
                  className="hover:text-accent/70"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
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
          <option value="">Toutes les propriétés</option>
          {allPropertyKeys.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
      </div>

      {/* Confidence filter */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-secondary">
          Confiance minimum
        </label>
        <select
          value={filters.minConfidence?.toString() || ''}
          onChange={(e) => handleConfidenceChange(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary"
        >
          <option value="">Toutes</option>
          <option value="10">10% et plus</option>
          <option value="20">20% et plus</option>
          <option value="30">30% et plus</option>
          <option value="40">40% et plus</option>
          <option value="50">50% et plus</option>
          <option value="60">60% et plus</option>
          <option value="70">70% et plus</option>
          <option value="80">80% et plus</option>
          <option value="90">90% et plus</option>
          <option value="100">100% uniquement</option>
        </select>
      </div>

      {/* Filter summary */}
      {isActive && (
        <div className="p-3 bg-bg-secondary rounded border border-border-default">
          <p className="text-xs text-text-secondary">
            Les éléments ne correspondant pas aux filtres sont affichés avec une opacité réduite.
          </p>
        </div>
      )}

      {/* Hidden elements section */}
      {hiddenElementIds.size > 0 && (
        <div className="space-y-2 pt-4 border-t border-border-default">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <EyeOff size={16} className="text-text-secondary" />
              <h3 className="text-sm font-semibold text-text-primary">
                Éléments masqués ({hiddenElementIds.size})
              </h3>
            </div>
            <button
              onClick={showAllElements}
              className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
            >
              <Eye size={12} />
              Tout afficher
            </button>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {Array.from(hiddenElementIds).map((id) => {
              const element = elements.find((el) => el.id === id);
              if (!element) return null;
              return (
                <div
                  key={id}
                  className="flex items-center justify-between p-2 bg-bg-secondary rounded"
                >
                  <span className="text-sm text-text-primary truncate flex-1">
                    {element.label || 'Sans nom'}
                  </span>
                  <button
                    onClick={() => showElement(id)}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded"
                    title="Afficher"
                  >
                    <Eye size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
