import { useMemo } from 'react';
import { useDossierStore, useQueryStore, useUIStore, useViewStore } from '../stores';
import { getDimmedElementIds } from '../utils/filterUtils';
import { useEvaluationModel } from './useEvaluationModel';

/**
 * Elements a view leaves out: those hidden by hand, plus, when the user chose
 * to hide rather than dim them, those outside the filters or the query.
 * Returns the hand-hidden set itself when nothing else is hidden.
 */
export function useHiddenElementIds(): Set<string> {
  const hiddenElementIds = useViewStore((s) => s.hiddenElementIds);
  const filters = useViewStore((s) => s.filters);
  const hideFilteredOut = useUIStore((s) => s.hideFilteredOut);
  const elements = useDossierStore((s) => s.elements);
  const queryFilterActive = useQueryStore((s) => s.isFilterActive);
  const queryMatchElementIds = useQueryStore((s) => s.matchingElementIds);
  const evaluationModel = useEvaluationModel();

  return useMemo(() => {
    if (!hideFilteredOut) return hiddenElementIds;
    const hidden = getDimmedElementIds(elements, filters, hiddenElementIds, evaluationModel);
    if (queryFilterActive && queryMatchElementIds.size > 0) {
      for (const el of elements) {
        if (!queryMatchElementIds.has(el.id)) hidden.add(el.id);
      }
    }
    if (hidden.size === 0) return hiddenElementIds;
    for (const id of hiddenElementIds) hidden.add(id);
    return hidden;
  }, [hideFilteredOut, hiddenElementIds, elements, filters, evaluationModel, queryFilterActive, queryMatchElementIds]);
}
