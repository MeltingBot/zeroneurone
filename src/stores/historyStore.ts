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
        // Restore deleted elements
        if (action.undo.elements) {
          for (const el of action.undo.elements) {
            await store.createElement(el.label, el.position, {
              ...el,
              id: el.id,
            });
          }
        }
        // Restore deleted links
        if (action.undo.links) {
          for (const link of action.undo.links) {
            await store.createLink(link.fromId, link.toId, {
              ...link,
              id: link.id,
            });
          }
        }
        break;

      case 'create-elements':
      case 'create-element':
        // Delete created elements
        if (action.redo.elementIds) {
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
        // Re-create elements
        if (action.redo.elements) {
          for (const el of action.redo.elements) {
            await store.createElement(el.label, el.position, el);
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
