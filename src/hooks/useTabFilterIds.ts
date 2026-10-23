import { useMemo } from 'react';
import { useTabStore, useViewStore } from '../stores';
import { tabFilterElementIds } from '../utils/filterUtils';

/** Elements kept by the tabs filter of the "All" view; null when it does not apply */
export function useTabFilterIds(): Set<string> | null {
  const includeTabs = useViewStore((s) => s.filters.includeTabs);
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  return useMemo(
    () => tabFilterElementIds({ includeTabs } as Parameters<typeof tabFilterElementIds>[0], tabs, activeTabId),
    [includeTabs, tabs, activeTabId],
  );
}

/** Same as useTabFilterIds, read once outside React */
export function getTabFilterIds(): Set<string> | null {
  const { tabs, activeTabId } = useTabStore.getState();
  return tabFilterElementIds(useViewStore.getState().filters, tabs, activeTabId);
}
