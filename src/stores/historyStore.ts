import { create } from 'zustand';
import type { Element, Link } from '../types';

interface HistoryAction {
  type: 'create-element' | 'delete-element' | 'update-element' | 'move-element' |
        'create-link' | 'delete-link' | 'update-link' |
        'create-elements' | 'delete-elements' | 'move-elements' |
        'extract-to-element' | 'dissolve-group' | 'remove-from-group' |
        'create-group' | 'delete-tab' | 'delete-view' | 'delete-section' | 'clear-filters';
  // Data for undoing the action
  undo: {
    elements?: Element[];
    links?: Link[];
    positions?: { id: string; position: { x: number; y: number } }[];
    // For update-element: the previous values
    elementId?: string;
    changes?: Partial<Element>;
    // For update-link: the previous values
    linkId?: string;
    linkChanges?: Partial<Link>;
    // Tab membership to restore on undo (tabId → elementIds[])
    tabMembership?: Record<string, string[]>;
    // Opaque snapshots for non-element operations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    snapshot?: any;
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
    // For update-link: the new values
    linkId?: string;
    linkChanges?: Partial<Link>;
    // Tab membership to restore on redo (tabId → elementIds[])
    tabMembership?: Record<string, string[]>;
    // Opaque snapshots for non-element operations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    snapshot?: any;
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

      case 'update-link':
        // Restore previous link values
        if (action.undo.linkId && action.undo.linkChanges) {
          await store.updateLink(action.undo.linkId, action.undo.linkChanges);
        }
        break;

      case 'move-elements':
      case 'move-element':
        // Restore previous positions
        if (action.undo.positions) {
          await store.updateElementPositions(action.undo.positions);
        }
        break;

      case 'extract-to-element':
        // Restore property/event on source element
        if (action.undo.elementId && action.undo.changes) {
          await store.updateElement(action.undo.elementId, action.undo.changes);
        }
        // Delete created element (cascades to delete connected link)
        if (action.redo.elementIds) {
          await store.deleteElements(action.redo.elementIds);
        }
        break;

      case 'dissolve-group':
        // Recreate the group element
        if (action.undo.elements) {
          store.pasteElements(action.undo.elements, []);
        }
        // Restore children to relative positions with parentGroupId
        if (action.undo.positions && action.undo.elements?.[0]) {
          const groupId = action.undo.elements[0].id;
          for (const child of action.undo.positions) {
            await store.updateElement(child.id, {
              parentGroupId: groupId,
              position: child.position,
            });
          }
        }
        break;

      case 'remove-from-group':
        // Restore child to relative position with parentGroupId
        if (action.undo.elementId && action.undo.changes) {
          await store.updateElement(action.undo.elementId, action.undo.changes);
          // Add child back to group's childIds
          const groupId = action.undo.changes.parentGroupId;
          if (groupId) {
            const currentStore = (await import('./investigationStore')).useInvestigationStore.getState();
            const group = currentStore.elements.find(el => el.id === groupId);
            if (group && !group.childIds.includes(action.undo.elementId)) {
              await currentStore.updateElement(groupId, {
                childIds: [...group.childIds, action.undo.elementId],
              });
            }
          }
        }
        break;

      case 'create-group':
        // Undo group creation: restore children to absolute positions, delete group
        if (action.undo.positions) {
          for (const child of action.undo.positions) {
            await store.updateElement(child.id, { parentGroupId: null, position: child.position });
          }
        }
        if (action.redo.elementIds) {
          await store.deleteElements(action.redo.elementIds);
        }
        break;

      case 'delete-tab':
        // Restore deleted tab
        if (action.undo.snapshot) {
          const { useTabStore } = await import('./tabStore');
          await useTabStore.getState().restoreTab(action.undo.snapshot);
        }
        break;

      case 'delete-view':
        // Restore deleted view
        if (action.undo.snapshot) {
          const { useViewStore } = await import('./viewStore');
          useViewStore.getState().restoreView(action.undo.snapshot);
        }
        break;

      case 'delete-section':
        // Restore deleted report section
        if (action.undo.snapshot) {
          const { useReportStore } = await import('./reportStore');
          await useReportStore.getState().restoreSection(action.undo.snapshot);
        }
        break;

      case 'clear-filters':
        // Restore previous filter state
        if (action.undo.snapshot) {
          const { useViewStore } = await import('./viewStore');
          const vs = useViewStore.getState();
          vs.setFilters(action.undo.snapshot.filters);
          if (action.undo.snapshot.hiddenElementIds?.length > 0) {
            vs.hideElements(action.undo.snapshot.hiddenElementIds);
          }
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

      case 'update-link':
        // Re-apply link changes
        if (action.redo.linkId && action.redo.linkChanges) {
          await store.updateLink(action.redo.linkId, action.redo.linkChanges);
        }
        break;

      case 'move-elements':
      case 'move-element':
        // Apply new positions
        if (action.redo.positions) {
          await store.updateElementPositions(action.redo.positions);
        }
        break;

      case 'extract-to-element':
        // Re-create element and link
        store.pasteElements(action.redo.elements || [], action.redo.links || []);
        // Remove property/event from source again
        if (action.redo.elementId && action.redo.changes) {
          await store.updateElement(action.redo.elementId, action.redo.changes);
        }
        break;

      case 'dissolve-group':
        // Convert children to absolute positions and clear parentGroupId
        if (action.undo.positions && action.undo.elements?.[0]) {
          const group = action.undo.elements[0];
          for (const child of action.undo.positions) {
            await store.updateElement(child.id, {
              parentGroupId: null,
              position: {
                x: child.position.x + group.position.x,
                y: child.position.y + group.position.y,
              },
            });
          }
        }
        // Delete the group element
        if (action.redo.elementIds) {
          await store.deleteElements(action.redo.elementIds);
        }
        break;

      case 'remove-from-group':
        // Remove child from group (set absolute position, clear parentGroupId)
        if (action.redo.elementId && action.redo.changes) {
          await store.updateElement(action.redo.elementId, action.redo.changes);
          // Remove child from group's childIds
          const groupId = action.undo.changes?.parentGroupId;
          if (groupId) {
            const currentStore = (await import('./investigationStore')).useInvestigationStore.getState();
            const group = currentStore.elements.find(el => el.id === groupId);
            if (group) {
              await currentStore.updateElement(groupId, {
                childIds: group.childIds.filter(id => id !== action.redo.elementId),
              });
            }
          }
        }
        break;

      case 'create-group':
        // Redo group creation: recreate group, move children to relative positions
        if (action.redo.elements) {
          store.pasteElements(action.redo.elements, []);
          const group = action.redo.elements[0];
          if (action.redo.positions) {
            for (const child of action.redo.positions) {
              await store.updateElement(child.id, { parentGroupId: group.id, position: child.position });
            }
          }
        }
        break;

      case 'delete-tab':
        // Re-delete tab
        if (action.redo.snapshot) {
          const { useTabStore } = await import('./tabStore');
          await useTabStore.getState().deleteTab(action.redo.snapshot);
        }
        break;

      case 'delete-view':
        // Re-delete view
        if (action.redo.snapshot) {
          const { useViewStore } = await import('./viewStore');
          await useViewStore.getState().deleteView(action.redo.snapshot);
        }
        break;

      case 'delete-section':
        // Re-delete section
        if (action.redo.snapshot) {
          const { useReportStore } = await import('./reportStore');
          await useReportStore.getState().removeSection(action.redo.snapshot);
        }
        break;

      case 'clear-filters':
        // Re-clear filters (restore "after" snapshot if available, else just clear)
        {
          const { useViewStore } = await import('./viewStore');
          const vs = useViewStore.getState();
          if (action.redo.snapshot) {
            vs.setFilters(action.redo.snapshot.filters);
            vs.showAllElements();
            if (action.redo.snapshot.hiddenElementIds?.length > 0) {
              vs.hideElements(action.redo.snapshot.hiddenElementIds);
            }
          } else {
            vs.clearFilters();
            vs.showAllElements();
          }
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
