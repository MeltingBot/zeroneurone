import { create } from 'zustand';
import type { Element, Link, ElementId, Cluster, CentralityResult, SimilarPair } from '../types';
import { insightsService, type PathResult, type CycleResult, type PathSearchOptions } from '../services/insightsService';
import { graphWorkerService, SupersededError } from '../services/graphWorkerService';
import { useProgressStore } from './progressStore';
import { hasActiveConstraints } from '../services/graph/constrainedPaths';
import type { StructuralRoles } from '../services/graph/structuralRoles';

interface InsightsState {
  // Results
  clusters: Cluster[];
  centrality: CentralityResult[];
  bridges: ElementId[];
  isolated: ElementId[];
  similarLabels: SimilarPair[];
  /** Who holds the network together, as structured facts */
  structuralRoles: StructuralRoles;
  computedAt: Date | null;
  /**
   * Structure signature of the graph the results describe (or are being
   * computed for). The panel remounts on every tab switch: it skips the
   * analysis when the structure has not changed since.
   */
  computedKey: string | null;

  // UI state
  isComputing: boolean;
  computeProgress: number;
  computePhase: string;
  highlightedElementIds: Set<ElementId>;
  highlightType: 'cluster' | 'centrality' | 'bridge' | 'isolated' | 'similar' | 'path' | 'cycle' | 'suggestion' | 'between' | 'role' | null;
  selectedClusterId: number | null;

  // Path finding
  pathResults: PathResult[];
  pathFromId: ElementId | null;
  pathToId: ElementId | null;
  /** Which path search produced the current results (drives the panel UI) */
  pathSearchMode: 'shortest' | 'all' | null;
  /** No admitted path, but one exists without the constraints */
  pathBlockedByConstraints: boolean;
  /** Whether the last path search followed link direction */
  pathDirected: boolean;
  /** Whether constraints narrowed the last path search (a context-menu search has none) */
  pathConstrained: boolean;
  /** Links walked by the highlighted paths. Read while highlightType is 'path'. */
  pathLinkFlow: Map<string, CycleLinkFlow>;

  // Cycle detection
  cycles: CycleResult[];
  /**
   * Links of the highlighted cycles and the way they are walked. 'both' when
   * the walk has no meaning (undirected search) or two shown cycles disagree.
   * Read while highlightType is 'cycle'.
   */
  cycleLinkFlow: Map<string, CycleLinkFlow>;
  /** Whether the last cycle search followed link direction. */
  cyclesDirected: boolean;
  /** Links a structural role sentence is about (a bridge link). Read while highlightType is 'role'. */
  roleLinkIds: Set<string>;
  /** Element picked in the cycle list, or the subject of a role sentence: a stronger glow on the canvas. Read while highlightType is 'cycle' or 'role'. */
  focusedElementId: ElementId | null;

  // Actions
  computeInsights: (elements: Element[], links: Link[], key?: string) => void;
  highlightCluster: (clusterId: number) => void;
  /** Highlight an element, with its neighbours when given (their links then show too) */
  highlightCentralElement: (elementId: ElementId, neighborIds?: Iterable<ElementId>) => void;
  highlightBridges: () => void;
  highlightIsolated: () => void;
  highlightSimilarPair: (elementId1: ElementId, elementId2: ElementId) => void;
  /** Highlight the elements of a link suggestion (panel hover) */
  highlightSuggestion: (elementIds: ElementId[]) => void;
  /** What links two combined tabs: shared elements, direct links or relays */
  highlightBetween: (elementIds: ElementId[]) => void;
  /** Highlight what a structural role sentence is about, its subject glowing stronger */
  highlightRole: (elementIds: Iterable<ElementId>, focusId: ElementId | null, linkIds?: Iterable<string>) => void;
  findPaths: (fromId: ElementId, toId: ElementId, options?: PathFilterOptions) => void;
  findAllPaths: (fromId: ElementId, toId: ElementId, maxDepth?: number, options?: PathFilterOptions & { maxPaths?: number }) => void;
  highlightPath: (pathIndex: number) => void;
  findCycles: (maxLength?: number, directed?: boolean) => void;
  highlightCycle: (cycleIndex: number) => void;
  /** Highlight a cycle and single out one of its elements. */
  focusCycleElement: (cycleIndex: number, elementId: ElementId) => void;
  clearCycles: () => void;
  clearHighlight: () => void;
  clearPaths: () => void;
  clear: () => void;
}

export type CycleLinkFlow = 'forward' | 'backward' | 'both';

const EMPTY_ROLES: StructuralRoles = { facts: [], clusterLeads: {} };

/** Constraints of a path search, and the model their grading threshold is read in */
export type PathFilterOptions = Pick<PathSearchOptions, 'constraints' | 'model'>;

