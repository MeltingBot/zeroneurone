import { create } from 'zustand';
import type { ElementId, LinkId } from '../types';

interface SelectionState {
  selectedElementIds: Set<ElementId>;
  selectedLinkIds: Set<LinkId>;
  editingElementId: ElementId | null;
  editingLinkId: LinkId | null;

  // Actions
  selectElement: (id: ElementId, addToSelection?: boolean) => void;
  selectElements: (ids: ElementId[], addToSelection?: boolean) => void;
  deselectElement: (id: ElementId) => void;
  toggleElement: (id: ElementId) => void;

  selectLink: (id: LinkId, addToSelection?: boolean) => void;
  selectLinks: (ids: LinkId[], addToSelection?: boolean) => void;
  deselectLink: (id: LinkId) => void;
  toggleLink: (id: LinkId) => void;

  // Select both elements and links at once (for box selection)
  selectBoth: (elementIds: ElementId[], linkIds: LinkId[], addToSelection?: boolean) => void;

  clearSelection: () => void;
  clearElementSelection: () => void;
  clearLinkSelection: () => void;

  // Editing
  startEditingElement: (id: ElementId) => void;
  startEditingLink: (id: LinkId) => void;
  stopEditing: () => void;

  // Derived
  hasSelection: () => boolean;
  getSelectedElementIds: () => ElementId[];
  getSelectedLinkIds: () => LinkId[];
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedElementIds: new Set(),
  selectedLinkIds: new Set(),
  editingElementId: null,
  editingLinkId: null,

  selectElement: (id: ElementId, addToSelection = false) => {
    set((state) => {
      const newSet = addToSelection
        ? new Set(state.selectedElementIds)
        : new Set<ElementId>();
      newSet.add(id);
      return {
        selectedElementIds: newSet,
        selectedLinkIds: addToSelection ? state.selectedLinkIds : new Set(),
      };
    });
  },

  selectElements: (ids: ElementId[], addToSelection = false) => {
    set((state) => {
      const newSet = addToSelection
        ? new Set(state.selectedElementIds)
        : new Set<ElementId>();
      ids.forEach((id) => newSet.add(id));
      return {
        selectedElementIds: newSet,
        selectedLinkIds: addToSelection ? state.selectedLinkIds : new Set(),
      };
    });
  },

  deselectElement: (id: ElementId) => {
    set((state) => {
      const newSet = new Set(state.selectedElementIds);
      newSet.delete(id);
      return { selectedElementIds: newSet };
    });
  },

  toggleElement: (id: ElementId) => {
    const { selectedElementIds } = get();
    if (selectedElementIds.has(id)) {
      get().deselectElement(id);
    } else {
      get().selectElement(id, true);
    }
  },

  selectLink: (id: LinkId, addToSelection = false) => {
    set((state) => {
      const newSet = addToSelection
        ? new Set(state.selectedLinkIds)
        : new Set<LinkId>();
      newSet.add(id);
      return {
        selectedLinkIds: newSet,
        selectedElementIds: addToSelection ? state.selectedElementIds : new Set(),
      };
    });
  },

  selectLinks: (ids: LinkId[], addToSelection = false) => {
    set((state) => {
      const newSet = addToSelection
        ? new Set(state.selectedLinkIds)
        : new Set<LinkId>();
      ids.forEach((id) => newSet.add(id));
      return {
        selectedLinkIds: newSet,
        selectedElementIds: addToSelection ? state.selectedElementIds : new Set(),
      };
    });
  },

  deselectLink: (id: LinkId) => {
    set((state) => {
      const newSet = new Set(state.selectedLinkIds);
      newSet.delete(id);
      return { selectedLinkIds: newSet };
    });
  },

  toggleLink: (id: LinkId) => {
    const { selectedLinkIds } = get();
    if (selectedLinkIds.has(id)) {
      get().deselectLink(id);
    } else {
      get().selectLink(id, true);
    }
  },

  selectBoth: (elementIds: ElementId[], linkIds: LinkId[], addToSelection = false) => {
    set((state) => {
      const newElementSet = addToSelection
        ? new Set(state.selectedElementIds)
        : new Set<ElementId>();
      const newLinkSet = addToSelection
        ? new Set(state.selectedLinkIds)
        : new Set<LinkId>();
      elementIds.forEach((id) => newElementSet.add(id));
      linkIds.forEach((id) => newLinkSet.add(id));
      return {
        selectedElementIds: newElementSet,
        selectedLinkIds: newLinkSet,
      };
    });
  },

  clearSelection: () => {
    set({
      selectedElementIds: new Set(),
      selectedLinkIds: new Set(),
    });
  },

  clearElementSelection: () => {
    set({ selectedElementIds: new Set() });
  },

  clearLinkSelection: () => {
    set({ selectedLinkIds: new Set() });
  },

  startEditingElement: (id: ElementId) => {
    set({ editingElementId: id, editingLinkId: null });
  },

  startEditingLink: (id: LinkId) => {
    set({ editingLinkId: id, editingElementId: null });
  },

  stopEditing: () => {
    set({ editingElementId: null, editingLinkId: null });
  },

  hasSelection: () => {
    const { selectedElementIds, selectedLinkIds } = get();
    return selectedElementIds.size > 0 || selectedLinkIds.size > 0;
  },

  getSelectedElementIds: () => {
    return Array.from(get().selectedElementIds);
  },

  getSelectedLinkIds: () => {
    return Array.from(get().selectedLinkIds);
  },
}));
