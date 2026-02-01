import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ModalType, Toast, ToolType, SidePanelTab, DisplayMode } from '../types';
import type { ExtractedMetadata } from '../services/metadataService';
import { generateUUID } from '../utils';

export interface MetadataImportItem {
  elementId: string;
  elementLabel: string;
  filename: string;
  metadata: ExtractedMetadata;
}

/** Data for import placement mode */
export interface ImportPlacementData {
  /** Bounding box of elements to import (min/max coordinates) */
  boundingBox: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
    elementCount: number;
  };
  /** The file to import */
  file: File;
  /** Target investigation ID */
  investigationId: string;
  /** Callback after successful import */
  onComplete?: () => void;
}

export type FontMode = 'readable' | 'handwritten';
export type ThemeMode = 'light' | 'dark';

// Capture handler type - each view registers a function that fits content and returns screenshot
export type CaptureHandler = () => Promise<string | null>;

interface UIState {
  // Modal
  activeModal: ModalType | null;
  modalData: unknown;

  // Side panel
  sidePanelOpen: boolean;
  sidePanelTab: SidePanelTab;

  // Tool
  activeTool: ToolType;

  // Toasts
  toasts: Toast[];

  // Search
  searchOpen: boolean;

  // Font mode (canvas only)
  fontMode: FontMode;

  // Theme mode (entire interface)
  themeMode: ThemeMode;

  // Hide media on elements
  hideMedia: boolean;

  // Anonymous mode (redact names)
  anonymousMode: boolean;

  // Show comment badges on elements
  showCommentBadges: boolean;

  // Minimap
  showMinimap: boolean;

  // Snap-to-grid and alignment guides
  snapToGrid: boolean;
  showAlignGuides: boolean;
  gridSize: number;

  // Metadata import queue
  metadataImportQueue: MetadataImportItem[];

  // Import placement mode
  importPlacementMode: boolean;
  importPlacementData: ImportPlacementData | null;

  // Capture system for report screenshots
  captureHandlers: Map<DisplayMode, CaptureHandler>;

  // Actions - Capture
  registerCaptureHandler: (mode: DisplayMode, handler: CaptureHandler) => void;
  unregisterCaptureHandler: (mode: DisplayMode) => void;
  captureView: (mode: DisplayMode) => Promise<string | null>;

  // Actions - Modal
  openModal: (type: ModalType, data?: unknown) => void;
  closeModal: () => void;

  // Actions - Side panel
  toggleSidePanel: () => void;
  openSidePanel: (tab?: SidePanelTab) => void;
  closeSidePanel: () => void;
  setSidePanelTab: (tab: SidePanelTab) => void;

  // Actions - Tool
  setActiveTool: (tool: ToolType) => void;

  // Actions - Toasts
  showToast: (
    type: Toast['type'],
    message: string,
    duration?: number
  ) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;

  // Actions - Search
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;

  // Actions - Font mode
  setFontMode: (mode: FontMode) => void;
  toggleFontMode: () => void;

  // Actions - Theme mode
  setThemeMode: (mode: ThemeMode) => void;
  toggleThemeMode: () => void;

  // Actions - Hide media
  toggleHideMedia: () => void;

  // Actions - Anonymous mode
  toggleAnonymousMode: () => void;

  // Actions - Comment badges
  toggleShowCommentBadges: () => void;

  // Actions - Minimap
  toggleMinimap: () => void;

  // Actions - Snap-to-grid and alignment guides
  toggleSnapToGrid: () => void;
  toggleAlignGuides: () => void;

  // Actions - Metadata import queue
  pushMetadataImport: (item: MetadataImportItem) => void;
  shiftMetadataImport: () => void;

  // Actions - Import placement mode
  enterImportPlacementMode: (data: ImportPlacementData) => void;
  exitImportPlacementMode: () => void;

  // Actions - Reset investigation-specific state
  resetInvestigationState: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
  activeModal: null,
  modalData: null,
  sidePanelOpen: true,
  sidePanelTab: 'detail',
  activeTool: 'select',
  toasts: [],
  searchOpen: false,
  fontMode: 'readable' as FontMode,
  themeMode: 'light' as ThemeMode,
  hideMedia: false,
  anonymousMode: false,
  showCommentBadges: true,
  showMinimap: true,
  snapToGrid: false,
  showAlignGuides: true,
  gridSize: 20,
  metadataImportQueue: [],
  importPlacementMode: false,
  importPlacementData: null,
  captureHandlers: new Map(),

  // Capture system
  registerCaptureHandler: (mode, handler) => {
    set((state) => {
      const newHandlers = new Map(state.captureHandlers);
      newHandlers.set(mode, handler);
      return { captureHandlers: newHandlers };
    });
  },

