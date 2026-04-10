import { useEffect, useState, lazy, Suspense, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Search, Filter, LayoutGrid, Calendar, Map, Table, Download, Upload, FileText, Keyboard, BookOpen, Github, Coffee, Sun, Moon, PanelLeft, PanelRight, PanelBottom, ExternalLink, MoreVertical } from 'lucide-react';
import { Layout, IconButton, Modal, Button, LanguageSwitcher, ErrorBoundary } from '../components/common';
import { SidePanel } from '../components/panels';
import { SearchModal, ExportModal, SynthesisModal, ShortcutsModal, MetadataImportModal, ImportIntoCurrentModal } from '../components/modals';
import { CollaborationInfo } from '../components/collaboration';

// Lazy load with auto-reload on chunk load failure (stale cache after deploy)
function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return lazy(() =>
    factory().catch(() => {
      const key = 'zn_chunk_retry';
      const last = sessionStorage.getItem(key);
      // Reload once per session to fetch fresh assets
      if (!last || Date.now() - Number(last) > 10_000) {
        sessionStorage.setItem(key, String(Date.now()));
        window.location.reload();
      }
      // If we already retried, let the ErrorBoundary handle it
      return factory();
    }),
  );
}

// Lazy load heavy components for better initial load
const Canvas = lazyWithRetry(() => import('../components/canvas').then(m => ({ default: m.Canvas })));
const TimelineView = lazyWithRetry(() => import('../components/timeline').then(m => ({ default: m.TimelineView })));
const MapView = lazyWithRetry(() => import('../components/map').then(m => ({ default: m.MapView })));
const MatrixView = lazyWithRetry(() => import('../components/matrix').then(m => ({ default: m.MatrixView })));
import { useDossierStore, useUIStore, useViewStore, useSyncStore, useSelectionStore, useInsightsStore, useTabStore } from '../stores';
import { TabBar } from '../components/canvas/TabBar';
import { searchService } from '../services/searchService';
import { syncService } from '../services/syncService';
import type { DisplayMode } from '../types';
import { usePlugins } from '../plugins/usePlugins';
import { getPlugins } from '../plugins/pluginRegistry';

const viewOptions: { mode: DisplayMode; icon: typeof LayoutGrid; labelKey: string; shortcut: string }[] = [
  { mode: 'canvas', icon: LayoutGrid, labelKey: 'canvas', shortcut: '1' },
  { mode: 'map', icon: Map, labelKey: 'map', shortcut: '2' },
  { mode: 'timeline', icon: Calendar, labelKey: 'timeline', shortcut: '3' },
  { mode: 'matrix', icon: Table, labelKey: 'matrix', shortcut: '4' },
];

/** Match a keyboard shortcut string like "Ctrl+Shift+P" against a KeyboardEvent */
function matchesShortcutKeys(e: KeyboardEvent, keys: string): boolean {
  const parts = keys.toLowerCase().split('+');
  const key = parts.pop() || '';
  const needCtrl = parts.includes('ctrl') || parts.includes('mod');
  const needShift = parts.includes('shift');
  const needAlt = parts.includes('alt');
  const hasCtrl = e.ctrlKey || e.metaKey;
  return hasCtrl === needCtrl && e.shiftKey === needShift && e.altKey === needAlt && e.key.toLowerCase() === key;
}

