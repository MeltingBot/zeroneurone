import Graph from 'graphology';
import betweennessCentrality from 'graphology-metrics/centrality/betweenness';
import type { Element, Link, ElementId, LinkId, Cluster, CentralityResult, SimilarPair, EvaluationModel } from '../types';
import {
  findArticulationPoints,
  detectSimilarLabels as detectSimilarLabelsShared,
} from './graph/algorithms';
import { findConstrainedPaths, type PathConstraints } from './graph/constrainedPaths';
import { computeCommunities, computeStructuralRoles, type StructuralRoles } from './graph/structuralRoles';

export interface InsightsResult {
  clusters: Cluster[];
  centrality: CentralityResult[];
  bridges: ElementId[];
  isolated: ElementId[];
  similarLabels: SimilarPair[];
  roles: StructuralRoles;
  computedAt: Date;
}

export interface PathResult {
  path: ElementId[];
  length: number;
  /** steps[i]: the links walkable between path[i] and path[i + 1] */
  steps: CycleLink[][];
}

export interface PathSearchOptions {
  /** Number of paths, shortest first */
  k: number;
  /** Maximum number of steps of a path */
  maxDepth: number;
  constraints?: PathConstraints | null;
  model?: EvaluationModel;
}

export interface PathSearchResult {
  paths: PathResult[];
  /** No path through the admitted links, but one when the constraints are dropped */
  blockedByConstraints: boolean;
}

/** A link a cycle goes through, and the way it is walked. */
export interface CycleLink {
  linkId: LinkId;
  /** True when the cycle walks the link from its `fromId` to its `toId`. */
  forward: boolean;
}

export interface CycleResult {
  /** Node sequence of the cycle (start node not repeated at the end) */
  cycle: ElementId[];
  /** Number of nodes/edges in the cycle */
  length: number;
  /** Links of each step, in cycle order (several when two elements share parallel links) */
  links: CycleLink[];
}

class InsightsService {
  private graph: Graph | null = null;
  private elements: Element[] = [];
  private links: Link[] = [];

  /**
   * Build the graph from elements and links
   */
  buildGraph(elements: Element[], links: Link[]): void {
    this.elements = elements;
    this.links = links;
    this.graph = new Graph({ type: 'undirected', multi: true });

    // Add nodes (exclude visual groups - they're containers, not graph nodes)
    for (const element of elements) {
      if (element.isGroup) continue;
      this.graph.addNode(element.id, { label: element.label });
    }

    // Add edges. Store the link direction so cycle detection can optionally
    // respect it (forward: from→to, backward: to→from, both/none: either way).
    for (const link of links) {
      // Only add edge if both nodes exist
      if (this.graph.hasNode(link.fromId) && this.graph.hasNode(link.toId)) {
        const direction = link.direction ?? (link.directed ? 'forward' : 'none');
        this.graph.addEdge(link.fromId, link.toId, { id: link.id, direction });
      }
    }
  }

  /**
   * Compute all insights
   */
  computeInsights(): InsightsResult {
    if (!this.graph || this.graph.order === 0) {
      return {
        clusters: [],
        centrality: [],
        bridges: [],
        isolated: [],
        similarLabels: [],
        roles: { facts: [], clusterLeads: {} },
        computedAt: new Date(),
      };
    }

    const betweenness = this.getBetweenness();
    const clusters = this.getClusters();
    return {
      clusters,
      centrality: this.getCentrality(betweenness),
      bridges: this.getBridges(),
      isolated: this.getIsolated(),
      similarLabels: this.detectSimilarLabels(),
      roles: computeStructuralRoles(this.graph, clusters, betweenness),
      computedAt: new Date(),
    };
  }

  /**
   * Detect clusters using Louvain community detection
   */
  getClusters(): Cluster[] {
    if (!this.graph || this.graph.order === 0) return [];
    // Seeded, as in the worker: the fallback finds the same groups
    return computeCommunities(this.graph);
  }

