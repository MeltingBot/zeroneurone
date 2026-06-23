import { create } from 'zustand';
import { db } from '../db/database';
import { generateUUID } from '../utils';
import type { JsonMappingTemplate, MappingConfig } from '../utils/jsonMapping';

/**
 * Global store of reusable JSON-import mapping templates (not tied to a dossier).
 * Mirrors the TagSet storage pattern: a global Dexie table + in-memory list.
 */
interface JsonMappingState {
  templates: JsonMappingTemplate[];
  loaded: boolean;
  load: () => Promise<void>;
  save: (name: string, signature: string[], config: MappingConfig) => Promise<JsonMappingTemplate>;
  update: (id: string, patch: { signature?: string[]; config?: MappingConfig }) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useJsonMappingStore = create<JsonMappingState>((set) => ({
  templates: [],
  loaded: false,

  load: async () => {
    try {
      const templates = await db.jsonMappings.orderBy('name').toArray();
      set({ templates, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  save: async (name, signature, config) => {
    const now = new Date();
    const tpl: JsonMappingTemplate = { id: generateUUID(), name, signature, config, createdAt: now, updatedAt: now };
    await db.jsonMappings.add(tpl);
    set((s) => ({ templates: [...s.templates, tpl].sort((a, b) => a.name.localeCompare(b.name)) }));
    return tpl;
  },

  update: async (id, patch) => {
    const now = new Date();
    await db.jsonMappings.update(id, { ...patch, updatedAt: now });
    set((s) => ({ templates: s.templates.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: now } : t)) }));
  },

  rename: async (id, name) => {
    const now = new Date();
    await db.jsonMappings.update(id, { name, updatedAt: now });
    set((s) => ({ templates: s.templates.map((t) => (t.id === id ? { ...t, name, updatedAt: now } : t)).sort((a, b) => a.name.localeCompare(b.name)) }));
  },

  remove: async (id) => {
    await db.jsonMappings.delete(id);
    set((s) => ({ templates: s.templates.filter((t) => t.id !== id) }));
  },
}));
