import { create } from 'zustand';
import type {
  ViewFilters,
  DisplayMode,
  ElementId,
  View,
  InvestigationId,
  Position,
  Element,
} from '../types';
import { DEFAULT_FILTERS } from '../types';
import { db } from '../db/database';
import { generateUUID } from '../utils';

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

  // Display mode
  displayMode: DisplayMode;

  // Filters
  filters: ViewFilters;
  hiddenElementIds: Set<ElementId>;

  // Focus mode
  focusElementId: ElementId | null;
  focusDepth: number;

  // Saved views
  savedViews: View[];

  // Actions - Viewport
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  setZoom: (zoom: number) => void;
  panTo: (x: number, y: number) => void;
  saveViewportForInvestigation: (investigationId: InvestigationId) => void;
  loadViewportForInvestigation: (investigationId: InvestigationId) => boolean;
  requestViewportChange: (viewport: { x: number; y: number; zoom: number }) => void;
  clearPendingViewport: () => void;

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
  showAllElements: () => void;

  // Actions - Focus mode
  setFocus: (elementId: ElementId, depth: number) => void;
  clearFocus: () => void;

  // Actions - Saved views
  loadViews: (investigationId: InvestigationId) => Promise<void>;
  saveView: (investigationId: InvestigationId, name: string, options?: { includePositions?: boolean; elements?: Element[] }) => Promise<View>;
  loadView: (view: View, updatePositions?: (positions: { id: ElementId; position: Position }[]) => Promise<void>) => void;
  deleteView: (viewId: string) => Promise<void>;

  // Derived
  hasActiveFilters: () => boolean;

  // Reset investigation-specific state
  resetInvestigationState: () => void;
}

export const useViewStore = create<ViewState>((set, get) => ({
  viewport: { x: 0, y: 0, zoom: 1 },
  pendingViewport: null,
  displayMode: 'canvas',
  filters: { ...DEFAULT_FILTERS },
  hiddenElementIds: new Set(),
  focusElementId: null,
  focusDepth: 1,
  savedViews: [],

  // Viewport
  setViewport: (viewport) => {
    set({ viewport });
  },

  // Save viewport for a specific investigation
  saveViewportForInvestigation: (investigationId: InvestigationId) => {
    const { viewport } = get();
    try {
      localStorage.setItem(`viewport_${investigationId}`, JSON.stringify(viewport));
    } catch {
      // Ignore localStorage errors
    }
  },

  // Load viewport for a specific investigation
  loadViewportForInvestigation: (investigationId: InvestigationId) => {
    try {
      const saved = localStorage.getItem(`viewport_${investigationId}`);
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

  requestViewportChange: (viewport) => {
    set({ pendingViewport: viewport });
  },

  clearPendingViewport: () => {
    set({ pendingViewport: null });
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
    set({ filters: { ...DEFAULT_FILTERS } });
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

  showAllElements: () => {
    set({ hiddenElementIds: new Set() });
  },

  // Focus mode
  setFocus: (elementId, depth) => {
    set({ focusElementId: elementId, focusDepth: depth });
  },

  clearFocus: () => {
    set({ focusElementId: null, focusDepth: 1 });
  },

  // Saved views
  loadViews: async (investigationId) => {
    const views = await db.views.where({ investigationId }).toArray();
    set({ savedViews: views });
  },

  saveView: async (investigationId, name, options) => {
    const state = get();
    const view: View = {
      id: generateUUID(),
      investigationId,
      name,
      viewport: { ...state.viewport },
      filters: { ...state.filters },
      hiddenElementIds: Array.from(state.hiddenElementIds),
      displayMode: state.displayMode,
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

    // Restore element positions if saved and callback provided
    if (view.elementPositions && view.elementPositions.length > 0 && updatePositions) {
      updatePositions(view.elementPositions);
    }
  },

  deleteView: async (viewId) => {
    await db.views.delete(viewId);
    set((state) => ({
      savedViews: state.savedViews.filter((v) => v.id !== viewId),
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
      filters.dateFrom !== null ||
      filters.dateTo !== null ||
      filters.hasGeo !== null
    );
  },

  // Reset investigation-specific state (called when closing an investigation)
  resetInvestigationState: () => {
    set({
      viewport: { x: 0, y: 0, zoom: 1 },
      filters: { ...DEFAULT_FILTERS },
      hiddenElementIds: new Set(),
      focusElementId: null,
      focusDepth: 1,
      savedViews: [],
      displayMode: 'canvas',
    });
  },
}));