  /** Normalized betweenness of each node (empty on graphs it cannot measure) */
  getBetweenness(): Record<string, number> {
    if (!this.graph || this.graph.order === 0) return {};
    try {
      return betweennessCentrality(this.graph, { normalized: true });
    } catch {
      return {};
    }
  }

  /**
   * Calculate degree + betweenness centrality for each node
   */
  getCentrality(betweennessMap: Record<string, number> = this.getBetweenness()): CentralityResult[] {
    if (!this.graph || this.graph.order === 0) return [];

    const results: CentralityResult[] = [];
    const maxDegree = Math.max(1, this.graph.order - 1);

    this.graph.forEachNode((nodeId) => {
      const degree = this.graph!.degree(nodeId);
      results.push({
        elementId: nodeId,
        degree,
        betweenness: betweennessMap[nodeId] ?? 0,
        score: degree / maxDegree,
      });
    });

    // Sort by degree descending (the panel pages through the list)
    return results
      .filter((r) => r.degree > 0)
      .sort((a, b) => b.degree - a.degree);
  }

  /**
   * Find bridge nodes (nodes whose removal would increase connected components)
   */
  getBridges(): ElementId[] {
    if (!this.graph || this.graph.order <= 2) return [];
    return findArticulationPoints(this.graph);
  }


  /**
   * Find isolated nodes (degree 0)
   */
  getIsolated(): ElementId[] {
    if (!this.graph) return [];

    const isolated: ElementId[] = [];

    this.graph.forEachNode((nodeId) => {
      if (this.graph!.degree(nodeId) === 0) {
        isolated.push(nodeId);
      }
    });

    return isolated;
  }

  /**
   * Detect elements with similar labels (potential duplicates)
   */
  detectSimilarLabels(): SimilarPair[] {
    return detectSimilarLabelsShared(this.elements) as SimilarPair[];
  }

  /**
   * The k shortest loopless paths between two elements through the links the
   * constraints admit (label, tag, period, confidence or grading, direction).
   */
  searchPaths(fromId: ElementId, toId: ElementId, options: PathSearchOptions): PathSearchResult {
    if (!this.graph || !this.graph.hasNode(fromId) || !this.graph.hasNode(toId) || fromId === toId) {
      return { paths: [], blockedByConstraints: false };
    }
    const linkById = new Map(this.links.map((l) => [l.id, l]));
    const result = findConstrainedPaths(this.elements, this.links, fromId, toId, {
      k: options.k,
      maxDepth: options.maxDepth,
      constraints: options.constraints,
      model: options.model ?? 'zeroneurone',
    });
    return {
      blockedByConstraints: result.blockedByConstraints,
      paths: result.paths.map((p) => ({
        path: p.path,
        length: p.length,
        steps: p.linkIds.map((ids, i) =>
          ids.map((linkId) => ({ linkId, forward: linkById.get(linkId)?.fromId === p.path[i] })),
        ),
      })),
    };
  }

  /** Shortest path between two elements (none when unreachable) */
  findPaths(fromId: ElementId, toId: ElementId): PathResult[] {
    return this.searchPaths(fromId, toId, { k: 1, maxDepth: Number.MAX_SAFE_INTEGER }).paths;
  }

  /**
   * Simple paths (no repeated node) between two elements, at most `maxDepth`
   * edges long and `maxPaths` in number, shortest first. Undirected.
   */
  findAllPaths(fromId: ElementId, toId: ElementId, maxDepth = 5, maxPaths = 200): PathResult[] {
    return this.searchPaths(fromId, toId, { k: maxPaths, maxDepth }).paths;
  }

