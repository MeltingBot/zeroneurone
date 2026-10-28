import { create } from 'zustand';
import type { DossierId, SavedQuery } from '../types';
import type { QueryNode, ParseError, QueryResult } from '../services/query/types';
import { parseQuery } from '../services/query/parser';
import { serializeQuery } from '../services/query/serializer';
import { evaluateQuery } from '../services/query/evaluator';
import { queryRepository } from '../db/repositories/queryRepository';
import { useDossierStore } from './dossierStore';
import { useSelectionStore } from './selectionStore';
import { useViewStore } from './viewStore';
import { useTabStore } from './tabStore';
import { assertDossierWritable } from '../utils/dossierLock';

interface QueryState {
  // Current query
  currentText: string;
  currentAst: QueryNode | null;
  parseError: ParseError | null;

  // Editor mode
  editorMode: 'visual' | 'text';

  // Output mode
  outputMode: 'canvas' | 'table' | 'both' | 'none';

  // Results
  results: QueryResult | null;

  // Filter active on canvas
  isFilterActive: boolean;
  matchingElementIds: Set<string>;
  matchingLinkIds: Set<string>;

  // Saved queries
  savedQueries: SavedQuery[];

  // Table columns
  tableColumns: string[];

  // Recent queries of the open dossier (in-session history, max 5)
  recentQueries: string[];
  /** Recent queries of the other dossiers opened this session, kept apart */
  recentByDossier: Record<string, string[]>;

  // Actions
  setText: (text: string) => void;
  setAst: (ast: QueryNode | null) => void;
  setEditorMode: (mode: 'visual' | 'text') => void;
  setOutputMode: (mode: 'canvas' | 'table' | 'both' | 'none') => void;
  execute: () => void;
  clear: () => void;
  toggleFilter: () => void;
  selectAllResults: () => void;
  deselectAllResults: () => void;
  /** Select what the query did not find, of the kind it found (elements, links
   *  or both); when that is already the selection, select the results again */
  invertResults: () => void;
  /** Whether the selection is exactly what invertResults selects */
  isInverseSelected: () => boolean;
  clearRecentQueries: () => void;
  /** Merge queries into a dossier's history (open or not), most recent first */
  mergeRecentQueries: (dossierId: DossierId, queries: string[]) => void;

  // Saved queries
  loadSavedQueries: (dossierId: DossierId) => Promise<void>;
  saveQuery: (dossierId: DossierId, name: string, description: string) => Promise<void>;
  deleteSavedQuery: (id: string) => Promise<void>;
  applySavedQuery: (query: SavedQuery) => void;

  // Table
  setTableColumns: (columns: string[]) => void;
}

/**
 * Elements the filter keeps in view: those the query found, and the ends of
 * the links it found — a query on links alone would otherwise leave them lost
 * among the dimmed elements, or dim nothing at all.
 */
/** Members of the open canvas tab; null outside a tab (whole dossier) */
export function activeTabPool(): ReadonlySet<string> | null {
  const { activeTabId, memberSet } = useTabStore.getState();
  return activeTabId !== null ? memberSet : null;
}

/** What the query did not find, of the kind it found; hidden elements and, in a tab, non-members left out */
function inverseOf(results: { elementIds: Set<string>; linkIds: Set<string> }): { elements: string[]; links: string[] } {
  const { elements, links } = useDossierStore.getState();
  const { hiddenElementIds } = useViewStore.getState();
  const pool = activeTabPool();
  const kept = (id: string) => !hiddenElementIds.has(id) && (!pool || pool.has(id));
  return {
    elements: results.elementIds.size > 0
      ? elements.filter((el) => !results.elementIds.has(el.id) && kept(el.id)).map((el) => el.id)
      : [],
    links: results.linkIds.size > 0
      ? links.filter((l) => !results.linkIds.has(l.id) && kept(l.fromId) && kept(l.toId)).map((l) => l.id)
      : [],
  };
}

/**
 * Keep the results inside the open tab: its members, and the links between
 * them. The query runs on the whole dossier so that conditions following
 * links still see the elements outside the tab.
 */
function scopeToTab(results: QueryResult): QueryResult {
  const pool = activeTabPool();
  if (!pool) return results;
  const elementIds = new Set<string>();
  for (const id of results.elementIds) if (pool.has(id)) elementIds.add(id);
  const linkIds = new Set<string>();
  if (results.linkIds.size > 0) {
    for (const link of useDossierStore.getState().links) {
      if (results.linkIds.has(link.id) && pool.has(link.fromId) && pool.has(link.toId)) linkIds.add(link.id);
    }
  }
  return { ...results, elementIds, linkIds };
}

