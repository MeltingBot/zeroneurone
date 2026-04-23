import { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useSelectionStore, useDossierStore, useViewStore, useInsightsStore, useUIStore, useQueryStore } from '../../stores';
import { ElementDetail } from './ElementDetail';
import { LinkDetail } from './LinkDetail';
import { MultiSelectionDetail } from './MultiSelectionDetail';
import { DossierDetail } from './DossierDetail';
import { FiltersPanel } from './FiltersPanel';
import { ViewsPanel } from './ViewsPanel';
import { InsightsPanel } from './InsightsPanel';
import { ReportPanel } from './ReportPanel';
import { QueryPanel } from './QueryPanel';
import { Info, Filter, Eye, Network, PanelRightClose, FileText, Code2, icons } from 'lucide-react';
import { IconButton } from '../common';
import { usePlugins } from '../../plugins/usePlugins';
import { useDetachedWindow } from '../../hooks/useDetachedWindow';

const MIN_WIDTH = 360;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 420;
const WIDTH_STORAGE_KEY = 'zeroneurone:sidepanel-width';

const MIN_HEIGHT = 200;
const MAX_HEIGHT = 500;
const DEFAULT_HEIGHT = 300;
const HEIGHT_STORAGE_KEY = 'zeroneurone:sidepanel-height';

type TabId = 'detail' | 'insights' | 'filters' | 'query' | 'views' | 'report' | (string & {});

interface Tab {
  id: TabId;
  label: string;
  icon: typeof Info;
  badge?: boolean;
}

