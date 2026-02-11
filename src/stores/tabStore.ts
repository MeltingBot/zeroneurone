import { create } from 'zustand';
import * as Y from 'yjs';
import type {
  CanvasTab,
  TabId,
  ElementId,
  InvestigationId,
  Link,
} from '../types';
import { tabRepository } from '../db/repositories/tabRepository';

interface TabState {
  // Data
  tabs: CanvasTab[];
  /** null when no tabs exist, otherwise always a real tab ID */
  activeTabId: TabId | null;

  // Derived sets (recomputed on tab/link changes)
  /** Element IDs that are members of the active tab */
  memberSet: Set<ElementId>;
  /** Element IDs that are ghosts (linked to members but not members themselves) */
  ghostIds: Set<ElementId>;
  /** Element IDs explicitly excluded from ghost appearance in the active tab */
  excludedSet: Set<ElementId>;

  // Actions - CRUD
  loadTabs: (investigationId: InvestigationId) => Promise<void>;
  createTab: (investigationId: InvestigationId, name: string) => Promise<CanvasTab>;
  renameTab: (tabId: TabId, name: string) => Promise<void>;
  deleteTab: (tabId: TabId) => Promise<void>;
  reorderTab: (tabId: TabId, newOrder: number) => Promise<void>;

  // Actions - Navigation
  setActiveTab: (tabId: TabId | null) => void;

  // Actions - Membership
  addMembers: (tabId: TabId, elementIds: ElementId[]) => Promise<void>;
  removeMembers: (tabId: TabId, elementIds: ElementId[]) => Promise<void>;

  // Actions - Ghost exclusion (dismiss a ghost from the active tab)
  excludeFromTab: (tabId: TabId, elementIds: ElementId[]) => Promise<void>;

  // Actions - Viewport per tab
  saveTabViewport: (tabId: TabId, viewport: { x: number; y: number; zoom: number }) => Promise<void>;

  // Actions - Ghost computation
  recomputeGhosts: (links: Link[]) => void;

  // Actions - Cascade (element deleted)
  removeElementFromAllTabs: (investigationId: InvestigationId, elementId: ElementId) => Promise<void>;

  // Actions - Y.js sync (called by investigationStore._syncFromYDoc)
  _syncTabsFromYDoc: (remoteTabs: CanvasTab[]) => void;

  // Queries
  getTabsForElement: (elementId: ElementId) => CanvasTab[];
  isGhost: (elementId: ElementId) => boolean;
  isMember: (elementId: ElementId) => boolean;

  // Restore a previously deleted tab (for undo)
  restoreTab: (tab: CanvasTab) => Promise<void>;

  // Reset
  resetInvestigationState: () => void;
}

