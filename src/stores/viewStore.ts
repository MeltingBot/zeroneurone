import { create } from 'zustand';
import type {
  ViewFilters,
  DisplayMode,
  ElementId,
  View,
  DossierId,
  Position,
  Element,
} from '../types';
import { DEFAULT_FILTERS } from '../types';
import { db } from '../db/database';
import { generateUUID } from '../utils';
import { onPersistFailure } from '../utils/persistError';
import { setTabViewportBridge, useTabStore } from './tabStore';
import { assertDossierWritable } from '../utils/dossierLock';

/** The tabs filter counts in the "All" view only, and for tabs that still exist */
function tabFilterApplies(includeTabs: string[] | undefined): boolean {
  if (!includeTabs || includeTabs.length === 0) return false;
  const { activeTabId, tabs } = useTabStore.getState();
  return activeTabId === null && tabs.some((tab) => includeTabs.includes(tab.id));
}

interface TimelineState {
  zoom: number;
  viewStartMs: number; // store as ms to avoid Date serialization issues
  mode: 'scatter' | 'swimlane';
  groupingCriterion: string;
  activeTags: string[] | null; // null = all tags, [] = none, [...] = specific
  laneOrder: string[] | null; // null = default alphabetical, [...] = custom order of lane keys
  showLinksInSwimlane: boolean;
  newestFirst: boolean;
  showDensity: boolean;
  showHistogram: boolean;
  histogramMode: 'hour' | 'weekday' | 'month';
  showCausality: boolean;
  causalityMaxDays: number;
  showCreatedAt: boolean;
}

const DEFAULT_TIMELINE: TimelineState = {
  zoom: 5,
  viewStartMs: 0, // 0 = trigger fit-all on mount
  mode: 'scatter',
  groupingCriterion: 'tag',
  activeTags: null,
  laneOrder: null,
  showLinksInSwimlane: false,
  newestFirst: false,
  showDensity: true,
  showHistogram: false,
  histogramMode: 'hour',
  showCausality: false,
  causalityMaxDays: 365,
  showCreatedAt: false,
};

export interface CanvasTemporalState {
  active: boolean;
  /** Selected instant of the navigator, or start of the period */
  date: Date | null;
  /** End of the period; null = instant mode */
  periodEnd: Date | null;
  /** Undated elements and links: shown greyed (true) or hidden (false). */
  showUndated: boolean;
}

const DEFAULT_CANVAS_TEMPORAL: CanvasTemporalState = {
  active: false,
  date: null,
  periodEnd: null,
  showUndated: true,
};

