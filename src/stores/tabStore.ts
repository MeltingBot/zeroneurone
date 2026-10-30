import { create } from 'zustand';
import * as Y from 'yjs';
import type {
  CanvasTab,
  TabId,
  ElementId,
  DossierId,
  Link,
} from '../types';
import { tabRepository } from '../db/repositories/tabRepository';
import { assertDossierWritable } from '../utils/dossierLock';

interface TabState {
  // Data
  tabs: CanvasTab[];
  /** null in the "All" view (or when no tabs exist), otherwise the open tab */
  activeTabId: TabId | null;
  /** Where the "All" view stood when left (this session) */
  allViewport: { x: number; y: number; zoom: number } | null;
  /** Tabs shown together with the open one (Ctrl+click): the view covers
   *  their members too. New elements still go to the open tab. */
  extraTabIds: TabId[];

  // Derived sets (recomputed on tab/link changes)
  /** Element IDs that are members of the open tab, or of any combined tab */
  memberSet: Set<ElementId>;
  /** Element IDs that are ghosts (linked to members but not members themselves) */
  ghostIds: Set<ElementId>;
  /** Element IDs explicitly excluded from ghost appearance in the active tab */
  excludedSet: Set<ElementId>;

  // Actions - CRUD
  loadTabs: (dossierId: DossierId) => Promise<void>;
  createTab: (dossierId: DossierId, name: string) => Promise<CanvasTab>;
  renameTab: (tabId: TabId, name: string) => Promise<void>;
  deleteTab: (tabId: TabId) => Promise<void>;
  reorderTab: (tabId: TabId, newOrder: number) => Promise<void>;

  // Actions - Navigation
  setActiveTab: (tabId: TabId | null) => void;
  /** Show a tab together with the open one, or stop showing it */
  toggleCombinedTab: (tabId: TabId) => void;

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
  removeElementFromAllTabs: (dossierId: DossierId, elementId: ElementId) => Promise<void>;
  /** Batch form: one store update and one Y.Doc transaction for all ids */
  removeElementsFromAllTabs: (dossierId: DossierId, elementIds: ElementId[]) => Promise<void>;

  // Actions - Y.js sync (called by dossierStore._syncFromYDoc)
  _syncTabsFromYDoc: (remoteTabs: CanvasTab[]) => void;

  // Queries
  getTabsForElement: (elementId: ElementId) => CanvasTab[];
  isGhost: (elementId: ElementId) => boolean;
  isMember: (elementId: ElementId) => boolean;

  // Restore a previously deleted tab (for undo)
  restoreTab: (tab: CanvasTab) => Promise<void>;

  // Reset
  resetDossierState: () => void;
}

// Modules the Y.Doc writes need, imported lazily (import cycle) and kept once
// loaded: every tab write then reaches the Y.Doc in the same tick as the store
// update, and in call order. With an await in between, a sync from the Y.Doc
// running in that gap (the safety re-sync) read the old value and undid the
// change just made; and a tab's members could reach the Y.Doc before the tab.
type YDocDeps = {
  syncService: typeof import('../services/syncService')['syncService'];
  getYMaps: typeof import('../types/yjs')['getYMaps'];
  setLocalOpPending: typeof import('./dossierStore')['setLocalOpPending'];
  tabToYMap: typeof import('../services/yjs/tabMapper')['tabToYMap'];
};
let yDocDeps: YDocDeps | null = null;
let yDocDepsLoading: Promise<YDocDeps> | null = null;
function loadYDocDeps(): Promise<YDocDeps> {
  if (yDocDeps) return Promise.resolve(yDocDeps);
  yDocDepsLoading ??= Promise.all([
    import('../services/syncService'),
    import('../types/yjs'),
    import('./dossierStore'),
    import('../services/yjs/tabMapper'),
  ]).then(([{ syncService }, { getYMaps }, { setLocalOpPending }, { tabToYMap }]) => {
    yDocDeps = { syncService, getYMaps, setLocalOpPending, tabToYMap };
    return yDocDeps;
  }).finally(() => { yDocDepsLoading = null; });
  return yDocDepsLoading;
}

type TabsYMap = Y.Map<unknown>;

/** Write to the Y.Doc's tabs map, in one transaction (fire-and-forget). */
function withTabsYMap(write: (tabsMap: TabsYMap, deps: YDocDeps) => void): Promise<void> {
  const run = (deps: YDocDeps) => {
    const ydoc = deps.syncService.getYDoc();
    if (!ydoc) return;
    deps.setLocalOpPending();
    const { tabs: tabsMap } = deps.getYMaps(ydoc);
    ydoc.transact(() => write(tabsMap as TabsYMap, deps));
  };
  if (yDocDeps) {
    run(yDocDeps);
    return Promise.resolve();
  }
  return loadYDocDeps().then(run);
}