/**
 * Links of the paths, with the way they are walked when the search followed
 * link direction ('both' otherwise, or when two paths disagree).
 */
function pathLinkFlowOf(paths: readonly PathResult[], directed: boolean): Map<string, CycleLinkFlow> {
  const flow = new Map<string, CycleLinkFlow>();
  for (const p of paths) {
    for (const step of p.steps) {
      for (const l of step) {
        const walk: CycleLinkFlow = !directed ? 'both' : l.forward ? 'forward' : 'backward';
        const seen = flow.get(l.linkId);
        flow.set(l.linkId, seen === undefined || seen === walk ? walk : 'both');
      }
    }
  }
  return flow;
}

/**
 * Each link of the cycles with the way it is walked. An undirected search
 * walks its loops in an arbitrary sense, so no sense is shown ('both'); so
 * too for a link two shown cycles walk in opposite senses.
 */
function cycleLinkFlowOf(cycles: readonly CycleResult[], directed: boolean): Map<string, CycleLinkFlow> {
  const flow = new Map<string, CycleLinkFlow>();
  for (const c of cycles) {
    for (const step of c.links) {
      const walk: CycleLinkFlow = !directed ? 'both' : step.forward ? 'forward' : 'backward';
      const seen = flow.get(step.linkId);
      flow.set(step.linkId, seen === undefined || seen === walk ? walk : 'both');
    }
  }
  return flow;
}