  unregisterCaptureHandler: (mode) => {
    set((state) => {
      const newHandlers = new Map(state.captureHandlers);
      newHandlers.delete(mode);
      return { captureHandlers: newHandlers };
    });
  },

  captureView: async (mode) => {
    const handler = get().captureHandlers.get(mode);
    if (handler) {
      return await handler();
    }
    return null;
  },

  // Modal
  openModal: (type, data) => {
    set({ activeModal: type, modalData: data });
  },

  closeModal: () => {
    set({ activeModal: null, modalData: null });
  },

  // Side panel
  toggleSidePanel: () => {
    set((state) => ({ sidePanelOpen: !state.sidePanelOpen }));
  },

  openSidePanel: (tab) => {
    set((state) => ({
      sidePanelOpen: true,
      sidePanelTab: tab ?? state.sidePanelTab,
    }));
  },

  closeSidePanel: () => {
    set({ sidePanelOpen: false });
  },

  setSidePanelTab: (tab) => {
    set({ sidePanelTab: tab, sidePanelOpen: true });
  },

  // Tool
  setActiveTool: (tool) => {
    set({ activeTool: tool });
  },

  // Toasts
  showToast: (type, message, duration = 3000) => {
    const id = generateUUID();
    const toast: Toast = { id, type, message, duration };

    set((state) => ({
      toasts: [...state.toasts, toast],
    }));

    if (duration > 0) {
      setTimeout(() => {
        get().dismissToast(id);
      }, duration);
    }

    return id;
  },

  dismissToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  clearToasts: () => {
    set({ toasts: [] });
  },

  // Search
  openSearch: () => {
    set({ searchOpen: true });
  },

  closeSearch: () => {
    set({ searchOpen: false });
  },

  toggleSearch: () => {
    set((state) => ({ searchOpen: !state.searchOpen }));
  },

  // Font mode (applies only to canvas elements via React state)
  setFontMode: (mode) => {
    set({ fontMode: mode });
  },

  toggleFontMode: () => {
    set((state) => ({
      fontMode: state.fontMode === 'readable' ? 'handwritten' : 'readable',
    }));
  },

  // Theme mode (applies to entire interface via CSS)
  setThemeMode: (mode) => {
    set({ themeMode: mode });
    document.documentElement.setAttribute('data-theme', mode);
  },

  toggleThemeMode: () => {
    set((state) => {
      const newMode = state.themeMode === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', newMode);
      return { themeMode: newMode };
    });
  },

  // Hide media
  toggleHideMedia: () => {
    set((state) => ({ hideMedia: !state.hideMedia }));
  },

  // Anonymous mode
  toggleAnonymousMode: () => {
    set((state) => ({ anonymousMode: !state.anonymousMode }));
  },

  // Comment badges
  toggleShowCommentBadges: () => {
    set((state) => ({ showCommentBadges: !state.showCommentBadges }));
  },

  // Minimap
  toggleMinimap: () => {
    set((state) => ({ showMinimap: !state.showMinimap }));
  },

  // Snap-to-grid and alignment guides
  toggleSnapToGrid: () => {
    set((state) => ({ snapToGrid: !state.snapToGrid }));
  },

  toggleAlignGuides: () => {
    set((state) => ({ showAlignGuides: !state.showAlignGuides }));
  },

  // Metadata import queue
  pushMetadataImport: (item) => {
    set((state) => ({
      metadataImportQueue: [...state.metadataImportQueue, item],
    }));
  },

  shiftMetadataImport: () => {
    set((state) => ({
      metadataImportQueue: state.metadataImportQueue.slice(1),
    }));
  },

  // Import placement mode
  enterImportPlacementMode: (data) => {
    set({
      importPlacementMode: true,
      importPlacementData: data,
      activeModal: null, // Close any open modal
    });
  },

  exitImportPlacementMode: () => {
    set({
      importPlacementMode: false,
      importPlacementData: null,
    });
  },

  // Reset investigation-specific state (called when closing an investigation)
  resetInvestigationState: () => {
    set({
      hideMedia: false,
      anonymousMode: false,
      importPlacementMode: false,
      importPlacementData: null,
    });
  },
}),
    {
      name: 'zeroneurone-ui-settings',
      // Only persist global preferences, NOT investigation-specific settings (hideMedia, anonymousMode)
      partialize: (state) => ({ fontMode: state.fontMode, themeMode: state.themeMode, showCommentBadges: state.showCommentBadges, showMinimap: state.showMinimap, snapToGrid: state.snapToGrid, showAlignGuides: state.showAlignGuides, gridSize: state.gridSize }),
      onRehydrateStorage: () => (state) => {
        // Apply theme on rehydration
        if (state?.themeMode) {
          document.documentElement.setAttribute('data-theme', state.themeMode);
        }
      },
    }
  )
);