// Helper: write tab changes to Y.Doc (fire-and-forget, non-blocking)
function syncTabToYDoc(tabId: string, fields: Record<string, unknown>): Promise<void> {
  return withTabsYMap((tabsMap) => {
    const ymap = tabsMap.get(tabId) as Y.Map<unknown> | undefined;
    if (ymap) {
      for (const [key, value] of Object.entries(fields)) {
        ymap.set(key, value);
      }
      ymap.set('updatedAt', new Date().toISOString());
    }
  });
}

type Viewport = { x: number; y: number; zoom: number };

/**
 * How the canvas viewport is read and set. Registered by the view store
 * (which imports this one), so that switching tab, from anywhere, keeps each
 * tab's zoom and centre.
 */
export interface TabViewportBridge {
  current: () => Viewport;
  restore: (viewport: Viewport) => void;
  /** Frame these elements (none: all of them) */
  fit: (elementIds: string[]) => void;
  /** Whether the canvas is the view shown (map and timeline keep their own) */
  canvasShown: () => boolean;
}
let viewportBridge: TabViewportBridge | null = null;
export function setTabViewportBridge(bridge: TabViewportBridge): void {
  viewportBridge = bridge;
}

const isSavedViewport = (v: Viewport | undefined) => !!v && (v.x !== 0 || v.y !== 0 || v.zoom !== 1);

/** Tabs the view shows: the open one first, then the combined ones */
export function openTabIds(state: { activeTabId: TabId | null; extraTabIds: TabId[] }): TabId[] {
  return state.activeTabId === null ? [] : [state.activeTabId, ...state.extraTabIds];
}

