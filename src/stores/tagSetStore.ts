import { create } from 'zustand';
import { tagSetRepository } from '../db/repositories';
import type { TagSet, TagSetId, SuggestedProperty } from '../types';

interface TagSetState {
  // State
  tagSets: Map<TagSetId, TagSet>;
  isLoaded: boolean;
  isLoading: boolean;

  // Actions - Load
  load: () => Promise<void>;

  // Actions - CRUD
  getById: (id: TagSetId) => TagSet | undefined;
  getByName: (name: string) => TagSet | undefined;
  getAll: () => TagSet[];
  create: (data: Omit<TagSet, 'id' | 'createdAt' | 'updatedAt'>) => Promise<TagSet>;
  update: (id: TagSetId, changes: Partial<Omit<TagSet, 'id' | 'createdAt'>>) => Promise<void>;
  delete: (id: TagSetId) => Promise<void>;
  resetToDefaults: () => Promise<void>;

  // Actions - Helpers
  nameExists: (name: string, excludeId?: TagSetId) => boolean;
  getSuggestedProperties: (tagName: string) => SuggestedProperty[];
}

export const useTagSetStore = create<TagSetState>((set, get) => ({
  tagSets: new Map(),
  isLoaded: false,
  isLoading: false,

  load: async () => {
    if (get().isLoading) return;

    set({ isLoading: true });

    // Initialize with defaults if empty
    await tagSetRepository.initializeIfEmpty();

    // Load all TagSets
    const tagSets = await tagSetRepository.getAll();

    set({
      tagSets: new Map(tagSets.map(t => [t.id, t])),
      isLoaded: true,
      isLoading: false,
    });
  },

  getById: (id) => {
    return get().tagSets.get(id);
  },

  getByName: (name) => {
    const normalized = name.toLowerCase().trim();
    return Array.from(get().tagSets.values()).find(
      t => t.name.toLowerCase() === normalized
    );
  },

  getAll: () => {
    return Array.from(get().tagSets.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'fr')
    );
  },

  create: async (data) => {
    const tagSet = await tagSetRepository.create(data);
    set((state) => {
      const newMap = new Map(state.tagSets);
      newMap.set(tagSet.id, tagSet);
      return { tagSets: newMap };
    });
    return tagSet;
  },

  update: async (id, changes) => {
    await tagSetRepository.update(id, changes);

    // Refresh from DB to get updated timestamps
    const updated = await tagSetRepository.getById(id);
    if (updated) {
      set((state) => {
        const newMap = new Map(state.tagSets);
        newMap.set(id, updated);
        return { tagSets: newMap };
      });
    }
  },

  delete: async (id) => {
    await tagSetRepository.delete(id);
    set((state) => {
      const newMap = new Map(state.tagSets);
      newMap.delete(id);
      return { tagSets: newMap };
    });
  },

  resetToDefaults: async () => {
    await tagSetRepository.resetToDefaults();
    const tagSets = await tagSetRepository.getAll();
    set({
      tagSets: new Map(tagSets.map(t => [t.id, t])),
    });
  },

  nameExists: (name, excludeId) => {
    const normalized = name.toLowerCase().trim();
    return Array.from(get().tagSets.values()).some(
      t => t.name.toLowerCase() === normalized && t.id !== excludeId
    );
  },

  getSuggestedProperties: (tagName) => {
    const tagSet = get().getByName(tagName);
    return tagSet?.suggestedProperties ?? [];
  },
}));
