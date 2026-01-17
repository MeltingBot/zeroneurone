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
  };
  // Data for redoing the action
  redo: {
    elements?: Element[];
    links?: Link[];
    positions?: { id: string; position: { x: number; y: number } }[];
    elementIds?: string[];
    linkIds?: string[];
  };
}

interface HistoryState {
  past: HistoryAction[];
  future: HistoryAction[];
  maxHistory: number;

  // Actions
  pushAction: (action: HistoryAction) => void;
  undo: () => HistoryAction | null;
  redo: () => HistoryAction | null;
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

  undo: () => {
    const { past } = get();
    if (past.length === 0) return null;

    const action = past[past.length - 1];
    set((state) => ({
      past: state.past.slice(0, -1),
      future: [action, ...state.future],
    }));
    return action;
  },

  redo: () => {
    const { future } = get();
    if (future.length === 0) return null;

    const action = future[0];
    set((state) => ({
      past: [...state.past, action],
      future: state.future.slice(1),
    }));
    return action;
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  clear: () => {
    set({ past: [], future: [] });
  },
}));
