import { create } from 'zustand';
import type { DossierId, SavedQuery } from '../types';
import type { QueryNode, ParseError, QueryResult } from '../services/query/types';
import { parseQuery } from '../services/query/parser';
import { serializeQuery } from '../services/query/serializer';
import { evaluateQuery } from '../services/query/evaluator';
import { queryRepository } from '../db/repositories/queryRepository';
import { useDossierStore } from './dossierStore';

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

  // Actions
  setText: (text: string) => void;
  setAst: (ast: QueryNode | null) => void;
  setEditorMode: (mode: 'visual' | 'text') => void;
  setOutputMode: (mode: 'canvas' | 'table' | 'both' | 'none') => void;
  execute: () => void;
  clear: () => void;
  toggleFilter: () => void;

  // Saved queries
  loadSavedQueries: (dossierId: DossierId) => Promise<void>;
  saveQuery: (dossierId: DossierId, name: string, description: string) => Promise<void>;
  deleteSavedQuery: (id: string) => Promise<void>;
  applySavedQuery: (query: SavedQuery) => void;

  // Table
  setTableColumns: (columns: string[]) => void;
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

  setText: (text: string) => {
    const result = text.trim() ? parseQuery(text) : { ast: null, error: null };
    set({
      currentText: text,
      currentAst: result.ast,
      parseError: result.error,
    });
    // Auto-execute if we have a valid AST
    if (result.ast) {
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
    set({ outputMode: mode, isFilterActive: isActive && get().results !== null });
  },

  execute: () => {
    const { currentAst, outputMode } = get();
    if (!currentAst) {
      set({ results: null, matchingElementIds: new Set(), matchingLinkIds: new Set() });
      return;
    }

    const dossierState = useDossierStore.getState();
    const elements = dossierState.elements;
    const links = dossierState.links;

    const results = evaluateQuery(currentAst, elements, links);
    const isActive = outputMode === 'canvas' || outputMode === 'both';

    set({
      results,
      matchingElementIds: isActive ? results.elementIds : new Set(),
      matchingLinkIds: isActive ? results.linkIds : new Set(),
      isFilterActive: isActive,
    });
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
        matchingElementIds: results.elementIds,
        matchingLinkIds: results.linkIds,
      });
    }
  },

  loadSavedQueries: async (dossierId: DossierId) => {
    const queries = await queryRepository.getByDossierId(dossierId);
    set({ savedQueries: queries });
  },

  saveQuery: async (dossierId: DossierId, name: string, description: string) => {
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
    await queryRepository.delete(id);
    set(state => ({ savedQueries: state.savedQueries.filter(q => q.id !== id) }));
  },

  applySavedQuery: (query: SavedQuery) => {
    const ast = query.ast as QueryNode;
    set({
      currentAst: ast,
      currentText: query.queryText,
      parseError: null,
      outputMode: query.defaultOutput,
      tableColumns: query.tableColumns || ['label', 'tags', 'confidence', 'date'],
    });
    get().execute();
  },

  setTableColumns: (columns: string[]) => set({ tableColumns: columns }),
}));