interface ViewState {
  // Viewport
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };

  // Pending viewport change (to be applied by Canvas via React Flow)
  pendingViewport: {
    x: number;
    y: number;
    zoom: number;
  } | null;

  // Pending fitView request (to be applied by Canvas via React Flow)
  pendingFitView: boolean;
  /** Nodes to frame for the pending fitView; null = every node */
  pendingFitViewIds: string[] | null;

  // Display mode
  displayMode: DisplayMode;

  // Filters
  filters: ViewFilters;
  hiddenElementIds: Set<ElementId>;

  // Timeline view state
  timeline: TimelineState;

  // Map temporal navigator — mirror of MapView's scrubber, published
  // here so other views and plugins can follow the scrubbed instant
  // (e.g. sync a communications panel with the device's position).
  // `dateMs` is the selected instant (epoch ms), null when inactive.
  mapTemporal: { active: boolean; dateMs: number | null };

  // Canvas temporal navigator — local display state, never persisted nor synced.
  canvasTemporal: CanvasTemporalState;

  // Saved views
  savedViews: View[];

  // Actions - Timeline
  setTimeline: (updates: Partial<TimelineState>) => void;

  // Actions - Map temporal navigator (written by MapView only)
  setMapTemporal: (state: { active: boolean; dateMs: number | null }) => void;

  // Actions - Canvas time cursor
  setCanvasTemporal: (updates: Partial<CanvasTemporalState>) => void;

  // Actions - Viewport
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  setZoom: (zoom: number) => void;
  panTo: (x: number, y: number) => void;
  saveViewportForDossier: (dossierId: DossierId) => void;
  loadViewportForDossier: (dossierId: DossierId) => boolean;
  requestViewportChange: (viewport: { x: number; y: number; zoom: number }) => void;
  clearPendingViewport: () => void;
  requestFitView: (nodeIds?: string[]) => void;
  clearPendingFitView: () => void;

  // Actions - Display mode
  setDisplayMode: (mode: DisplayMode) => void;

  // Actions - Filters
  setFilters: (filters: Partial<ViewFilters>) => void;
  clearFilters: () => void;
  addIncludeTag: (tag: string) => void;
  removeIncludeTag: (tag: string) => void;
  addExcludeTag: (tag: string) => void;
  removeExcludeTag: (tag: string) => void;

  // Actions - Hidden elements
  hideElement: (id: ElementId) => void;
  hideElements: (ids: ElementId[]) => void;
  showElement: (id: ElementId) => void;
  /** Show these again, leaving the other hidden elements hidden */
  showElements: (ids: ElementId[]) => void;
  showAllElements: () => void;

  // Actions - Saved views
  loadViews: (dossierId: DossierId) => Promise<void>;
  saveView: (dossierId: DossierId, name: string, options?: { includePositions?: boolean; elements?: Element[] }) => Promise<View>;
  loadView: (view: View, updatePositions?: (positions: { id: ElementId; position: Position }[]) => Promise<void>) => void;
  deleteView: (viewId: string) => Promise<void>;
  restoreView: (view: View) => void;

  // Derived
  hasActiveFilters: () => boolean;

  // Reset dossier-specific state
  resetDossierState: () => void;
}

