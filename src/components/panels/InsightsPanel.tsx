import { useCallback, useEffect } from 'react';
import {
  RefreshCw,
  Network,
  Star,
  GitBranch,
  CircleOff,
  Copy,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { useInvestigationStore, useInsightsStore, useSelectionStore } from '../../stores';

export function InsightsPanel() {
  const { elements, links } = useInvestigationStore();
  const { selectElement, selectElements } = useSelectionStore();
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
    computeInsights,
    highlightCluster,
    highlightCentralElement,
    highlightBridges,
    highlightIsolated,
    highlightSimilarPair,
    clearHighlight,
  } = useInsightsStore();

  // Compute insights on mount if not already computed
  useEffect(() => {
    if (!computedAt && elements.length > 0) {
      computeInsights(elements, links);
    }
  }, [elements, links, computedAt, computeInsights]);

  const handleRefresh = useCallback(() => {
    computeInsights(elements, links);
    clearHighlight();
  }, [elements, links, computeInsights, clearHighlight]);

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

  const handleCentralClick = useCallback(
    (elementId: string) => {
      highlightCentralElement(elementId);
      selectElement(elementId);
    },
    [highlightCentralElement, selectElement]
  );

  const handleBridgesClick = useCallback(() => {
    if (highlightType === 'bridge') {
      clearHighlight();
    } else {
      highlightBridges();
    }
  }, [highlightType, highlightBridges, clearHighlight]);

  const handleIsolatedClick = useCallback(() => {
    if (highlightType === 'isolated') {
      clearHighlight();
    } else {
      highlightIsolated();
    }
  }, [highlightType, highlightIsolated, clearHighlight]);

  const handleSimilarClick = useCallback(
    (elementId1: string, elementId2: string) => {
      highlightSimilarPair(elementId1, elementId2);
      selectElements([elementId1, elementId2]);
    },
    [highlightSimilarPair, selectElements]
  );

  // Get element label by ID
  const getElementLabel = useCallback(
    (elementId: string) => {
      const element = elements.find((el) => el.id === elementId);
      return element?.label || 'Sans nom';
    },
    [elements]
  );

  const hasData = elements.length > 0;
  const hasInsights =
    clusters.length > 0 ||
    centrality.length > 0 ||
    bridges.length > 0 ||
    isolated.length > 0 ||
    similarLabels.length > 0;

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network size={16} className="text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">Insights</h3>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isComputing || !hasData}
          className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded disabled:opacity-50 disabled:cursor-not-allowed"
          title="Recalculer les insights"
        >
          {isComputing ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <RefreshCw size={12} />
          )}
          Actualiser
        </button>
      </div>

      {/* Computing indicator */}
      {isComputing && (
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 size={14} className="animate-spin" />
          Calcul en cours...
        </div>
      )}

      {/* No data */}
      {!hasData && !isComputing && (
        <div className="text-center py-8">
          <p className="text-sm text-text-tertiary">
            Ajoutez des éléments et des liens pour voir les insights.
          </p>
        </div>
      )}

      {/* No insights found */}
      {hasData && !hasInsights && !isComputing && (
        <div className="text-center py-8">
          <p className="text-sm text-text-tertiary">
            Aucun insight détecté. Ajoutez plus de liens entre les éléments.
          </p>
        </div>
      )}

      {/* Insights sections */}
      {hasInsights && !isComputing && (
        <>
          {/* Clusters */}
          {clusters.length > 0 && (
            <section className="space-y-2">
              <h4 className="text-xs font-medium text-text-secondary flex items-center gap-1">
                <Network size={12} />
                Clusters ({clusters.length})
              </h4>
              <div className="space-y-1">
                {clusters.map((cluster) => (
                  <div
                    key={cluster.id}
                    className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                      selectedClusterId === cluster.id
                        ? 'bg-accent/10 border border-accent'
                        : 'hover:bg-bg-secondary border border-transparent'
                    }`}
                    onClick={() => handleClusterClick(cluster.id)}
                  >
                    <div className="flex items-center gap-2">
                      <ChevronRight
                        size={12}
                        className={`transition-transform ${
                          selectedClusterId === cluster.id ? 'rotate-90' : ''
                        }`}
                      />
                      <span className="text-sm text-text-primary">
                        Cluster {cluster.id + 1}
                      </span>
                      <span className="text-xs text-text-tertiary">
                        ({cluster.size} éléments)
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectCluster(cluster.elementIds);
                      }}
                      className="p-1 text-text-tertiary hover:text-accent"
                      title="Sélectionner tous"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Most connected (centrality) */}
          {centrality.length > 0 && (
            <section className="space-y-2">
              <h4 className="text-xs font-medium text-text-secondary flex items-center gap-1">
                <Star size={12} />
                Éléments les plus connectés
              </h4>
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
                    <span className="text-xs text-text-tertiary ml-2">
                      {item.degree} connexion{item.degree > 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Bridges */}
          {bridges.length > 0 && (
            <section className="space-y-2">
              <h4 className="text-xs font-medium text-text-secondary flex items-center gap-1">
                <GitBranch size={12} />
                Ponts ({bridges.length})
              </h4>
              <p className="text-xs text-text-tertiary">
                Éléments qui connectent différentes parties du graphe.
              </p>
              <button
                onClick={handleBridgesClick}
                className={`w-full p-2 text-sm rounded transition-colors text-left ${
                  highlightType === 'bridge'
                    ? 'bg-accent/10 border border-accent text-accent'
                    : 'hover:bg-bg-secondary border border-transparent text-text-primary'
                }`}
              >
                {highlightType === 'bridge' ? 'Masquer' : 'Afficher'} les ponts
              </button>
            </section>
          )}

          {/* Isolated */}
          {isolated.length > 0 && (
            <section className="space-y-2">
              <h4 className="text-xs font-medium text-text-secondary flex items-center gap-1">
                <CircleOff size={12} />
                Éléments isolés ({isolated.length})
              </h4>
              <p className="text-xs text-text-tertiary">
                Éléments sans aucune connexion.
              </p>
              <button
                onClick={handleIsolatedClick}
                className={`w-full p-2 text-sm rounded transition-colors text-left ${
                  highlightType === 'isolated'
                    ? 'bg-accent/10 border border-accent text-accent'
                    : 'hover:bg-bg-secondary border border-transparent text-text-primary'
                }`}
              >
                {highlightType === 'isolated' ? 'Masquer' : 'Afficher'} les isolés
              </button>
            </section>
          )}

          {/* Similar labels */}
          {similarLabels.length > 0 && (
            <section className="space-y-2">
              <h4 className="text-xs font-medium text-text-secondary flex items-center gap-1">
                <Copy size={12} />
                Doublons potentiels ({similarLabels.length})
              </h4>
              <div className="space-y-1">
                {similarLabels.slice(0, 5).map((pair, index) => (
                  <div
                    key={index}
                    className="p-2 rounded hover:bg-bg-secondary cursor-pointer transition-colors"
                    onClick={() =>
                      handleSimilarClick(pair.elementId1, pair.elementId2)
                    }
                  >
                    <div className="flex items-center gap-1 text-sm text-text-primary">
                      <span className="truncate max-w-24">
                        {getElementLabel(pair.elementId1)}
                      </span>
                      <span className="text-text-tertiary">≈</span>
                      <span className="truncate max-w-24">
                        {getElementLabel(pair.elementId2)}
                      </span>
                    </div>
                    <span className="text-xs text-text-tertiary">
                      {Math.round(pair.similarity * 100)}% similaire
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Last computed */}
          {computedAt && (
            <div className="pt-2 border-t border-border-default">
              <p className="text-xs text-text-tertiary">
                Calculé le{' '}
                {computedAt.toLocaleString('fr-FR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