/** Members and dismissed ghosts of the tabs the view shows */
function viewSets(tabs: CanvasTab[], activeTabId: TabId | null, extraTabIds: TabId[]) {
  const ids = openTabIds({ activeTabId, extraTabIds });
  const memberSet = new Set<ElementId>();
  const excludedSet = new Set<ElementId>();
  for (const tab of tabs) {
    if (!ids.includes(tab.id)) continue;
    for (const id of tab.memberElementIds) memberSet.add(id);
    for (const id of tab.excludedElementIds) excludedSet.add(id);
  }
  return { memberSet, excludedSet };
}

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  allViewport: null,
  extraTabIds: [],
  memberSet: new Set(),
  ghostIds: new Set(),
  excludedSet: new Set(),

  // ── Load ──────────────────────────────────────────────

  loadTabs: async (dossierId) => {
    // Ready before the first edit, so tab writes reach the Y.Doc at once
    loadYDocDeps().catch(() => { /* loaded again at the first write */ });
    const tabs = await tabRepository.getByDossier(dossierId);
    const firstTab = tabs.length > 0 ? tabs[0] : null;
    set({
      allViewport: null,
      tabs,
      activeTabId: firstTab?.id ?? null,
      extraTabIds: [],
      memberSet: firstTab ? new Set(firstTab.memberElementIds) : new Set(),
      ghostIds: new Set(),
      excludedSet: firstTab ? new Set(firstTab.excludedElementIds) : new Set(),
    });
  },

  // ── Create ────────────────────────────────────────────

  createTab: async (dossierId, name) => {
    assertDossierWritable();
    const { tabs } = get();
    const maxOrder = tabs.reduce((max, t) => Math.max(max, t.order), 0);
    const tab = await tabRepository.create(dossierId, name, maxOrder + 1);
    set((s) => ({ tabs: [...s.tabs, tab] }));

    // Y.js sync: create new Y.Map in tabs map
    withTabsYMap((tabsMap, { tabToYMap }) => {
      tabsMap.set(tab.id, tabToYMap(tab));
    });

    return tab;
  },

  // ── Rename ────────────────────────────────────────────

  renameTab: async (tabId, name) => {
    assertDossierWritable();
    await tabRepository.update(tabId, { name });
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, name, updatedAt: new Date() } : t)),
    }));
    syncTabToYDoc(tabId, { name });
  },

  // ── Delete ────────────────────────────────────────────

  deleteTab: async (tabId) => {
    assertDossierWritable();
    await tabRepository.delete(tabId);
    set((s) => {
      const newTabs = s.tabs.filter((t) => t.id !== tabId);
      const extras = s.extraTabIds.filter((id) => id !== tabId);
      if (s.activeTabId === tabId) {
        // A combined tab takes over, else the first remaining tab, or null
        const fallbackId = extras[0] ?? newTabs[0]?.id ?? null;
        const extraTabIds = extras.filter((id) => id !== fallbackId);
        return {
          tabs: newTabs,
          activeTabId: fallbackId,
          extraTabIds,
          ghostIds: new Set(),
          ...viewSets(newTabs, fallbackId, extraTabIds),
        };
      }
      if (extras.length !== s.extraTabIds.length) {
        return { tabs: newTabs, extraTabIds: extras, ...viewSets(newTabs, s.activeTabId, extras) };
      }
      return { tabs: newTabs };
    });

    // Y.js sync: delete from tabs map
    withTabsYMap((tabsMap) => {
      tabsMap.delete(tabId);
    });

    // Its elements stay in the dossier, visible in "All": an element may
    // belong to no tab.
  },

  // ── Restore (undo delete) ────────────────────────────

  restoreTab: async (tab: CanvasTab) => {
    assertDossierWritable();
    // Re-insert into IndexedDB (bulkUpsert uses put which handles re-insertion with same ID)
    await tabRepository.bulkUpsert([tab]);

    // Add to local state
    set((s) => ({
      tabs: [...s.tabs, tab].sort((a, b) => a.order - b.order),
    }));

    // Y.js sync: recreate in tabs map
    withTabsYMap((tabsMap, { tabToYMap }) => {
      tabsMap.set(tab.id, tabToYMap(tab));
    });
  },

  // ── Reorder ───────────────────────────────────────────

  reorderTab: async (tabId, newOrder) => {
    assertDossierWritable();
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
    const { tabs, activeTabId: previous } = get();
    const tab = tabId === null ? null : tabs.find((t) => t.id === tabId);
    if (tabId !== null && !tab) return;

    // Leaving a tab (or "All"): keep where the view stood
    const switching = previous !== tabId && viewportBridge !== null;
    if (switching) {
      const here = viewportBridge!.current();
      if (previous === null) set({ allViewport: here });
      else void get().saveTabViewport(previous, here);
    }

    if (tab === null || tab === undefined) {
      // "All" (or no tabs exist)
      set({ activeTabId: null, extraTabIds: [], memberSet: new Set(), ghostIds: new Set(), excludedSet: new Set() });
    } else {
      set({
        activeTabId: tabId,
        extraTabIds: [],
        memberSet: new Set(tab.memberElementIds),
        ghostIds: new Set(), // Reset — will be recomputed by useEffect
        excludedSet: new Set(tab.excludedElementIds),
      });
    }

    // Back to where this tab's view stood, or framed on its elements the
    // first time. A caller centring an element right after still wins.
    if (switching && viewportBridge!.canvasShown()) {
      const saved = tab ? tab.viewport : get().allViewport ?? undefined;
      if (isSavedViewport(saved)) viewportBridge!.restore(saved!);
      else viewportBridge!.fit(tab ? tab.memberElementIds : []);
    }
  },

  toggleCombinedTab: (tabId) => {
    const { tabs, activeTabId, extraTabIds } = get();
    if (!tabs.some((t) => t.id === tabId)) return;
    // From "All": just open it
    if (activeTabId === null) {
      get().setActiveTab(tabId);
      return;
    }
    let nextActive: TabId = activeTabId;
    let nextExtras: TabId[];
    if (tabId === activeTabId) {
      // Leaving the open tab: the first combined one takes over
      if (extraTabIds.length === 0) return;
      nextActive = extraTabIds[0];
      nextExtras = extraTabIds.slice(1);
    } else if (extraTabIds.includes(tabId)) {
      nextExtras = extraTabIds.filter((id) => id !== tabId);
    } else {
      nextExtras = [...extraTabIds, tabId];
    }
    set({
      activeTabId: nextActive,
      extraTabIds: nextExtras,
      ...viewSets(tabs, nextActive, nextExtras),
    });
  },

  // ── Membership ────────────────────────────────────────

  addMembers: async (tabId, elementIds) => {
    assertDossierWritable();
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
      const inView = openTabIds(s).includes(tabId);
      return inView
        ? { tabs: newTabs, ...viewSets(newTabs, s.activeTabId, s.extraTabIds) }
        : { tabs: newTabs };
    });

    syncTabToYDoc(tabId, {
      memberElementIds: updatedMembers,
      ...(excludedChanged ? { excludedElementIds: updatedExcluded } : {}),
    });
  },

  removeMembers: async (tabId, elementIds) => {
    assertDossierWritable();
    const { tabs } = get();
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;

    // An element may leave its last tab: it stays in the dossier ("All")
    const removeSet = new Set(elementIds.filter((id) => tab.memberElementIds.includes(id)));
    if (removeSet.size === 0) return;

    const updatedMembers = tab.memberElementIds.filter((id) => !removeSet.has(id));
    await tabRepository.update(tabId, { memberElementIds: updatedMembers });

    set((s) => {
      const newTabs = s.tabs.map((t) =>
        t.id === tabId ? { ...t, memberElementIds: updatedMembers, updatedAt: new Date() } : t,
      );
      const inView = openTabIds(s).includes(tabId);
      return inView
        ? { tabs: newTabs, memberSet: viewSets(newTabs, s.activeTabId, s.extraTabIds).memberSet }
        : { tabs: newTabs };
    });

    syncTabToYDoc(tabId, { memberElementIds: updatedMembers });
  },

  // ── Ghost exclusion ─────────────────────────────────────

  excludeFromTab: async (tabId, elementIds) => {
    assertDossierWritable();
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
      const isActive = openTabIds(s).includes(tabId);
      const newExcludedSet = isActive ? viewSets(newTabs, s.activeTabId, s.extraTabIds).excludedSet : s.excludedSet;
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
    // In the store at once (a switch back right after reads it), then on disk
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, viewport, updatedAt: new Date() } : t,
      ),
    }));
    await tabRepository.update(tabId, { viewport });
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

  removeElementFromAllTabs: async (dossierId, elementId) => {
    await get().removeElementsFromAllTabs(dossierId, [elementId]);
  },

  removeElementsFromAllTabs: async (dossierId, elementIds) => {
    if (elementIds.length === 0) return;
    const gone = new Set(elementIds);
    // Collect affected tabs before mutating
    const affectedTabs = get().tabs.filter(
      (t) => t.memberElementIds.some((id) => gone.has(id)) || t.excludedElementIds.some((id) => gone.has(id)),
    );

    await tabRepository.removeElementsFromAllTabs(dossierId, elementIds);
    const without = (set: Set<string>) => {
      const next = new Set(set);
      for (const id of gone) next.delete(id);
      return next;
    };
    set((s) => ({
      tabs: s.tabs.map((t) => ({
        ...t,
        memberElementIds: t.memberElementIds.filter((id) => !gone.has(id)),
        excludedElementIds: t.excludedElementIds.filter((id) => !gone.has(id)),
      })),
      memberSet: without(s.memberSet),
      ghostIds: without(s.ghostIds),
      excludedSet: without(s.excludedSet),
    }));

    // Sync cleaned memberElementIds/excludedElementIds to Y.Doc, one transaction
    if (affectedTabs.length > 0) {
      await withTabsYMap((tabsMap) => {
        for (const tab of affectedTabs) {
          const ymap = tabsMap.get(tab.id) as Y.Map<unknown> | undefined;
          if (ymap) {
            ymap.set('memberElementIds', tab.memberElementIds.filter((id) => !gone.has(id)));
            ymap.set('excludedElementIds', tab.excludedElementIds.filter((id) => !gone.has(id)));
            ymap.set('updatedAt', new Date().toISOString());
          }
        }
      });
    }
  },

  // ── Y.js sync (called by dossierStore._syncFromYDoc) ───

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

    // Recalculate memberSet/excludedSet from the tabs in view. Combined tabs
    // deleted remotely drop out; the open tab deleted remotely falls back.
    // In the "All" view (null), nothing changes.
    const exists = (id: TabId) => mergedTabs.some(t => t.id === id);
    let extras = get().extraTabIds.filter(exists);
    let nextActive: TabId | null = activeTabId;
    if (activeTabId !== null && !exists(activeTabId)) {
      nextActive = extras[0] ?? mergedTabs[0]?.id ?? null;
      extras = extras.filter((id) => id !== nextActive);
    }
    set({
      tabs: mergedTabs,
      activeTabId: nextActive,
      extraTabIds: extras,
      ...viewSets(mergedTabs, nextActive, extras),
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

  resetDossierState: () => {
    set({
      allViewport: null,
      tabs: [],
      activeTabId: null,
      extraTabIds: [],
      memberSet: new Set(),
      ghostIds: new Set(),
      excludedSet: new Set(),
    });
  },
}));