export function SidePanel() {
  const { t } = useTranslation('panels');
  const { t: tCommon } = useTranslation('common');
  const selectedElementIds = useSelectionStore((s) => s.selectedElementIds);
  const selectedLinkIds = useSelectionStore((s) => s.selectedLinkIds);
  const elements = useDossierStore((s) => s.elements);
  const links = useDossierStore((s) => s.links);
  const currentDossier = useDossierStore((s) => s.currentDossier);
  const hasActiveFilters = useViewStore((s) => s.hasActiveFilters);
  const displayMode = useViewStore((s) => s.displayMode);
  const highlightedElementIds = useInsightsStore((s) => s.highlightedElementIds);
  const queryFilterActive = useQueryStore((s) => s.isFilterActive);
  const panelSide = useUIStore((s) => s.panelSide);
  const setPanelSide = useUIStore((s) => s.setPanelSide);
  const activeTab = useUIStore((s) => s.sidePanelTab) as TabId;
  const setActiveTab = useUIStore((s) => s.setSidePanelTab);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [width, setWidth] = useState(() => {
    const stored = localStorage.getItem(WIDTH_STORAGE_KEY);
    if (stored) {
      const n = parseInt(stored, 10);
      if (n >= MIN_WIDTH && n <= MAX_WIDTH) return n;
    }
    return DEFAULT_WIDTH;
  });
  const [height, setHeight] = useState(() => {
    const stored = localStorage.getItem(HEIGHT_STORAGE_KEY);
    if (stored) {
      const n = parseInt(stored, 10);
      if (n >= MIN_HEIGHT && n <= MAX_HEIGHT) return n;
    }
    return DEFAULT_HEIGHT;
  });
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  const isBottom = panelSide === 'bottom';
  const isDetached = panelSide === 'detached';

  // Reset collapsed state when dock mode changes
  useEffect(() => {
    setIsCollapsed(false);
  }, [panelSide]);

  // Detached window
  const detachedContainer = useDetachedWindow(isDetached, () => setPanelSide('right'));

  // Handle resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!panelRef.current) return;
      const containerRect = panelRef.current.parentElement?.getBoundingClientRect();
      if (!containerRect) return;

      const side = useUIStore.getState().panelSide;
      if (side === 'bottom') {
        const newHeight = containerRect.bottom - e.clientY;
        setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, newHeight)));
      } else {
        const newWidth = side === 'left'
          ? e.clientX - containerRect.left
          : containerRect.right - e.clientX;
        setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)));
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      const side = useUIStore.getState().panelSide;
      if (side === 'bottom') {
        setHeight((h) => {
          localStorage.setItem(HEIGHT_STORAGE_KEY, String(h));
          return h;
        });
      } else {
        setWidth((w) => {
          localStorage.setItem(WIDTH_STORAGE_KEY, String(w));
          return w;
        });
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const selectedElements = useMemo(
    () => elements.filter((el) => selectedElementIds.has(el.id)),
    [elements, selectedElementIds]
  );
  const selectedLinks = useMemo(
    () => links.filter((link) => selectedLinkIds.has(link.id)),
    [links, selectedLinkIds]
  );
  const totalSelected = selectedElements.length + selectedLinks.length;

  // Blur any focused input in the panel when selection is cleared
  useEffect(() => {
    if (totalSelected === 0 && panelRef.current) {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && panelRef.current.contains(activeElement)) {
        activeElement.blur();
      }
    }
  }, [totalSelected]);

  const panelPlugins = usePlugins('panel:right');
  const filtersActive = hasActiveFilters();
  const insightsActive = highlightedElementIds.size > 0;
  const isCanvasMode = displayMode === 'canvas';

  // Switch away from views tab when leaving canvas mode
  useEffect(() => {
    if (!isCanvasMode && activeTab === 'views') {
      setActiveTab('detail');
    }
  }, [isCanvasMode, activeTab]);

  // Switch away from removed plugin tabs
  useEffect(() => {
    const builtinIds = ['detail', 'insights', 'filters', 'query', 'views', 'report'];
    if (!builtinIds.includes(activeTab) && !panelPlugins.some((p) => p.id === activeTab)) {
      setActiveTab('detail');
    }
  }, [panelPlugins, activeTab]);

  const tabs: Tab[] = [
    { id: 'detail', label: t('tabs.detail'), icon: Info },
    { id: 'insights', label: t('tabs.insights'), icon: Network, badge: insightsActive },
    { id: 'filters', label: t('tabs.filters'), icon: Filter, badge: filtersActive },
    { id: 'query', label: t('tabs.query'), icon: Code2, badge: queryFilterActive },
    ...(isCanvasMode ? [{ id: 'views' as TabId, label: t('tabs.views'), icon: Eye }] : []),
    { id: 'report', label: t('tabs.report'), icon: FileText },
    ...panelPlugins.map((p) => ({
      id: p.id as TabId,
      label: p.label,
      icon: icons[p.icon as keyof typeof icons] || Info,
    })),
  ];

  // Render detail content based on selection
  const renderDetailContent = () => {
    if (totalSelected === 0) {
      if (currentDossier) {
        return (
          <div className="flex-1 overflow-y-auto">
            <DossierDetail dossier={currentDossier} />
          </div>
        );
      }
      return (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-text-tertiary text-center">
            {tCommon('empty.noDossierLoaded')}
          </p>
        </div>
      );
    }

    if (totalSelected > 1) {
      return (
        <div className="flex-1 overflow-y-auto">
          <MultiSelectionDetail />
        </div>
      );
    }

    if (selectedElements.length === 1) {
      return (
        <div className="flex-1 overflow-y-auto">
          <ElementDetail key={selectedElements[0].id} element={selectedElements[0]} />
        </div>
      );
    }

    if (selectedLinks.length === 1) {
      return (
        <div className="flex-1 overflow-y-auto">
          <LinkDetail link={selectedLinks[0]} />
        </div>
      );
    }

    return null;
  };

  // Render tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'detail':
        return renderDetailContent();
      case 'insights':
        return (
          <div className="flex-1 overflow-y-auto">
            <InsightsPanel />
          </div>
        );
      case 'filters':
        return (
          <div className="flex-1 overflow-y-auto">
            <FiltersPanel />
          </div>
        );
      case 'query':
        return (
          <div className="flex-1 overflow-y-auto">
            <QueryPanel />
          </div>
        );
      case 'views':
        return (
          <div className="flex-1 overflow-y-auto">
            <ViewsPanel />
          </div>
        );
      case 'report':
        return <ReportPanel />;
      default: {
        const plugin = panelPlugins.find((p) => p.id === activeTab);
        if (plugin) {
          const PluginComponent = plugin.component;
          return (
            <div className="flex-1 overflow-y-auto">
              <PluginComponent dossierId={currentDossier?.id || ''} />
            </div>
          );
        }
        return null;
      }
    }
  };

  // --- Collapsed mode ---
  if (isCollapsed && !isDetached) {
    if (isBottom) {
      return (
        <aside className="h-8 border-t border-border-default bg-bg-primary flex items-center">
          <div className="flex items-center px-2 gap-0.5">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setIsCollapsed(false);
                  }}
                  className={`relative p-1.5 rounded transition-colors ${
                    activeTab === tab.id
                      ? 'bg-accent/10 text-accent'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
                  }`}
                  title={tab.label}
                >
                  <Icon size={16} />
                  {tab.badge && (
                    <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-accent rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        </aside>
      );
    }

    return (
      <aside className={`w-12 ${panelSide === 'left' ? 'border-r' : 'border-l'} border-border-default bg-bg-primary flex flex-col`}>
        <div className="flex flex-col items-center py-2 gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setIsCollapsed(false);
                }}
                className={`relative p-2 rounded transition-colors ${
                  activeTab === tab.id
                    ? 'bg-accent/10 text-accent'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
                }`}
                title={tab.label}
              >
                <Icon size={18} />
                {tab.badge && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-accent rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </aside>
    );
  }

  // --- Panel body (shared between docked and detached) ---
  const panelBody = (
    <aside
      ref={isDetached ? undefined : panelRef}
      className={`${
        isBottom ? 'border-t' :
        isDetached ? '' :
        panelSide === 'left' ? 'border-r' : 'border-l'
      } border-border-default bg-bg-primary flex flex-col overflow-hidden relative${
        isDetached ? ' h-full' : ''
      }`}
      style={isDetached ? undefined : isBottom ? { height: `${height}px` } : { width: `${width}px` }}
      data-testid="detail-panel"
    >
      {/* Resize handle (not shown when detached) */}
      {!isDetached && (
        <div
          onMouseDown={handleMouseDown}
          className={`absolute ${
            isBottom
              ? 'top-0 left-0 right-0 h-1 cursor-ns-resize'
              : `${panelSide === 'left' ? 'right-0' : 'left-0'} top-0 bottom-0 w-1 cursor-ew-resize`
          } hover:bg-accent/30 transition-colors z-10 ${
            isResizing ? 'bg-accent/50' : ''
          }`}
        />
      )}

      {/* Header with tabs */}
      <header className="border-b border-border-default shrink-0">
        <div className="flex items-center h-10 px-1 overflow-hidden">
          <div className="flex items-center gap-0.5 flex-1 min-w-0">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  title={tab.label}
                  className={`relative flex items-center gap-1 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-accent/10 text-accent px-2'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary px-1.5'
                  }`}
                >
                  <Icon size={14} />
                  {isActive && tab.label}
                  {tab.badge && (
                    <span className="w-1.5 h-1.5 bg-accent rounded-full" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Collapse button (not in detached mode) */}
          {!isDetached && (
            <div className="ml-auto shrink-0">
              <IconButton onClick={() => setIsCollapsed(true)} title={t('tabs.collapsePanel')}>
                <PanelRightClose size={14} />
              </IconButton>
            </div>
          )}
        </div>
      </header>

      {/* Tab content */}
      {renderTabContent()}
    </aside>
  );

  // --- Detached mode: render into popup window ---
  if (isDetached) {
    if (!detachedContainer) return null;
    return createPortal(panelBody, detachedContainer);
  }

  return panelBody;
}
