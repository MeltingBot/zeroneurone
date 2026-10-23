import { create } from 'zustand';
import type { CanvasTab, Element, Link } from '../types';

/**
 * Snapshot of a 'tab-membership' action: per tab, the elements it gained and
 * lost (only real changes, so an undo never takes out an element that was
 * already there), the tab created for the occasion if any, and the tab open
 * before and after.
 */
export interface TabMembershipSnapshot {
  changes: { tabId: string; added: string[]; removed: string[] }[];
  createdTab?: CanvasTab;
  activeBefore: string | null;
  activeAfter: string | null;
}

/** Open a tab again after undo/redo, if it still exists ("All" otherwise) */
function reopenTab(tabId: string | null) {
  import('./tabStore').then(({ useTabStore }) => {
    const tabs = useTabStore.getState();
    tabs.setActiveTab(tabId && tabs.tabs.some((t) => t.id === tabId) ? tabId : null);
  });
}

interface HistoryAction {
  type: 'create-element' | 'delete-element' | 'update-element' | 'move-element' |
        'create-link' | 'delete-link' | 'update-link' |
        'create-elements' | 'delete-elements' | 'move-elements' |
        'extract-to-element' | 'dissolve-group' | 'remove-from-group' |
        'create-group' | 'delete-tab' | 'delete-view' | 'delete-section' | 'clear-filters' |
        'add-asset' | 'merge-elements' | 'update-bulk' | 'dismiss-suggestions' | 'tab-membership';
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
    // For update-bulk: previous values of the changed fields, per item
    bulkElements?: { id: string; changes: Partial<Element> }[];
    bulkLinks?: { id: string; changes: Partial<Link> }[];
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
    // For update-bulk: the bulk updates to replay, in order
    bulkCalls?: { kind: 'elements' | 'links'; ids: string[]; changes: Partial<Element> | Partial<Link> }[];
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
  /** Execute an action's undo/redo without touching the stacks (for external
   *  handlers that popped it themselves and don't handle its type) */
  applyUndo: (action: HistoryAction) => Promise<void>;
  applyRedo: (action: HistoryAction) => Promise<void>;
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
    await get().applyUndo(action);
  },

  applyUndo: async (action) => {
    // Import dynamically to avoid circular dependencies
    const { useDossierStore } = await import('./dossierStore');
    const store = useDossierStore.getState();

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

      case 'create-link':
        // Remove the link that was just created
        if (action.redo.linkIds) {
          await store.deleteLinks(action.redo.linkIds);
        }
        break;

      case 'delete-link':
        // Restore deleted links
        if (action.undo.links) {
          store.pasteElements([], action.undo.links);
        }
        break;

      case 'update-link':
        // Restore previous link values
        if (action.undo.linkId && action.undo.linkChanges) {
          await store.updateLink(action.undo.linkId, action.undo.linkChanges);
        }
        break;

      case 'dismiss-suggestions': {
        // Restore the dismissals, then refresh the list so the suggestion is back
        const snap = action.undo.snapshot as { dossierId: string; dismissedSuggestions: string[] } | undefined;
        if (snap) {
          await store.updateDossier(snap.dossierId, { dismissedSuggestions: snap.dismissedSuggestions });
          const { useSuggestionsStore } = await import('./suggestionsStore');
          useSuggestionsStore.getState().refresh();
        }
        break;
      }

      case 'update-bulk':
        // Restore each item's previous values of the fields the bulk edit touched
        for (const { id, changes } of action.undo.bulkElements || []) {
          await store.updateElement(id, changes);
        }
        for (const { id, changes } of action.undo.bulkLinks || []) {
          await store.updateLink(id, changes);
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
            const currentStore = (await import('./dossierStore')).useDossierStore.getState();
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

      case 'tab-membership': {
        // Elements sent to, moved between or gathered in a new canvas tab
        const snap = action.undo.snapshot as TabMembershipSnapshot;
        const { useTabStore } = await import('./tabStore');
        const tabs = useTabStore.getState();
        // The created tab goes as a whole; the other tabs get their members
        // back. Adds before removals: an element moving between two tabs is
        // never, even briefly, in neither.
        const others = snap.changes.filter((c) => c.tabId !== snap.createdTab?.id);
        for (const c of others) {
          if (c.removed.length > 0) await useTabStore.getState().addMembers(c.tabId, c.removed);
        }
        if (snap.createdTab) await tabs.deleteTab(snap.createdTab.id);
        for (const c of others) {
          if (c.added.length > 0) await useTabStore.getState().removeMembers(c.tabId, c.added);
        }
        reopenTab(snap.activeBefore);
        break;
      }

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

      case 'add-asset':
        // Undo asset attachment: detach + remove the asset
        if (action.undo.snapshot?.elementId && action.undo.snapshot?.assetId) {
          await store.removeAsset(action.undo.snapshot.elementId, action.undo.snapshot.assetId);
        }
        break;

      case 'merge-elements': {
        // Put the source element and the dropped links back, then rewind the
        // target and every link the merge rewrote.
        const snap = action.undo.snapshot;
        if (snap) {
          const deleted = new Set<string>(snap.deletedLinkIds);
          const droppedLinks = snap.linksBefore.filter((l: Link) => deleted.has(l.id));
          store.pasteElements([snap.sourceElement], droppedLinks);
          await store.updateElement(snap.targetId, snap.targetBefore);
          for (const before of snap.linksBefore) {
            if (deleted.has(before.id)) continue;
            await store.updateLink(before.id, {
              fromId: before.fromId,
              toId: before.toId,
              label: before.label,
              notes: before.notes,
              tags: before.tags,
              properties: before.properties,
            });
          }
        }
        break;
      }

      default:
        // The entry has already left `past`, so an unhandled type is silently
        // skipped: the user presses Ctrl+Z, nothing happens, and the next one
        // jumps to an older, unrelated action. Surface it instead of hiding it.
        console.warn(`[history] no undo handler for action type "${action.type}"`);
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
    await get().applyRedo(action);
  },

  applyRedo: async (action) => {
    // Import dynamically to avoid circular dependencies
    const { useDossierStore } = await import('./dossierStore');
    const store = useDossierStore.getState();

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

      case 'create-link':
        // Re-create the link
        store.pasteElements([], action.redo.links || []);
        break;

      case 'delete-link':
        // Re-delete links
        if (action.redo.linkIds) {
          await store.deleteLinks(action.redo.linkIds);
        }
        break;

      case 'update-link':
        // Re-apply link changes
        if (action.redo.linkId && action.redo.linkChanges) {
          await store.updateLink(action.redo.linkId, action.redo.linkChanges);
        }
        break;

      case 'dismiss-suggestions': {
        const snap = action.redo.snapshot as { dossierId: string; dismissedSuggestions: string[] } | undefined;
        if (snap) {
          await store.updateDossier(snap.dossierId, { dismissedSuggestions: snap.dismissedSuggestions });
          const { useSuggestionsStore } = await import('./suggestionsStore');
          useSuggestionsStore.getState().refresh();
        }
        break;
      }

      case 'update-bulk':
        for (const call of action.redo.bulkCalls || []) {
          if (call.kind === 'elements') {
            await store.updateElements(call.ids, call.changes as Parameters<typeof store.updateElements>[1]);
          } else {
            await store.updateLinks(call.ids, call.changes as Parameters<typeof store.updateLinks>[1]);
          }
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
            const currentStore = (await import('./dossierStore')).useDossierStore.getState();
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

      case 'tab-membership': {
        const snap = action.redo.snapshot as TabMembershipSnapshot;
        const { useTabStore } = await import('./tabStore');
        const tabs = useTabStore.getState();
        // The created tab comes back with its members in one write: restoreTab
        // writes the Y.Doc asynchronously, members added after could be lost.
        if (snap.createdTab) {
          const own = snap.changes.find((c) => c.tabId === snap.createdTab!.id);
          await tabs.restoreTab({ ...snap.createdTab, memberElementIds: own?.added ?? [] });
        }
        // Adds before removals (see undo)
        const others = snap.changes.filter((c) => c.tabId !== snap.createdTab?.id);
        for (const c of others) {
          if (c.added.length > 0) await useTabStore.getState().addMembers(c.tabId, c.added);
        }
        for (const c of others) {
          if (c.removed.length > 0) await useTabStore.getState().removeMembers(c.tabId, c.removed);
        }
        reopenTab(snap.activeAfter);
        break;
      }

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

      case 'add-asset':
        // Redo asset attachment: re-add the file (saveAsset dedups by hash → same id)
        if (action.redo.snapshot?.elementId && action.redo.snapshot?.file) {
          await store.addAsset(action.redo.snapshot.elementId, action.redo.snapshot.file);
        }
        break;

      case 'merge-elements':
        // The merge is deterministic given the same two elements, so replaying
        // it is enough — and keeps the snapshot in sync with what it produces.
        if (action.redo.snapshot) {
          await store.mergeElements(action.redo.snapshot.targetId, action.redo.snapshot.sourceId);
        }
        break;

      default:
        console.warn(`[history] no redo handler for action type "${action.type}"`);
    }
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  clear: () => {
    set({ past: [], future: [] });
  },
}));
