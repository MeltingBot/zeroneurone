import { useDossierStore, useTabStore, useViewStore } from '../stores';

/**
 * Bring an element on screen in the current view, without touching the
 * selection: the map flies to it, the timeline scrolls to it, the canvas
 * centres it at zoom 1 (switching to a canvas tab holding it if the active one
 * does not).
 */
export function revealElement(elementId: string): void {
  const target = useDossierStore.getState().elements.find((el) => el.id === elementId);
  if (!target) return;

  const { activeTabId, memberSet, tabs, setActiveTab } = useTabStore.getState();
  if (activeTabId && !memberSet.has(target.id)) {
    const targetTab = tabs.find((tab) => tab.memberElementIds.includes(target.id));
    if (targetTab) setActiveTab(targetTab.id);
  }

  const mode = useViewStore.getState().displayMode;
  if (mode === 'map' && target.geo) {
    window.dispatchEvent(new CustomEvent('map:flyToElement', { detail: { elementId: target.id } }));
  } else if (mode === 'timeline') {
    window.dispatchEvent(new CustomEvent('timeline:scrollToElement', { detail: { elementId: target.id } }));
  } else {
    const sizeMap: Record<string, number> = { small: 40, medium: 56, large: 72 };
    const baseSize = typeof target.visual?.size === 'number'
      ? target.visual.size
      : sizeMap[target.visual?.size ?? 'medium'] ?? 56;
    const centerX = target.position.x + (target.visual?.customWidth ?? baseSize) / 2;
    const centerY = target.position.y + (target.visual?.customHeight ?? baseSize) / 2;
    const zoom = 1.0;
    useViewStore.getState().requestViewportChange({
      x: -centerX * zoom + (window.innerWidth - 350) / 2,
      y: -centerY * zoom + window.innerHeight / 2,
      zoom,
    });
  }
}

/**
 * Bring a set of elements on screen in the current view: one is revealed as
 * above; several are framed together (canvas viewport, map bounds), at most at
 * zoom 1 on the canvas. The timeline scrolls to the first.
 */
export function revealElements(ids: Iterable<string>): void {
  const wanted = new Set(ids);
  if (wanted.size <= 1) {
    for (const id of wanted) revealElement(id);
    return;
  }
  const targets = useDossierStore.getState().elements.filter((el) => wanted.has(el.id));
  if (targets.length === 0) return;

  const mode = useViewStore.getState().displayMode;
  if (mode === 'map') {
    window.dispatchEvent(new CustomEvent('map:fitElements', { detail: { elementIds: targets.map((el) => el.id) } }));
    return;
  }
  if (mode === 'timeline') {
    revealElement(targets[0].id);
    return;
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of targets) {
    const w = el.visual?.customWidth ?? 120;
    const h = el.visual?.customHeight ?? 56;
    minX = Math.min(minX, el.position.x); minY = Math.min(minY, el.position.y);
    maxX = Math.max(maxX, el.position.x + w); maxY = Math.max(maxY, el.position.y + h);
  }
  const width = window.innerWidth - 350;
  const height = window.innerHeight - 120;
  const zoom = Math.max(0.05, Math.min(1, width / ((maxX - minX) * 1.2), height / ((maxY - minY) * 1.2)));
  useViewStore.getState().requestViewportChange({
    x: -((minX + maxX) / 2) * zoom + width / 2,
    y: -((minY + maxY) / 2) * zoom + window.innerHeight / 2,
    zoom,
  });
}