export function DossierPage() {
  const { t } = useTranslation('pages');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    currentDossier,
    elements,
    links,
    assets,
    isLoading,
    loadingPhase,
    loadingDetail,
    loadingProgress,
    error,
    loadDossier,
    unloadDossier,
  } = useDossierStore();

  const { searchOpen, toggleSearch, closeSearch, resetDossierState: resetUIState, themeMode, toggleThemeMode, showToast, panelSide, togglePanelSide } = useUIStore();
  const { displayMode, setDisplayMode, hasActiveFilters, clearFilters, loadViews, resetDossierState: resetViewState, loadViewportForDossier, saveViewportForDossier } = useViewStore();

  const syncMode = useSyncStore((state) => state.mode);
  const clearSelection = useSelectionStore((state) => state.clearSelection);
  const clearInsights = useInsightsStore((state) => state.clear);
  const loadTabs = useTabStore((state) => state.loadTabs);
  const resetTabState = useTabStore((state) => state.resetDossierState);
  const canvasTabs = useTabStore((state) => state.tabs);
  const activeTabId = useTabStore((state) => state.activeTabId);
  const setActiveTab = useTabStore((state) => state.setActiveTab);
  const addTabMembers = useTabStore((state) => state.addMembers);

  const setReadOnly = useDossierStore((s) => s.setReadOnly);
  const deleteDossier = useDossierStore((s) => s.deleteDossier);
  const updateElement = useDossierStore((s) => s.updateElement);
  const updateLink = useDossierStore((s) => s.updateLink);
  const updateDossier = useDossierStore((s) => s.updateDossier);

  const filtersActive = hasActiveFilters();
  const [exportOpen, setExportOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [redactConfirmOpen, setRedactConfirmOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [synthesisOpen, setSynthesisOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);

  // Close header overflow menu on click outside
  useEffect(() => {
    if (!headerMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [headerMenuOpen]);

  const [collabLeaveWarning, setCollabLeaveWarning] = useState(false);
  const headerPlugins = usePlugins('header:right');

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
      loadDossier(id);
      // Load saved viewport for this dossier
      loadViewportForDossier(id);
      // Load canvas tabs
      loadTabs(id);
    }
    return () => {
      // Save viewport before unloading
      if (id) {
        saveViewportForDossier(id);
      }
      unloadDossier();
      searchService.clear();
      // Reset dossier-specific state (selection, filters, insights, redaction, tabs)
      clearSelection();
      clearInsights();
      resetUIState();
      resetViewState();
      resetTabState();
    };
  }, [id, loadDossier, unloadDossier, clearSelection, clearInsights, resetUIState, resetViewState, resetTabState, loadViewportForDossier, saveViewportForDossier, loadTabs]);

  // Retention expiration check
  const retentionExpiredDays = (() => {
    if (!currentDossier?.retentionDays) return null;
    const expiresAt = new Date(currentDossier.createdAt).getTime() + currentDossier.retentionDays * 86400000;
    const diff = Date.now() - expiresAt;
    return diff > 0 ? Math.ceil(diff / 86400000) : null;
  })();

  useEffect(() => {
    if (!currentDossier || retentionExpiredDays === null) {
      setReadOnly(false);
      return;
    }
    const policy = currentDossier.retentionPolicy || 'warn';
    if (policy === 'warn') {
      showToast('warning', t('dossier.retentionExpiredBanner', { days: retentionExpiredDays }));
    } else if (policy === 'readonly') {
      setReadOnly(true);
    } else if (policy === 'delete') {
      setReadOnly(true);
      setDeleteConfirmOpen(true);
    } else if (policy === 'redact') {
      setReadOnly(true);
      setRedactConfirmOpen(true);
    }
  }, [currentDossier?.id, retentionExpiredDays]);

  // Self-healing: reassign orphaned elements to the first tab
  const orphanHealedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentDossier || elements.length === 0 || canvasTabs.length === 0) return;
    if (orphanHealedRef.current === currentDossier.id) return;
    orphanHealedRef.current = currentDossier.id;

    const allMembers = new Set<string>();
    for (const tab of canvasTabs) {
      for (const id of tab.memberElementIds) {
        allMembers.add(id);
      }
    }
    const orphanIds = elements
      .filter((el) => !allMembers.has(el.id))
      .map((el) => el.id);
    if (orphanIds.length > 0) {
      addTabMembers(canvasTabs[0].id, orphanIds);
    }
  }, [currentDossier, elements, canvasTabs, addTabMembers]);

  // Load search index: full rebuild on dossier load, incremental updates after
  const searchInitializedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentDossier) return;

    if (searchInitializedRef.current !== currentDossier.id) {
      // First load or dossier changed: full rebuild
      searchService.loadDossier(currentDossier.id, elements, links, assets);
      searchInitializedRef.current = currentDossier.id;
    } else {
      // Subsequent changes: incremental sync (only diffs)
      searchService.syncIncremental(elements, links, assets);
    }
  }, [currentDossier, elements, links, assets]);

  // Load saved views for this dossier
  useEffect(() => {
    if (currentDossier) {
      loadViews(currentDossier.id);
    }
  }, [currentDossier, loadViews]);

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


      // Tab cycling: Alt+Left/Right, Alt+0 for first tab
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          if (canvasTabs.length === 0) return;
          const tabIds = canvasTabs.map(t => t.id);
          const currentIndex = activeTabId ? tabIds.indexOf(activeTabId) : 0;
          const delta = e.key === 'ArrowRight' ? 1 : -1;
          const nextIndex = (currentIndex + delta + tabIds.length) % tabIds.length;
          setActiveTab(tabIds[nextIndex]);
          return;
        }
        if (e.key === '0') {
          e.preventDefault();
          if (canvasTabs.length > 0) setActiveTab(canvasTabs[0].id);
          return;
        }
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
          case '4':
            setDisplayMode('matrix');
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

      // Plugin keyboard shortcuts (evaluated after native ones)
      const pluginShortcuts = getPlugins('keyboard:shortcuts');
      for (const shortcut of pluginShortcuts) {
        if (matchesShortcutKeys(e, shortcut.keys)) {
          e.preventDefault();
          shortcut.action();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSearch, setDisplayMode, canvasTabs, activeTabId, setActiveTab]);

  if (isLoading) {
    // loadingPhase is an i18n key (opening, syncing, files, elements)
    const phaseLabel = loadingPhase
      ? t(`dossier.loading.${loadingPhase}`)
      : t('home.loading');

    // loadingDetail: for 'elements' phase it's "count|count", otherwise plain text
    let detailLabel = loadingDetail;
    if (loadingPhase === 'elements' && loadingDetail.includes('|')) {
      const [elCount, lkCount] = loadingDetail.split('|');
      detailLabel = t('dossier.loading.elementsLinks', { elements: elCount, links: lkCount });
    }

    return (
      <Layout>
        <div className="h-full flex flex-col items-center justify-center gap-3">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm font-medium text-text-primary">{phaseLabel}</span>
            {detailLabel && (
              <span className="text-xs text-text-secondary tabular-nums">{detailLabel}</span>
            )}
          </div>
          <div className="w-48 h-1 bg-bg-tertiary rounded overflow-hidden">
            <div
              className="h-full bg-accent rounded transition-[width] duration-300"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !currentDossier) {
    return (
      <Layout>
        <div className="h-full flex flex-col items-center justify-center gap-4">
          <span className="text-sm text-error">
            {error || t('dossier.notFound')}
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
      case 'matrix':
        return (
          <ErrorBoundary scope="Matrix" showHomeButton>
            <Suspense fallback={<ViewLoader />}>
              <MatrixView />
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
      {/* Delete confirmation modal (retention policy=delete) */}
      <Modal isOpen={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} title={t('dossier.retentionDeleteAction')}>
        <div className="space-y-4">
          <p className="text-sm text-text-primary">
            {t('dossier.retentionDeleteConfirm')}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteConfirmOpen(false)}>
              {t('actions.cancel', { ns: 'common' })}
            </Button>
            <button
              className="px-3 py-1.5 text-sm text-white bg-error hover:bg-error/90 rounded"
              onClick={async () => {
                if (currentDossier) {
                  await deleteDossier(currentDossier.id);
                  navigate('/');
                }
              }}
            >
              {t('dossier.retentionDeleteAction')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Redact confirmation modal (retention policy=redact) */}
      <Modal isOpen={redactConfirmOpen} onClose={() => setRedactConfirmOpen(false)} title={t('dossier.retentionRedactAction')}>
        <div className="space-y-4">
          <p className="text-sm text-text-primary">
            {t('dossier.retentionRedactConfirm')}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRedactConfirmOpen(false)}>
              {t('actions.cancel', { ns: 'common' })}
            </Button>
            <button
              className="px-3 py-1.5 text-sm text-white bg-error hover:bg-error/90 rounded"
              onClick={async () => {
                if (!currentDossier) return;
                const redacted = '\u2588\u2588\u2588';
                for (const el of elements) {
                  await updateElement(el.id, {
                    label: redacted,
                    notes: '',
                    source: '',
                    tags: [],
                    properties: [],
                  });
                }
                for (const lk of links) {
                  await updateLink(lk.id, {
                    label: redacted,
                    notes: '',
                    source: '',
                    tags: [],
                    properties: [],
                  });
                }
                await updateDossier(currentDossier.id, {
                  description: '',
                  creator: '',
                  retentionPolicy: 'readonly',
                });
                setRedactConfirmOpen(false);
              }}
            >
              {t('dossier.retentionRedactAction')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Header */}
      <header className="h-10 flex items-center justify-between px-3 border-b border-border-default bg-bg-primary gap-1">
        <div className="flex items-center gap-2 min-w-0 shrink">
          <IconButton onClick={handleGoHome} data-testid="back-to-home">
            <ArrowLeft size={16} />
          </IconButton>
          <h1 className="text-sm font-semibold text-text-primary truncate">
            {currentDossier.name}
          </h1>
          <div className="w-px h-4 bg-border-default shrink-0" />
          <div className="flex items-center gap-1 shrink-0">
            <CollaborationInfo />
          </div>
        </div>

        {/* View switcher */}
        <div className="flex items-center gap-0.5 px-1 py-0.5 bg-bg-secondary rounded shrink-0">
          {viewOptions.map((option) => {
            const Icon = option.icon;
            const isActive = displayMode === option.mode;
            const label = t(`dossier.views.${option.labelKey}`);
            return (
              <button
                key={option.mode}
                onClick={() => setDisplayMode(option.mode)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  isActive
                    ? 'bg-bg-primary text-text-primary shadow-sm font-medium'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
                title={`${label} (${option.shortcut})`}
              >
                <Icon size={14} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {/* Filter indicator */}
          {filtersActive && (
            <button
              onClick={clearFilters}
              className="p-1.5 text-accent hover:bg-accent/10 rounded transition-colors"
              title={t('dossier.header.clearFilters')}
            >
              <Filter size={14} />
            </button>
          )}
          <button
            onClick={() => setSynthesisOpen(true)}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
            title={t('dossier.header.generateReport')}
          >
            <FileText size={14} />
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
            title={t('dossier.header.import')}
          >
            <Download size={14} />
          </button>
          <button
            onClick={() => setExportOpen(true)}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
            title={t('dossier.header.export')}
          >
            <Upload size={14} />
          </button>
          <button
            onClick={toggleSearch}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
            title={`${t('dossier.header.search')} (Ctrl+K)`}
          >
            <Search size={14} />
          </button>

          {/* Secondary buttons — visible on large screens */}
          <div className="hidden lg:flex items-center gap-1">
            <div className="w-px h-4 bg-border-default mx-0.5" />
            {/* Panel dock mode toggle */}
            <button
              onClick={togglePanelSide}
              className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary rounded transition-colors"
              title={
                panelSide === 'right' ? t('dossier.header.panelDockBottom', 'Panneau en bas') :
                panelSide === 'bottom' ? t('dossier.header.panelDockLeft', 'Panneau a gauche') :
                panelSide === 'left' ? t('dossier.header.panelDetach', 'Detacher le panneau') :
                t('dossier.header.panelDockRight', 'Panneau a droite')
              }
            >
              {panelSide === 'right' ? <PanelBottom size={14} /> :
               panelSide === 'bottom' ? <PanelLeft size={14} /> :
               panelSide === 'left' ? <ExternalLink size={14} /> :
               <PanelRight size={14} />}
            </button>
            {/* Dark mode toggle */}
            <button
              onClick={toggleThemeMode}
              className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary rounded transition-colors"
              title={themeMode === 'light' ? t('dossier.viewToolbar.darkMode') : t('dossier.viewToolbar.lightMode')}
            >
              {themeMode === 'light' ? <Moon size={14} /> : <Sun size={14} />}
            </button>
            <button
              onClick={() => setShortcutsOpen(true)}
              className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary rounded"
              title={`${t('dossier.header.shortcuts')} (?)`}
            >
              <Keyboard size={14} />
            </button>
            <a
              href="https://doc.zeroneurone.com"
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary rounded"
              title={t('dossier.header.documentation')}
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
              title={t('dossier.header.supportKofi')}
            >
              <Coffee size={14} />
            </a>
          </div>

          {/* Overflow menu — visible on small screens only */}
          <div className="relative lg:hidden" ref={headerMenuRef}>
            <button
              onClick={() => setHeaderMenuOpen(v => !v)}
              className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary rounded transition-colors"
              title={t('dossier.header.more', 'Plus')}
            >
              <MoreVertical size={14} />
            </button>
            {headerMenuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-bg-primary border border-border-default rounded shadow-lg z-50 py-1 min-w-[180px]">
                <button
                  onClick={() => { togglePanelSide(); setHeaderMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-tertiary"
                >
                  {panelSide === 'right' ? <PanelBottom size={14} /> :
                   panelSide === 'bottom' ? <PanelLeft size={14} /> :
                   panelSide === 'left' ? <ExternalLink size={14} /> :
                   <PanelRight size={14} />}
                  {panelSide === 'right' ? t('dossier.header.panelDockBottom', 'Panneau en bas') :
                   panelSide === 'bottom' ? t('dossier.header.panelDockLeft', 'Panneau a gauche') :
                   panelSide === 'left' ? t('dossier.header.panelDetach', 'Detacher le panneau') :
                   t('dossier.header.panelDockRight', 'Panneau a droite')}
                </button>
                <button
                  onClick={() => { toggleThemeMode(); setHeaderMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-tertiary"
                >
                  {themeMode === 'light' ? <Moon size={14} /> : <Sun size={14} />}
                  {themeMode === 'light' ? t('dossier.viewToolbar.darkMode') : t('dossier.viewToolbar.lightMode')}
                </button>
                <div className="h-px bg-border-default my-1" />
                <button
                  onClick={() => { setShortcutsOpen(true); setHeaderMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-tertiary"
                >
                  <Keyboard size={14} />
                  {t('dossier.header.shortcuts')}
                </button>
                <a
                  href="https://doc.zeroneurone.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-tertiary"
                  onClick={() => setHeaderMenuOpen(false)}
                >
                  <BookOpen size={14} />
                  {t('dossier.header.documentation')}
                </a>
                <a
                  href="https://github.com/MeltingBot/zeroneurone"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-tertiary"
                  onClick={() => setHeaderMenuOpen(false)}
                >
                  <Github size={14} />
                  GitHub
                </a>
                <a
                  href="https://ko-fi.com/yannpilpre"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-tertiary"
                  onClick={() => setHeaderMenuOpen(false)}
                >
                  <Coffee size={14} />
                  {t('dossier.header.supportKofi')}
                </a>
              </div>
            )}
          </div>

          {headerPlugins.map((PluginComponent, i) => <PluginComponent key={`hp-${i}`} />)}

          <LanguageSwitcher size="sm" />
        </div>
      </header>

      {/* Main content */}
      <div className={`flex-1 flex overflow-hidden ${
        panelSide === 'bottom' ? 'flex-col' :
        panelSide === 'left' ? 'flex-row-reverse' :
        'flex-row'
      }`}>
        {/* Main view */}
        <main className="flex-1 relative bg-bg-secondary flex flex-col min-h-0 min-w-0">
          <TabBar dossierId={currentDossier.id} />
          <div className="flex-1 relative min-h-0">
            {renderMainView()}
          </div>
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

      {/* Import modal (simplified for current dossier) */}
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
        title={t('dossier.collab.leaveTitle')}
        width="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCollabLeaveWarning(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button variant="primary" onClick={handleConfirmLeave}>
              {t('dossier.collab.leave')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">
          {t('dossier.collab.leaveMessage')}
        </p>
        <p className="text-sm text-text-secondary mt-2">
          {t('dossier.collab.rejoinMessage')}
        </p>
      </Modal>
    </Layout>
  );
}
