/**
 * Graph Worker Service
 *
 * Main-thread interface for the graph worker.
 * Provides async methods for insights, layout, and path computations.
 */

import type { Element, Link } from '../types';
import { toLayoutEdges, toLayoutNodes } from './graph/layouts';
import type { StructuralRoles } from './graph/structuralRoles';

export type { LayoutType, LayoutOptions } from './graph/layouts';
import type { LayoutOptions } from './graph/layouts';

/**
 * A request was replaced by a newer one before the worker answered. Not a
 * failure: the caller simply no longer needs the result.
 */
export class SupersededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupersededError';
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface WorkerInsightsData {
  clusters: { id: number; elementIds: string[]; size: number }[];
  centrality: { elementId: string; degree: number; betweenness: number; score: number }[];
  bridges: string[];
  isolated: string[];
  roles: StructuralRoles;
}

type ProgressCallback = (percent: number, phase: string) => void;

// ============================================================================
// SERVICE
// ============================================================================

type RequestKind = 'insights' | 'layout';

interface PendingRequest {
  id: number;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  onProgress: ProgressCallback | null;
}

const RESULT_KIND: Record<string, RequestKind> = {
  insightsResult: 'insights',
  layoutResult: 'layout',
};

class GraphWorkerService {
  private worker: Worker | null = null;
  // One pending request per kind: a new insights request replaces the previous
  // insights request, never a layout. The worker handles
  // messages in order, so each answer is matched to its request by id; an
  // answer to a replaced request is dropped.
  private pending = new Map<RequestKind, PendingRequest>();
  private nextId = 1;

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL('../workers/graphWorker.ts', import.meta.url),
        { type: 'module' }
      );
      this.worker.onmessage = (event) => this.handleMessage(event.data);
      this.worker.onerror = (error) => {
        // The worker itself failed: every request still waiting fails with it
        for (const request of this.pending.values()) request.reject(error);
        this.pending.clear();
      };
    }
    return this.worker;
  }

  /** The pending request this response answers, if it is still awaited */
  private takeMatching(requestId: number | undefined, kind?: RequestKind): PendingRequest | null {
    for (const [k, request] of this.pending) {
      if (kind && k !== kind) continue;
      if (request.id === requestId) {
        this.pending.delete(k);
        return request;
      }
    }
    return null;
  }

  private handleMessage(response: any) {
    if (response.type === 'progress') {
      for (const request of this.pending.values()) {
        if (request.id === response.requestId) request.onProgress?.(response.percent, response.phase);
      }
      return;
    }
    if (response.type === 'error') {
      this.takeMatching(response.requestId)?.reject(new Error(response.message));
      return;
    }
    const kind = RESULT_KIND[response.type];
    if (!kind) return;
    const request = this.takeMatching(response.requestId, kind);
    if (!request) return; // Stale: its request was replaced
    request.resolve(response.type === 'insightsResult' ? response.data : response.positions);
  }

  /** Send a request, replacing (and settling) the previous one of the same kind */
  private send<T>(kind: RequestKind, message: Record<string, unknown>, onProgress: ProgressCallback | null): Promise<T> {
    const worker = this.getWorker();
    const previous = this.pending.get(kind);
    if (previous) {
      this.pending.delete(kind);
      previous.reject(new SupersededError(`${kind} superseded by a newer request`));
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(kind, { id, resolve, reject, onProgress });
      worker.postMessage({ ...message, requestId: id });
    });
  }

  /**
   * Compute all graph insights in the worker thread.
   */
  computeInsights(
    elements: Element[],
    links: Link[],
    onProgress?: ProgressCallback
  ): Promise<WorkerInsightsData> {
    return this.send('insights', {
      type: 'computeInsights',
      elements: toLayoutNodes(elements),
      links: toLayoutEdges(links),
    }, onProgress ?? null);
  }

  /**
   * Compute layout positions in the worker thread.
   */
  computeLayout(
    elements: Element[],
    links: Link[],
    options: LayoutOptions,
    onProgress?: ProgressCallback
  ): Promise<Record<string, { x: number; y: number }>> {
    return this.send('layout', {
      type: 'computeLayout',
      elements: toLayoutNodes(elements),
      links: toLayoutEdges(links),
      options,
    }, onProgress ?? null);
  }
}

export const graphWorkerService = new GraphWorkerService();
