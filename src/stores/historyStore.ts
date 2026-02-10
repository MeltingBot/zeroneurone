import { create } from 'zustand';
import type { Element, Link } from '../types';

interface HistoryAction {
  type: 'create-element' | 'delete-element' | 'update-element' | 'move-element' |
        'create-link' | 'delete-link' | 'update-link' |
        'create-elements' | 'delete-elements' | 'move-elements';
  // Data for undoing the action
  undo: {
    elements?: Element[];
    links?: Link[];
    positions?: { id: string; position: { x: number; y: number } }[];
    // For update-element: the previous values
    elementId?: string;
    changes?: Partial<Element>;
    // Tab membership to restore on undo (tabId → elementIds[])
    tabMembership?: Record<string, string[]>;
  };
  // Data for redoing the action
  redo: {
    elements?: Element[];
    links?: Link[];
    positions?: { id: string; position: { x: number; y: number } }[];
    elementIds?: string[];
    linkIds?: string[];
    // For update-element: the new values
    elementId?: string;
    changes?: Partial<Element>;
    // Tab membership to restore on redo (tabId → elementIds[])
    tabMembership?: Record<string, string[]>;
  };
}

interface HistoryState {
  past: HistoryAction[];
  future: HistoryAction[];
  maxHistory: number;

  // Actions
  pushAction: (action: HistoryAction) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  popUndo: () => HistoryAction | null;
  popRedo: () => HistoryAction | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  maxHistory: 50,

  pushAction: (action) => {
    set((state) => ({
      past: [...state.past.slice(-state.maxHistory + 1), action],
      future: [], // Clear future when new action is performed
    }));
  },

  // Pop action from past without executing (for external handlers)
  popUndo: () => {
    const { past } = get();
    if (past.length === 0) return null;

    const action = past[past.length - 1];
    set((state) => ({
      past: state.past.slice(0, -1),
      future: [action, ...state.future],
    }));
    return action;
  },

  // Pop action from future without executing (for external handlers)
  popRedo: () => {
    const { future } = get();
    if (future.length === 0) return null;

    const action = future[0];
    set((state) => ({
      past: [...state.past, action],
      future: state.future.slice(1),
    }));
    return action;
  },

  // Execute undo operation
  undo: async () => {
    const { past } = get();
    if (past.length === 0) return;

    const action = past[past.length - 1];
    set((state) => ({
      past: state.past.slice(0, -1),
      future: [action, ...state.future],
    }));

    // Import dynamically to avoid circular dependencies
    const { useInvestigationStore } = await import('./investigationStore');
    const store = useInvestigationStore.getState();

    switch (action.type) {
      case 'delete-elements':
      case 'delete-element':
        // Restore deleted elements and links in a single batch (one Y.Doc transaction)
        store.pasteElements(action.undo.elements || [], action.undo.links || []);
        // Restore tab membership (elements were removed from tabs on delete)
        if (action.undo.tabMembership) {
          const { useTabStore } = await import('./tabStore');
          for (const [tabId, elementIds] of Object.entries(action.undo.tabMembership)) {
            await useTabStore.getState().addMembers(tabId, elementIds);
          }
        }
        break;

      case 'create-elements':
      case 'create-element':
        // Capture tab membership before deleting (for redo restore)
        if (action.redo.elementIds) {
          const { useTabStore } = await import('./tabStore');
          const tabStore = useTabStore.getState();
          const membership: Record<string, string[]> = {};
          let hasAny = false;
          for (const id of action.redo.elementIds) {
            for (const tab of tabStore.getTabsForElement(id)) {
              if (!membership[tab.id]) membership[tab.id] = [];
              membership[tab.id].push(id);
              hasAny = true;
            }
          }
          if (hasAny) action.redo.tabMembership = membership;
          // Delete created elements
          await store.deleteElements(action.redo.elementIds);
        }
        // Also delete created links (for paste/duplicate operations)
        if (action.redo.linkIds) {
          await store.deleteLinks(action.redo.linkIds);
        }
        break;

      case 'update-element':
        // Restore previous values
        if (action.undo.elementId && action.undo.changes) {
          await store.updateElement(action.undo.elementId, action.undo.changes);
        }
        break;

      case 'move-elements':
      case 'move-element':
        // Restore previous positions
        if (action.undo.positions) {
          await store.updateElementPositions(action.undo.positions);
        }
        break;
    }
  },

  // Execute redo operation
  redo: async () => {
    const { future } = get();
    if (future.length === 0) return;

    const action = future[0];
    set((state) => ({
      past: [...state.past, action],
      future: state.future.slice(1),
    }));

    // Import dynamically to avoid circular dependencies
    const { useInvestigationStore } = await import('./investigationStore');
    const store = useInvestigationStore.getState();

    switch (action.type) {
      case 'delete-elements':
      case 'delete-element':
        // Re-delete elements
        if (action.redo.elementIds) {
          await store.deleteElements(action.redo.elementIds);
        }
        if (action.redo.linkIds) {
          await store.deleteLinks(action.redo.linkIds);
        }
        break;

      case 'create-elements':
      case 'create-element':
        // Re-create elements in a single batch (one Y.Doc transaction)
        store.pasteElements(action.redo.elements || [], action.redo.links || []);
        // Restore tab membership (captured during undo)
        if (action.redo.tabMembership) {
          const { useTabStore } = await import('./tabStore');
          for (const [tabId, elementIds] of Object.entries(action.redo.tabMembership)) {
            await useTabStore.getState().addMembers(tabId, elementIds);
          }
        }
        break;

      case 'update-element':
        // Re-apply changes
        if (action.redo.elementId && action.redo.changes) {
          await store.updateElement(action.redo.elementId, action.redo.changes);
        }
        break;

      case 'move-elements':
      case 'move-element':
        // Apply new positions
        if (action.redo.positions) {
          await store.updateElementPositions(action.redo.positions);
        }
        break;
    }
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  clear: () => {
    set({ past: [], future: [] });
  },
}));
