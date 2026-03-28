import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryStore } from '../../stores/queryStore';
import { useDossierStore } from '../../stores/dossierStore';
import { useViewStore } from '../../stores/viewStore';
import { QueryBuilderText } from './QueryBuilderText';
import { QueryBuilderVisual } from './QueryBuilderVisual';
import { QueryResultsTable } from './QueryResultsTable';
import { SavedQueriesList } from './SavedQueriesList';
import { X, Type, LayoutList, Filter, Table2, CheckSquare, Eye, History, SearchX } from 'lucide-react';

export function QueryPanel() {
  const { t } = useTranslation('panels');

  const editorMode = useQueryStore((s) => s.editorMode);
  const setEditorMode = useQueryStore((s) => s.setEditorMode);
  const outputMode = useQueryStore((s) => s.outputMode);
  const setOutputMode = useQueryStore((s) => s.setOutputMode);
  const results = useQueryStore((s) => s.results);
  const clear = useQueryStore((s) => s.clear);
  const setText = useQueryStore((s) => s.setText);
  const currentAst = useQueryStore((s) => s.currentAst);
  const loadSavedQueries = useQueryStore((s) => s.loadSavedQueries);
  const selectAllResults = useQueryStore((s) => s.selectAllResults);
  const recentQueries = useQueryStore((s) => s.recentQueries);
  const currentDossier = useDossierStore((s) => s.currentDossier);
  const saveView = useViewStore((s) => s.saveView);
  const [showHistory, setShowHistory] = useState(false);

  // Load saved queries on mount
  useEffect(() => {
    if (currentDossier) {
      loadSavedQueries(currentDossier.id);
    }
  }, [currentDossier, loadSavedQueries]);

  const showTable = results && (outputMode === 'table' || outputMode === 'both');

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

  const handleSaveAsView = useCallback(async () => {
    if (!currentDossier || !results) return;
    const name = `Query: ${useQueryStore.getState().currentText.slice(0, 40)}`;
    await saveView(currentDossier.id, name);
  }, [currentDossier, results, saveView]);

  const handleApplyHistory = useCallback((text: string) => {
    setText(text);
    setShowHistory(false);
  }, [setText]);

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

      {/* Zero results indicator (#7) */}
      {results && results.elementIds.size === 0 && results.linkIds.size === 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-border-default bg-warning/5">
          <SearchX size={14} className="text-warning shrink-0" />
          <span className="text-xs text-text-secondary">{t('query.zeroResults')}</span>
        </div>
      )}

      {/* Recent queries (#12) */}
      {showHistory && recentQueries.length > 0 && (
        <div className="border-t border-border-default px-3 py-2">
          <div className="flex items-center gap-1 mb-1.5">
            <History size={12} className="text-text-tertiary" />
            <span className="text-[10px] font-medium text-text-tertiary uppercase">{t('query.recentQueries')}</span>
          </div>
          {recentQueries.map((q, i) => (
            <button
              key={i}
              onClick={() => handleApplyHistory(q)}
              className="block w-full text-left px-2 py-1 text-xs font-mono text-text-secondary hover:text-text-primary hover:bg-bg-secondary rounded truncate transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Results bar */}
      <div className="border-t border-border-default px-3 py-2 flex items-center gap-2">
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

        {/* History toggle */}
        {recentQueries.length > 0 && (
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`p-1 rounded transition-colors ${
              showHistory ? 'text-accent bg-accent/10' : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
            }`}
            title={t('query.recentQueries')}
          >
            <History size={14} />
          </button>
        )}

        <div className="flex-1" />

        {/* Results count + actions */}
        {results && (
          <>
            <span className="text-xs text-text-secondary">
              {results.elementIds.size} {t('query.elements')}, {results.linkIds.size} {t('query.links')}
            </span>

            {/* Select all (#6) */}
            {(results.elementIds.size > 0 || results.linkIds.size > 0) && (
              <button
                onClick={selectAllResults}
                className="flex items-center gap-1 px-1.5 py-1 text-xs text-text-secondary hover:text-text-primary rounded hover:bg-bg-secondary transition-colors"
                title={t('query.selectAll')}
              >
                <CheckSquare size={12} />
              </button>
            )}

            {/* Save as View (#13) */}
            {(results.elementIds.size > 0 || results.linkIds.size > 0) && (
              <button
                onClick={handleSaveAsView}
                className="flex items-center gap-1 px-1.5 py-1 text-xs text-text-secondary hover:text-text-primary rounded hover:bg-bg-secondary transition-colors"
                title={t('query.saveAsView')}
              >
                <Eye size={12} />
              </button>
            )}

            {/* Output toggles */}
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
          </>
        )}
      </div>
    </div>
  );
}
