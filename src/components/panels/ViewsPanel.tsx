import { useState, useCallback } from 'react';
import { Eye, Plus, Trash2, Check, LayoutGrid } from 'lucide-react';
import { useInvestigationStore, useViewStore } from '../../stores';
import type { View } from '../../types';

export function ViewsPanel() {
  const { currentInvestigation, elements, updateElementPositions } = useInvestigationStore();
  const { savedViews, saveView, loadView, deleteView, hasActiveFilters } = useViewStore();
  const [isCreating, setIsCreating] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [includePositions, setIncludePositions] = useState(false);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

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

  // Can save if has filters OR if including positions
  const canSaveView = hasActiveFilters() || includePositions;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
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
  );
}
