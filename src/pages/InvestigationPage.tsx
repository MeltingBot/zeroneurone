import { useEffect, useState, lazy, Suspense, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Search, Filter, LayoutGrid, Calendar, Map, Download, Upload, FileText, Keyboard, BookOpen, Github, Coffee, Sun, Moon } from 'lucide-react';
import { Layout, IconButton, Modal, Button, LanguageSwitcher, ErrorBoundary } from '../components/common';
import { SidePanel } from '../components/panels';
import { SearchModal, ExportModal, SynthesisModal, ShortcutsModal, MetadataImportModal, ImportIntoCurrentModal } from '../components/modals';

// Lazy load heavy components for better initial load
const Canvas = lazy(() => import('../components/canvas').then(m => ({ default: m.Canvas })));
const TimelineView = lazy(() => import('../components/timeline').then(m => ({ default: m.TimelineView })));
const MapView = lazy(() => import('../components/map').then(m => ({ default: m.MapView })));
import { useInvestigationStore, useUIStore, useViewStore, useSyncStore, useSelectionStore, useInsightsStore } from '../stores';
import { searchService } from '../services/searchService';
import { syncService } from '../services/syncService';
import type { DisplayMode } from '../types';

const viewOptions: { mode: DisplayMode; icon: typeof LayoutGrid; labelKey: string; shortcut: string }[] = [
  { mode: 'canvas', icon: LayoutGrid, labelKey: 'canvas', shortcut: '1' },
  { mode: 'map', icon: Map, labelKey: 'map', shortcut: '2' },
  { mode: 'timeline', icon: Calendar, labelKey: 'timeline', shortcut: '3' },
];

