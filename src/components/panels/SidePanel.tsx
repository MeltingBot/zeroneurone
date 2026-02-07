import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelectionStore, useInvestigationStore, useViewStore, useInsightsStore } from '../../stores';
import { ElementDetail } from './ElementDetail';
import { LinkDetail } from './LinkDetail';
import { MultiSelectionDetail } from './MultiSelectionDetail';
import { InvestigationDetail } from './InvestigationDetail';
import { FiltersPanel } from './FiltersPanel';
import { ViewsPanel } from './ViewsPanel';
import { InsightsPanel } from './InsightsPanel';
import { ReportPanel } from './ReportPanel';
import { Info, Filter, Eye, Network, PanelRightClose, FileText } from 'lucide-react';
import { IconButton } from '../common';

const MIN_WIDTH = 360;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 400;

type TabId = 'detail' | 'insights' | 'filters' | 'views' | 'report';

interface Tab {
  id: TabId;
  label: string;
  icon: typeof Info;
  badge?: boolean;
}

export function SidePanel() {
  const { t } = useTranslation('panels');
  const { t: tCommon } = useTranslation('common');
  // Individual selectors — prevent re-renders when unrelated state changes
  const selectedElementIds = useSelectionStore((s) => s.selectedElementIds);
  const selectedLinkIds = useSelectionStore((s) => s.selectedLinkIds);
  const elements = useInvestigationStore((s) => s.elements);
  const links = useInvestigationStore((s) => s.links);
  const currentInvestigation = useInvestigationStore((s) => s.currentInvestigation);
  const hasActiveFilters = useViewStore((s) => s.hasActiveFilters);
  const displayMode = useViewStore((s) => s.displayMode);
  const highlightedElementIds = useInsightsStore((s) => s.highlightedElementIds);

  const [activeTab, setActiveTab] = useState<TabId>('detail');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

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

      // Calculate new width from the right edge
      const newWidth = containerRect.right - e.clientX;
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
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
  // This ensures keyboard events (like Delete) go to the canvas
  useEffect(() => {
    if (totalSelected === 0 && panelRef.current) {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && panelRef.current.contains(activeElement)) {
        activeElement.blur();
      }
    }
  }, [totalSelected]);

  const filtersActive = hasActiveFilters();
  const insightsActive = highlightedElementIds.size > 0;
  const isCanvasMode = displayMode === 'canvas';

  // Switch away from views tab when leaving canvas mode
  useEffect(() => {
    if (!isCanvasMode && activeTab === 'views') {
      setActiveTab('detail');
    }
  }, [isCanvasMode, activeTab]);

  const tabs: Tab[] = [
    { id: 'detail', label: t('tabs.detail'), icon: Info },
    { id: 'insights', label: t('tabs.insights'), icon: Network, badge: insightsActive },
    { id: 'filters', label: t('tabs.filters'), icon: Filter, badge: filtersActive },
    ...(isCanvasMode ? [{ id: 'views' as TabId, label: t('tabs.views'), icon: Eye }] : []),
    { id: 'report', label: t('tabs.report'), icon: FileText },
  ];

  if (isCollapsed) {
    return (
      <aside className="w-12 border-l border-border-default bg-bg-primary flex flex-col">
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

  // Render detail content based on selection
  const renderDetailContent = () => {
    // Nothing selected - show investigation details
    if (totalSelected === 0) {
      if (currentInvestigation) {
        return (
          <div className="flex-1 overflow-y-auto">
            <InvestigationDetail investigation={currentInvestigation} />
          </div>
        );
      }
      return (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-text-tertiary text-center">
            {tCommon('empty.noInvestigationLoaded')}
          </p>
        </div>
      );
    }

    // Multiple items selected - show bulk edit panel
    if (totalSelected > 1) {
      return (
        <div className="flex-1 overflow-y-auto">
          <MultiSelectionDetail />
        </div>
      );
    }

    // Single element selected
    if (selectedElements.length === 1) {
      return (
        <div className="flex-1 overflow-y-auto">
          <ElementDetail key={selectedElements[0].id} element={selectedElements[0]} />
        </div>
      );
    }

    // Single link selected
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
      case 'views':
        return (
          <div className="flex-1 overflow-y-auto">
            <ViewsPanel />
          </div>
        );
      case 'report':
        return <ReportPanel />;
      default:
        return null;
    }
  };

  return (
    <aside
      ref={panelRef}
      className="border-l border-border-default bg-bg-primary flex flex-col overflow-hidden relative"
      style={{ width: `${width}px` }}
      data-testid="detail-panel"
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={`absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-accent/30 transition-colors z-10 ${
          isResizing ? 'bg-accent/50' : ''
        }`}
      />

      {/* Header with tabs */}
      <header className="border-b border-border-default shrink-0">
        {/* Tab bar */}
        <div className="flex items-center h-10 px-1 overflow-hidden">
          {/* Tabs with labels */}
          <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto scrollbar-none">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-accent/10 text-accent'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
                  }`}
                >
                  <Icon size={14} />
                  {tab.label}
                  {tab.badge && (
                    <span className="w-1.5 h-1.5 bg-accent rounded-full" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Collapse button - always visible */}
          <div className="ml-auto shrink-0">
            <IconButton onClick={() => setIsCollapsed(true)} title={t('tabs.collapsePanel')}>
              <PanelRightClose size={14} />
            </IconButton>
          </div>
        </div>

      </header>

      {/* Tab content */}
      {renderTabContent()}
    </aside>
  );
}
