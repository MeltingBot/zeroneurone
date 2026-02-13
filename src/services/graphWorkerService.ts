/**
 * Graph Worker Service
 *
 * Main-thread interface for the graph worker.
 * Provides async methods for insights, layout, and path computations.
 */

import type { Element, Link } from '../types';

// ============================================================================
// TYPES
// ============================================================================

interface SerializedElement {
  id: string;
  label: string;
  isGroup?: boolean;
  position: { x: number; y: number };
}

interface SerializedLink {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
}

export interface WorkerInsightsData {
  clusters: { id: number; elementIds: string[]; size: number }[];
  centrality: { elementId: string; degree: number; betweenness: number; score: number }[];
  bridges: string[];
  isolated: string[];
  similarLabels: { elementId1: string; elementId2: string; similarity: number }[];
}

export type LayoutType = 'force' | 'circular' | 'grid' | 'random' | 'hierarchy';

export interface LayoutOptions {
  layoutType: LayoutType;
  center?: { x: number; y: number };
}

type ProgressCallback = (percent: number, phase: string) => void;

// ============================================================================
// SERVICE
// ============================================================================

class GraphWorkerService {
  private worker: Worker | null = null;
  private pendingResolve: ((value: any) => void) | null = null;
  private pendingReject: ((reason: any) => void) | null = null;
  private progressCallback: ProgressCallback | null = null;

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL('../workers/graphWorker.ts', import.meta.url),
        { type: 'module' }
      );
      this.worker.onmessage = (event) => this.handleMessage(event.data);
      this.worker.onerror = (error) => {
        if (this.pendingReject) {
          this.pendingReject(error);
          this.pendingResolve = null;
          this.pendingReject = null;
        }
      };
    }
    return this.worker;
  }

  private handleMessage(response: any) {
    switch (response.type) {
      case 'progress':
        this.progressCallback?.(response.percent, response.phase);
        break;
      case 'insightsResult':
        this.pendingResolve?.(response.data);
        this.pendingResolve = null;
        this.pendingReject = null;
        break;
      case 'layoutResult':
        this.pendingResolve?.(response.positions);
        this.pendingResolve = null;
        this.pendingReject = null;
        break;
      case 'pathResult':
        this.pendingResolve?.(response.paths);
        this.pendingResolve = null;
        this.pendingReject = null;
        break;
      case 'error':
        this.pendingReject?.(new Error(response.message));
        this.pendingResolve = null;
        this.pendingReject = null;
        break;
    }
  }

  private serializeElements(elements: Element[]): SerializedElement[] {
    return elements.map(el => ({
      id: el.id,
      label: el.label,
      isGroup: el.isGroup,
      position: el.position,
    }));
  }

  private serializeLinks(links: Link[]): SerializedLink[] {
    return links.map(l => ({
      id: l.id,
      fromId: l.fromId,
      toId: l.toId,
      label: l.label,
    }));
  }

  /**
   * Compute all graph insights in the worker thread.
   */
  async computeInsights(
    elements: Element[],
    links: Link[],
    onProgress?: ProgressCallback
  ): Promise<WorkerInsightsData> {
    this.progressCallback = onProgress ?? null;
    const worker = this.getWorker();

    return new Promise((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;
      worker.postMessage({
        type: 'computeInsights',
        elements: this.serializeElements(elements),
        links: this.serializeLinks(links),
      });
    });
  }

  /**
   * Compute layout positions in the worker thread.
   */
  async computeLayout(
    elements: Element[],
    links: Link[],
    options: LayoutOptions,
    onProgress?: ProgressCallback
  ): Promise<Record<string, { x: number; y: number }>> {
    this.progressCallback = onProgress ?? null;
    const worker = this.getWorker();

    return new Promise((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;
      worker.postMessage({
        type: 'computeLayout',
        elements: this.serializeElements(elements),
        links: this.serializeLinks(links),
        options,
      });
    });
  }

  /**
   * Find paths between two elements in the worker thread.
   */
  async findPaths(
    elements: Element[],
    links: Link[],
    fromId: string,
    toId: string
  ): Promise<{ path: string[]; length: number }[]> {
    this.progressCallback = null;
    const worker = this.getWorker();

    return new Promise((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;
      worker.postMessage({
        type: 'findPaths',
        elements: this.serializeElements(elements),
        links: this.serializeLinks(links),
        fromId,
        toId,
      });
    });
  }

  /**
   * Terminate the worker.
   */
  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingResolve = null;
    this.pendingReject = null;
    this.progressCallback = null;
  }
}

export const graphWorkerService = new GraphWorkerService();