// Helper: write tab changes to Y.Doc (fire-and-forget, non-blocking)
async function syncTabToYDoc(
  tabId: string,
  fields: Record<string, any>,
): Promise<void> {
  const { syncService } = await import('../services/syncService');
  const ydoc = syncService.getYDoc();
  if (!ydoc) return;
  const { getYMaps } = await import('../types/yjs');
  const { setLocalOpPending } = await import('./investigationStore');
  setLocalOpPending();
  const { tabs: tabsMap } = getYMaps(ydoc);
  ydoc.transact(() => {
    const ymap = tabsMap.get(tabId) as Y.Map<any> | undefined;
    if (ymap) {
      for (const [key, value] of Object.entries(fields)) {
        ymap.set(key, value);
      }
      ymap.set('updatedAt', new Date().toISOString());
    }
  });
}

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  memberSet: new Set(),
  ghostIds: new Set(),
  excludedSet: new Set(),

  // ── Load ──────────────────────────────────────────────

  loadTabs: async (investigationId) => {
    const tabs = await tabRepository.getByInvestigation(investigationId);
    const firstTab = tabs.length > 0 ? tabs[0] : null;
    set({
      tabs,
      activeTabId: firstTab?.id ?? null,
      memberSet: firstTab ? new Set(firstTab.memberElementIds) : new Set(),
      ghostIds: new Set(),
      excludedSet: firstTab ? new Set(firstTab.excludedElementIds) : new Set(),
    });
  },

  // ── Create ────────────────────────────────────────────

  createTab: async (investigationId, name) => {
    const { tabs } = get();
    const maxOrder = tabs.reduce((max, t) => Math.max(max, t.order), 0);
    const tab = await tabRepository.create(investigationId, name, maxOrder + 1);
    set((s) => ({ tabs: [...s.tabs, tab] }));

    // Y.js sync: create new Y.Map in tabs map
    import('../services/syncService').then(({ syncService }) => {
      const ydoc = syncService.getYDoc();
      if (!ydoc) return;
      import('../types/yjs').then(({ getYMaps }) => {
        import('./investigationStore').then(({ setLocalOpPending }) => {
          import('../services/yjs/tabMapper').then(({ tabToYMap }) => {
            setLocalOpPending();
            const { tabs: tabsMap } = getYMaps(ydoc);
            ydoc.transact(() => {
              tabsMap.set(tab.id, tabToYMap(tab));
            });
          });
        });
      });
    });

    return tab;
  },

  // ── Rename ────────────────────────────────────────────

  renameTab: async (tabId, name) => {
    await tabRepository.update(tabId, { name });
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, name, updatedAt: new Date() } : t)),
    }));
    syncTabToYDoc(tabId, { name });
  },

  // ── Delete ────────────────────────────────────────────

  deleteTab: async (tabId) => {
    await tabRepository.delete(tabId);
    set((s) => {
      const newTabs = s.tabs.filter((t) => t.id !== tabId);
      if (s.activeTabId === tabId) {
        // Switch to the first remaining tab, or null if none left
        const fallback = newTabs.length > 0 ? newTabs[0] : null;
        return {
          tabs: newTabs,
          activeTabId: fallback?.id ?? null,
          memberSet: fallback ? new Set(fallback.memberElementIds) : new Set(),
          ghostIds: new Set(),
          excludedSet: fallback ? new Set(fallback.excludedElementIds) : new Set(),
        };
      }
      return { tabs: newTabs };
    });

    // Y.js sync: delete from tabs map
    import('../services/syncService').then(({ syncService }) => {
      const ydoc = syncService.getYDoc();
      if (!ydoc) return;
      import('../types/yjs').then(({ getYMaps }) => {
        import('./investigationStore').then(({ setLocalOpPending }) => {
          setLocalOpPending();
          const { tabs: tabsMap } = getYMaps(ydoc);
          ydoc.transact(() => {
            tabsMap.delete(tabId);
          });
        });
      });
    });

    // Reassign orphaned elements to the first remaining tab
    const { tabs, addMembers } = get();
    if (tabs.length > 0) {
      const { useInvestigationStore } = await import('./investigationStore');
      const elements = useInvestigationStore.getState().elements;
      const allMembers = new Set<ElementId>();
      for (const tab of tabs) {
        for (const id of tab.memberElementIds) {
          allMembers.add(id);
        }
      }
      const orphanIds = elements
        .filter((el) => !allMembers.has(el.id))
        .map((el) => el.id);
      if (orphanIds.length > 0) {
        await addMembers(tabs[0].id, orphanIds);
      }
    }
  },

  // ── Restore (undo delete) ────────────────────────────

  restoreTab: async (tab: CanvasTab) => {
    // Re-insert into IndexedDB (bulkUpsert uses put which handles re-insertion with same ID)
    await tabRepository.bulkUpsert([tab]);

    // Add to local state
    set((s) => ({
      tabs: [...s.tabs, tab].sort((a, b) => a.order - b.order),
    }));

    // Y.js sync: recreate in tabs map
    import('../services/syncService').then(({ syncService }) => {
      const ydoc = syncService.getYDoc();
      if (!ydoc) return;
      import('../types/yjs').then(({ getYMaps }) => {
        import('./investigationStore').then(({ setLocalOpPending }) => {
          import('../services/yjs/tabMapper').then(({ tabToYMap }) => {
            setLocalOpPending();
            const { tabs: tabsMap } = getYMaps(ydoc);
            ydoc.transact(() => {
              tabsMap.set(tab.id, tabToYMap(tab));
            });
          });
        });
      });
    });
  },

  // ── Reorder ───────────────────────────────────────────

  reorderTab: async (tabId, newOrder) => {
    await tabRepository.update(tabId, { order: newOrder });
    set((s) => ({
      tabs: s.tabs
        .map((t) => (t.id === tabId ? { ...t, order: newOrder, updatedAt: new Date() } : t))
        .sort((a, b) => a.order - b.order),
    }));
    syncTabToYDoc(tabId, { order: newOrder });
  },

  // ── Navigation ────────────────────────────────────────

  setActiveTab: (tabId) => {
    if (tabId === null) {
      // No tabs exist
      set({ activeTabId: null, memberSet: new Set(), ghostIds: new Set(), excludedSet: new Set() });
      return;
    }
    const { tabs } = get();
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    set({
      activeTabId: tabId,
      memberSet: new Set(tab.memberElementIds),
      ghostIds: new Set(), // Reset — will be recomputed by useEffect
      excludedSet: new Set(tab.excludedElementIds),
    });
  },

  // ── Membership ────────────────────────────────────────

  addMembers: async (tabId, elementIds) => {
    const { tabs } = get();
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;

    const existingSet = new Set(tab.memberElementIds);
    const newIds = elementIds.filter((id) => !existingSet.has(id));
    if (newIds.length === 0) return;

    const updatedMembers = [...tab.memberElementIds, ...newIds];
    // Clear exclusions for newly added members (re-admission)
    const addedSet = new Set(newIds);
    const updatedExcluded = tab.excludedElementIds.filter((id) => !addedSet.has(id));
    const excludedChanged = updatedExcluded.length !== tab.excludedElementIds.length;

    await tabRepository.update(tabId, {
      memberElementIds: updatedMembers,
      ...(excludedChanged ? { excludedElementIds: updatedExcluded } : {}),
    });

    set((s) => {
      const newTabs = s.tabs.map((t) =>
        t.id === tabId
          ? { ...t, memberElementIds: updatedMembers, ...(excludedChanged ? { excludedElementIds: updatedExcluded } : {}), updatedAt: new Date() }
          : t,
      );
      const isActive = s.activeTabId === tabId;
      const newMemberSet = isActive ? new Set(updatedMembers) : s.memberSet;
      const newExcludedSet = isActive && excludedChanged ? new Set(updatedExcluded) : s.excludedSet;
      return { tabs: newTabs, memberSet: newMemberSet, excludedSet: newExcludedSet };
    });

    syncTabToYDoc(tabId, {
      memberElementIds: updatedMembers,
      ...(excludedChanged ? { excludedElementIds: updatedExcluded } : {}),
    });
  },

  removeMembers: async (tabId, elementIds) => {
    const { tabs } = get();
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;

    // Safety: never orphan an element — skip those present in only this tab
    const safeToRemove = elementIds.filter((id) => {
      const otherTabs = tabs.filter((t) => t.id !== tabId && t.memberElementIds.includes(id));
      return otherTabs.length > 0;
    });
    if (safeToRemove.length === 0) return;

    const removeSet = new Set(safeToRemove);
    const updatedMembers = tab.memberElementIds.filter((id) => !removeSet.has(id));
    await tabRepository.update(tabId, { memberElementIds: updatedMembers });

    set((s) => {
      const newTabs = s.tabs.map((t) =>
        t.id === tabId ? { ...t, memberElementIds: updatedMembers, updatedAt: new Date() } : t,
      );
      const newMemberSet =
        s.activeTabId === tabId ? new Set(updatedMembers) : s.memberSet;
      return { tabs: newTabs, memberSet: newMemberSet };
    });

    syncTabToYDoc(tabId, { memberElementIds: updatedMembers });
  },

  // ── Ghost exclusion ─────────────────────────────────────

  excludeFromTab: async (tabId, elementIds) => {
    const { tabs } = get();
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;

    const existingExcluded = new Set(tab.excludedElementIds);
    const newExclusions = elementIds.filter((id) => !existingExcluded.has(id));
    if (newExclusions.length === 0) return;

    const updatedExcluded = [...tab.excludedElementIds, ...newExclusions];
    await tabRepository.update(tabId, { excludedElementIds: updatedExcluded });

    set((s) => {
      const newTabs = s.tabs.map((t) =>
        t.id === tabId ? { ...t, excludedElementIds: updatedExcluded, updatedAt: new Date() } : t,
      );
      const isActive = s.activeTabId === tabId;
      const newExcludedSet = isActive ? new Set(updatedExcluded) : s.excludedSet;
      // Remove excluded elements from ghostIds immediately
      const newGhostIds = isActive
        ? (() => { const g = new Set(s.ghostIds); newExclusions.forEach((id) => g.delete(id)); return g; })()
        : s.ghostIds;
      return { tabs: newTabs, excludedSet: newExcludedSet, ghostIds: newGhostIds };
    });

    syncTabToYDoc(tabId, { excludedElementIds: updatedExcluded });
  },

  // ── Viewport ──────────────────────────────────────────
  // Viewport is LOCAL only — NOT synced via Y.js

  saveTabViewport: async (tabId, viewport) => {
    await tabRepository.update(tabId, { viewport });
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, viewport, updatedAt: new Date() } : t,
      ),
    }));
  },

  // ── Ghost computation ─────────────────────────────────

  recomputeGhosts: (links) => {
    const { activeTabId, memberSet, excludedSet } = get();
    if (activeTabId === null || memberSet.size === 0) {
      set({ ghostIds: new Set() });
      return;
    }

    const newGhostIds = new Set<ElementId>();
    for (const link of links) {
      if (memberSet.has(link.fromId) && !memberSet.has(link.toId)) {
        if (!excludedSet.has(link.toId)) newGhostIds.add(link.toId);
      }
      if (memberSet.has(link.toId) && !memberSet.has(link.fromId)) {
        if (!excludedSet.has(link.fromId)) newGhostIds.add(link.fromId);
      }
    }
    set({ ghostIds: newGhostIds });
  },

  // ── Cascade ───────────────────────────────────────────

  removeElementFromAllTabs: async (investigationId, elementId) => {
    // Collect affected tabs before mutating
    const affectedTabs = get().tabs.filter(
      (t) => t.memberElementIds.includes(elementId) || t.excludedElementIds.includes(elementId),
    );

    await tabRepository.removeElementFromAllTabs(investigationId, elementId);
    set((s) => ({
      tabs: s.tabs.map((t) => ({
        ...t,
        memberElementIds: t.memberElementIds.filter((id) => id !== elementId),
        excludedElementIds: t.excludedElementIds.filter((id) => id !== elementId),
      })),
      memberSet: (() => {
        const newSet = new Set(s.memberSet);
        newSet.delete(elementId);
        return newSet;
      })(),
      ghostIds: (() => {
        const newSet = new Set(s.ghostIds);
        newSet.delete(elementId);
        return newSet;
      })(),
      excludedSet: (() => {
        const newSet = new Set(s.excludedSet);
        newSet.delete(elementId);
        return newSet;
      })(),
    }));

    // Sync cleaned memberElementIds/excludedElementIds to Y.Doc
    if (affectedTabs.length > 0) {
      const { syncService } = await import('../services/syncService');
      const ydoc = syncService.getYDoc();
      if (ydoc) {
        const { getYMaps } = await import('../types/yjs');
        const { setLocalOpPending } = await import('./investigationStore');
        setLocalOpPending();
        const { tabs: tabsMap } = getYMaps(ydoc);
        ydoc.transact(() => {
          for (const tab of affectedTabs) {
            const ymap = tabsMap.get(tab.id) as Y.Map<any> | undefined;
            if (ymap) {
              ymap.set('memberElementIds', tab.memberElementIds.filter((id) => id !== elementId));
              ymap.set('excludedElementIds', tab.excludedElementIds.filter((id) => id !== elementId));
              ymap.set('updatedAt', new Date().toISOString());
            }
          }
        });
      }
    }
  },

  // ── Y.js sync (called by investigationStore._syncFromYDoc) ───

  _syncTabsFromYDoc: (remoteTabs) => {
    const { activeTabId } = get();
    // Merge: keep local viewport for each tab (viewport is not synced)
    const localTabMap = new Map(get().tabs.map(t => [t.id, t]));
    const mergedTabs = remoteTabs.map(rt => {
      const local = localTabMap.get(rt.id);
      return {
        ...rt,
        viewport: local?.viewport ?? rt.viewport,
      };
    }).sort((a, b) => a.order - b.order);

    // Recalculate memberSet/excludedSet if active tab data changed
    const activeTab = mergedTabs.find(t => t.id === activeTabId);
    set({
      tabs: mergedTabs,
      memberSet: activeTab ? new Set(activeTab.memberElementIds) : new Set(),
      excludedSet: activeTab ? new Set(activeTab.excludedElementIds) : new Set(),
      // activeTabId stays unchanged — if tab was deleted remotely, fallback
      ...(activeTab ? {} : mergedTabs.length > 0
        ? { activeTabId: mergedTabs[0].id, memberSet: new Set(mergedTabs[0].memberElementIds), excludedSet: new Set(mergedTabs[0].excludedElementIds) }
        : { activeTabId: null, memberSet: new Set(), excludedSet: new Set() }),
    });
  },

  // ── Queries ───────────────────────────────────────────

  getTabsForElement: (elementId) => {
    return get().tabs.filter((t) => t.memberElementIds.includes(elementId));
  },

  isGhost: (elementId) => {
    return get().ghostIds.has(elementId);
  },

  isMember: (elementId) => {
    const { activeTabId, memberSet } = get();
    if (activeTabId === null) return true; // No tabs = everything visible
    return memberSet.has(elementId);
  },

  // ── Reset ─────────────────────────────────────────────

  resetInvestigationState: () => {
    set({
      tabs: [],
      activeTabId: null,
      memberSet: new Set(),
      ghostIds: new Set(),
      excludedSet: new Set(),
    });
  },
}));
