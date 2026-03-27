import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryStore } from '../../stores/queryStore';
import { useDossierStore } from '../../stores/dossierStore';
import { QueryBuilderText } from './QueryBuilderText';
import { QueryBuilderVisual } from './QueryBuilderVisual';
import { QueryResultsTable } from './QueryResultsTable';
import { SavedQueriesList } from './SavedQueriesList';
import { Play, X, Type, LayoutList, Filter, Table2 } from 'lucide-react';

export function QueryPanel() {
  const { t } = useTranslation('panels');

  const editorMode = useQueryStore((s) => s.editorMode);
  const setEditorMode = useQueryStore((s) => s.setEditorMode);
  const outputMode = useQueryStore((s) => s.outputMode);
  const setOutputMode = useQueryStore((s) => s.setOutputMode);
  const results = useQueryStore((s) => s.results);
  const clear = useQueryStore((s) => s.clear);
  const execute = useQueryStore((s) => s.execute);
  const currentAst = useQueryStore((s) => s.currentAst);
  const loadSavedQueries = useQueryStore((s) => s.loadSavedQueries);
  const currentDossier = useDossierStore((s) => s.currentDossier);

  // Load saved queries on mount
  useEffect(() => {
    if (currentDossier) {
      loadSavedQueries(currentDossier.id);
    }
  }, [currentDossier, loadSavedQueries]);

  const showTable = results && (outputMode === 'table' || outputMode === 'both');

  const handleExecute = useCallback(() => {
    execute();
    if (outputMode === 'none') {
      setOutputMode('canvas');
    }
  }, [execute, outputMode, setOutputMode]);

  const handleClear = useCallback(() => {
    clear();
  }, [clear]);

  const handleToggleOutput = useCallback((mode: 'canvas' | 'table') => {
    if (outputMode === mode) {
      setOutputMode('none');
    } else if (outputMode === 'none') {
      setOutputMode(mode);
    } else if (outputMode === 'both') {
      setOutputMode(mode === 'canvas' ? 'table' : 'canvas');
    } else {
      setOutputMode('both');
    }
  }, [outputMode, setOutputMode]);

  return (
    <div className="flex flex-col h-full">
      {/* Header: mode toggle */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border-default">
        <button
          onClick={() => setEditorMode('visual')}
          className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
            editorMode === 'visual'
              ? 'bg-accent/10 text-accent'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
          }`}
        >
          <LayoutList size={12} />
          {t('query.modeVisual')}
        </button>
        <button
          onClick={() => setEditorMode('text')}
          className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
            editorMode === 'text'
              ? 'bg-accent/10 text-accent'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
          }`}
        >
          <Type size={12} />
          {t('query.modeText')}
        </button>
      </div>

      {/* Editor */}
      <div className={`overflow-y-auto ${showTable ? '' : 'flex-1'}`} style={showTable ? { maxHeight: '40%' } : undefined}>
        {editorMode === 'text' ? <QueryBuilderText /> : <QueryBuilderVisual />}

        {/* Saved queries */}
        <SavedQueriesList />
      </div>

      {/* Table results */}
      {showTable && (
        <div className="flex-1 overflow-hidden border-t border-border-default">
          <QueryResultsTable />
        </div>
      )}

      {/* Results bar */}
      <div className="border-t border-border-default px-3 py-2 flex items-center gap-2">
        {/* Execute button */}
        <button
          onClick={handleExecute}
          disabled={!currentAst}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded bg-accent text-white hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Play size={12} />
          {t('query.execute')}
        </button>

        {/* Clear button */}
        {currentAst && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary rounded hover:bg-bg-secondary transition-colors"
          >
            <X size={12} />
            {t('query.clear')}
          </button>
        )}

        <div className="flex-1" />

        {/* Results count */}
        {results && (
          <span className="text-xs text-text-secondary">
            {results.elementIds.size} {t('query.elements')}, {results.linkIds.size} {t('query.links')}
          </span>
        )}

        {/* Output toggles */}
        {results && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleToggleOutput('canvas')}
              className={`p-1 rounded transition-colors ${
                outputMode === 'canvas' || outputMode === 'both'
                  ? 'text-accent bg-accent/10'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
              }`}
              title={t('query.filterMode')}
            >
              <Filter size={14} />
            </button>
            <button
              onClick={() => handleToggleOutput('table')}
              className={`p-1 rounded transition-colors ${
                outputMode === 'table' || outputMode === 'both'
                  ? 'text-accent bg-accent/10'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
              }`}
              title={t('query.tableMode')}
            >
              <Table2 size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