export const useViewStore = create<ViewState>((set, get) => ({
  viewport: { x: 0, y: 0, zoom: 1 },
  pendingViewport: null,
  pendingFitView: false,
  pendingFitViewIds: null,
  displayMode: 'canvas',
  filters: { ...DEFAULT_FILTERS },
  hiddenElementIds: new Set(),
  timeline: { ...DEFAULT_TIMELINE },
  mapTemporal: { active: false, dateMs: null },
  canvasTemporal: { ...DEFAULT_CANVAS_TEMPORAL },
  savedViews: [],

  // Timeline
  setTimeline: (updates) => {
    set((state) => ({
      timeline: { ...state.timeline, ...updates },
    }));
  },

  // Map temporal navigator
  setMapTemporal: (next) => {
    const prev = get().mapTemporal;
    if (prev.active === next.active && prev.dateMs === next.dateMs) return;
    set({ mapTemporal: next });
  },

  // Canvas time cursor
  setCanvasTemporal: (updates) => {
    set((state) => ({ canvasTemporal: { ...state.canvasTemporal, ...updates } }));
  },

  // Viewport
  setViewport: (viewport) => {
    set({ viewport });
  },

  // Save viewport for a specific dossier
  saveViewportForDossier: (dossierId: DossierId) => {
    const { viewport } = get();
    try {
      localStorage.setItem(`viewport_${dossierId}`, JSON.stringify(viewport));
    } catch {
      // Ignore localStorage errors
    }
  },

  // Load viewport for a specific dossier
  loadViewportForDossier: (dossierId: DossierId) => {
    try {
      const saved = localStorage.getItem(`viewport_${dossierId}`);
      if (saved) {
        const viewport = JSON.parse(saved);
        if (viewport && typeof viewport.x === 'number' && typeof viewport.y === 'number' && typeof viewport.zoom === 'number') {
          set({ viewport });
          return true;
        }
      }
    } catch {
      // Ignore parse errors
    }
    return false;
  },

  setZoom: (zoom) => {
    set((state) => ({
      viewport: { ...state.viewport, zoom: Math.max(0.1, Math.min(4, zoom)) },
    }));
  },

  panTo: (x, y) => {
    set((state) => ({
      viewport: { ...state.viewport, x, y },
    }));
  },

  // The last request wins: centring on a search result right after a tab
  // switch must not be undone by the tab's framing, applied later (once its
  // nodes are measured), and the other way round
  requestViewportChange: (viewport) => {
    set({ pendingViewport: viewport, pendingFitView: false, pendingFitViewIds: null });
  },

  clearPendingViewport: () => {
    set({ pendingViewport: null });
  },

  requestFitView: (nodeIds) => {
    set({ pendingFitView: true, pendingFitViewIds: nodeIds?.length ? nodeIds : null, pendingViewport: null });
  },

  clearPendingFitView: () => {
    set({ pendingFitView: false, pendingFitViewIds: null });
  },

  // Display mode
  setDisplayMode: (mode) => {
    set({ displayMode: mode });
  },

  // Filters
  setFilters: (filters) => {
    set((state) => ({
      filters: { ...state.filters, ...filters },
    }));
  },

  clearFilters: () => {
    // The date periods are a setting, not a filter (they narrow nothing and
    // are not listed among the active filters): they stay
    set((state) => ({
      filters: { ...DEFAULT_FILTERS, dateRangeProperties: state.filters.dateRangeProperties ?? [] },
    }));
  },

  addIncludeTag: (tag) => {
    set((state) => ({
      filters: {
        ...state.filters,
        includeTags: state.filters.includeTags.includes(tag)
          ? state.filters.includeTags
          : [...state.filters.includeTags, tag],
      },
    }));
  },

  removeIncludeTag: (tag) => {
    set((state) => ({
      filters: {
        ...state.filters,
        includeTags: state.filters.includeTags.filter((t) => t !== tag),
      },
    }));
  },

  addExcludeTag: (tag) => {
    set((state) => ({
      filters: {
        ...state.filters,
        excludeTags: state.filters.excludeTags.includes(tag)
          ? state.filters.excludeTags
          : [...state.filters.excludeTags, tag],
      },
    }));
  },

  removeExcludeTag: (tag) => {
    set((state) => ({
      filters: {
        ...state.filters,
        excludeTags: state.filters.excludeTags.filter((t) => t !== tag),
      },
    }));
  },

  // Hidden elements
  hideElement: (id) => {
    set((state) => {
      const newSet = new Set(state.hiddenElementIds);
      newSet.add(id);
      return { hiddenElementIds: newSet };
    });
  },

  hideElements: (ids) => {
    set((state) => {
      const newSet = new Set(state.hiddenElementIds);
      ids.forEach((id) => newSet.add(id));
      return { hiddenElementIds: newSet };
    });
  },

  showElement: (id) => {
    set((state) => {
      const newSet = new Set(state.hiddenElementIds);
      newSet.delete(id);
      return { hiddenElementIds: newSet };
    });
  },

  showElements: (ids) => {
    set((state) => {
      const newSet = new Set(state.hiddenElementIds);
      ids.forEach((id) => newSet.delete(id));
      return { hiddenElementIds: newSet };
    });
  },

  showAllElements: () => {
    set({ hiddenElementIds: new Set() });
  },

  // Saved views
  loadViews: async (dossierId) => {
    const views = await db.views.where({ dossierId }).toArray();
    set({ savedViews: views });
  },

  saveView: async (dossierId, name, options) => {
    assertDossierWritable();
    const state = get();
    // Capture active tab for restoration
    const { useTabStore } = await import('./tabStore');
    const currentActiveTabId = useTabStore.getState().activeTabId;
    // The view keeps what narrows the display: filters, how the rest shows
    // (dimmed or hidden), and the query applied
    const { useUIStore } = await import('./uiStore');
    const { useQueryStore } = await import('./queryStore');
    const queryState = useQueryStore.getState();
    const query = queryState.currentAst && queryState.outputMode !== 'none'
      ? { text: queryState.currentText, outputMode: queryState.outputMode }
      : null;

    const view: View = {
      id: generateUUID(),
      dossierId,
      name,
      viewport: { ...state.viewport },
      filters: { ...state.filters },
      hiddenElementIds: Array.from(state.hiddenElementIds),
      displayMode: state.displayMode,
      activeTabId: currentActiveTabId,
      hideFilteredOut: useUIStore.getState().hideFilteredOut,
      query,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Include element positions if requested
    if (options?.includePositions && options?.elements) {
      view.elementPositions = options.elements.map(el => ({
        id: el.id,
        position: { ...el.position },
      }));
    }

    await db.views.add(view);
    set((s) => ({ savedViews: [...s.savedViews, view] }));
    return view;
  },

  loadView: (view, updatePositions) => {
    set({
      viewport: { ...view.viewport },
      filters: { ...view.filters },
      hiddenElementIds: new Set(view.hiddenElementIds),
      displayMode: view.displayMode,
    });

    // Restore how the rest shows and the query (views saved before these
    // existed leave them as they are)
    if (view.hideFilteredOut !== undefined) {
      import('./uiStore').then(({ useUIStore }) => {
        useUIStore.setState({ hideFilteredOut: view.hideFilteredOut! });
      });
    }
    if (view.query !== undefined) {
      import('./queryStore').then(({ useQueryStore }) => {
        const queryStore = useQueryStore.getState();
        if (view.query) {
          // Mode first: running the query (setText) computes what it keeps on
          // the views only when it is applied to them
          queryStore.setOutputMode(view.query.outputMode);
          queryStore.setText(view.query.text);
        } else {
          queryStore.clear();
        }
      });
    }

    // Restore active tab if saved
    if (view.activeTabId !== undefined) {
      import('./tabStore').then(({ useTabStore }) => {
        useTabStore.getState().setActiveTab(view.activeTabId!);
      });
    }

    // Restore element positions if saved and callback provided
    if (view.elementPositions && view.elementPositions.length > 0 && updatePositions) {
      updatePositions(view.elementPositions);
    }
  },

  deleteView: async (viewId) => {
    assertDossierWritable();
    await db.views.delete(viewId);
    set((state) => ({
      savedViews: state.savedViews.filter((v) => v.id !== viewId),
    }));
  },

  restoreView: (view: View) => {
    assertDossierWritable();
    db.views.put(view).catch((err) => onPersistFailure(err, 'view.restore'));
    set((state) => ({
      savedViews: [...state.savedViews, view].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    }));
  },

  // Derived
  hasActiveFilters: () => {
    const { filters } = get();
    return (
      filters.includeTags.length > 0 ||
      filters.excludeTags.length > 0 ||
      filters.hasProperty !== null ||
      filters.textSearch !== '' ||
      filters.minConfidence !== null ||
      (filters.evaluationSources?.length ?? 0) > 0 ||
      (filters.evaluationInfos?.length ?? 0) > 0 ||
      filters.dateFrom !== null ||
      filters.dateTo !== null ||
      filters.hasGeo !== null ||
      (filters.includedDateProperties?.length ?? 0) > 0 ||
      (filters.excludedDateProperties?.length ?? 0) > 0 ||
      tabFilterApplies(filters.includeTabs)
    );
  },

  // Reset dossier-specific state (called when closing an dossier)
  resetDossierState: () => {
    set({
      viewport: { x: 0, y: 0, zoom: 1 },
      pendingFitView: false,
      pendingFitViewIds: null,
      filters: { ...DEFAULT_FILTERS },
      hiddenElementIds: new Set(),
      savedViews: [],
      displayMode: 'canvas',
      timeline: { ...DEFAULT_TIMELINE },
      mapTemporal: { active: false, dateMs: null },
      canvasTemporal: { ...DEFAULT_CANVAS_TEMPORAL },
    });
  },
}));

// Switching tab keeps each tab's zoom and centre (see setActiveTab)
setTabViewportBridge({
  current: () => ({ ...useViewStore.getState().viewport }),
  restore: (viewport) => useViewStore.getState().requestViewportChange(viewport),
  fit: (elementIds) => useViewStore.getState().requestFitView(elementIds),
  canvasShown: () => useViewStore.getState().displayMode === 'canvas',
});
