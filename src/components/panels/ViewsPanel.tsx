import { useState, useCallback, useMemo } from 'react';
import {
  Eye, EyeOff, Plus, Trash2, Check, LayoutGrid, Tag, Percent, Hash, Search, Settings2, Link2,
  Grid2X2, Type, Layers, Spline, Minus, Hand, Sparkles, CornerDownRight
} from 'lucide-react';
import { useInvestigationStore, useViewStore } from '../../stores';
import type { View } from '../../types';

type TagDisplayMode = 'none' | 'icons' | 'labels' | 'both';
type TagDisplaySize = 'small' | 'medium' | 'large';

const TAG_MODE_OPTIONS: { value: TagDisplayMode; label: string; icon: React.ReactNode }[] = [
  { value: 'none', label: 'Masqués', icon: <EyeOff size={14} /> },
  { value: 'icons', label: 'Icônes', icon: <Grid2X2 size={14} /> },
  { value: 'labels', label: 'Labels', icon: <Type size={14} /> },
  { value: 'both', label: 'Icônes + Labels', icon: <Layers size={14} /> },
];

const TAG_SIZE_OPTIONS: { value: TagDisplaySize; label: string }[] = [
  { value: 'small', label: 'S' },
  { value: 'medium', label: 'M' },
  { value: 'large', label: 'L' },
];

