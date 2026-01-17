import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ModalType, Toast, ToolType, SidePanelTab } from '../types';
import { generateUUID } from '../utils';

export type FontMode = 'readable' | 'handwritten';
export type ThemeMode = 'light' | 'dark';

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
}),
    {
      name: 'zeroneurone-ui-settings',
      partialize: (state) => ({ fontMode: state.fontMode, themeMode: state.themeMode, hideMedia: state.hideMedia, anonymousMode: state.anonymousMode }),
      onRehydrateStorage: () => (state) => {
        // Apply theme on rehydration
        if (state?.themeMode) {
          document.documentElement.setAttribute('data-theme', state.themeMode);
        }
      },
    }
  )
);
