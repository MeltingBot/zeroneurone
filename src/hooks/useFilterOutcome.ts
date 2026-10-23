import { useCallback, useMemo } from 'react';
import { useDossierStore, useQueryStore, useSelectionStore, useTabStore, useViewStore } from '../stores';
import { getDimmedElementIds } from '../utils/filterUtils';
import { useEvaluationModel } from './useEvaluationModel';
import { getTabFilterIds, useTabFilterIds } from './useTabFilterIds';
import { getEvaluationModel } from '../utils/evaluation';
import type { Element, EvaluationModel, Link, ViewFilters } from '../types';

export interface FilterOutcome {
  /** Elements not hidden by hand */
  total: number;
  /** Elements the views show: kept by the filters and by the query */
  shownIds: string[];
  /** Elements kept by the filters alone */
  filterCount: number;
  /** Elements kept by the query alone (link ends included); null without a query filter */
  queryCount: number | null;
  /** Links found by the query whose two ends are shown (empty without a query filter) */
  shownLinkIds: string[];
}

/**
 * What the filters and the query applied on the canvas keep, computed as the
 * views do (an element is shown when both keep it), so that the filters and
 * query panels give the same count as what is on screen.
 */
export function useFilterOutcome(): FilterOutcome {
  const elements = useDossierStore((s) => s.elements);
  const filters = useViewStore((s) => s.filters);
  const hiddenElementIds = useViewStore((s) => s.hiddenElementIds);
  const queryFilterActive = useQueryStore((s) => s.isFilterActive);
  const queryMatchElementIds = useQueryStore((s) => s.matchingElementIds);
  const queryMatchLinkIds = useQueryStore((s) => s.matchingLinkIds);
  const links = useDossierStore((s) => s.links);
  const evaluationModel = useEvaluationModel();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const tabMemberSet = useTabStore((s) => s.memberSet);
  const pool = activeTabId !== null ? tabMemberSet : null;
  const tabFilterIds = useTabFilterIds();

  return useMemo(
    () => computeFilterOutcome(elements, links, filters, hiddenElementIds, evaluationModel,
      queryFilterActive, queryMatchElementIds, queryMatchLinkIds, pool, tabFilterIds),
    [elements, links, filters, hiddenElementIds, evaluationModel, queryFilterActive, queryMatchElementIds, queryMatchLinkIds, pool, tabFilterIds]
  );
}

/** Same as useFilterOutcome, read once outside React (plugins) */
export function getFilterOutcome(): FilterOutcome {
  const { elements, links, currentDossier } = useDossierStore.getState();
  const { filters, hiddenElementIds } = useViewStore.getState();
  const { isFilterActive, matchingElementIds, matchingLinkIds } = useQueryStore.getState();
  const { activeTabId, memberSet } = useTabStore.getState();
  return computeFilterOutcome(elements, links, filters, hiddenElementIds,
    getEvaluationModel(currentDossier), isFilterActive, matchingElementIds, matchingLinkIds,
    activeTabId !== null ? memberSet : null, getTabFilterIds());
}

/** What the filters and the query keep (the computation behind useFilterOutcome) */
export function computeFilterOutcome(
  elements: Element[],
  links: Link[],
  filters: ViewFilters,
  hiddenElementIds: Set<string>,
  evaluationModel: EvaluationModel,
  queryFilterActive: boolean,
  queryMatchElementIds: Set<string>,
  queryMatchLinkIds: Set<string>,
  /** Members of the open canvas tab: only they count; null for the whole dossier */
  pool: ReadonlySet<string> | null = null,
  /** Elements kept by the tabs filter of the "All" view; null if it does not apply */
  tabFilterIds: ReadonlySet<string> | null = null,
): FilterOutcome {
  const dimmedByFilters = getDimmedElementIds(elements, filters, hiddenElementIds, evaluationModel, tabFilterIds);
  const queryActive = queryFilterActive && queryMatchElementIds.size > 0;
  let total = 0;
  let filterCount = 0;
  let queryCount = 0;
  const shownIds: string[] = [];
  for (const el of elements) {
    if (hiddenElementIds.has(el.id)) continue;
    if (pool && !pool.has(el.id)) continue;
    total++;
    const byFilters = !dimmedByFilters.has(el.id);
    const byQuery = !queryActive || queryMatchElementIds.has(el.id);
    if (byFilters) filterCount++;
    if (queryActive && byQuery) queryCount++;
    if (byFilters && byQuery) shownIds.push(el.id);
  }
  const shownLinkIds: string[] = [];
  if (queryActive && queryMatchLinkIds.size > 0) {
    const shown = new Set(shownIds);
    for (const link of links) {
      if (queryMatchLinkIds.has(link.id) && shown.has(link.fromId) && shown.has(link.toId)) {
        shownLinkIds.push(link.id);
      }
    }
  }
  return { total, shownIds, filterCount, queryCount: queryActive ? queryCount : null, shownLinkIds };
}

/**
 * Select or deselect what the views show (the elements, and the links the
 * query found between them). The filters and query panels share it, so their
 * toggles always agree.
 */
export function useShownSelection(outcome: FilterOutcome) {
  const selectedElementIds = useSelectionStore((s) => s.selectedElementIds);
  const selectedLinkIds = useSelectionStore((s) => s.selectedLinkIds);
  const { shownIds, shownLinkIds } = outcome;
  const allSelected = shownIds.length + shownLinkIds.length > 0
    && shownIds.every((id) => selectedElementIds.has(id))
    && shownLinkIds.every((id) => selectedLinkIds.has(id));
  const select = useCallback(() => {
    useSelectionStore.getState().selectBoth(shownIds, shownLinkIds, true);
  }, [shownIds, shownLinkIds]);
  const deselect = useCallback(() => {
    const sel = useSelectionStore.getState();
    shownIds.forEach((id) => sel.deselectElement(id));
    shownLinkIds.forEach((id) => sel.deselectLink(id));
  }, [shownIds, shownLinkIds]);
  return { allSelected, toggle: allSelected ? deselect : select };
}
