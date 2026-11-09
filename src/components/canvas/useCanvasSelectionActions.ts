import { useCallback, useMemo, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { Edge } from '@xyflow/react';
import type { TFunction } from 'i18next';

import { useDossierStore, useSelectionStore, useViewStore, useUIStore, useTabStore, useQueryStore, useSuggestionsStore, toast } from '../../stores';
import type { useInsightsStore } from '../../stores';
import type { TabMembershipSnapshot } from '../../stores/historyStore';
import type { Element, Link, Asset } from '../../types';
import { generateUUID } from '../../utils';
import { computeElementDimensions } from '../../utils/elementDimensions';
import { scaleByDegree, type buildDegreeMap } from '../../utils/degreeSize';
import { addElementsToGroup, gatherGroup, groupElements } from '../../utils/groupElements';
import { buildMermaidExport } from '../../services/exportMermaid';
import { buildDOTExport } from '../../services/exportDOT';
import { similarQueryText, labelsQueryText, neighbourhoodQueryText, showOnlySplit } from '../../utils/selectionQueries';
import { insightsService } from '../../services/insightsService';
import { emitExport } from '../../plugins/pluginEventBus';
import { withDossierLinkDefaults } from '../../utils/dossierOptions';
import { linksTouching } from './overview/overviewHitTest';
import type { OverviewScene } from './overview/overviewTypes';
import type { CanvasMenuPosition, ContextMenuState, DeleteElementsWithHistory, DossierStore, HistoryStore, SelectionStore, TabStore, UIStore, ViewStore, WriteClipboard } from './canvasHookTypes';
import { routeOfCopiedLink } from '../../utils/routeFollow';

type InsightsStore = ReturnType<typeof useInsightsStore.getState>;

export interface CanvasSelectionActionsParams {
  elements: Element[];
  links: Link[];
  elementMap: Map<string, Element>;
  assetMap: Map<string, string | null>;
  degreeMap: ReturnType<typeof buildDegreeMap> | null;
  allEdges: Edge[];
  currentDossier: DossierStore['currentDossier'];
  contextMenu: ContextMenuState | null;
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
  closeContextMenu: () => void;
  canvasContextMenu: CanvasMenuPosition | null;
  setMergeElements: Dispatch<SetStateAction<Element[] | null>>;
  setPreviewAsset: Dispatch<SetStateAction<Asset | null>>;
  overviewActiveRef: RefObject<boolean>;
  overviewSceneRef: RefObject<OverviewScene | null>;
  selectedElementIds: SelectionStore['selectedElementIds'];
  selectedLinkIds: SelectionStore['selectedLinkIds'];
  getSelectedElementIds: SelectionStore['getSelectedElementIds'];
  clearSelection: SelectionStore['clearSelection'];
  selectElement: SelectionStore['selectElement'];
  selectElements: SelectionStore['selectElements'];
  selectLinks: SelectionStore['selectLinks'];
  createElement: DossierStore['createElement'];
  createLink: DossierStore['createLink'];
  updateElement: DossierStore['updateElement'];
  createGroup: DossierStore['createGroup'];
  removeFromGroup: DossierStore['removeFromGroup'];
  dissolveGroup: DossierStore['dissolveGroup'];
  pasteElements: DossierStore['pasteElements'];
  deleteElementsWithHistory: DeleteElementsWithHistory;
  writeClipboard: WriteClipboard;
  pushAction: HistoryStore['pushAction'];
  hideElement: ViewStore['hideElement'];
  hideElements: ViewStore['hideElements'];
  showElement: ViewStore['showElement'];
  showElements: ViewStore['showElements'];
  activeTabId: TabStore['activeTabId'];
  extraTabIds: TabStore['extraTabIds'];
  canvasTabs: TabStore['tabs'];
  addTabMembers: TabStore['addMembers'];
  removeTabMembers: TabStore['removeMembers'];
  excludeFromTab: TabStore['excludeFromTab'];
  setActiveTab: TabStore['setActiveTab'];
  createTab: TabStore['createTab'];
  saveTabViewport: TabStore['saveTabViewport'];
  findPaths: InsightsStore['findPaths'];
  findAllPaths: InsightsStore['findAllPaths'];
  setSidePanelTab: UIStore['setSidePanelTab'];
  t: TFunction<'common'>;
  tPages: TFunction<'pages'>;
}

/**
 * Actions of the element, canvas and selection menus: create, copy, cut,
 * duplicate, delete, hide, lock, groups, tabs, queries, paths, merge.
 */
export function useCanvasSelectionActions({
  elements,
  links,
  elementMap,
  assetMap,
  degreeMap,
  allEdges,
  currentDossier,
  contextMenu,
  setContextMenu,
  closeContextMenu,
  canvasContextMenu,
  setMergeElements,
  setPreviewAsset,
  overviewActiveRef,
  overviewSceneRef,
  selectedElementIds,
  selectedLinkIds,
  getSelectedElementIds,
  clearSelection,
  selectElement,
  selectElements,
  selectLinks,
  createElement,
  createLink,
  updateElement,
  createGroup,
  removeFromGroup,
  dissolveGroup,
  pasteElements,
  deleteElementsWithHistory,
  writeClipboard,
  pushAction,
  hideElement,
  hideElements,
  showElement,
  showElements,
  activeTabId,
  extraTabIds,
  canvasTabs,
  addTabMembers,
  removeTabMembers,
  excludeFromTab,
  setActiveTab,
  createTab,
  saveTabViewport,
  findPaths,
  findAllPaths,
  setSidePanelTab,
  t,
  tPages,
}: CanvasSelectionActionsParams) {
  const handleCanvasContextMenuCreate = useCallback(async () => {
    if (!canvasContextMenu) return;

    const newElement = await createElement('', {
      x: canvasContextMenu.canvasX,
      y: canvasContextMenu.canvasY,
    });

    if (activeTabId) {
      addTabMembers(activeTabId, [newElement.id]);
    }

    pushAction({
      type: 'create-element',
      undo: {},
      redo: { elements: [newElement], elementIds: [newElement.id] },
    });

    selectElement(newElement.id);
  }, [canvasContextMenu, createElement, selectElement, pushAction, activeTabId, addTabMembers]);

  const handleCanvasContextMenuCreateGroup = useCallback(async () => {
    if (!canvasContextMenu) return;

    const group = await createGroup('Groupe', {
      x: canvasContextMenu.canvasX,
      y: canvasContextMenu.canvasY,
    }, { width: 300, height: 200 });

    pushAction({
      type: 'create-element',
      undo: {},
      redo: { elements: [group], elementIds: [group.id] },
    });

    selectElement(group.id);
  }, [canvasContextMenu, createGroup, selectElement, pushAction]);

  const handleCanvasContextMenuCreateAnnotation = useCallback(async () => {
    if (!canvasContextMenu) return;

    const annotation = await createElement('', {
      x: canvasContextMenu.canvasX,
      y: canvasContextMenu.canvasY,
    }, {
      isAnnotation: true,
      notes: '',
      visual: {
        color: '#ffffff',
        borderColor: '#e5e7eb',
        shape: 'rectangle',
        size: 'medium',
        icon: null,
        image: null,
        customWidth: 200,
      },
    });

    if (activeTabId) {
      addTabMembers(activeTabId, [annotation.id]);
    }

    pushAction({
      type: 'create-element',
      undo: {},
      redo: { elements: [annotation], elementIds: [annotation.id] },
    });
    selectElement(annotation.id);
  }, [canvasContextMenu, createElement, selectElement, pushAction, activeTabId, addTabMembers]);

  // Canvas menu: act on the selection, not on a right-clicked element
  const handleSelectionCopy = useCallback(() => {
    const selectedEls = getSelectedElementIds();
    if (selectedEls.length === 0) return;
    const elsToCopy = elements.filter(el => selectedEls.includes(el.id));
    if (elsToCopy.length > 0) {
      writeClipboard(elsToCopy, [...selectedLinkIds]);
    }
  }, [elements, getSelectedElementIds, selectedLinkIds, writeClipboard]);

  const handleSelectionCut = useCallback(async () => {
    const selectedEls = getSelectedElementIds();
    if (selectedEls.length === 0) return;
    const elsToCut = elements.filter(el => selectedEls.includes(el.id));
    if (elsToCut.length > 0) {
      writeClipboard(elsToCut, [...selectedLinkIds]);
      await deleteElementsWithHistory(selectedEls);
      clearSelection();
    }
  }, [elements, getSelectedElementIds, selectedLinkIds, deleteElementsWithHistory, clearSelection, writeClipboard]);

  const handleSelectionDuplicate = useCallback(async () => {
    const selectedEls = getSelectedElementIds();
    if (selectedEls.length === 0 || !currentDossier) return;
    const elsToDuplicate = elements.filter(el => selectedEls.includes(el.id));
    if (elsToDuplicate.length === 0) return;

    const now = new Date();
    const offset = 40;
    const oldToNewIdMap = new Map<string, string>();

    const newElements: Element[] = elsToDuplicate.map(el => {
      const newId = generateUUID();
      oldToNewIdMap.set(el.id, newId);
      return {
        ...el,
        id: newId,
        dossierId: currentDossier.id,
        position: { x: el.position.x + offset, y: el.position.y + offset },
        parentGroupId: null,
        createdAt: now,
        updatedAt: now,
      };
    });

    const elIdSet = new Set(selectedEls);
    const relevantLinks = links.filter(l => elIdSet.has(l.fromId) && elIdSet.has(l.toId));
    const originals = new Map(elements.map((el) => [el.id, el]));
    const copies = new Map(newElements.map((el) => [el.id, el]));
    const newLinks: Link[] = relevantLinks.map(link => ({
      ...link,
      // A route drawn by hand moves with the copies
      ...routeOfCopiedLink(link, originals, copies, oldToNewIdMap),
      id: generateUUID(),
      dossierId: currentDossier.id,
      fromId: oldToNewIdMap.get(link.fromId)!,
      toId: oldToNewIdMap.get(link.toId)!,
      createdAt: now,
      updatedAt: now,
    })).filter(l => l.fromId && l.toId);

    pasteElements(newElements, newLinks);
    const newElementIds = newElements.map(el => el.id);
    if (activeTabId) {
      addTabMembers(activeTabId, newElementIds);
    }
    const newLinkIds = newLinks.map(l => l.id);
    pushAction({
      type: 'create-elements',
      undo: {},
      redo: { elements: newElements, links: newLinks, elementIds: newElementIds, linkIds: newLinkIds },
    });
    selectElements(newElementIds);
  }, [elements, links, getSelectedElementIds, currentDossier, pasteElements, selectElements, pushAction, activeTabId, addTabMembers]);

  const handleSelectionDelete = useCallback(async () => {
    const selectedEls = getSelectedElementIds();
    if (selectedEls.length === 0) return;
    await deleteElementsWithHistory(selectedEls);
    clearSelection();
  }, [getSelectedElementIds, deleteElementsWithHistory, clearSelection]);

  // Canvas menu (right-click on the selection box): lock or unlock every
  // selected element; unlock only when all of them are already locked
  const selectionLocked = useMemo(() => {
    if (selectedElementIds.size === 0) return false;
    for (const id of selectedElementIds) {
      if (!elementMap.get(id)?.isPositionLocked) return false;
    }
    return true;
  }, [selectedElementIds, elementMap]);

  const handleSelectionToggleLock = useCallback(async () => {
    const ids = getSelectedElementIds();
    if (ids.length === 0) return;
    await Promise.all(ids.map(id => updateElement(id, { isPositionLocked: !selectionLocked })));
  }, [getSelectedElementIds, selectionLocked, updateElement]);

  // Tab membership changes go through the history: each records, per tab,
  // only the elements really added or removed, so Ctrl+Z puts things back.
  const tabMembers = useCallback((tabId: string) =>
    new Set(useTabStore.getState().tabs.find((t) => t.id === tabId)?.memberElementIds ?? []), []);
  const pushTabMembership = useCallback((snapshot: TabMembershipSnapshot) => {
    if (snapshot.changes.every((c) => c.added.length === 0 && c.removed.length === 0) && !snapshot.createdTab) return;
    pushAction({ type: 'tab-membership', undo: { snapshot }, redo: { snapshot } });
  }, [pushAction]);

  // Tabs the view shows: the open one, and those combined with it
  const viewTabIds = useMemo(
    () => (activeTabId === null ? [] : [activeTabId, ...extraTabIds]),
    [activeTabId, extraTabIds],
  );

  // New canvas tab holding `ids`, opened. Same naming as the tab bar; the
  // canvas stays where it is, the elements being on screen. Made from inside
  // a tab (or combined tabs), the elements move: they leave the tabs they came from.
  const canCreateTab = !!currentDossier;
  const createTabFromIds = useCallback(async (ids: string[]) => {
    if (!currentDossier || ids.length === 0) return;
    const from = activeTabId;
    const sources = viewTabIds.map((tabId) => ({ tabId, removed: ids.filter((id) => tabMembers(tabId).has(id)) }));
    const tab = await createTab(currentDossier.id, tPages('dossier.tabs.defaultName', { n: canvasTabs.length + 1 }));
    // The new tab opens where the view stands (the elements are on screen)
    await saveTabViewport(tab.id, useViewStore.getState().viewport);
    await addTabMembers(tab.id, ids);
    for (const { tabId, removed } of sources) if (removed.length > 0) await removeTabMembers(tabId, removed);
    setActiveTab(tab.id);
    pushTabMembership({
      changes: [{ tabId: tab.id, added: ids, removed: [] }, ...sources.map(({ tabId, removed }) => ({ tabId, added: [], removed }))],
      createdTab: tab,
      activeBefore: from,
      activeAfter: tab.id,
    });
  }, [currentDossier, activeTabId, viewTabIds, canvasTabs.length, saveTabViewport, createTab, tPages, addTabMembers, removeTabMembers, setActiveTab, tabMembers, pushTabMembership]);

  // Send `ids` to another tab and out of the tabs in view (they stay in "All").
  const moveIdsToTab = useCallback(async (tabId: string, ids: string[]) => {
    const from = activeTabId;
    if (from === null || ids.length === 0) return;
    const sources = viewTabIds.filter((id) => id !== tabId);
    if (sources.length === 0) return;
    const target = tabMembers(tabId);
    const added = ids.filter((id) => !target.has(id));
    const removals = sources.map((sourceId) => ({ tabId: sourceId, removed: ids.filter((id) => tabMembers(sourceId).has(id)) }));
    await addTabMembers(tabId, ids);
    for (const { tabId: sourceId, removed } of removals) if (removed.length > 0) await removeTabMembers(sourceId, removed);
    pushTabMembership({
      changes: [{ tabId, added, removed: [] }, ...removals.map(({ tabId: sourceId, removed }) => ({ tabId: sourceId, added: [], removed }))],
      activeBefore: from,
      activeAfter: from,
    });
  }, [activeTabId, viewTabIds, addTabMembers, removeTabMembers, tabMembers, pushTabMembership]);

  // Bring ghosts into the open tab: in it, out of the tabs they are in
  const moveIdsHere = useCallback(async (ids: string[]) => {
    const here = activeTabId;
    if (here === null || ids.length === 0) return;
    const target = tabMembers(here);
    const added = ids.filter((id) => !target.has(id));
    const removals = canvasTabs
      .filter((tab) => tab.id !== here)
      .map((tab) => ({ tabId: tab.id, removed: ids.filter((id) => tabMembers(tab.id).has(id)) }))
      .filter(({ removed }) => removed.length > 0);
    await addTabMembers(here, ids);
    for (const { tabId, removed } of removals) await removeTabMembers(tabId, removed);
    pushTabMembership({
      changes: [{ tabId: here, added, removed: [] }, ...removals.map(({ tabId, removed }) => ({ tabId, added: [], removed }))],
      activeBefore: here,
      activeAfter: here,
    });
  }, [activeTabId, canvasTabs, addTabMembers, removeTabMembers, tabMembers, pushTabMembership]);

  // Take `ids` out of the tabs in view: members leave them (they stay in
  // "All"), ghosts are set aside. Membership changes go through the history.
  const removeIdsFromActiveTab = useCallback(async (ids: string[]) => {
    if (activeTabId === null || ids.length === 0) return;
    const inView = new Set<string>();
    const removals = viewTabIds.map((tabId) => {
      const members = tabMembers(tabId);
      const removed = ids.filter((id) => members.has(id));
      removed.forEach((id) => inView.add(id));
      return { tabId, removed };
    });
    const ghosts = ids.filter((id) => !inView.has(id));
    for (const tabId of viewTabIds) if (ghosts.length > 0) await excludeFromTab(tabId, ghosts);
    const changed = removals.filter(({ removed }) => removed.length > 0);
    if (changed.length > 0) {
      for (const { tabId, removed } of changed) await removeTabMembers(tabId, removed);
      pushTabMembership({
        changes: changed.map(({ tabId, removed }) => ({ tabId, added: [], removed })),
        activeBefore: activeTabId,
        activeAfter: activeTabId,
      });
    }
  }, [activeTabId, viewTabIds, tabMembers, excludeFromTab, removeTabMembers, pushTabMembership]);

  // Add `ids` to a tab, keeping them where they are.
  const addIdsToTab = useCallback(async (tabId: string, ids: string[]) => {
    const target = tabMembers(tabId);
    const added = ids.filter((id) => !target.has(id));
    if (added.length === 0) return;
    await addTabMembers(tabId, added);
    pushTabMembership({ changes: [{ tabId, added, removed: [] }], activeBefore: activeTabId, activeAfter: activeTabId });
  }, [activeTabId, addTabMembers, tabMembers, pushTabMembership]);

  // Show only `ids`: everything else is hidden, except the groups holding
  // them (a hidden group would take them along) and the members of a group
  // among them
  const showOnly = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const { keep, hide } = showOnlySplit(ids, useDossierStore.getState().elements);
    showElements(keep);
    hideElements(hide);
  }, [showElements, hideElements]);

  const handleSelectionShowOnly = useCallback(() => {
    showOnly(getSelectedElementIds());
  }, [getSelectedElementIds, showOnly]);

  const handleContextMenuShowOnly = useCallback(() => {
    if (!contextMenu) return;
    const selectedEls = getSelectedElementIds();
    showOnly(selectedEls.length > 1 && selectedEls.includes(contextMenu.elementId) ? selectedEls : [contextMenu.elementId]);
  }, [contextMenu, getSelectedElementIds, showOnly]);

  const showAllHidden = useCallback(() => useViewStore.getState().showAllElements(), []);

  const handleSelectionHide = useCallback(() => {
    const selectedEls = getSelectedElementIds();
    if (selectedEls.length === 0) return;
    hideElements(selectedEls);
    clearSelection();
  }, [getSelectedElementIds, hideElements, clearSelection]);

  // Find similar: label close to the element's, and one of its tags
  const handleFindSimilar = useCallback(() => {
    // Element menu: right-clicked element; canvas menu: the single selected element
    const targetId = contextMenu?.elementId ?? getSelectedElementIds()[0];
    if (!targetId) return;
    const el = elements.find(e => e.id === targetId);
    if (!el) return;
    // A label close to it (LIKE: case, accents, small typos) AND one of its
    // tags; either part alone when the element lacks the other
    const text = similarQueryText(el);
    if (!text) {
      useUIStore.getState().showToast('warning', tPages('dossier.findSimilarNoTags'));
      return;
    }
    useQueryStore.getState().setText(text);
    useQueryStore.getState().execute();
    useUIStore.getState().setSidePanelTab('query');
  }, [contextMenu, elements, getSelectedElementIds]);

  const handleOpenUrl = useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
    closeContextMenu();
  }, [closeContextMenu]);

  const handleCopyUrl = useCallback((url: string) => {
    navigator.clipboard.writeText(url)
      .then(() => toast.success(tPages('dossier.urlCopied')))
      .catch(() => toast.error(tPages('dossier.urlCopyFailed')));
    closeContextMenu();
  }, [closeContextMenu, tPages]);

  // Query matching the labels of the selected elements
  const handleQueryFromSelection = useCallback(() => {
    const selectedEls = getSelectedElementIds();
    if (selectedEls.length < 2) return;

    const text = labelsQueryText(selectedEls.map(id => elements.find(e => e.id === id)).filter((el): el is Element => !!el));
    if (!text) return;

    useQueryStore.getState().setText(text);
    useQueryStore.getState().execute();
    useUIStore.getState().setSidePanelTab('query');
  }, [getSelectedElementIds, elements]);

  // Copy the selection as a Mermaid flowchart (Markdown notes, wikis, reports)
  const handleCopyAsMermaid = useCallback(() => {
    const ids = new Set(getSelectedElementIds());
    if (ids.size === 0) return;
    // Children of selected groups come along
    for (const el of elements) if (el.parentGroupId && ids.has(el.parentGroupId)) ids.add(el.id);
    const selected = elements.filter(el => ids.has(el.id));
    const between = links.filter(l => ids.has(l.fromId) && ids.has(l.toId));
    navigator.clipboard.writeText(buildMermaidExport(selected, between))
      .then(() => { emitExport('clipboard-mermaid'); toast.success(tPages('dossier.mermaidCopied')); })
      .catch(() => toast.error(tPages('dossier.mermaidCopyFailed')));
  }, [getSelectedElementIds, elements, links, tPages]);

  // Copy the selection as a DOT graph (Graphviz, NetworkX)
  const handleCopyAsDot = useCallback(() => {
    const ids = new Set(getSelectedElementIds());
    if (ids.size === 0) return;
    // Children of selected groups come along
    for (const el of elements) if (el.parentGroupId && ids.has(el.parentGroupId)) ids.add(el.id);
    const selected = elements.filter(el => ids.has(el.id));
    const between = links.filter(l => ids.has(l.fromId) && ids.has(l.toId));
    navigator.clipboard.writeText(buildDOTExport(currentDossier?.name ?? '', selected, between))
      .then(() => { emitExport('clipboard-dot'); toast.success(tPages('dossier.dotCopied')); })
      .catch(() => toast.error(tPages('dossier.mermaidCopyFailed')));
  }, [getSelectedElementIds, elements, links, tPages, currentDossier?.name]);

  // Element menu targets: the whole selection when the clicked element is part
  // of a multiple one, the clicked element alone otherwise
  const menuTargetIds = useCallback((): string[] => {
    if (!contextMenu) return getSelectedElementIds();
    const selected = getSelectedElementIds();
    return selected.length > 1 && selected.includes(contextMenu.elementId) ? selected : [contextMenu.elementId];
  }, [contextMenu, getSelectedElementIds]);

  // Focus: the neighbourhood of the targets as a ZNQuery, which the user can
  // then edit, save or keep in a view. A target is its label, readable; its id
  // only when another element bears the same label (label = is case-insensitive)
  const focusOn = useCallback((ids: string[], depth: number) => {
    const text = neighbourhoodQueryText(ids, elements, depth);
    if (!text) return;
    useQueryStore.getState().setText(text);
    useUIStore.getState().setSidePanelTab('query');
  }, [elements]);

  const handleContextMenuFocus = useCallback(
    (depth: number) => focusOn(menuTargetIds(), depth),
    [focusOn, menuTargetIds]
  );
  const handleSelectionFocus = useCallback(
    (depth: number) => focusOn(getSelectedElementIds(), depth),
    [focusOn, getSelectedElementIds]
  );

  const handleContextMenuHide = useCallback(() => {
    if (contextMenu) {
      const selectedEls = getSelectedElementIds();
      if (selectedEls.length > 1 && selectedEls.includes(contextMenu.elementId)) {
        hideElements(selectedEls);
        clearSelection();
      } else {
        hideElement(contextMenu.elementId);
      }
    }
  }, [contextMenu, hideElement, hideElements, getSelectedElementIds, clearSelection]);

  const handleContextMenuShow = useCallback(() => {
    if (contextMenu) {
      showElement(contextMenu.elementId);
    }
  }, [contextMenu, showElement]);

  const handleContextMenuDelete = useCallback(async () => {
    if (contextMenu) {
      await deleteElementsWithHistory([contextMenu.elementId]);
      clearSelection();
    }
  }, [contextMenu, deleteElementsWithHistory, clearSelection]);

  const handleContextMenuPreview = useCallback(() => {
    if (contextMenu?.previewAsset) {
      setPreviewAsset(contextMenu.previewAsset);
    }
  }, [contextMenu, setPreviewAsset]);

  const handleContextMenuCopy = useCallback(() => {
    const selectedEls = getSelectedElementIds();
    const elsToCopy = selectedEls.length > 0
      ? elements.filter(el => selectedEls.includes(el.id))
      : contextMenu
        ? elements.filter(el => el.id === contextMenu.elementId)
        : [];

    if (elsToCopy.length > 0) {
      writeClipboard(elsToCopy, [...selectedLinkIds]);
    }
  }, [elements, getSelectedElementIds, contextMenu, selectedLinkIds, writeClipboard]);

  const handleContextMenuCut = useCallback(async () => {
    const selectedEls = getSelectedElementIds();
    const elsToCut = selectedEls.length > 0
      ? elements.filter(el => selectedEls.includes(el.id))
      : contextMenu
        ? elements.filter(el => el.id === contextMenu.elementId)
        : [];

    if (elsToCut.length > 0) {
      writeClipboard(elsToCut, [...selectedLinkIds]);
      await deleteElementsWithHistory(elsToCut.map(el => el.id));
      clearSelection();
    }
  }, [elements, getSelectedElementIds, contextMenu, selectedLinkIds, deleteElementsWithHistory, clearSelection, writeClipboard]);

  const handleContextMenuDuplicate = useCallback(() => {
    if (!contextMenu) return;
    const selectedEls = getSelectedElementIds();
    const elIds = selectedEls.length > 0 ? selectedEls : [contextMenu.elementId];
    const elsToDuplicate = elements.filter(el => elIds.includes(el.id));
    if (elsToDuplicate.length === 0) return;

    const now = new Date();
    const offset = 40;
    const oldToNewIdMap = new Map<string, string>();

    const newElements: Element[] = elsToDuplicate.map(el => {
      const newId = generateUUID();
      oldToNewIdMap.set(el.id, newId);
      return {
        ...el,
        id: newId,
        dossierId: currentDossier!.id,
        position: {
          x: el.position.x + offset,
          y: el.position.y + offset,
        },
        parentGroupId: null,
        createdAt: now,
        updatedAt: now,
      };
    });

    const elIdSet = new Set(elIds);
    const relevantLinks = links.filter(l =>
      elIdSet.has(l.fromId) && elIdSet.has(l.toId)
    );
    const originals = new Map(elements.map((el) => [el.id, el]));
    const copies = new Map(newElements.map((el) => [el.id, el]));
    const newLinks: Link[] = relevantLinks.map(link => ({
      ...link,
      ...routeOfCopiedLink(link, originals, copies, oldToNewIdMap),
      id: generateUUID(),
      dossierId: currentDossier!.id,
      fromId: oldToNewIdMap.get(link.fromId)!,
      toId: oldToNewIdMap.get(link.toId)!,
      createdAt: now,
      updatedAt: now,
    })).filter(l => l.fromId && l.toId);

    pasteElements(newElements, newLinks);

    const newElementIds = newElements.map(el => el.id);
    if (activeTabId) {
      addTabMembers(activeTabId, newElementIds);
    }
    const newLinkIds = newLinks.map(l => l.id);
    pushAction({
      type: 'create-elements',
      undo: {},
      redo: { elements: newElements, links: newLinks, elementIds: newElementIds, linkIds: newLinkIds },
    });
    selectElements(newElementIds);
  }, [contextMenu, elements, links, getSelectedElementIds, currentDossier, pasteElements, selectElements, pushAction, activeTabId, addTabMembers]);

  // Elements a new group can take: top-level, non-group elements. Groups are
  // a single level (child position = group position + relative offset), and
  // undo only knows how to put children back at the top level, so groups and
  // elements already inside a group are left out.
  const groupableSelectedIds = useMemo(() => {
    const ids: string[] = [];
    for (const id of selectedElementIds) {
      const el = elementMap.get(id);
      // A parent group that no longer exists (left over) does not hold the element
      const inGroup = !!el?.parentGroupId && !!elementMap.get(el.parentGroupId)?.isGroup;
      if (el && !el.isGroup && !inGroup) ids.push(id);
    }
    return ids;
  }, [selectedElementIds, elementMap]);
  const canGroupSelection = groupableSelectedIds.length >= 2;

  // The group the free elements of the selection can join: exactly one group selected
  const addToGroupTargetId = useMemo(() => {
    if (groupableSelectedIds.length === 0) return null;
    let target: string | null = null;
    for (const id of selectedElementIds) {
      if (!elementMap.get(id)?.isGroup) continue;
      if (target) return null;
      target = id;
    }
    return target;
  }, [groupableSelectedIds, selectedElementIds, elementMap]);

  const handleAddToGroup = useCallback(async () => {
    if (!addToGroupTargetId) return;
    await addElementsToGroup(addToGroupTargetId, groupableSelectedIds, t('empty.unnamed'));
    clearSelection();
  }, [addToGroupTargetId, groupableSelectedIds, t, clearSelection]);

  const handleGroupSelection = useCallback(async () => {
    const selectedElements = groupableSelectedIds
      .map(id => elementMap.get(id))
      .filter((el): el is Element => !!el);
    if (selectedElements.length < 2) return;
    const childIds = selectedElements.map(el => el.id);

    const absolutePositions = selectedElements.map(el => ({
      id: el.id,
      position: { ...el.position },
    }));

    // Bounding box of the selected elements, using the size they are drawn at.
    // The padding also covers the diamond tips, which overhang the node box.
    const padding = 40;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of selectedElements) {
      const firstAssetId = el.assetIds?.[0];
      const hasImage = Boolean(firstAssetId && assetMap.get(firstAssetId)) && el.visual.hideMedia !== true;
      const shown = degreeMap ? scaleByDegree(el, degreeMap.get(el.id) ?? 0, hasImage) : el;
      const { width: w, height: h } = computeElementDimensions(shown.visual, el.label || t('empty.unnamed'), hasImage);
      minX = Math.min(minX, shown.position.x);
      minY = Math.min(minY, shown.position.y);
      maxX = Math.max(maxX, shown.position.x + w);
      maxY = Math.max(maxY, shown.position.y + h);
    }

    const groupPos = { x: minX - padding, y: minY - padding };
    const groupSize = {
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
    };

    const group = await createGroup('Groupe', groupPos, groupSize, childIds);

    const relativePositions = selectedElements.map(el => ({
      id: el.id,
      position: { x: el.position.x - groupPos.x, y: el.position.y - groupPos.y },
    }));

    // Get fresh group snapshot from store (with childIds set)
    const groupSnapshot = useDossierStore.getState().elements.find(el => el.id === group.id);
    if (groupSnapshot) {
      pushAction({
        type: 'create-group',
        undo: { positions: absolutePositions },
        redo: { elements: [groupSnapshot], elementIds: [group.id], positions: relativePositions },
      });
    }

    clearSelection();
  }, [groupableSelectedIds, elementMap, assetMap, degreeMap, t, createGroup, clearSelection, pushAction]);

  // Group the selection after packing it in a grid around its centre
  const handleGroupGather = useCallback(async () => {
    await groupElements(groupableSelectedIds, 'Groupe', t('empty.unnamed'), { gather: true });
    clearSelection();
  }, [groupableSelectedIds, t, clearSelection]);

  // Pack the members of the group under the menu in a grid
  const handleGatherGroup = useCallback(async () => {
    if (!contextMenu?.elementId) return;
    await gatherGroup(contextMenu.elementId, t('empty.unnamed'));
  }, [contextMenu, t]);

  const handleDissolveGroup = useCallback(async () => {
    if (!contextMenu) return;
    const group = elementMap.get(contextMenu.elementId);
    if (!group?.isGroup) return;

    // Snapshot group element and children's relative positions for undo
    const groupSnapshot = { ...group };
    const childPositions = group.childIds
      .map(childId => {
        const child = elementMap.get(childId);
        return child ? { id: childId, position: { ...child.position } } : null;
      })
      .filter((p): p is { id: string; position: { x: number; y: number } } => p !== null);

    await dissolveGroup(contextMenu.elementId);

    pushAction({
      type: 'dissolve-group',
      undo: {
        elements: [groupSnapshot],
        positions: childPositions,
      },
      redo: {
        elementIds: [contextMenu.elementId],
      },
    });

    clearSelection();
  }, [contextMenu, elementMap, dissolveGroup, clearSelection, pushAction]);

  const handleRemoveFromGroup = useCallback(async () => {
    if (!contextMenu) return;
    const child = elementMap.get(contextMenu.elementId);
    if (!child?.parentGroupId) return;

    const group = elementMap.get(child.parentGroupId);
    if (!group) return;

    const oldRelativePosition = { ...child.position };
    const absolutePosition = {
      x: child.position.x + group.position.x,
      y: child.position.y + group.position.y,
    };

    await removeFromGroup([contextMenu.elementId]);

    pushAction({
      type: 'remove-from-group',
      undo: {
        elementId: contextMenu.elementId,
        changes: { parentGroupId: child.parentGroupId, position: oldRelativePosition },
      },
      redo: {
        elementId: contextMenu.elementId,
        changes: { parentGroupId: null, position: absolutePosition },
      },
    });
  }, [contextMenu, elementMap, removeFromGroup, pushAction]);

  // Element menu lock: the clicked element's state decides, applied to the whole selection
  const handleToggleLock = useCallback(async () => {
    if (!contextMenu) return;
    const clickedElement = elementMap.get(contextMenu.elementId);
    if (!clickedElement) return;

    const newLockState = !clickedElement.isPositionLocked;

    const targetIds = selectedElementIds.size > 1
      ? Array.from(selectedElementIds)
      : [contextMenu.elementId];

    await Promise.all(
      targetIds.map(id => updateElement(id, { isPositionLocked: newLockState }))
    );
  }, [contextMenu, elementMap, selectedElementIds, updateElement]);

  const handleFindPaths = useCallback(
    (fromId: string, toId: string) => {
      // Ensure the analysis graph reflects current data (the Insights panel may
      // never have been opened, so its graph would be stale/absent), then show
      // the result in the Insights panel.
      insightsService.buildGraph(elements, links);
      findPaths(fromId, toId);
      setSidePanelTab('insights');
    },
    [findPaths, elements, links, setSidePanelTab]
  );

  const handleFindAllPaths = useCallback(
    (fromId: string, toId: string) => {
      insightsService.buildGraph(elements, links);
      findAllPaths(fromId, toId);
      setSidePanelTab('insights');
    },
    [findAllPaths, elements, links, setSidePanelTab]
  );

  const handleMergeElements = useCallback(() => {
    if (selectedElementIds.size < 2) return;
    const chosen = Array.from(selectedElementIds)
      .map((id) => elementMap.get(id))
      .filter((el): el is Element => !!el);
    if (chosen.length >= 2) {
      setMergeElements(chosen);
      setContextMenu(null);
    }
  }, [selectedElementIds, elementMap, setContextMenu, setMergeElements]);

  // Exactly 2 selected: the one not under the menu
  const otherSelectedElement = useMemo(() => {
    if (contextMenu && selectedElementIds.size === 2) {
      const otherId = Array.from(selectedElementIds).find(
        (id) => id !== contextMenu.elementId
      );
      if (otherId) {
        return elementMap.get(otherId);
      }
    }
    return undefined;
  }, [contextMenu, selectedElementIds, elementMap]);

  // Link suggestions for the selected elements, shown in their side-panel tab
  const handleSuggestLinks = useCallback(() => {
    useSuggestionsStore.getState().analyze(menuTargetIds());
    useUIStore.getState().setSidePanelTab('suggestions');
  }, [menuTargetIds]);

  // Links shown on the canvas (filters, tab, hidden elements applied) touching
  // the selected elements — or all of them when nothing is selected.
  const handleSelectLinks = useCallback(() => {
    // From the element menu: its targets; elsewhere the selection (none: every link)
    const selected = contextMenu ? new Set(menuTargetIds()) : useSelectionStore.getState().selectedElementIds;
    // Overview: React Flow has no edges, the scene holds every drawn link
    const scene = overviewSceneRef.current;
    if (overviewActiveRef.current && scene) {
      const picked: number[] = [];
      for (let i = 0; i < scene.nodeCount; i++) if (selected.size === 0 || selected.has(scene.ids[i])) picked.push(i);
      selectLinks(linksTouching(scene, picked));
      return;
    }
    const ids = allEdges
      .filter((edge) => selected.size === 0 || selected.has(edge.source) || selected.has(edge.target))
      .map((edge) => edge.id);
    selectLinks(ids);
  }, [contextMenu, menuTargetIds, allEdges, selectLinks, overviewActiveRef, overviewSceneRef]);

  // Adds to the targets the elements linked to them by a link shown on the
  // canvas (filters, tab and hidden elements applied)
  const handleSelectNeighbors = useCallback(() => {
    const base = new Set(menuTargetIds());
    if (base.size === 0) return;
    const result = new Set(base);
    const scene = overviewSceneRef.current;
    if (overviewActiveRef.current && scene) {
      for (let l = 0; l < scene.linkCount; l++) {
        const a = scene.ids[scene.from[l]], b = scene.ids[scene.to[l]];
        if (base.has(a)) result.add(b);
        if (base.has(b)) result.add(a);
      }
    } else {
      for (const edge of allEdges) {
        if (base.has(edge.source)) result.add(edge.target);
        if (base.has(edge.target)) result.add(edge.source);
      }
    }
    selectElements(Array.from(result));
  }, [menuTargetIds, allEdges, selectElements, overviewActiveRef, overviewSceneRef]);

  // Exactly two linkable elements selected: a link between them, from the one
  // under the menu (or the first selected) to the other
  const linkPair = useMemo((): [string, string] | null => {
    if (selectedElementIds.size !== 2) return null;
    const ids = Array.from(selectedElementIds);
    if (ids.some((id) => !elementMap.get(id) || elementMap.get(id)!.isAnnotation)) return null;
    return contextMenu?.elementId === ids[1] ? [ids[1], ids[0]] : [ids[0], ids[1]];
  }, [selectedElementIds, elementMap, contextMenu]);

  const handleLinkSelection = useCallback(async () => {
    if (!linkPair) return;
    const dossier = useDossierStore.getState().currentDossier;
    const created = await createLink(linkPair[0], linkPair[1], withDossierLinkDefaults(dossier));
    pushAction({ type: 'create-link', undo: {}, redo: { linkIds: [created.id], links: [created] } });
  }, [linkPair, createLink, pushAction]);

  return {
    addIdsToTab,
    canCreateTab,
    canAddToGroup: addToGroupTargetId !== null,
    canLinkSelection: linkPair !== null,
    canGroupSelection,
    createTabFromIds,
    handleCanvasContextMenuCreate,
    handleCanvasContextMenuCreateAnnotation,
    handleCanvasContextMenuCreateGroup,
    handleAddToGroup,
    handleContextMenuCopy,
    handleContextMenuCut,
    handleContextMenuDelete,
    handleContextMenuDuplicate,
    handleContextMenuFocus,
    handleContextMenuHide,
    handleContextMenuPreview,
    handleContextMenuShow,
    handleContextMenuShowOnly,
    handleCopyAsDot,
    handleCopyAsMermaid,
    handleCopyUrl,
    handleDissolveGroup,
    handleFindAllPaths,
    handleFindPaths,
    handleFindSimilar,
    handleGatherGroup,
    handleGroupGather,
    handleGroupSelection,
    handleMergeElements,
    handleOpenUrl,
    handleQueryFromSelection,
    handleRemoveFromGroup,
    handleSelectionCopy,
    handleSelectionCut,
    handleSelectionDelete,
    handleSelectionDuplicate,
    handleSelectionHide,
    handleSelectionShowOnly,
    handleSelectionToggleLock,
    handleLinkSelection,
    handleSelectionFocus,
    handleSelectLinks,
    handleSelectNeighbors,
    handleSuggestLinks,
    handleToggleLock,
    moveIdsHere,
    moveIdsToTab,
    otherSelectedElement,
    removeIdsFromActiveTab,
    selectionLocked,
    showAllHidden,
    viewTabIds,
  };
}
