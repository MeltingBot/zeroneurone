import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Network,
  Star,
  GitBranch,
  CircleOff,
  Copy,
  Loader2,
  ChevronRight,
  ChevronDown,
  MousePointer2,
  EyeOff,
  Eye,
  Filter,
  Route,
  X,
  ArrowRight,
  Merge,
  Search,
  Group,
  Ungroup,
} from 'lucide-react';
import { useInvestigationStore, useInsightsStore, useSelectionStore, useViewStore } from '../../stores';
import { StatsOverview } from './StatsOverview';
import { ProgressiveList } from '../common/ProgressiveList';
import type { Element } from '../../types';

export function InsightsPanel() {
  const { t, i18n } = useTranslation('panels');
  const { elements, links, createGroup, dissolveGroup } = useInvestigationStore();
  const { selectElement, selectElements, clearSelection, selectedElementIds } = useSelectionStore();
  const { hideElements, hiddenElementIds, showElement, setFilters, clearFilters } = useViewStore();
  const {
    clusters,
    centrality,
    bridges,
    isolated,
    similarLabels,
    computedAt,
    isComputing,
    highlightedElementIds,
    highlightType,
    selectedClusterId,
    pathResults,
    // pathFromId, // Currently unused - for path finding UI
    // pathToId,
    computeInsights,
    highlightCluster,
    highlightCentralElement,
    highlightBridges,
    highlightIsolated,
    highlightSimilarPair,
    findPaths,
    clearHighlight,
    clearPaths,
  } = useInsightsStore();

  // Local state for expanded sections
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['clusters', 'centrality'])
  );

  // Path finding state
  const [pathMode, setPathMode] = useState(false);
  const [pathFrom, setPathFrom] = useState<string | null>(null);
  const [pathTo, setPathTo] = useState<string | null>(null);

  // Auto-compute insights when data changes (debounced)
  useEffect(() => {
    if (elements.length === 0) return;

    const timer = setTimeout(() => {
      computeInsights(elements, links);
    }, 300);

    return () => clearTimeout(timer);
  }, [elements, links, computeInsights]);

  // Toggle section expansion
  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  // Handle stat click from overview
  const handleStatClick = useCallback((stat: string) => {
    switch (stat) {
      case 'clusters':
        setExpandedSections((prev) => new Set([...prev, 'clusters']));
        break;
      case 'isolated':
        highlightIsolated();
        setExpandedSections((prev) => new Set([...prev, 'isolated']));
        break;
      case 'bridges':
        highlightBridges();
        setExpandedSections((prev) => new Set([...prev, 'bridges']));
        break;
      case 'duplicates':
        setExpandedSections((prev) => new Set([...prev, 'similar']));
        break;
    }
  }, [highlightIsolated, highlightBridges]);

  // Cluster actions
  const handleClusterClick = useCallback(
    (clusterId: number) => {
      if (selectedClusterId === clusterId) {
        clearHighlight();
      } else {
        highlightCluster(clusterId);
      }
    },
    [selectedClusterId, highlightCluster, clearHighlight]
  );

  const handleSelectCluster = useCallback(
    (elementIds: string[]) => {
      selectElements(elementIds);
    },
    [selectElements]
  );

  const handleFilterCluster = useCallback(
    (elementIds: string[]) => {
      // Get tags from cluster elements to filter
      const clusterElements = elements.filter((el) => elementIds.includes(el.id));
      const clusterTags = new Set<string>();
      clusterElements.forEach((el) => el.tags.forEach((tag) => clusterTags.add(tag)));

      if (clusterTags.size > 0) {
        clearFilters();
        setFilters({ includeTags: Array.from(clusterTags) });
      }
    },
    [elements, clearFilters, setFilters]
  );

  // Create a visual group from cluster elements
  const handleGroupCluster = useCallback(
    async (elementIds: string[], clusterId: number) => {
      const clusterElements = elements.filter(
        (el) => elementIds.includes(el.id) && !el.isGroup && !el.parentGroupId
      );
      if (clusterElements.length < 2) return;

      const padding = 40;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const el of clusterElements) {
        const w = el.visual.customWidth || 120;
        const h = el.visual.customHeight || 60;
        minX = Math.min(minX, el.position.x);
        minY = Math.min(minY, el.position.y);
        maxX = Math.max(maxX, el.position.x + w);
        maxY = Math.max(maxY, el.position.y + h);
      }

      const groupPos = { x: minX - padding, y: minY - padding };
      const groupSize = {
        width: maxX - minX + padding * 2,
        height: maxY - minY + padding * 2,
      };

      await createGroup(t('insights.clusters.name', { id: clusterId + 1 }), groupPos, groupSize, clusterElements.map(el => el.id));
    },
    [elements, createGroup, t]
  );

  // Check if all elements in a list are hidden
  const areAllHidden = useCallback(
    (elementIds: string[]) => {
      return elementIds.length > 0 && elementIds.every((id) => hiddenElementIds.has(id));
    },
    [hiddenElementIds]
  );

  // Check if all elements in a list are selected
  const areAllSelected = useCallback(
    (elementIds: string[]) => {
      return elementIds.length > 0 && elementIds.every((id) => selectedElementIds.has(id));
    },
    [selectedElementIds]
  );

  // Find the group that contains all cluster elements (if any)
  const getClusterGroupId = useCallback(
    (elementIds: string[]): string | null => {
      const clusterElements = elements.filter(
        (el) => elementIds.includes(el.id) && !el.isGroup
      );
      if (clusterElements.length === 0) return null;
      const firstParent = clusterElements[0].parentGroupId;
      if (!firstParent) return null;
      // All cluster elements must share the same parent group
      if (clusterElements.every((el) => el.parentGroupId === firstParent)) {
        return firstParent;
      }
      return null;
    },
    [elements]
  );

  // Toggle visibility for a group of elements
  const toggleHideElements = useCallback(
    (elementIds: string[]) => {
      const allHidden = areAllHidden(elementIds);
      if (allHidden) {
        // Show all elements
        elementIds.forEach((id) => showElement(id));
      } else {
        // Hide all elements
        hideElements(elementIds);
      }
    },
    [areAllHidden, hideElements, showElement]
  );

  // Central element actions
  const handleCentralClick = useCallback(
    (elementId: string) => {
      highlightCentralElement(elementId);
      selectElement(elementId);
    },
    [highlightCentralElement, selectElement]
  );

  // Bridge actions
  const handleBridgesClick = useCallback(() => {
    if (highlightType === 'bridge') {
      clearHighlight();
    } else {
      highlightBridges();
    }
  }, [highlightType, highlightBridges, clearHighlight]);

  const handleSelectBridges = useCallback(() => {
    selectElements(bridges);
  }, [bridges, selectElements]);

  const handleToggleHideBridges = useCallback(() => {
    toggleHideElements(bridges);
  }, [bridges, toggleHideElements]);

  // Isolated actions
  const handleIsolatedClick = useCallback(() => {
    if (highlightType === 'isolated') {
      clearHighlight();
    } else {
      highlightIsolated();
    }
  }, [highlightType, highlightIsolated, clearHighlight]);

  const handleSelectIsolated = useCallback(() => {
    selectElements(isolated);
  }, [isolated, selectElements]);

  const handleToggleHideIsolated = useCallback(() => {
    toggleHideElements(isolated);
  }, [isolated, toggleHideElements]);

  // Similar labels actions
  const handleSimilarClick = useCallback(
    (elementId1: string, elementId2: string) => {
      highlightSimilarPair(elementId1, elementId2);
      selectElements([elementId1, elementId2]);
    },
    [highlightSimilarPair, selectElements]
  );

  // Path finding
  const handleStartPathFinding = useCallback(() => {
    setPathMode(true);
    setPathFrom(null);
    setPathTo(null);
    clearPaths();
  }, [clearPaths]);

  const handleCancelPathFinding = useCallback(() => {
    setPathMode(false);
    setPathFrom(null);
    setPathTo(null);
    clearPaths();
    clearHighlight();
  }, [clearPaths, clearHighlight]);

  const handleSelectPathElement = useCallback(
    (elementId: string) => {
      if (!pathFrom) {
        setPathFrom(elementId);
      } else if (!pathTo && elementId !== pathFrom) {
        setPathTo(elementId);
        findPaths(pathFrom, elementId);
      }
    },
    [pathFrom, pathTo, findPaths]
  );

  // Get element label by ID
  const getElementLabel = useCallback(
    (elementId: string) => {
      const element = elements.find((el) => el.id === elementId);
      return element?.label || t('insights.noName');
    },
    [elements, t]
  );

  // Elements sorted by label for path finding dropdown
  const sortedElements = useMemo(() => {
    const locale = i18n.language === 'en' ? 'en' : 'fr';
    return [...elements].sort((a, b) =>
      (a.label || '').localeCompare(b.label || '', locale)
    );
  }, [elements, i18n.language]);

  const hasData = elements.length > 0;
  const hasInsights =
    clusters.length > 0 ||
    centrality.length > 0 ||
    bridges.length > 0 ||
    isolated.length > 0 ||
    similarLabels.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Stats Overview */}
      <StatsOverview
        onStatClick={handleStatClick}
        activeStat={highlightType}
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Computing indicator */}
        {isComputing && (
          <div className="flex items-center gap-2 p-4 text-sm text-text-secondary">
            <Loader2 size={14} className="animate-spin" />
            {t('insights.computing')}
          </div>
        )}

        {/* No data */}
        {!hasData && !isComputing && (
          <div className="text-center py-8 px-4">
            <p className="text-sm text-text-tertiary">
              {t('insights.noData')}
            </p>
          </div>
        )}

        {/* Path Finding Section */}
        <div className="border-b border-border-default">
          <div className="p-3">
            {!pathMode ? (
              <button
                onClick={handleStartPathFinding}
                disabled={elements.length < 2}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-bg-secondary hover:bg-bg-tertiary border border-border-default rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Route size={14} />
                {t('insights.paths.button')}
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text-secondary">
                    {t('insights.paths.title')}
                  </span>
                  <button
                    onClick={handleCancelPathFinding}
                    className="p-1 text-text-tertiary hover:text-text-primary"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* From selector */}
                <div className="space-y-1">
                  <label className="text-[10px] text-text-tertiary">{t('insights.paths.from')}</label>
                  <ElementAutocomplete
                    elements={sortedElements}
                    value={pathFrom}
                    onChange={(id) => {
                      if (id) {
                        handleSelectPathElement(id);
                      } else {
                        setPathFrom(null);
                        setPathTo(null);
                        clearPaths();
                      }
                    }}
                    placeholder={t('insights.paths.searchPlaceholder')}
                    noNameLabel={t('insights.noName')}
                    noResultsLabel={t('insights.noResults')}
                  />
                </div>

                {/* To selector */}
                <div className="space-y-1">
                  <label className="text-[10px] text-text-tertiary">{t('insights.paths.to')}</label>
                  <ElementAutocomplete
                    elements={sortedElements}
                    excludeIds={pathFrom ? [pathFrom] : []}
                    value={pathTo}
                    onChange={(id) => {
                      if (pathFrom && id) {
                        setPathTo(id);
                        findPaths(pathFrom, id);
                      } else {
                        setPathTo(null);
                        clearPaths();
                      }
                    }}
                    placeholder={t('insights.paths.searchPlaceholder')}
                    noNameLabel={t('insights.noName')}
                    noResultsLabel={t('insights.noResults')}
                    disabled={!pathFrom}
                  />
                </div>

                {/* Path results */}
                {pathResults.length > 0 && (
                  <div className="mt-2 p-2 bg-accent/10 border border-accent/30 rounded">
                    <div className="text-xs text-accent font-medium mb-1">
                      {t('insights.paths.pathFound', { count: pathResults[0].length })}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 text-xs text-text-secondary">
                      {pathResults[0].path.map((nodeId, idx) => (
                        <span key={nodeId} className="flex items-center gap-1">
                          <span
                            className="px-1.5 py-0.5 bg-bg-primary rounded cursor-pointer hover:bg-bg-secondary"
                            onClick={() => selectElement(nodeId)}
                          >
                            {getElementLabel(nodeId)}
                          </span>
                          {idx < pathResults[0].path.length - 1 && (
                            <ArrowRight size={10} className="text-text-tertiary" />
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {pathFrom && pathTo && pathResults.length === 0 && (
                  <div className="mt-2 p-2 bg-warning/10 border border-warning/30 rounded">
                    <div className="text-xs text-warning">
                      {t('insights.paths.noPath')}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Insights sections */}
        {hasInsights && !isComputing && (
          <div className="divide-y divide-border-default">
            {/* Clusters */}
            {clusters.length > 0 && (
              <InsightSection
                id="clusters"
                title={t('insights.clusters.title')}
                icon={<Network size={12} />}
                count={clusters.length}
                isExpanded={expandedSections.has('clusters')}
                onToggle={() => toggleSection('clusters')}
              >
                <ProgressiveList
                  items={clusters}
                  initialCount={10}
                  increment={10}
                  className="space-y-1"
                  renderItem={(cluster) => (
                    <div
                      key={cluster.id}
                      className={`p-2 rounded border transition-colors ${
                        selectedClusterId === cluster.id
                          ? 'bg-accent/10 border-accent'
                          : 'border-transparent hover:bg-bg-secondary'
                      }`}
                    >
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => handleClusterClick(cluster.id)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-text-primary">
                            {t('insights.clusters.name', { id: cluster.id + 1 })}
                          </span>
                          <span className="text-xs text-text-tertiary">
                            {t('insights.clusters.elements', { count: cluster.size })}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap gap-1 mt-2">
                        <ActionButton
                          icon={areAllSelected(cluster.elementIds) ? <X size={10} /> : <MousePointer2 size={10} />}
                          label={areAllSelected(cluster.elementIds) ? t('insights.clusters.actions.deselect') : t('insights.clusters.actions.select')}
                          onClick={() => {
                            if (areAllSelected(cluster.elementIds)) {
                              clearSelection();
                            } else {
                              handleSelectCluster(cluster.elementIds);
                            }
                          }}
                        />
                        <ActionButton
                          icon={areAllHidden(cluster.elementIds) ? <Eye size={10} /> : <EyeOff size={10} />}
                          label={areAllHidden(cluster.elementIds) ? t('insights.clusters.actions.show') : t('insights.clusters.actions.hide')}
                          onClick={() => toggleHideElements(cluster.elementIds)}
                        />
                        <ActionButton
                          icon={<Filter size={10} />}
                          label={t('insights.clusters.actions.filter')}
                          onClick={() => handleFilterCluster(cluster.elementIds)}
                        />
                        {(() => {
                          const groupId = getClusterGroupId(cluster.elementIds);
                          return groupId ? (
                            <ActionButton
                              icon={<Ungroup size={10} />}
                              label={t('insights.clusters.actions.dissolve')}
                              onClick={() => dissolveGroup(groupId)}
                            />
                          ) : (
                            <ActionButton
                              icon={<Group size={10} />}
                              label={t('insights.clusters.actions.group')}
                              onClick={() => handleGroupCluster(cluster.elementIds, cluster.id)}
                            />
                          );
                        })()}
                      </div>
                    </div>
                  )}
                />
              </InsightSection>
            )}

            {/* Most connected (centrality) */}
            {centrality.length > 0 && (
              <InsightSection
                id="centrality"
                title={t('insights.centrality.title')}
                icon={<Star size={12} />}
                count={centrality.length}
                isExpanded={expandedSections.has('centrality')}
                onToggle={() => toggleSection('centrality')}
              >
                <div className="space-y-1">
                  {centrality.slice(0, 5).map((item) => (
                    <div
                      key={item.elementId}
                      className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                        highlightedElementIds.has(item.elementId) &&
                        highlightType === 'centrality'
                          ? 'bg-accent/10 border border-accent'
                          : 'hover:bg-bg-secondary border border-transparent'
                      }`}
                      onClick={() => handleCentralClick(item.elementId)}
                    >
                      <span className="text-sm text-text-primary truncate flex-1">
                        {getElementLabel(item.elementId)}
                      </span>
                      <span className="text-xs text-text-tertiary ml-2 tabular-nums">
                        {t('insights.links', { count: item.degree })}
                      </span>
                    </div>
                  ))}
                </div>
              </InsightSection>
            )}

            {/* Bridges */}
            {bridges.length > 0 && (
              <InsightSection
                id="bridges"
                title={t('insights.bridges.title')}
                icon={<GitBranch size={12} />}
                count={bridges.length}
                isExpanded={expandedSections.has('bridges')}
                onToggle={() => toggleSection('bridges')}
                description={t('insights.bridges.description')}
              >
                <div className="space-y-2">
                  <button
                    onClick={handleBridgesClick}
                    className={`w-full p-2 text-xs rounded transition-colors text-left ${
                      highlightType === 'bridge'
                        ? 'bg-accent/10 border border-accent text-accent'
                        : 'hover:bg-bg-secondary border border-transparent text-text-primary'
                    }`}
                  >
                    {highlightType === 'bridge' ? t('insights.bridges.hideBridges') : t('insights.bridges.showBridges')}
                  </button>

                  <div className="flex gap-1">
                    <ActionButton
                      icon={<MousePointer2 size={10} />}
                      label={t('insights.bridges.selectAll')}
                      onClick={handleSelectBridges}
                    />
                    <ActionButton
                      icon={areAllHidden(bridges) ? <Eye size={10} /> : <EyeOff size={10} />}
                      label={areAllHidden(bridges) ? t('insights.bridges.showAll') : t('insights.bridges.hideAll')}
                      onClick={handleToggleHideBridges}
                    />
                  </div>

                  {/* List bridge elements */}
                  <ProgressiveList
                    items={bridges}
                    initialCount={20}
                    increment={20}
                    className="space-y-1"
                    renderItem={(bridgeId) => (
                      <div
                        key={bridgeId}
                        className="px-2 py-1 text-xs text-text-secondary hover:bg-bg-secondary rounded cursor-pointer"
                        onClick={() => {
                          selectElement(bridgeId);
                          highlightCentralElement(bridgeId);
                        }}
                      >
                        {getElementLabel(bridgeId)}
                      </div>
                    )}
                  />
                </div>
              </InsightSection>
            )}

            {/* Isolated */}
            {isolated.length > 0 && (
              <InsightSection
                id="isolated"
                title={t('insights.isolated.title')}
                icon={<CircleOff size={12} />}
                count={isolated.length}
                isExpanded={expandedSections.has('isolated')}
                onToggle={() => toggleSection('isolated')}
                description={t('insights.isolated.description')}
              >
                <div className="space-y-2">
                  <button
                    onClick={handleIsolatedClick}
                    className={`w-full p-2 text-xs rounded transition-colors text-left ${
                      highlightType === 'isolated'
                        ? 'bg-accent/10 border border-accent text-accent'
                        : 'hover:bg-bg-secondary border border-transparent text-text-primary'
                    }`}
                  >
                    {highlightType === 'isolated' ? t('insights.isolated.hideIsolated') : t('insights.isolated.showIsolated')}
                  </button>

                  <div className="flex gap-1">
                    <ActionButton
                      icon={<MousePointer2 size={10} />}
                      label={t('insights.isolated.selectAll')}
                      onClick={handleSelectIsolated}
                    />
                    <ActionButton
                      icon={areAllHidden(isolated) ? <Eye size={10} /> : <EyeOff size={10} />}
                      label={areAllHidden(isolated) ? t('insights.isolated.showAll') : t('insights.isolated.hideAll')}
                      onClick={handleToggleHideIsolated}
                    />
                  </div>

                  {/* List isolated elements */}
                  <ProgressiveList
                    items={isolated}
                    initialCount={20}
                    increment={20}
                    className="space-y-1"
                    renderItem={(isolatedId) => (
                      <div
                        key={isolatedId}
                        className="px-2 py-1 text-xs text-text-secondary hover:bg-bg-secondary rounded cursor-pointer"
                        onClick={() => selectElement(isolatedId)}
                      >
                        {getElementLabel(isolatedId)}
                      </div>
                    )}
                  />
                </div>
              </InsightSection>
            )}

            {/* Similar labels */}
            {similarLabels.length > 0 && (
              <InsightSection
                id="similar"
                title={t('insights.similar.title')}
                icon={<Copy size={12} />}
                count={similarLabels.length}
                isExpanded={expandedSections.has('similar')}
                onToggle={() => toggleSection('similar')}
                description={t('insights.similar.description')}
              >
                <ProgressiveList
                  items={similarLabels}
                  initialCount={10}
                  increment={10}
                  className="space-y-1"
                  renderItem={(pair, index) => (
                    <div
                      key={index}
                      className="p-2 rounded hover:bg-bg-secondary transition-colors"
                    >
                      <div
                        className="flex items-center gap-1 text-xs text-text-primary cursor-pointer"
                        onClick={() => handleSimilarClick(pair.elementId1, pair.elementId2)}
                      >
                        <span className="truncate max-w-[100px]">
                          {getElementLabel(pair.elementId1)}
                        </span>
                        <span className="text-text-tertiary">≈</span>
                        <span className="truncate max-w-[100px]">
                          {getElementLabel(pair.elementId2)}
                        </span>
                        <span className="ml-auto text-[10px] text-text-tertiary tabular-nums">
                          {Math.round(pair.similarity * 100)}%
                        </span>
                      </div>
                      <div className="flex gap-1 mt-1">
                        <ActionButton
                          icon={<MousePointer2 size={10} />}
                          label={t('insights.similar.select')}
                          onClick={() => handleSimilarClick(pair.elementId1, pair.elementId2)}
                        />
                        <ActionButton
                          icon={<Merge size={10} />}
                          label={t('insights.similar.merge')}
                          onClick={() => {
                            selectElements([pair.elementId1, pair.elementId2]);
                          }}
                          disabled
                        />
                      </div>
                    </div>
                  )}
                />
              </InsightSection>
            )}
          </div>
        )}

        {/* No insights found */}
        {hasData && !hasInsights && !isComputing && (
          <div className="text-center py-8 px-4">
            <p className="text-sm text-text-tertiary">
              {t('insights.noInsights')}
            </p>
          </div>
        )}

        {/* Last computed */}
        {computedAt && (
          <div className="p-3 border-t border-border-default">
            <p className="text-[10px] text-text-tertiary text-center">
              {t('insights.lastComputed')}{' '}
              {computedAt.toLocaleString(i18n.language === 'en' ? 'en-US' : 'fr-FR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Insight Section Component
interface InsightSectionProps {
  id: string;
  title: string;
  icon: React.ReactNode;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  description?: string;
  children: React.ReactNode;
}

function InsightSection({
  title,
  icon,
  count,
  isExpanded,
  onToggle,
  description,
  children,
}: InsightSectionProps) {
  return (
    <section>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-3 hover:bg-bg-secondary transition-colors"
      >
        {isExpanded ? (
          <ChevronDown size={12} className="text-text-tertiary" />
        ) : (
          <ChevronRight size={12} className="text-text-tertiary" />
        )}
        <span className="text-text-secondary">{icon}</span>
        <span className="text-xs font-medium text-text-primary flex-1 text-left">
          {title}
        </span>
        <span className="text-[10px] bg-bg-tertiary text-text-secondary px-1.5 py-0.5 rounded">
          {count}
        </span>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3">
          {description && (
            <p className="text-[10px] text-text-tertiary mb-2">{description}</p>
          )}
          {children}
        </div>
      )}
    </section>
  );
}

// Action Button Component
interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

function ActionButton({ icon, label, onClick, disabled }: ActionButtonProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      className="flex items-center gap-1 px-2 py-1 text-[10px] text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      title={label}
    >
      {icon}
      {label}
    </button>
  );
}

// Element Autocomplete Component
interface ElementAutocompleteProps {
  elements: Element[];
  excludeIds?: string[];
  value: string | null;
  onChange: (elementId: string) => void;
  placeholder?: string;
  noNameLabel?: string;
  noResultsLabel?: string;
  disabled?: boolean;
}

function ElementAutocomplete({
  elements,
  excludeIds = [],
  value,
  onChange,
  placeholder,
  noNameLabel = 'Unnamed',
  noResultsLabel = 'No results',
  disabled = false,
}: ElementAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Get selected element label
  const selectedElement = useMemo(
    () => elements.find((el) => el.id === value),
    [elements, value]
  );

  // Filter elements based on query
  const filteredElements = useMemo(() => {
    const available = elements.filter((el) => !excludeIds.includes(el.id));
    if (!query.trim()) return available.slice(0, 50); // Show first 50 when no query

    const lowerQuery = query.toLowerCase();
    return available
      .filter((el) => {
        const label = (el.label || '').toLowerCase();
        return label.includes(lowerQuery);
      })
      .slice(0, 50);
  }, [elements, excludeIds, query]);

  // Reset highlighted index when filtered list changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredElements.length]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlightedEl = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedEl) {
        highlightedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  // Reset editing state when value changes externally
  useEffect(() => {
    if (value) {
      setIsEditing(false);
      setQuery('');
    }
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    setIsOpen(true);
    // If user starts typing while a value is selected, clear the selection
    if (value && !isEditing) {
      setIsEditing(true);
      onChange('');
    }
  };

  const handleInputFocus = () => {
    setIsOpen(true);
    // If there's a selected value, switch to editing mode to allow search
    if (value) {
      setIsEditing(true);
      setQuery('');
    }
  };

  const handleInputBlur = () => {
    // Delay to allow click on dropdown item
    setTimeout(() => {
      setIsOpen(false);
      // If was editing but nothing selected, reset editing state
      if (isEditing && !value) {
        setIsEditing(false);
      }
    }, 150);
  };

  const handleSelect = (elementId: string) => {
    onChange(elementId);
    setQuery('');
    setIsOpen(false);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredElements.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredElements[highlightedIndex]) {
          handleSelect(filteredElements[highlightedIndex].id);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setQuery('');
        setIsEditing(false);
        break;
    }
  };

  const handleClear = () => {
    setQuery('');
    setIsEditing(false);
    onChange('');
    inputRef.current?.focus();
  };

  // Determine what to display in the input
  const displayValue = isEditing ? query : (value ? (selectedElement?.label || noNameLabel) : query);
  const showDropdown = isOpen && (isEditing || !value);

  return (
    <div className="relative">
      <div className="relative">
        <Search
          size={12}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary"
        />
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full pl-7 pr-7 py-1.5 text-xs bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent disabled:opacity-50 ${
            value && !isEditing ? 'text-text-primary font-medium' : ''
          }`}
        />
        {(value || query) && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && filteredElements.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto bg-bg-primary border border-border-default rounded shadow-lg"
        >
          {filteredElements.map((el, index) => (
            <div
              key={el.id}
              onClick={() => handleSelect(el.id)}
              className={`px-3 py-2 text-xs cursor-pointer transition-colors ${
                index === highlightedIndex
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-primary hover:bg-bg-secondary'
              }`}
            >
              {el.label || noNameLabel}
            </div>
          ))}
        </div>
      )}

      {/* No results */}
      {showDropdown && query && filteredElements.length === 0 && (
        <div className="absolute z-50 w-full mt-1 px-3 py-2 bg-bg-primary border border-border-default rounded shadow-lg">
          <span className="text-xs text-text-tertiary">{noResultsLabel}</span>
        </div>
      )}
    </div>
  );
}