export function ViewsPanel() {
  const {
    currentInvestigation,
    elements,
    links,
    updateElementPositions,
    toggleConfidenceIndicator,
    togglePropertyDisplay,
    clearDisplayedProperties,
    setTagDisplayMode,
    setTagDisplaySize,
    setLinkAnchorMode,
    setLinkCurveMode,
  } = useInvestigationStore();
  const { savedViews, saveView, loadView, deleteView, hasActiveFilters } = useViewStore();
  const [isCreating, setIsCreating] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [includePositions, setIncludePositions] = useState(false);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [propertySearch, setPropertySearch] = useState('');

  // Current display settings
  const settings = currentInvestigation?.settings;
  const tagDisplayMode = settings?.tagDisplayMode ?? 'icons';
  const tagDisplaySize = settings?.tagDisplaySize ?? 'small';
  const showConfidence = settings?.showConfidenceIndicator ?? false;
  const displayedProperties = settings?.displayedProperties ?? [];
  const linkAnchorMode = settings?.linkAnchorMode ?? 'manual';
  const linkCurveMode = settings?.linkCurveMode ?? 'curved';

  // Get all unique property keys from elements and links
  const allPropertyKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const el of elements) {
      for (const prop of el.properties) {
        if (prop.key) keys.add(prop.key);
      }
    }
    for (const link of links) {
      if (link.properties) {
        for (const prop of link.properties) {
          if (prop.key) keys.add(prop.key);
        }
      }
    }
    return Array.from(keys).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [elements, links]);

  // Filter properties by search
  const filteredPropertyKeys = useMemo(() => {
    if (!propertySearch.trim()) return allPropertyKeys;
    const search = propertySearch.toLowerCase();
    return allPropertyKeys.filter(key => key.toLowerCase().includes(search));
  }, [allPropertyKeys, propertySearch]);

  const handleSaveView = useCallback(async () => {
    if (!currentInvestigation || !newViewName.trim()) return;

    await saveView(currentInvestigation.id, newViewName.trim(), {
      includePositions,
      elements: includePositions ? elements : undefined,
    });
    setNewViewName('');
    setIncludePositions(false);
    setIsCreating(false);
  }, [currentInvestigation, newViewName, saveView, includePositions, elements]);

  const handleLoadView = useCallback(
    (view: View) => {
      loadView(view, view.elementPositions ? updateElementPositions : undefined);
      setActiveViewId(view.id);
    },
    [loadView, updateElementPositions]
  );

  const handleDeleteView = useCallback(
    async (viewId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await deleteView(viewId);
      if (activeViewId === viewId) {
        setActiveViewId(null);
      }
    },
    [deleteView, activeViewId]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSaveView();
      } else if (e.key === 'Escape') {
        setIsCreating(false);
        setNewViewName('');
      }
    },
    [handleSaveView]
  );

  const handleModeChange = useCallback((mode: TagDisplayMode) => {
    setTagDisplayMode(mode);
  }, [setTagDisplayMode]);

  const handleSizeChange = useCallback((size: TagDisplaySize) => {
    setTagDisplaySize(size);
  }, [setTagDisplaySize]);

  // Can save if has filters OR if including positions
  const canSaveView = hasActiveFilters() || includePositions;

  return (
    <div className="p-4 space-y-6">
      {/* Display Settings Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Settings2 size={16} className="text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">Affichage sur le canvas</h3>
        </div>

        {/* Tags display */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <Tag size={12} />
            <span>Tags</span>
          </div>

          {/* Mode selector */}
          <div className="flex gap-1">
            {TAG_MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleModeChange(opt.value)}
                title={opt.label}
                className={`flex-1 flex items-center justify-center py-1.5 rounded transition-colors ${
                  tagDisplayMode === opt.value
                    ? 'bg-accent text-white'
                    : 'bg-bg-secondary hover:bg-bg-tertiary text-text-secondary'
                }`}
              >
                {opt.icon}
              </button>
            ))}
          </div>

          {/* Size selector (only if mode is not 'none') */}
          {tagDisplayMode !== 'none' && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-text-tertiary">Taille:</span>
              <div className="flex gap-1">
                {TAG_SIZE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleSizeChange(opt.value)}
                    className={`w-7 h-6 text-[10px] rounded transition-colors ${
                      tagDisplaySize === opt.value
                        ? 'bg-accent text-white'
                        : 'bg-bg-secondary hover:bg-bg-tertiary text-text-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Confidence indicator */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <Percent size={12} />
            <span>Indicateur de confiance</span>
          </div>
          <button
            type="button"
            onClick={() => toggleConfidenceIndicator()}
            className={`relative w-8 h-4 rounded-full transition-colors ${
              showConfidence ? 'bg-accent' : 'bg-bg-tertiary'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                showConfidence ? 'translate-x-4' : ''
              }`}
            />
          </button>
        </div>

        {/* Links section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <Link2 size={12} />
            <span>Liaisons</span>
          </div>

          {/* Curve mode + Anchor mode in a row */}
          <div className="flex gap-4 pl-4">
            {/* Curve mode */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-text-tertiary">Forme</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setLinkCurveMode('curved')}
                  title="Courbes"
                  className={`w-8 h-7 flex items-center justify-center rounded transition-colors ${
                    linkCurveMode === 'curved'
                      ? 'bg-accent text-white'
                      : 'bg-bg-secondary hover:bg-bg-tertiary text-text-secondary'
                  }`}
                >
                  <Spline size={14} />
                </button>
                <button
                  onClick={() => setLinkCurveMode('straight')}
                  title="Droites"
                  className={`w-8 h-7 flex items-center justify-center rounded transition-colors ${
                    linkCurveMode === 'straight'
                      ? 'bg-accent text-white'
                      : 'bg-bg-secondary hover:bg-bg-tertiary text-text-secondary'
                  }`}
                >
                  <Minus size={14} />
                </button>
                <button
                  onClick={() => setLinkCurveMode('orthogonal')}
                  title="Angles droits"
                  className={`w-8 h-7 flex items-center justify-center rounded transition-colors ${
                    linkCurveMode === 'orthogonal'
                      ? 'bg-accent text-white'
                      : 'bg-bg-secondary hover:bg-bg-tertiary text-text-secondary'
                  }`}
                >
                  <CornerDownRight size={14} />
                </button>
              </div>
            </div>

            {/* Anchor mode */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-text-tertiary">Ancrage</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setLinkAnchorMode('manual')}
                  title="Manuel"
                  className={`w-8 h-7 flex items-center justify-center rounded transition-colors ${
                    linkAnchorMode === 'manual'
                      ? 'bg-accent text-white'
                      : 'bg-bg-secondary hover:bg-bg-tertiary text-text-secondary'
                  }`}
                >
                  <Hand size={14} />
                </button>
                <button
                  onClick={() => setLinkAnchorMode('auto')}
                  title="Automatique"
                  className={`w-8 h-7 flex items-center justify-center rounded transition-colors ${
                    linkAnchorMode === 'auto'
                      ? 'bg-accent text-white'
                      : 'bg-bg-secondary hover:bg-bg-tertiary text-text-secondary'
                  }`}
                >
                  <Sparkles size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Properties display */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <Hash size={12} />
              <span>Propriétés affichées</span>
            </div>
            {allPropertyKeys.length > 0 && (
              <span className="text-[10px] text-text-tertiary">
                {allPropertyKeys.length} disponible{allPropertyKeys.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {allPropertyKeys.length > 0 ? (
            <>
              {/* Search input - always visible */}
              <div className="relative">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
                <input
                  type="text"
                  value={propertySearch}
                  onChange={(e) => setPropertySearch(e.target.value)}
                  placeholder="Rechercher une propriété..."
                  className="w-full pl-8 pr-8 py-1.5 text-xs bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary placeholder:text-text-tertiary"
                />
                {propertySearch && (
                  <button
                    onClick={() => setPropertySearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                  >
                    <span className="text-xs">×</span>
                  </button>
                )}
              </div>

              {/* Property checkboxes */}
              <div className="max-h-48 overflow-y-auto space-y-0.5 border border-border-default rounded p-1">
                {filteredPropertyKeys.length > 0 ? (
                  filteredPropertyKeys.map((key) => {
                    const isDisplayed = displayedProperties.includes(key);
                    const isAtLimit = displayedProperties.length >= 3 && !isDisplayed;
                    return (
                      <label
                        key={key}
                        className={`flex items-center gap-2 py-1.5 px-2 rounded transition-colors ${
                          isDisplayed ? 'bg-accent/10 hover:bg-accent/15 cursor-pointer' :
                          isAtLimit ? 'opacity-50 cursor-not-allowed' : 'hover:bg-bg-tertiary cursor-pointer'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isDisplayed}
                          disabled={isAtLimit}
                          onChange={() => togglePropertyDisplay(key)}
                          className="w-4 h-4 rounded border-border-default text-accent focus:ring-accent disabled:opacity-50"
                        />
                        <span className={`text-xs truncate ${isDisplayed ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
                          {key}
                        </span>
                      </label>
                    );
                  })
                ) : (
                  <p className="text-xs text-text-tertiary py-3 text-center">
                    Aucun résultat pour "{propertySearch}"
                  </p>
                )}
              </div>

              {/* Quick actions */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-text-tertiary">
                  {displayedProperties.length > 0
                    ? `${displayedProperties.length}/3 sélectionnée${displayedProperties.length > 1 ? 's' : ''}`
                    : 'Max. 3'
                  }
                </span>
                {displayedProperties.length > 0 && (
                  <button
                    onClick={() => clearDisplayedProperties()}
                    className="text-[10px] text-text-tertiary hover:text-error"
                  >
                    Tout désélectionner
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="text-xs text-text-tertiary py-3 text-center bg-bg-secondary rounded">
              Aucune propriété définie sur les éléments
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-border-default" />

      {/* Saved Views Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Eye size={16} className="text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">Vues sauvegardées</h3>
        </div>

        {/* Save current view */}
        {isCreating ? (
          <div className="space-y-2">
            <input
              type="text"
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nom de la vue..."
              autoFocus
              className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary placeholder:text-text-tertiary"
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includePositions}
                onChange={(e) => setIncludePositions(e.target.checked)}
                className="w-4 h-4 rounded border-border-default text-accent focus:ring-accent"
              />
              <span className="text-xs text-text-secondary">
                Inclure les positions ({elements.length} éléments)
              </span>
            </label>
            <div className="flex gap-2">
              <button
                onClick={handleSaveView}
                disabled={!newViewName.trim()}
                className="flex-1 px-3 py-1.5 text-xs font-medium bg-accent text-white rounded hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Sauvegarder
              </button>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setNewViewName('');
                  setIncludePositions(false);
                }}
                className="flex-1 px-3 py-1.5 text-xs font-medium bg-bg-tertiary text-text-secondary rounded hover:bg-border-default"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsCreating(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium border border-dashed border-border-default rounded hover:border-accent hover:text-accent text-text-secondary"
          >
            <Plus size={14} />
            Sauvegarder la vue actuelle
          </button>
        )}

        {/* Saved views list */}
        {savedViews.length > 0 ? (
          <div className="space-y-1">
            {savedViews.map((view) => (
              <div
                key={view.id}
                onClick={() => handleLoadView(view)}
                className={`flex items-center justify-between p-2 rounded cursor-pointer group transition-colors ${
                  activeViewId === view.id
                    ? 'bg-accent/10 border border-accent'
                    : 'hover:bg-bg-secondary border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {activeViewId === view.id && (
                    <Check size={14} className="text-accent flex-shrink-0" />
                  )}
                  <span className="text-sm text-text-primary truncate">
                    {view.name}
                  </span>
                  {view.elementPositions && view.elementPositions.length > 0 && (
                    <LayoutGrid size={12} className="text-text-tertiary flex-shrink-0" title="Positions sauvegardées" />
                  )}
                </div>
                <button
                  onClick={(e) => handleDeleteView(view.id, e)}
                  className="p-1 text-text-tertiary hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Supprimer la vue"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-tertiary text-center py-4">
            Aucune vue sauvegardée
          </p>
        )}

        {/* View info */}
        {activeViewId && (
          <div className="p-2 bg-bg-secondary rounded text-xs text-text-tertiary">
            {(() => {
              const activeView = savedViews.find(v => v.id === activeViewId);
              const hasPositions = activeView?.elementPositions && activeView.elementPositions.length > 0;
              return (
                <p>
                  Vue active. Les filtres et le viewport ont été restaurés.
                  {hasPositions && ` Positions de ${activeView.elementPositions.length} éléments restaurées.`}
                </p>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
