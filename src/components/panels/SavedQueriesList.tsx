import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryStore } from '../../stores/queryStore';
import { useDossierStore } from '../../stores/dossierStore';
import type { SavedQuery } from '../../types';
import { Save, Trash2, Play, ChevronDown, ChevronRight, Pencil, Check, X } from 'lucide-react';

export function SavedQueriesList() {
  const { t } = useTranslation('panels');
  const savedQueries = useQueryStore((s) => s.savedQueries);
  const saveQuery = useQueryStore((s) => s.saveQuery);
  const deleteSavedQuery = useQueryStore((s) => s.deleteSavedQuery);
  const applySavedQuery = useQueryStore((s) => s.applySavedQuery);
  const currentAst = useQueryStore((s) => s.currentAst);
  const currentDossier = useDossierStore((s) => s.currentDossier);

  const [isExpanded, setIsExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleSave = useCallback(async () => {
    if (!currentDossier || !saveName.trim()) return;
    await saveQuery(currentDossier.id, saveName.trim(), '');
    setSaveName('');
    setIsSaving(false);
  }, [currentDossier, saveName, saveQuery]);

  const handleApply = useCallback((query: SavedQuery) => {
    applySavedQuery(query);
  }, [applySavedQuery]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteSavedQuery(id);
  }, [deleteSavedQuery]);

  const handleStartEdit = useCallback((query: SavedQuery) => {
    setEditingId(query.id);
    setEditName(query.name);
  }, []);

  const handleConfirmEdit = useCallback(async (query: SavedQuery) => {
    if (!editName.trim()) return;
    // Update via repository directly (queryStore doesn't have rename)
    const { queryRepository } = await import('../../db/repositories/queryRepository');
    await queryRepository.update(query.id, { name: editName.trim() });
    // Refresh list
    if (currentDossier) {
      useQueryStore.getState().loadSavedQueries(currentDossier.id);
    }
    setEditingId(null);
  }, [editName, currentDossier]);

  return (
    <div className="border-t border-border-default">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
      >
        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {t('query.savedQueries')}
        {savedQueries.length > 0 && (
          <span className="ml-auto text-text-tertiary">{savedQueries.length}</span>
        )}
      </button>

      {isExpanded && (
        <div className="px-3 pb-2">
          {/* Save current query */}
          {currentAst && !isSaving && (
            <button
              onClick={() => setIsSaving(true)}
              className="flex items-center gap-1 w-full px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary rounded border border-dashed border-border-default hover:border-accent hover:bg-bg-secondary transition-colors justify-center mb-2"
            >
              <Save size={12} />
              {t('query.saveCurrentQuery')}
            </button>
          )}

          {/* Save form */}
          {isSaving && (
            <div className="flex items-center gap-1 mb-2">
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') setIsSaving(false);
                }}
                placeholder={t('query.queryName')}
                autoFocus
                className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-border-default bg-bg-primary text-text-primary outline-none focus:border-accent"
              />
              <button
                onClick={handleSave}
                disabled={!saveName.trim()}
                className="p-1 text-accent hover:bg-accent/10 rounded disabled:opacity-40 transition-colors"
              >
                <Check size={12} />
              </button>
              <button
                onClick={() => setIsSaving(false)}
                className="p-1 text-text-tertiary hover:text-text-primary rounded transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* List */}
          {savedQueries.length === 0 ? (
            <p className="text-[10px] text-text-tertiary text-center py-2">
              {t('query.noSavedQueries')}
            </p>
          ) : (
            <div className="space-y-0.5">
              {savedQueries.map((query) => (
                <div
                  key={query.id}
                  className="group flex items-center gap-1 px-2 py-1.5 rounded hover:bg-bg-secondary transition-colors"
                >
                  {editingId === query.id ? (
                    <>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleConfirmEdit(query);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                        className="flex-1 min-w-0 px-1 py-0.5 text-xs rounded border border-border-default bg-bg-primary text-text-primary outline-none focus:border-accent"
                      />
                      <button
                        onClick={() => handleConfirmEdit(query)}
                        className="p-0.5 text-accent hover:bg-accent/10 rounded transition-colors"
                      >
                        <Check size={10} />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-0.5 text-text-tertiary hover:text-text-primary rounded transition-colors"
                      >
                        <X size={10} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleApply(query)}
                        className="flex-1 min-w-0 text-left text-xs text-text-primary truncate"
                        title={query.queryText}
                      >
                        {query.name}
                      </button>
                      <div className="hidden group-hover:flex items-center gap-0.5">
                        <button
                          onClick={() => handleApply(query)}
                          className="p-0.5 text-text-tertiary hover:text-accent rounded transition-colors"
                          title={t('query.execute')}
                        >
                          <Play size={10} />
                        </button>
                        <button
                          onClick={() => handleStartEdit(query)}
                          className="p-0.5 text-text-tertiary hover:text-text-primary rounded transition-colors"
                          title={t('query.rename')}
                        >
                          <Pencil size={10} />
                        </button>
                        <button
                          onClick={() => handleDelete(query.id)}
                          className="p-0.5 text-text-tertiary hover:text-error rounded transition-colors"
                          title={t('query.deleteQuery')}
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
