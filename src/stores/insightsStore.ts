import { create } from 'zustand';
import type { Element, Link, ElementId, Cluster, CentralityResult, SimilarPair } from '../types';
import { insightsService, type PathResult } from '../services/insightsService';
import { graphWorkerService } from '../services/graphWorkerService';

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
  computeProgress: number;
  computePhase: string;
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
  computeProgress: 0,
  computePhase: '',
  highlightedElementIds: new Set(),
  highlightType: null,
  selectedClusterId: null,

  pathResults: [],
  pathFromId: null,
  pathToId: null,

  // Actions
  computeInsights: (elements, links) => {
    set({ isComputing: true, computeProgress: 0, computePhase: 'starting' });

    // Use Web Worker for off-main-thread computation
    graphWorkerService.computeInsights(
      elements,
      links,
      (percent, phase) => {
        set({ computeProgress: percent, computePhase: phase });
      }
    ).then((results) => {
      // Also update the insightsService graph for path finding (fast, stays on main thread)
      insightsService.buildGraph(elements, links);

      set({
        clusters: results.clusters,
        centrality: results.centrality,
        bridges: results.bridges,
        isolated: results.isolated,
        similarLabels: results.similarLabels,
        computedAt: new Date(),
        isComputing: false,
        computeProgress: 100,
        computePhase: 'done',
      });
    }).catch((error) => {
      console.error('[InsightsStore] Worker computation failed, falling back to main thread:', error);
      // Fallback to main-thread computation
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
    });
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
      computeProgress: 0,
      computePhase: '',
      highlightedElementIds: new Set(),
      highlightType: null,
      selectedClusterId: null,
      pathResults: [],
      pathFromId: null,
      pathToId: null,
    });
  },
}));
