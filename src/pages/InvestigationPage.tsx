import { useEffect, useState, lazy, Suspense, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Filter, LayoutGrid, Calendar, Map, Download, FileText, Keyboard, Github, Coffee } from 'lucide-react';
import { Layout, IconButton } from '../components/common';
import { SidePanel } from '../components/panels';
import { SearchModal, ExportModal, ReportModal, ShortcutsModal } from '../components/modals';

// Lazy load heavy components for better initial load
const Canvas = lazy(() => import('../components/canvas').then(m => ({ default: m.Canvas })));
const TimelineView = lazy(() => import('../components/timeline').then(m => ({ default: m.TimelineView })));
const MapView = lazy(() => import('../components/map').then(m => ({ default: m.MapView })));
import { useInvestigationStore, useUIStore, useSelectionStore, useViewStore } from '../stores';
import { searchService } from '../services/searchService';
import { syncService } from '../services/syncService';
import type { DisplayMode } from '../types';

const viewOptions: { mode: DisplayMode; icon: typeof LayoutGrid; label: string; shortcut: string }[] = [
  { mode: 'canvas', icon: LayoutGrid, label: 'Canvas', shortcut: '1' },
  { mode: 'map', icon: Map, label: 'Carte', shortcut: '2' },
  { mode: 'timeline', icon: Calendar, label: 'Timeline', shortcut: '3' },
];