export const useInsightsStore = create<InsightsState>((set, get) => ({
  // Initial state
  clusters: [],
  centrality: [],
  bridges: [],
  isolated: [],
  similarLabels: [],
  structuralRoles: EMPTY_ROLES,
  computedAt: null,
  computedKey: null,

  isComputing: false,
  computeProgress: 0,
  computePhase: '',
  highlightedElementIds: new Set(),
  highlightType: null,
  selectedClusterId: null,

  pathResults: [],
  pathFromId: null,
  pathToId: null,
  pathSearchMode: null,
  pathBlockedByConstraints: false,
  pathLinkFlow: new Map(),
  pathDirected: false,
  pathConstrained: false,

  cycles: [],
  cycleLinkFlow: new Map(),
  cyclesDirected: false,
  focusedElementId: null,
  roleLinkIds: new Set(),

  // Actions
  computeInsights: (elements, links, key) => {
    set({ isComputing: true, computeProgress: 0, computePhase: 'starting', computedKey: key ?? null });
    const progress = useProgressStore.getState();
    progress.start('insights', 'activity.insights', 0);

    // Use Web Worker for off-main-thread computation
    graphWorkerService.computeInsights(
      elements,
      links,
      (percent, phase) => {
        set({ computeProgress: percent, computePhase: phase });
        useProgressStore.getState().update('insights', percent);
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
        structuralRoles: results.roles,
        computedAt: new Date(),
        isComputing: false,
        computeProgress: 100,
        computePhase: 'done',
      });
      useProgressStore.getState().end('insights');
    }).catch((error) => {
      // A superseded request is not a failure: a newer computation is already
      // running and will set the state. Falling back here would compute the
      // same thing twice and let a stale result overwrite a fresh one.
      if (error instanceof SupersededError) return;

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
          structuralRoles: results.roles,
          computedAt: results.computedAt,
          isComputing: false,
        });
        useProgressStore.getState().end('insights');
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

  highlightCentralElement: (elementId, neighborIds) => {
    const ids = new Set<ElementId>(neighborIds ?? []);
    ids.add(elementId);
    set({
      highlightedElementIds: ids,
      highlightType: 'centrality',
      selectedClusterId: null,
      focusedElementId: elementId,
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

  highlightBetween: (elementIds) => {
    set({
      highlightedElementIds: new Set(elementIds),
      highlightType: 'between',
      selectedClusterId: null,
    });
  },

  highlightRole: (elementIds, focusId, linkIds = []) => {
    set({
      highlightedElementIds: new Set(elementIds),
      highlightType: 'role',
      selectedClusterId: null,
      focusedElementId: focusId,
      roleLinkIds: new Set(linkIds),
    });
  },

  highlightSuggestion: (elementIds) => {
    set({
      highlightedElementIds: new Set(elementIds),
      highlightType: 'suggestion',
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

  findPaths: (fromId, toId, given) => {
    const options = given ?? {};
    const directed = !!options?.constraints?.respectDirection;
    const { paths, blockedByConstraints } = insightsService.searchPaths(fromId, toId, {
      k: 1,
      maxDepth: Number.MAX_SAFE_INTEGER,
      ...options,
    });
    set({
      pathResults: paths,
      pathFromId: fromId,
      pathToId: toId,
      pathSearchMode: 'shortest',
      pathBlockedByConstraints: blockedByConstraints,
      pathConstrained: hasActiveConstraints(options.constraints, options.model),
      pathDirected: directed,
      pathLinkFlow: pathLinkFlowOf(paths.slice(0, 1), directed),
    });

    // Auto-highlight first path if found
    if (paths.length > 0) {
      set({
        highlightedElementIds: new Set(paths[0].path),
        highlightType: 'path',
        selectedClusterId: null,
      });
    } else if (get().highlightType === 'path') {
      // No path: the previous one must not stay lit
      set({ highlightedElementIds: new Set(), highlightType: null });
    }
  },

  findAllPaths: (fromId, toId, maxDepth = 5, given) => {
    const options = given ?? {};
    const directed = !!options?.constraints?.respectDirection;
    const { paths, blockedByConstraints } = insightsService.searchPaths(fromId, toId, {
      k: options?.maxPaths ?? 200,
      maxDepth,
      constraints: options?.constraints,
      model: options?.model,
    });
    set({
      pathResults: paths,
      pathFromId: fromId,
      pathToId: toId,
      pathSearchMode: 'all',
      pathBlockedByConstraints: blockedByConstraints,
      pathConstrained: hasActiveConstraints(options.constraints, options.model),
      pathDirected: directed,
      pathLinkFlow: pathLinkFlowOf(paths, directed),
    });

    // Highlight the union of every path so all routes are visible at once.
    if (paths.length > 0) {
      const union = new Set<ElementId>();
      for (const p of paths) {
        for (const nodeId of p.path) union.add(nodeId);
      }
      set({
        highlightedElementIds: union,
        highlightType: 'path',
        selectedClusterId: null,
      });
    } else if (get().highlightType === 'path') {
      // No path: the previous ones must not stay lit
      set({ highlightedElementIds: new Set(), highlightType: null });
    }
  },

  highlightPath: (pathIndex) => {
    const { pathResults, pathDirected } = get();
    if (pathResults[pathIndex]) {
      set({
        highlightedElementIds: new Set(pathResults[pathIndex].path),
        highlightType: 'path',
        selectedClusterId: null,
        pathLinkFlow: pathLinkFlowOf([pathResults[pathIndex]], pathDirected),
      });
    }
  },

  findCycles: (maxLength = 6, directed = false) => {
    const cycles = insightsService.findCycles(maxLength, 100, directed);
    set({ cycles, cyclesDirected: directed, focusedElementId: null });

    // Highlight the union of every cycle so all loops are visible at once.
    if (cycles.length > 0) {
      const union = new Set<ElementId>();
      for (const c of cycles) {
        for (const nodeId of c.cycle) union.add(nodeId);
      }
      set({
        highlightedElementIds: union,
        cycleLinkFlow: cycleLinkFlowOf(cycles, directed),
        highlightType: 'cycle',
        selectedClusterId: null,
      });
    } else {
      set({ highlightedElementIds: new Set(), cycleLinkFlow: new Map(), highlightType: null });
    }
  },

  highlightCycle: (cycleIndex) => {
    const { cycles, cyclesDirected } = get();
    if (cycles[cycleIndex]) {
      set({
        highlightedElementIds: new Set(cycles[cycleIndex].cycle),
        cycleLinkFlow: cycleLinkFlowOf([cycles[cycleIndex]], cyclesDirected),
        focusedElementId: null,
        highlightType: 'cycle',
        selectedClusterId: null,
      });
    }
  },

  focusCycleElement: (cycleIndex, elementId) => {
    get().highlightCycle(cycleIndex);
    if (get().cycles[cycleIndex]) set({ focusedElementId: elementId });
  },

  clearCycles: () => {
    set({ cycles: [] });
  },

  clearHighlight: () => {
    set({
      highlightedElementIds: new Set(),
      cycleLinkFlow: new Map(),
      focusedElementId: null,
      highlightType: null,
      selectedClusterId: null,
    });
  },

  clearPaths: () => {
    set({
      pathResults: [],
      pathFromId: null,
      pathToId: null,
      pathSearchMode: null,
      pathBlockedByConstraints: false,
      pathConstrained: false,
      pathLinkFlow: new Map(),
    });
  },

  clear: () => {
    insightsService.clear();
    set({
      cycleLinkFlow: new Map(),
      focusedElementId: null,
      clusters: [],
      centrality: [],
      bridges: [],
      isolated: [],
      similarLabels: [],
      structuralRoles: EMPTY_ROLES,
      computedAt: null,
      computedKey: null,
      isComputing: false,
      computeProgress: 0,
      computePhase: '',
      highlightedElementIds: new Set(),
      highlightType: null,
      selectedClusterId: null,
      pathResults: [],
      pathFromId: null,
      pathToId: null,
      pathSearchMode: null,
      pathBlockedByConstraints: false,
      pathConstrained: false,
      pathLinkFlow: new Map(),
      cycles: [],
    });
  },
}));
