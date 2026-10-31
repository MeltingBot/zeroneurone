/**
 * Graph Worker
 *
 * Offloads heavy graph computations (insights, layout) from the main thread.
 * Bridges are articulation points (Tarjan, O(n+m), see graph/algorithms);
 * 
 */

import Graph from 'graphology';
import betweennessCentrality from 'graphology-metrics/centrality/betweenness';
import { findArticulationPoints } from '../services/graph/algorithms';
import { computeCommunities, computeStructuralRoles, type StructuralRoles } from '../services/graph/structuralRoles';
import { computeLayout, type LayoutNode, type LayoutEdge, type LayoutOptions } from '../services/graph/layouts';

// ============================================================================
// TYPES
// ============================================================================

type SerializedElement = LayoutNode;
type SerializedLink = LayoutEdge;

interface InsightsData {
  clusters: { id: number; elementIds: string[]; size: number }[];
  centrality: { elementId: string; degree: number; betweenness: number; score: number }[];
  bridges: string[];
  isolated: string[];
  roles: StructuralRoles;
}

// Every request carries an id, echoed by its responses (progress included),
// so the main thread can tell a stale answer from the one it waits for.
type WorkerRequest = { requestId?: number } & (
  | { type: 'computeInsights'; elements: SerializedElement[]; links: SerializedLink[] }
  | { type: 'computeLayout'; elements: SerializedElement[]; links: SerializedLink[]; options: LayoutOptions }
);

type WorkerResponse = { requestId?: number } & (
  | { type: 'insightsResult'; data: InsightsData }
  | { type: 'layoutResult'; positions: Record<string, { x: number; y: number }> }
  | { type: 'progress'; percent: number; phase: string }
  | { type: 'error'; message: string }
);

/** Id of the request being computed, echoed by progress messages */
let currentRequestId: number | undefined;

// ============================================================================
// GRAPH BUILDING
// ============================================================================

function buildGraph(elements: SerializedElement[], links: SerializedLink[]): Graph {
  const graph = new Graph({ type: 'undirected', multi: true });

  for (const element of elements) {
    if (element.isGroup) continue;
    graph.addNode(element.id, { label: element.label, x: element.position.x, y: element.position.y });
  }

  for (const link of links) {
    if (graph.hasNode(link.fromId) && graph.hasNode(link.toId)) {
      graph.addEdge(link.fromId, link.toId, { id: link.id });
    }
  }

  return graph;
}

// ============================================================================
// INSIGHTS COMPUTATION
// ============================================================================

function computeInsights(elements: SerializedElement[], links: SerializedLink[]): InsightsData {
  const graph = buildGraph(elements, links);

  if (graph.order === 0) {
    return { clusters: [], centrality: [], bridges: [], isolated: [], roles: { facts: [], clusterLeads: {} } };
  }

  // Report progress
  postProgress(10, 'clusters');

  // Clusters (Louvain, seeded: the same graph gives the same groups)
  const clusters: InsightsData['clusters'] = computeCommunities(graph);

  postProgress(25, 'centrality');

  // Betweenness centrality (normalized)
  let betweennessMap: Record<string, number> = {};
  try {
    betweennessMap = betweennessCentrality(graph, { normalized: true });
  } catch { /* empty — fails on graphs with <2 nodes */ }

  postProgress(40, 'centrality');

  // Centrality (degree + betweenness)
  const centrality: InsightsData['centrality'] = [];
  const maxDegree = Math.max(1, graph.order - 1);
  graph.forEachNode((nodeId) => {
    const degree = graph.degree(nodeId);
    if (degree > 0) {
      centrality.push({
        elementId: nodeId,
        degree,
        betweenness: betweennessMap[nodeId] ?? 0,
        score: degree / maxDegree,
      });
    }
  });
  // Whole list, as insightsService: the panel pages through it
  centrality.sort((a, b) => b.degree - a.degree);

  postProgress(50, 'bridges');

  // Bridges (Tarjan — O(V+E))
  const bridges = graph.order > 2 ? findArticulationPoints(graph) : [];

  postProgress(70, 'isolated');

  // Isolated nodes
  const isolated: string[] = [];
  graph.forEachNode((nodeId) => {
    if (graph.degree(nodeId) === 0) {
      isolated.push(nodeId);
    }
  });

  postProgress(75, 'roles');

  // Structural roles: who holds the network together
  const roles = computeStructuralRoles(graph, clusters, betweennessMap);

  postProgress(100, 'done');

  return { clusters, centrality, bridges, isolated, roles };
}

// ============================================================================
// PROGRESS REPORTING
// ============================================================================

function postProgress(percent: number, phase: string) {
  self.postMessage({ type: 'progress', percent, phase, requestId: currentRequestId } satisfies WorkerResponse);
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const requestId = request.requestId;
  currentRequestId = requestId;

  try {
    switch (request.type) {
      case 'computeInsights': {
        const data = computeInsights(request.elements, request.links);
        self.postMessage({ type: 'insightsResult', data, requestId } satisfies WorkerResponse);
        break;
      }
      case 'computeLayout': {
        const positions = computeLayout(request.elements, request.links, request.options, postProgress);
        self.postMessage({ type: 'layoutResult', positions, requestId } satisfies WorkerResponse);
        break;
      }
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: (err as Error).message, requestId } satisfies WorkerResponse);
  }
};