export function withLinkEnds(results: { elementIds: Set<string>; linkIds: Set<string> }): Set<string> {
  if (results.linkIds.size === 0) return results.elementIds;
  const ids = new Set(results.elementIds);
  for (const link of useDossierStore.getState().links) {
    if (results.linkIds.has(link.id)) { ids.add(link.fromId); ids.add(link.toId); }
  }
  return ids;
}

export const useQueryStore = create<QueryState>((set, get) => ({
  currentText: '',
  currentAst: null,
  parseError: null,
  editorMode: 'visual',
  outputMode: 'none',
  results: null,
  isFilterActive: false,
  matchingElementIds: new Set(),
  matchingLinkIds: new Set(),
  savedQueries: [],
  tableColumns: ['label', 'tags', 'confidence', 'date'],
  recentQueries: [],
  recentByDossier: {},

  setText: (text: string) => {
    const result = text.trim() ? parseQuery(text) : { ast: null, error: null };
    set({
      currentText: text,
      currentAst: result.ast,
      parseError: result.error,
    });
    // Auto-execute if we have a valid AST
    if (result.ast) {
      if (get().outputMode === 'none') {
        set({ outputMode: 'canvas' });
      }
      get().execute();
    } else {
      set({ results: null, matchingElementIds: new Set(), matchingLinkIds: new Set(), isFilterActive: false });
    }
  },

  setAst: (ast: QueryNode | null) => {
    const text = ast ? serializeQuery(ast) : '';
    set({
      currentAst: ast,
      currentText: text,
      parseError: null,
    });
    if (ast) {
      // Auto-activate canvas filter when building visually
      if (get().outputMode === 'none') {
        set({ outputMode: 'canvas' });
      }
      get().execute();
    } else {
      set({ results: null, matchingElementIds: new Set(), matchingLinkIds: new Set(), isFilterActive: false });
    }
  },

  setEditorMode: (mode) => set({ editorMode: mode }),

  setOutputMode: (mode) => {
    const isActive = mode === 'canvas' || mode === 'both';
    const { results } = get();
    // What the query keeps on the views is computed only when it applies to
    // them: switching it on again (e.g. from table only) must fill it
    set({
      outputMode: mode,
      isFilterActive: isActive && results !== null,
      matchingElementIds: isActive && results ? withLinkEnds(results) : new Set(),
      matchingLinkIds: isActive && results ? results.linkIds : new Set(),
    });
  },

  execute: () => {
    const { currentAst, currentText, outputMode } = get();
    if (!currentAst) {
      set({ results: null, matchingElementIds: new Set(), matchingLinkIds: new Set() });
      return;
    }

    const dossierState = useDossierStore.getState();
    const elements = dossierState.elements;
    const links = dossierState.links;

    const results = scopeToTab(evaluateQuery(currentAst, elements, links));
    const isActive = outputMode === 'canvas' || outputMode === 'both';

    // Track in recent queries (deduplicate, max 5)
    const trimmed = currentText.trim();
    const recentUpdate: Partial<{ recentQueries: string[] }> = {};
    if (trimmed) {
      const { recentQueries } = get();
      if (recentQueries[0] !== trimmed) {
        recentUpdate.recentQueries = [trimmed, ...recentQueries.filter(q => q !== trimmed)].slice(0, 5);
      }
    }

    set({
      results,
      matchingElementIds: isActive ? withLinkEnds(results) : new Set(),
      matchingLinkIds: isActive ? results.linkIds : new Set(),
      isFilterActive: isActive,
      ...recentUpdate,
    });
  },

  selectAllResults: () => {
    const { results } = get();
    if (!results) return;
    useSelectionStore.getState().selectBoth(
      [...results.elementIds],
      [...results.linkIds],
      true,
    );
  },

  deselectAllResults: () => {
    const { results } = get();
    if (!results) return;
    const sel = useSelectionStore.getState();
    results.elementIds.forEach((id) => sel.deselectElement(id));
    results.linkIds.forEach((id) => sel.deselectLink(id));
  },

  invertResults: () => {
    const { results } = get();
    if (!results) return;
    if (get().isInverseSelected()) {
      useSelectionStore.getState().selectBoth([...results.elementIds], [...results.linkIds], false);
      return;
    }
    const { elements: otherElements, links: otherLinks } = inverseOf(results);
    useSelectionStore.getState().selectBoth(otherElements, otherLinks, false);
  },

  isInverseSelected: () => {
    const { results } = get();
    if (!results) return false;
    const { selectedElementIds, selectedLinkIds } = useSelectionStore.getState();
    const inverse = inverseOf(results);
    if (inverse.elements.length + inverse.links.length === 0) return false;
    return inverse.elements.length === selectedElementIds.size && inverse.links.length === selectedLinkIds.size
      && inverse.elements.every((id) => selectedElementIds.has(id)) && inverse.links.every((id) => selectedLinkIds.has(id));
  },

  clearRecentQueries: () => set({ recentQueries: [] }),

  mergeRecentQueries: (dossierId, queries) => {
    const merge = (existing: string[]) => [...queries, ...existing]
      .filter((q, i, arr) => q && arr.indexOf(q) === i)
      .slice(0, 5);
    if (dossierId === openDossierId) {
      set({ recentQueries: merge(get().recentQueries) });
    } else {
      const { recentByDossier } = get();
      set({ recentByDossier: { ...recentByDossier, [dossierId]: merge(recentByDossier[dossierId] ?? []) } });
    }
  },

  clear: () => {
    set({
      currentText: '',
      currentAst: null,
      parseError: null,
      results: null,
      isFilterActive: false,
      matchingElementIds: new Set(),
      matchingLinkIds: new Set(),
    });
  },

  toggleFilter: () => {
    const { isFilterActive, results } = get();
    if (isFilterActive) {
      set({ isFilterActive: false, matchingElementIds: new Set(), matchingLinkIds: new Set() });
    } else if (results) {
      set({
        isFilterActive: true,
        matchingElementIds: withLinkEnds(results),
        matchingLinkIds: results.linkIds,
      });
    }
  },

  loadSavedQueries: async (dossierId: DossierId) => {
    const queries = await queryRepository.getByDossierId(dossierId);
    set({ savedQueries: queries });
  },

  saveQuery: async (dossierId: DossierId, name: string, description: string) => {
    assertDossierWritable();
    const { currentAst, currentText, outputMode, tableColumns } = get();
    if (!currentAst) return;

    const saved = await queryRepository.create(dossierId, {
      name,
      description,
      ast: currentAst,
      queryText: currentText,
      defaultOutput: outputMode === 'none' ? 'canvas' : outputMode,
      tableColumns,
    });

    set(state => ({ savedQueries: [...state.savedQueries, saved] }));
  },

  deleteSavedQuery: async (id: string) => {
    assertDossierWritable();
    await queryRepository.delete(id);
    set(state => ({ savedQueries: state.savedQueries.filter(q => q.id !== id) }));
  },

  applySavedQuery: (query: SavedQuery) => {
    const ast = query.ast as QueryNode;
    set({
      currentAst: ast,
      // Text rebuilt from the saved structure: a query saved before groups
      // were always parenthesized shows them too (same results either way)
      currentText: ast ? serializeQuery(ast) : query.queryText,
      parseError: null,
      outputMode: query.defaultOutput,
      tableColumns: query.tableColumns || ['label', 'tags', 'confidence', 'date'],
    });
    get().execute();
  },

  setTableColumns: (columns: string[]) => set({ tableColumns: columns }),
}));

