import { create } from 'zustand';
import type { Element, Link, ElementId, Cluster, CentralityResult, SimilarPair } from '../types';
import { insightsService, type PathResult } from '../services/insightsService';

interface InsightsState {
  // Results
  clusters: Cluster[];
  centrality: CentralityResult[];
  bridges: ElementId[];
  isolated: ElementId[];
  similarLabels: SimilarPair[];
  computedAt: Date | null;

  // UI state
  isComputing: boolean;
  highlightedElementIds: Set<ElementId>;
  highlightType: 'cluster' | 'centrality' | 'bridge' | 'isolated' | 'similar' | 'path' | null;
  selectedClusterId: number | null;

  // Path finding
  pathResults: PathResult[];
  pathFromId: ElementId | null;
  pathToId: ElementId | null;

  // Actions
  computeInsights: (elements: Element[], links: Link[]) => void;
  highlightCluster: (clusterId: number) => void;
  highlightCentralElement: (elementId: ElementId) => void;
  highlightBridges: () => void;
  highlightIsolated: () => void;
  highlightSimilarPair: (elementId1: ElementId, elementId2: ElementId) => void;
  findPaths: (fromId: ElementId, toId: ElementId) => void;
  highlightPath: (pathIndex: number) => void;
  clearHighlight: () => void;
  clearPaths: () => void;
  clear: () => void;
}

export const useInsightsStore = create<InsightsState>((set, get) => ({
  // Initial state
  clusters: [],
  centrality: [],
  bridges: [],
  isolated: [],
  similarLabels: [],
  computedAt: null,

  isComputing: false,
  highlightedElementIds: new Set(),
  highlightType: null,
  selectedClusterId: null,

  pathResults: [],
  pathFromId: null,
  pathToId: null,

  // Actions
  computeInsights: (elements, links) => {
    set({ isComputing: true });

    // Use setTimeout to allow UI to update
    setTimeout(() => {
      insightsService.buildGraph(elements, links);
      const results = insightsService.computeInsights();

      set({
        clusters: results.clusters,
        centrality: results.centrality,
        bridges: results.bridges,
        isolated: results.isolated,
        similarLabels: results.similarLabels,
        computedAt: results.computedAt,
        isComputing: false,
      });
    }, 10);
  },

  highlightCluster: (clusterId) => {
    const { clusters } = get();
    const cluster = clusters.find((c) => c.id === clusterId);

    if (cluster) {
      set({
        highlightedElementIds: new Set(cluster.elementIds),
        highlightType: 'cluster',
        selectedClusterId: clusterId,
      });
    }
  },

  highlightCentralElement: (elementId) => {
    set({
      highlightedElementIds: new Set([elementId]),
      highlightType: 'centrality',
      selectedClusterId: null,
    });
  },

  highlightBridges: () => {
    const { bridges } = get();
    set({
      highlightedElementIds: new Set(bridges),
      highlightType: 'bridge',
      selectedClusterId: null,
    });
  },

  highlightIsolated: () => {
    const { isolated } = get();
    set({
      highlightedElementIds: new Set(isolated),
      highlightType: 'isolated',
      selectedClusterId: null,
    });
  },

  highlightSimilarPair: (elementId1, elementId2) => {
    set({
      highlightedElementIds: new Set([elementId1, elementId2]),
      highlightType: 'similar',
      selectedClusterId: null,
    });
  },

  findPaths: (fromId, toId) => {
    const paths = insightsService.findPaths(fromId, toId);
    set({
      pathResults: paths,
      pathFromId: fromId,
      pathToId: toId,
    });

    // Auto-highlight first path if found
    if (paths.length > 0) {
      set({
        highlightedElementIds: new Set(paths[0].path),
        highlightType: 'path',
        selectedClusterId: null,
      });
    }
  },

  highlightPath: (pathIndex) => {
    const { pathResults } = get();
    if (pathResults[pathIndex]) {
      set({
        highlightedElementIds: new Set(pathResults[pathIndex].path),
        highlightType: 'path',
        selectedClusterId: null,
      });
    }
  },

  clearHighlight: () => {
    set({
      highlightedElementIds: new Set(),
      highlightType: null,
      selectedClusterId: null,
    });
  },

  clearPaths: () => {
    set({
      pathResults: [],
      pathFromId: null,
      pathToId: null,
    });
  },

  clear: () => {
    insightsService.clear();
    set({
      clusters: [],
      centrality: [],
      bridges: [],
      isolated: [],
      similarLabels: [],
      computedAt: null,
      isComputing: false,
      highlightedElementIds: new Set(),
      highlightType: null,
      selectedClusterId: null,
      pathResults: [],
      pathFromId: null,
      pathToId: null,
    });
  },
}));
