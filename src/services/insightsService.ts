import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';
import { bidirectional } from 'graphology-shortest-path';
import type { Element, Link, ElementId, Cluster, CentralityResult, SimilarPair } from '../types';

export interface InsightsResult {
  clusters: Cluster[];
  centrality: CentralityResult[];
  bridges: ElementId[];
  isolated: ElementId[];
  similarLabels: SimilarPair[];
  computedAt: Date;
}

export interface PathResult {
  path: ElementId[];
  length: number;
}

class InsightsService {
  private graph: Graph | null = null;
  private elements: Element[] = [];

  /**
   * Build the graph from elements and links
   */
  buildGraph(elements: Element[], links: Link[]): void {
    this.elements = elements;
    this.graph = new Graph({ type: 'undirected', multi: true });

    // Add nodes (exclude visual groups - they're containers, not graph nodes)
    for (const element of elements) {
      if (element.isGroup) continue;
      this.graph.addNode(element.id, { label: element.label });
    }

    // Add edges
    for (const link of links) {
      // Only add edge if both nodes exist
      if (this.graph.hasNode(link.fromId) && this.graph.hasNode(link.toId)) {
        this.graph.addEdge(link.fromId, link.toId, { id: link.id });
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
        computedAt: new Date(),
      };
    }

    return {
      clusters: this.getClusters(),
      centrality: this.getCentrality(),
      bridges: this.getBridges(),
      isolated: this.getIsolated(),
      similarLabels: this.detectSimilarLabels(),
      computedAt: new Date(),
    };
  }

  /**
   * Detect clusters using Louvain community detection
   */
  getClusters(): Cluster[] {
    if (!this.graph || this.graph.order === 0) return [];

    try {
      // Run Louvain algorithm
      const communities = louvain(this.graph);

      // Group nodes by community
      const clusterMap = new Map<number, ElementId[]>();

      for (const [nodeId, communityId] of Object.entries(communities)) {
        const existing = clusterMap.get(communityId) || [];
        existing.push(nodeId);
        clusterMap.set(communityId, existing);
      }

      // Convert to Cluster array
      const clusters: Cluster[] = [];
      let id = 0;
      for (const [, elementIds] of clusterMap) {
        if (elementIds.length > 1) {
          clusters.push({
            id: id++,
            elementIds,
            size: elementIds.length,
          });
        }
      }

      // Sort by size descending
      return clusters.sort((a, b) => b.size - a.size);
    } catch {
      return [];
    }
  }

  /**
   * Calculate degree centrality for each node
   */
  getCentrality(): CentralityResult[] {
    if (!this.graph || this.graph.order === 0) return [];

    const results: CentralityResult[] = [];
    const maxDegree = Math.max(1, this.graph.order - 1);

    this.graph.forEachNode((nodeId) => {
      const degree = this.graph!.degree(nodeId);
      results.push({
        elementId: nodeId,
        degree,
        score: degree / maxDegree,
      });
    });

    // Sort by degree descending, take top 10
    return results
      .filter((r) => r.degree > 0)
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 10);
  }

  /**
   * Find bridge nodes (nodes whose removal would increase connected components)
   */
  getBridges(): ElementId[] {
    if (!this.graph || this.graph.order <= 2) return [];

    const bridges: ElementId[] = [];
    const originalComponents = this.countConnectedComponents();

    // For each node, check if removing it increases the number of components
    this.graph.forEachNode((nodeId) => {
      const neighbors = this.graph!.neighbors(nodeId);

      // Only potential bridges have at least 2 neighbors
      if (neighbors.length < 2) return;

      // Temporarily remove the node and check connectivity
      const tempGraph = this.graph!.copy();
      tempGraph.dropNode(nodeId);

      const newComponents = this.countConnectedComponentsInGraph(tempGraph);

      if (newComponents > originalComponents) {
        bridges.push(nodeId);
      }
    });

    return bridges;
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
    const pairs: SimilarPair[] = [];
    const threshold = 0.7; // Similarity threshold

    for (let i = 0; i < this.elements.length; i++) {
      for (let j = i + 1; j < this.elements.length; j++) {
        const el1 = this.elements[i];
        const el2 = this.elements[j];

        // Skip empty labels
        if (!el1.label || !el2.label) continue;

        const similarity = this.calculateSimilarity(
          el1.label.toLowerCase(),
          el2.label.toLowerCase()
        );

        if (similarity >= threshold) {
          pairs.push({
            elementId1: el1.id,
            elementId2: el2.id,
            similarity,
          });
        }
      }
    }

    // Sort by similarity descending
    return pairs.sort((a, b) => b.similarity - a.similarity).slice(0, 20);
  }

  /**
   * Find shortest paths between two elements
   */
  findPaths(fromId: ElementId, toId: ElementId): PathResult[] {
    if (!this.graph) return [];

    // Check if both nodes exist
    if (!this.graph.hasNode(fromId) || !this.graph.hasNode(toId)) {
      return [];
    }

    try {
      // Find shortest path
      const path = bidirectional(this.graph, fromId, toId);

      if (path) {
        return [
          {
            path,
            length: path.length - 1,
          },
        ];
      }

      return [];
    } catch {
      return [];
    }
  }

  /**
   * Calculate Levenshtein similarity between two strings
   */
  private calculateSimilarity(s1: string, s2: string): number {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(s1: string, s2: string): number {
    const costs: number[] = [];

    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) {
        costs[s2.length] = lastValue;
      }
    }

    return costs[s2.length];
  }

  /**
   * Count connected components in the current graph
   */
  private countConnectedComponents(): number {
    if (!this.graph) return 0;
    return this.countConnectedComponentsInGraph(this.graph);
  }

  /**
   * Count connected components in a given graph
   */
  private countConnectedComponentsInGraph(graph: Graph): number {
    const visited = new Set<string>();
    let components = 0;

    graph.forEachNode((nodeId) => {
      if (!visited.has(nodeId)) {
        components++;
        this.dfs(graph, nodeId, visited);
      }
    });

    return components;
  }

  /**
   * Depth-first search for connected components
   */
  private dfs(graph: Graph, nodeId: string, visited: Set<string>): void {
    visited.add(nodeId);

    graph.forEachNeighbor(nodeId, (neighbor) => {
      if (!visited.has(neighbor)) {
        this.dfs(graph, neighbor, visited);
      }
    });
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