  /**
   * Enumerate simple cycles (closed loops with no repeated node) in the graph,
   * bounded by `maxLength` nodes and capped by `maxCycles`. Useful for spotting
   * circular relationships (e.g. financial circuits). Traversal is undirected.
   *
   * Each cycle is reported once: enumeration starts only from the cycle's
   * lowest-indexed node, and a mirror guard (second node < last node) discards
   * the reverse traversal of the same loop.
   *
   * When `directed` is true, an edge is only traversable in the direction of the
   * link: `forward` (from→to), `backward` (to→from), while `both`/`none` stay
   * bidirectional (a neutral link does not block a circuit). The mirror guard is
   * dropped in that case since a directed cycle has a single traversal sense.
   */
  findCycles(maxLength = 6, maxCycles = 100, directed = false): CycleResult[] {
    if (!this.graph) return [];
    const graph = this.graph;

    const nodes = graph.nodes();
    const indexOf = new Map<string, number>();
    nodes.forEach((n, i) => indexOf.set(n, i));

    // In directed mode, can we step from `from` to `to` following link direction?
    const canTraverse = (from: ElementId, to: ElementId): boolean => {
      let ok = false;
      graph.forEachEdge(from, to, (_edge, attrs, source, target) => {
        if (ok) return;
        const d = (attrs as { direction?: string }).direction;
        if (d === 'both' || d === 'none' || d == null) ok = true;
        else if (d === 'forward' && source === from && target === to) ok = true;
        else if (d === 'backward' && source === to && target === from) ok = true;
      });
      return ok;
    };

    // The links each step of a cycle goes through: in directed mode, only
    // those that can be walked that way
    const resultOf = (cycle: ElementId[]): CycleResult => {
      const links: CycleLink[] = [];
      for (let i = 0; i < cycle.length; i++) {
        const u = cycle[i];
        const v = cycle[(i + 1) % cycle.length];
        graph.forEachEdge(u, v, (_edge, attrs, source) => {
          const { id, direction: d } = attrs as { id: LinkId; direction?: string };
          const forward = source === u;
          if (directed && !(d === 'both' || d === 'none' || d == null
            || (d === 'forward' && forward) || (d === 'backward' && !forward))) return;
          links.push({ linkId: id, forward });
        });
      }
      return { cycle, length: cycle.length, links };
    };

    const results: CycleResult[] = [];
    const path: ElementId[] = [];
    const onPath = new Set<ElementId>();

    const dfs = (start: ElementId, current: ElementId): void => {
      if (results.length >= maxCycles) return;
      graph.forEachNeighbor(current, (neighbor: string) => {
        if (results.length >= maxCycles) return;
        if (neighbor === start && path.length >= 3) {
          if (directed) {
            // Directed cycle: the closing edge must follow the link direction.
            if (canTraverse(current, start)) {
              results.push(resultOf([...path]));
            }
          } else {
            // Undirected: keep only one of the two mirror traversals.
            const second = indexOf.get(path[1]) ?? 0;
            const last = indexOf.get(path[path.length - 1]) ?? 0;
            if (second < last) {
              results.push(resultOf([...path]));
            }
          }
          return;
        }
        // Extend only to higher-indexed, unvisited nodes so `start` stays the
        // cycle's minimum and each simple cycle is enumerated a single time.
        const startIdx = indexOf.get(start) ?? 0;
        const nbIdx = indexOf.get(neighbor) ?? 0;
        if (nbIdx > startIdx && !onPath.has(neighbor) && path.length < maxLength) {
          if (directed && !canTraverse(current, neighbor)) return;
          path.push(neighbor);
          onPath.add(neighbor);
          dfs(start, neighbor);
          path.pop();
          onPath.delete(neighbor);
        }
      });
    };

    try {
      for (const start of nodes) {
        if (results.length >= maxCycles) break;
        path.length = 0;
        onPath.clear();
        path.push(start);
        onPath.add(start);
        dfs(start, start);
      }
    } catch {
      return results.sort((a, b) => a.length - b.length);
    }

    return results.sort((a, b) => a.length - b.length);
  }

  /**
   * Clear the service state
   */
  clear(): void {
    this.graph = null;
    this.elements = [];
  }
}

export const insightsService = new InsightsService();