export function InvestigationPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    currentInvestigation,
    elements,
    links,
    isLoading,
    error,
    loadInvestigation,
    unloadInvestigation,
  } = useInvestigationStore();

  const { selectedElementIds, selectedLinkIds } = useSelectionStore();
  const { searchOpen, toggleSearch, closeSearch, resetInvestigationState: resetUIState } = useUIStore();
  const { displayMode, setDisplayMode, hasActiveFilters, clearFilters, loadViews, resetInvestigationState: resetViewState } = useViewStore();

  const filtersActive = hasActiveFilters();
  const [exportOpen, setExportOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Handle navigation back to home - properly close sync connection
  const handleGoHome = useCallback(() => {
    // Close sync connection before navigating
    syncService.close();
    navigate('/');
  }, [navigate]);

  useEffect(() => {
    if (id) {
      loadInvestigation(id);
    }
    return () => {
      unloadInvestigation();
      searchService.clear();
      // Reset investigation-specific state (filters, redaction settings)
      resetUIState();
      resetViewState();
    };
  }, [id, loadInvestigation, unloadInvestigation, resetUIState, resetViewState]);

  // Load search index when elements/links change
  useEffect(() => {
    if (currentInvestigation && elements.length >= 0) {
      searchService.loadInvestigation(currentInvestigation.id, elements, links);
    }
  }, [currentInvestigation, elements, links]);

  // Load saved views for this investigation
  useEffect(() => {
    if (currentInvestigation) {
      loadViews(currentInvestigation.id);
    }
  }, [currentInvestigation, loadViews]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Ctrl+K for search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        toggleSearch();
        return;
      }

      // View switching shortcuts (1-3) and help (?)
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (e.key) {
          case '1':
            setDisplayMode('canvas');
            break;
          case '2':
            setDisplayMode('map');
            break;
          case '3':
            setDisplayMode('timeline');
            break;
          case '?':
            setShortcutsOpen(true);
            break;
          case 'Escape':
            setShortcutsOpen(false);
            setExportOpen(false);
            setReportOpen(false);
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSearch, setDisplayMode]);

  if (isLoading) {
    return (
      <Layout>
        <div className="h-full flex items-center justify-center">
          <span className="text-sm text-text-secondary">Chargement...</span>
        </div>
      </Layout>
    );
  }

  if (error || !currentInvestigation) {
    return (
      <Layout>
        <div className="h-full flex flex-col items-center justify-center gap-4">
          <span className="text-sm text-error">
            {error || 'Enquête non trouvée'}
          </span>
          <button
            onClick={handleGoHome}
            className="text-sm text-accent hover:underline"
          >
            Retour à l'accueil
          </button>
        </div>
      </Layout>
    );
  }

  const selectionCount = selectedElementIds.size + selectedLinkIds.size;

  // Loading fallback for lazy components
  const ViewLoader = () => (
    <div className="h-full flex items-center justify-center bg-bg-secondary">
      <div className="flex flex-col items-center gap-2">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-text-secondary">Chargement...</span>
      </div>
    </div>
  );

  // Render only the active view (React Flow/Leaflet need visible container)
  const renderMainView = () => {
    const view = (() => {
      switch (displayMode) {
        case 'canvas':
          return <Canvas />;
        case 'timeline':
          return <TimelineView />;
        case 'map':
          return <MapView />;
        default:
          return <Canvas />;
      }
    })();

    return <Suspense fallback={<ViewLoader />}>{view}</Suspense>;
  };

  return (
    <Layout>
      {/* Header */}
      <header className="h-12 flex items-center justify-between px-4 border-b border-border-default bg-bg-primary">
        <div className="flex items-center gap-3">
          <IconButton onClick={handleGoHome}>
            <ArrowLeft size={16} />
          </IconButton>
          <h1 className="text-sm font-semibold text-text-primary">
            {currentInvestigation.name}
          </h1>
        </div>

        {/* View switcher */}
        <div className="flex items-center gap-1 px-1 py-0.5 bg-bg-secondary rounded-lg">
          {viewOptions.map((option) => {
            const Icon = option.icon;
            const isActive = displayMode === option.mode;
            return (
              <button
                key={option.mode}
                onClick={() => setDisplayMode(option.mode)}
                className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${
                  isActive
                    ? 'bg-bg-primary text-text-primary shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
                title={`${option.label} (${option.shortcut})`}
              >
                <Icon size={14} />
                <span className="hidden md:inline">{option.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {/* Filter indicator */}
          {filtersActive && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 px-2 py-1 text-xs bg-accent/10 text-accent rounded hover:bg-accent/20 transition-colors"
              title="Effacer les filtres"
            >
              <Filter size={14} />
              <span>Filtres actifs</span>
            </button>
          )}
          <button
            onClick={() => setReportOpen(true)}
            className="flex items-center gap-2 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
            title="Generer un rapport"
          >
            <FileText size={14} />
            <span className="hidden sm:inline">Rapport</span>
          </button>
          <button
            onClick={() => setExportOpen(true)}
            className="flex items-center gap-2 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
            title="Exporter"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Exporter</span>
          </button>
          <button
            onClick={toggleSearch}
            className="flex items-center gap-2 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
          >
            <Search size={14} />
            <span className="hidden sm:inline">Rechercher</span>
            <kbd className="hidden sm:inline px-1 py-0.5 bg-bg-tertiary rounded text-text-tertiary text-[10px]">
              Ctrl+K
            </kbd>
          </button>
          <button
            onClick={() => setShortcutsOpen(true)}
            className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary rounded"
            title="Raccourcis clavier (?)"
          >
            <Keyboard size={14} />
          </button>
          <a
            href="https://github.com/MeltingBot/zeroneurone"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary rounded"
            title="GitHub"
          >
            <Github size={14} />
          </a>
          <a
            href="https://ko-fi.com/yannpilpre"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary rounded"
            title="Soutenir sur Ko-fi"
          >
            <Coffee size={14} />
          </a>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main view */}
        <main className="flex-1 relative bg-bg-secondary">
          {renderMainView()}
        </main>

        {/* Side panel */}
        <SidePanel />
      </div>

      {/* Footer / Status bar */}
      <footer className="h-8 flex items-center justify-between px-4 border-t border-border-default bg-bg-secondary text-xs text-text-secondary">
        <div className="flex items-center gap-4">
          <span>
            {elements.length} élément{elements.length !== 1 ? 's' : ''}
          </span>
          <span>
            {links.length} lien{links.length !== 1 ? 's' : ''}
          </span>
          <span className="text-text-tertiary">
            Vue: {viewOptions.find((v) => v.mode === displayMode)?.label}
          </span>
        </div>
        <div>
          {selectionCount > 0 && (
            <span>
              {selectionCount} sélectionné{selectionCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </footer>

      {/* Search modal */}
      <SearchModal isOpen={searchOpen} onClose={closeSearch} />

      {/* Export modal */}
      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
      />

      {/* Report modal */}
      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
      />

      {/* Shortcuts modal */}
      <ShortcutsModal
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </Layout>
  );
}
