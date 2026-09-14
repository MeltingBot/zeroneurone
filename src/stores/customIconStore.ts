import { create } from 'zustand';
import { customIconRepository } from '../db/repositories';
import type { CustomIcon, CustomIconId } from '../types';

interface CustomIconState {
  // State
  icons: Map<CustomIconId, CustomIcon>;
  isLoaded: boolean;
  isLoading: boolean;

  // Actions
  load: () => Promise<void>;
  getById: (id: CustomIconId) => CustomIcon | undefined;
  getAll: () => CustomIcon[];
  /** Create from already-sanitized SVG. Dedups on identical content. */
  create: (name: string, svg: string) => Promise<CustomIcon>;
  delete: (id: CustomIconId) => Promise<void>;
}

export const useCustomIconStore = create<CustomIconState>((set, get) => ({
  icons: new Map(),
  isLoaded: false,
  isLoading: false,

  load: async () => {
    if (get().isLoading) return;
    set({ isLoading: true });
    const icons = await customIconRepository.getAll();
    set({
      icons: new Map(icons.map(i => [i.id, i])),
      isLoaded: true,
      isLoading: false,
    });
  },

  getById: (id) => {
    return get().icons.get(id);
  },

  getAll: () => {
    return Array.from(get().icons.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'fr')
    );
  },

  create: async (name, svg) => {
    const icon = await customIconRepository.create(name, svg);
    set((state) => {
      const newMap = new Map(state.icons);
      newMap.set(icon.id, icon);
      return { icons: newMap };
    });
    return icon;
  },

  delete: async (id) => {
    await customIconRepository.delete(id);
    set((state) => {
      const newMap = new Map(state.icons);
      newMap.delete(id);
      return { icons: newMap };
    });
  },
}));