// Each dossier has its own query, results and history: nothing typed in one
// dossier is shown, applied or exported in another.
let openDossierId: string | null = useDossierStore.getState().currentDossier?.id ?? null;
useDossierStore.subscribe((state) => {
  const nextId = state.currentDossier?.id ?? null;
  if (nextId === openDossierId) return;
  const { recentQueries, recentByDossier } = useQueryStore.getState();
  const byDossier = { ...recentByDossier };
  if (openDossierId) byDossier[openDossierId] = recentQueries;
  const restored = nextId ? byDossier[nextId] ?? [] : [];
  if (nextId) delete byDossier[nextId];
  openDossierId = nextId;
  useQueryStore.getState().clear();
  useQueryStore.setState({ recentQueries: restored, recentByDossier: byDossier, savedQueries: [] });
});

// Re-execute query when dossier data changes (#5)
useDossierStore.subscribe((state, prevState) => {
  if (state.elements !== prevState.elements || state.links !== prevState.links) {
    const { currentAst } = useQueryStore.getState();
    if (currentAst) {
      useQueryStore.getState().execute();
    }
  }
});

// Re-execute when the open tab or its members change: results stay inside the tab
useTabStore.subscribe((state, prevState) => {
  if (state.activeTabId !== prevState.activeTabId || state.memberSet !== prevState.memberSet) {
    if (useQueryStore.getState().currentAst) useQueryStore.getState().execute();
  }
});