export function InvestigationPage() {
  const { t } = useTranslation('pages');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    currentInvestigation,
    elements,
    links,
    isLoading,
    loadingPhase,
    error,
    loadInvestigation,
    unloadInvestigation,
  } = useInvestigationStore();

  const { searchOpen, toggleSearch, closeSearch, resetInvestigationState: resetUIState, themeMode, toggleThemeMode } = useUIStore();
  const { displayMode, setDisplayMode, hasActiveFilters, clearFilters, loadViews, resetInvestigationState: resetViewState, loadViewportForInvestigation, saveViewportForInvestigation } = useViewStore();

  const syncMode = useSyncStore((state) => state.mode);
  const clearSelection = useSelectionStore((state) => state.clearSelection);
  const clearInsights = useInsightsStore((state) => state.clear);

  const filtersActive = hasActiveFilters();
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [synthesisOpen, setSynthesisOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [collabLeaveWarning, setCollabLeaveWarning] = useState(false);

  // Handle navigation back to home - show warning if in collab mode
  const handleGoHome = useCallback(() => {
    if (syncMode === 'shared') {
      setCollabLeaveWarning(true);
    } else {
      syncService.close();
      navigate('/');
    }
  }, [navigate, syncMode]);

  const handleConfirmLeave = useCallback(() => {
    setCollabLeaveWarning(false);
    syncService.close();
    navigate('/');
  }, [navigate]);

  useEffect(() => {
    if (id) {
      loadInvestigation(id);
      // Load saved viewport for this investigation
      loadViewportForInvestigation(id);
    }
    return () => {
      // Save viewport before unloading
      if (id) {
        saveViewportForInvestigation(id);
      }
      unloadInvestigation();
      searchService.clear();
      // Reset investigation-specific state (selection, filters, insights, redaction)
      clearSelection();
      clearInsights();
      resetUIState();
      resetViewState();
    };
  }, [id, loadInvestigation, unloadInvestigation, clearSelection, clearInsights, resetUIState, resetViewState, loadViewportForInvestigation, saveViewportForInvestigation]);

  // Load search index: full rebuild on investigation load, incremental updates after
  const searchInitializedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentInvestigation) return;

    if (searchInitializedRef.current !== currentInvestigation.id) {
      // First load or investigation changed: full rebuild
      searchService.loadInvestigation(currentInvestigation.id, elements, links);
      searchInitializedRef.current = currentInvestigation.id;
    } else {
      // Subsequent changes: incremental sync (only diffs)
      searchService.syncIncremental(elements, links);
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
            setSynthesisOpen(false);
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
        <div className="h-full flex flex-col items-center justify-center gap-2">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-text-secondary">{loadingPhase || t('home.loading')}</span>
        </div>
      </Layout>
    );
  }

  if (error || !currentInvestigation) {
    return (
      <Layout>
        <div className="h-full flex flex-col items-center justify-center gap-4">
          <span className="text-sm text-error">
            {error || t('investigation.notFound')}
          </span>
          <button
            onClick={handleGoHome}
            className="text-sm text-accent hover:underline"
          >
            {t('home.backToHome')}
          </button>
        </div>
      </Layout>
    );
  }

  // Loading fallback for lazy components
  const ViewLoader = () => (
    <div className="h-full flex items-center justify-center bg-bg-secondary">
      <div className="flex flex-col items-center gap-2">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-text-secondary">{t('home.loading')}</span>
      </div>
    </div>
  );

  // Render only the active view (React Flow/Leaflet need visible container)
  // Each view is wrapped in its own ErrorBoundary for isolated error recovery
  const renderMainView = () => {
    switch (displayMode) {
      case 'canvas':
        return (
          <ErrorBoundary scope="Canvas" showHomeButton>
            <Suspense fallback={<ViewLoader />}>
              <Canvas />
            </Suspense>
          </ErrorBoundary>
        );
      case 'timeline':
        return (
          <ErrorBoundary scope="Timeline" showHomeButton>
            <Suspense fallback={<ViewLoader />}>
              <TimelineView />
            </Suspense>
          </ErrorBoundary>
        );
      case 'map':
        return (
          <ErrorBoundary scope="Carte" showHomeButton>
            <Suspense fallback={<ViewLoader />}>
              <MapView />
            </Suspense>
          </ErrorBoundary>
        );
      default:
        return (
          <ErrorBoundary scope="Canvas" showHomeButton>
            <Suspense fallback={<ViewLoader />}>
              <Canvas />
            </Suspense>
          </ErrorBoundary>
        );
    }
  };

  return (
    <Layout>
      {/* Header */}
      <header className="h-12 flex items-center justify-between px-4 border-b border-border-default bg-bg-primary">
        <div className="flex items-center gap-3">
          <IconButton onClick={handleGoHome} data-testid="back-to-home">
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
            const label = t(`investigation.views.${option.labelKey}`);
            return (
              <button
                key={option.mode}
                onClick={() => setDisplayMode(option.mode)}
                className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${
                  isActive
                    ? 'bg-bg-primary text-text-primary shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
                title={`${label} (${option.shortcut})`}
              >
                <Icon size={14} />
                <span className="hidden md:inline">{label}</span>
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
              title={t('investigation.header.clearFilters')}
            >
              <Filter size={14} />
              <span>{t('investigation.header.activeFilters')}</span>
            </button>
          )}
          <button
            onClick={() => setSynthesisOpen(true)}
            className="flex items-center gap-2 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
            title={t('investigation.header.generateReport')}
          >
            <FileText size={14} />
            <span className="hidden sm:inline">{t('investigation.header.report')}</span>
          </button>
          {/* Dark mode toggle */}
          <button
            onClick={toggleThemeMode}
            className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary rounded transition-colors"
            title={themeMode === 'light' ? t('investigation.viewToolbar.darkMode') : t('investigation.viewToolbar.lightMode')}
          >
            {themeMode === 'light' ? <Moon size={14} /> : <Sun size={14} />}
          </button>
          {/* Language selector */}
          <LanguageSwitcher size="sm" />
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
            title={t('investigation.header.import')}
          >
            <Upload size={14} />
            <span className="hidden sm:inline">{t('investigation.header.import')}</span>
          </button>
          <button
            onClick={() => setExportOpen(true)}
            className="flex items-center gap-2 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
            title={t('investigation.header.export')}
          >
            <Download size={14} />
            <span className="hidden sm:inline">{t('investigation.header.export')}</span>
          </button>
          <button
            onClick={toggleSearch}
            className="flex items-center gap-2 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
          >
            <Search size={14} />
            <span className="hidden sm:inline">{t('investigation.header.search')}</span>
            <kbd className="hidden sm:inline px-1 py-0.5 bg-bg-tertiary rounded text-text-tertiary text-[10px]">
              Ctrl+K
            </kbd>
          </button>
          <button
            onClick={() => setShortcutsOpen(true)}
            className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary rounded"
            title={`${t('investigation.header.shortcuts')} (?)`}
          >
            <Keyboard size={14} />
          </button>
          <a
            href="https://doc.zeroneurone.com"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary rounded"
            title={t('investigation.header.documentation')}
          >
            <BookOpen size={14} />
          </a>
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
            title={t('investigation.header.supportKofi')}
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
        <ErrorBoundary scope="Panneau" compact>
          <SidePanel />
        </ErrorBoundary>
      </div>


      {/* Search modal */}
      <SearchModal isOpen={searchOpen} onClose={closeSearch} />

      {/* Export modal */}
      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
      />

      {/* Import modal (simplified for current investigation) */}
      <ImportIntoCurrentModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
      />

      {/* Synthesis modal */}
      <SynthesisModal
        isOpen={synthesisOpen}
        onClose={() => setSynthesisOpen(false)}
      />

      {/* Shortcuts modal */}
      <ShortcutsModal
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      {/* Metadata import modal */}
      <MetadataImportModal />

      {/* Warning when leaving a collaborative session */}
      <Modal
        isOpen={collabLeaveWarning}
        onClose={() => setCollabLeaveWarning(false)}
        title={t('investigation.collab.leaveTitle')}
        width="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCollabLeaveWarning(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button variant="primary" onClick={handleConfirmLeave}>
              {t('investigation.collab.leave')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">
          {t('investigation.collab.leaveMessage')}
        </p>
        <p className="text-sm text-text-secondary mt-2">
          {t('investigation.collab.rejoinMessage')}
        </p>
      </Modal>
    </Layout>
  );
}
