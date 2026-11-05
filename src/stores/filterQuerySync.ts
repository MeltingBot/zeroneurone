import { useDossierStore } from './dossierStore';
import { useQueryStore } from './queryStore';
import { useTabStore } from './tabStore';
import { useViewStore } from './viewStore';
import { getEvaluationModel } from '../utils/evaluation';
import { tabFilterElementIds } from '../utils/filterUtils';
import { sameQuery, viewFiltersToQuery } from '../utils/viewFiltersQuery';
import type { ViewFilters } from '../types';
import type { QueryNode } from '../services/query/types';

/**
 * The filters panel writes its filters in the query panel, as ZNQuery, when
 * the query is empty or already theirs: the query then says what the filters
 * keep. Another query (typed, focus, matrix, view, saved query) is never
 * changed by the filters, which keep narrowing the views beside it.
 *
 * Edited in the query panel, the filters' query becomes a query like the
 * others, and the filters it said are unchecked: the query says them now, no
 * filter stays at work out of its sight.
 */

/** The filters of the open view as a query, read from the stores */
export function currentFiltersQuery() {
  const { elements, currentDossier } = useDossierStore.getState();
  const { filters } = useViewStore.getState();
  const { tabs, activeTabId } = useTabStore.getState();
  return viewFiltersToQuery(
    filters,
    elements,
    getEvaluationModel(currentDossier),
    tabFilterElementIds(filters, tabs, activeTabId) !== null,
  );
}

let editing = false;

function syncFilterPart(): void {
  if (editing) return;
  useQueryStore.getState().setFilterPart(currentFiltersQuery().ast);
}

/**
 * Run a change made in the query panel (typing, visual builder, clear). When
 * it changes the filters' query, the filters it said are unchecked; while the
 * text does not parse yet, it waits.
 */
export function editQuery(write: () => void): void {
  const before = useQueryStore.getState().filterPart;
  editing = true;
  try {
    write();
  } finally {
    editing = false;
  }
  const { currentAst, currentText, parseError } = useQueryStore.getState();
  if (!before) {
    // Own query cleared: the filters write theirs again
    if (currentText.trim() === '') syncFilterPart();
    return;
  }
  if (parseError || hasBlankCondition(currentAst) || (currentText.trim() !== '' && sameQuery(currentAst, before))) {
    // Being typed or built (a condition with no field yet), or unchanged:
    // still the filters' query
    useQueryStore.setState({ filterPart: before });
    return;
  }
  uncheckWrittenFilters();
}

/** Whether a condition of the visual builder has no field chosen yet */
function hasBlankCondition(node: QueryNode | null): boolean {
  if (!node) return false;
  switch (node.type) {
    case 'condition': return node.field.trim() === '';
    case 'and':
    case 'or': return node.children.some(hasBlankCondition);
    case 'not': return hasBlankCondition(node.child);
    case 'within': return hasBlankCondition(node.target);
  }
}

/** Uncheck the filters the query said (those with an exact query) */
function uncheckWrittenFilters(): void {
  const { gaps } = currentFiltersQuery();
  const { filters } = useViewStore.getState();
  const model = getEvaluationModel(useDossierStore.getState().currentDossier);
  const unchecked: Partial<ViewFilters> = { hasGeo: null };
  if (!gaps.includes('tags')) { unchecked.includeTags = []; unchecked.excludeTags = []; }
  if (!gaps.includes('property') && filters.hasProperty) {
    unchecked.hasProperty = null;
    if (filters.badgePropertyKey === filters.hasProperty) unchecked.badgePropertyKey = null;
  }
  if (model === 'zeroneurone') unchecked.minConfidence = null;
  else { unchecked.evaluationSources = null; unchecked.evaluationInfos = null; }
  useViewStore.getState().setFilters(unchecked);
}

useViewStore.subscribe((state, prev) => {
  if (state.filters !== prev.filters) syncFilterPart();
});

useDossierStore.subscribe((state, prev) => {
  if (state.elements === prev.elements && state.currentDossier === prev.currentDossier) return;
  // Without filters, nothing to write: no walk over the elements
  if (useQueryStore.getState().filterPart === null && !filtersMayWrite()) return;
  syncFilterPart();
});

useTabStore.subscribe((state, prev) => {
  if (state.tabs !== prev.tabs || state.activeTabId !== prev.activeTabId) syncFilterPart();
});

// Query written elsewhere: emptied (a view without query, another dossier),
// the filters write theirs again; the filters' own query (a view saved with
// it) is theirs again
useQueryStore.subscribe((state, prev) => {
  if (editing || state.filterPart !== null) return;
  if (state.currentText === prev.currentText && prev.filterPart === null) return;
  if (state.currentText.trim() === '') { syncFilterPart(); return; }
  if (!state.currentAst || !filtersMayWrite()) return;
  const part = currentFiltersQuery().ast;
  if (part && sameQuery(state.currentAst, part)) useQueryStore.setState({ filterPart: part });
});

/** Whether a filter the query can say is set */
function filtersMayWrite(): boolean {
  const f = useViewStore.getState().filters;
  return f.includeTags.length > 0 || f.excludeTags.length > 0 || f.hasProperty !== null
    || f.minConfidence !== null || (f.evaluationSources?.length ?? 0) > 0
    || (f.evaluationInfos?.length ?? 0) > 0 || f.hasGeo !== null;
}
