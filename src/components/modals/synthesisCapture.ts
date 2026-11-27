/**
 * Captures of the views for the synthesis: each view is shown in turn (behind
 * an overlay) and asked for its capture. When the synthesis covers only part
 * of the dossier, everything outside it is hidden for the time of the
 * captures; the selection is cleared so that its outlines are not captured.
 * The view state is then put back as it was.
 */
import { useSelectionStore, useTabStore, useUIStore, useViewStore } from '../../stores';
import type { CaptureResult } from '../../stores/uiStore';
import type { DisplayMode } from '../../types';

export type CaptureView = 'canvas' | 'map' | 'timeline';

/** Time for a view to mount, then to settle (map tiles, layout) */
const MOUNT_DELAY = 1000;
const SETTLE_DELAY: Record<CaptureView, number> = { canvas: 300, map: 0, timeline: 500 };
const HANDLER_WAIT = 5000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForHandler(mode: DisplayMode): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < HANDLER_WAIT) {
    if (useUIStore.getState().captureHandlers.has(mode)) return true;
    await sleep(100);
  }
  console.warn(`Capture handler for ${mode} not registered after ${HANDLER_WAIT}ms`);
  return false;
}

/**
 * Show only `keepIds` in every view while `fn` runs: the other elements are
 * hidden and the "All" tab is shown, so that a tab or a selection appears
 * alone. The hidden elements and the tab state are restored afterwards.
 */
export async function withOnlyElementsShown<T>(keepIds: ReadonlySet<string> | null, allIds: readonly string[], fn: () => Promise<T>): Promise<T> {
  if (!keepIds) return withoutSelection(fn);
  const view = useViewStore.getState();
  const previousHidden = view.hiddenElementIds;
  const tabs = useTabStore.getState();
  const previousTab = {
    activeTabId: tabs.activeTabId,
    extraTabIds: tabs.extraTabIds,
    memberSet: tabs.memberSet,
    ghostIds: tabs.ghostIds,
    excludedSet: tabs.excludedSet,
  };
  const hidden = new Set(previousHidden);
  for (const id of allIds) if (!keepIds.has(id)) hidden.add(id);
  useTabStore.setState({ activeTabId: null, extraTabIds: [], memberSet: new Set(), ghostIds: new Set(), excludedSet: new Set() });
  useViewStore.setState({ hiddenElementIds: hidden });
  try {
    return await withoutSelection(fn);
  } finally {
    useViewStore.setState({ hiddenElementIds: previousHidden });
    useTabStore.setState(previousTab);
  }
}

/** Run `fn` with nothing selected, then select again what was */
async function withoutSelection<T>(fn: () => Promise<T>): Promise<T> {
  const { selectedElementIds, selectedLinkIds, lastClickedElementId } = useSelectionStore.getState();
  useSelectionStore.setState({ selectedElementIds: new Set(), selectedLinkIds: new Set(), lastClickedElementId: null });
  try {
    return await fn();
  } finally {
    useSelectionStore.setState({ selectedElementIds, selectedLinkIds, lastClickedElementId });
  }
}

/** Show `mode`, wait for it to settle and return its capture */
export async function captureViewOf(mode: CaptureView): Promise<CaptureResult | null> {
  useViewStore.getState().setDisplayMode(mode);
  await sleep(MOUNT_DELAY);
  if (!(await waitForHandler(mode))) return null;
  await sleep(SETTLE_DELAY[mode]);
  return useUIStore.getState().captureView(mode);
}
