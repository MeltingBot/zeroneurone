import { useCallback, useEffect } from 'react';
import type { Edge } from '@xyflow/react';

import { useViewStore, useHistoryStore } from '../../stores';
import type { Element, Link } from '../../types';
import { generateUUID } from '../../utils';
import type { DeleteElementsWithHistory, DossierStore, HistoryStore, MousePosRef, SelectionStore, TabStore, WrapperRef, WriteClipboard } from './canvasHookTypes';
import { routeOfCopiedLink } from '../../utils/routeFollow';

export interface CanvasKeyboardParams {
  reactFlowWrapper: WrapperRef;
  lastMousePosRef: MousePosRef;
  elements: Element[];
  links: Link[];
  allEdges: Edge[];
  currentDossier: DossierStore['currentDossier'];
  selectedLinkIds: SelectionStore['selectedLinkIds'];
  getSelectedElementIds: SelectionStore['getSelectedElementIds'];
  getSelectedLinkIds: SelectionStore['getSelectedLinkIds'];
  clearSelection: SelectionStore['clearSelection'];
  selectElements: SelectionStore['selectElements'];
  selectElement: SelectionStore['selectElement'];
  selectLinks: SelectionStore['selectLinks'];
  deleteElementsWithHistory: DeleteElementsWithHistory;
  deleteLinks: DossierStore['deleteLinks'];
  createElement: DossierStore['createElement'];
  createGroup: DossierStore['createGroup'];
  pasteElements: DossierStore['pasteElements'];
  updateElementPositions: DossierStore['updateElementPositions'];
  pushAction: HistoryStore['pushAction'];
  writeClipboard: WriteClipboard;
  activeTabId: TabStore['activeTabId'];
  tabMemberSet: TabStore['memberSet'];
  addTabMembers: TabStore['addMembers'];
}

/** Canvas shortcuts on window: selection, move, delete, copy, duplicate, create, undo */
export function useCanvasKeyboard({
  reactFlowWrapper,
  lastMousePosRef,
  elements,
  links,
  allEdges,
  currentDossier,
  selectedLinkIds,
  getSelectedElementIds,
  getSelectedLinkIds,
  clearSelection,
  selectElements,
  selectElement,
  selectLinks,
  deleteElementsWithHistory,
  deleteLinks,
  createElement,
  createGroup,
  pasteElements,
  updateElementPositions,
  pushAction,
  writeClipboard,
  activeTabId,
  tabMemberSet,
  addTabMembers,
}: CanvasKeyboardParams) {
  // Undo/redo go through the history store: one implementation for every
  // entry point, and the replay marked as such (asUndo) for plugin events
  const handleUndo = useCallback(() => useHistoryStore.getState().undo(), []);
  const handleRedo = useCallback(() => useHistoryStore.getState().redo(), []);

  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      const viewport = useViewStore.getState().viewport;
      const target = event.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable ||
        target.closest('[contenteditable="true"]')
      ) {
        return;
      }

      const isCtrlOrMeta = event.ctrlKey || event.metaKey;

      if (event.key === 'Escape') {
        clearSelection();
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        const selectedEls = getSelectedElementIds();
        if (selectedEls.length === 0) return;
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0;
        const dy = event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0;
        const movableEls = elements.filter(el => selectedEls.includes(el.id) && !el.isPositionLocked);
        if (movableEls.length === 0) return;
        const undoPositions = movableEls.map(el => ({ id: el.id, position: { ...el.position } }));
        const redoPositions = movableEls.map(el => ({
          id: el.id,
          position: { x: el.position.x + dx, y: el.position.y + dy },
        }));
        updateElementPositions(redoPositions);
        pushAction({
          type: 'move-elements',
          undo: { positions: undoPositions },
          redo: { positions: redoPositions },
        });
        return;
      }

      // Delete selected elements. The canvas's own key handler (focus on the
      // canvas) may have done it already: it bubbles here first. Twice would
      // stack two history entries, the second without tab membership, and an
      // undo would bring the elements back outside their tabs.
      if ((event.key === 'Delete' || event.key === 'Backspace') && !event.defaultPrevented) {
        event.preventDefault();
        const selectedEls = getSelectedElementIds();
        const selectedLks = getSelectedLinkIds();

        if (selectedEls.length > 0) {
          await deleteElementsWithHistory(selectedEls);
        }
        if (selectedLks.length > 0) {
          const linksToDelete = links.filter(l => selectedLks.includes(l.id));
          pushAction({
            type: 'delete-link',
            undo: { links: linksToDelete },
            redo: { linkIds: selectedLks },
          });
          await deleteLinks(selectedLks);
        }
        clearSelection();
      }

      // Select all visible links with Ctrl+Shift+A
      if (event.key.toLowerCase() === 'a' && isCtrlOrMeta && event.shiftKey) {
        event.preventDefault();
        selectLinks(allEdges.map((edge) => edge.id));
        return;
      }

      // Select all with Ctrl+A (only visible elements in active tab)
      if (event.key === 'a' && isCtrlOrMeta) {
        event.preventDefault();
        const visibleIds = activeTabId !== null
          ? elements.filter((el) => tabMemberSet.has(el.id)).map((el) => el.id)
          : elements.map((el) => el.id);
        selectElements(visibleIds);
        return;
      }

      // Text selected in a preview (PDF, text file): let the browser copy it.
      // Writing elements to the clipboard here would overwrite it right after.
      if ((event.key === 'c' || event.key === 'x') && isCtrlOrMeta && window.getSelection()?.toString()) {
        return;
      }

      if (event.key === 'c' && isCtrlOrMeta) {
        const selectedEls = getSelectedElementIds();
        if (selectedEls.length > 0) {
          writeClipboard(elements.filter(el => selectedEls.includes(el.id)), [...selectedLinkIds]);
        }
      }

      if (event.key === 'x' && isCtrlOrMeta) {
        event.preventDefault();
        const selectedEls = getSelectedElementIds();
        if (selectedEls.length > 0) {
          const elsToCut = elements.filter(el => selectedEls.includes(el.id));
          writeClipboard(elsToCut, [...selectedLinkIds]);
          await deleteElementsWithHistory(selectedEls);
          clearSelection();
        }
      }

      if (event.key === 'd' && isCtrlOrMeta) {
        event.preventDefault();
        const selectedEls = getSelectedElementIds();
        if (selectedEls.length > 0) {
          const elsToDuplicate = elements.filter(el => selectedEls.includes(el.id));
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
              parentGroupId: el.parentGroupId && oldToNewIdMap.has(el.parentGroupId)
                ? oldToNewIdMap.get(el.parentGroupId)!
                : null,
              createdAt: now,
              updatedAt: now,
            };
          });

          const selectedSet = new Set(selectedEls);
          const relevantLinks = links.filter(l =>
            selectedSet.has(l.fromId) && selectedSet.has(l.toId)
          );
          const originals = new Map(elements.map((el) => [el.id, el]));
          const copies = new Map(newElements.map((el) => [el.id, el]));
          const newLinks: Link[] = relevantLinks.map(link => ({
            ...link,
            // A route drawn by hand moves with the copies
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
        }
      }

      // New element with E (no modifier) at cursor position
      if (event.key === 'e' && !isCtrlOrMeta && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        const bounds = reactFlowWrapper.current?.getBoundingClientRect();
        const mx = bounds ? (lastMousePosRef.current.x - bounds.left - viewport.x) / viewport.zoom : 0;
        const my = bounds ? (lastMousePosRef.current.y - bounds.top - viewport.y) / viewport.zoom : 0;
        const el = await createElement('', { x: mx, y: my });
        if (activeTabId) addTabMembers(activeTabId, [el.id]);
        pushAction({ type: 'create-element', undo: {}, redo: { elements: [el], elementIds: [el.id] } });
        selectElement(el.id);
      }

      // New note with N (no modifier) at cursor position
      if (event.key === 'n' && !isCtrlOrMeta && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        const bounds = reactFlowWrapper.current?.getBoundingClientRect();
        const mx = bounds ? (lastMousePosRef.current.x - bounds.left - viewport.x) / viewport.zoom : 0;
        const my = bounds ? (lastMousePosRef.current.y - bounds.top - viewport.y) / viewport.zoom : 0;
        const annotation = await createElement('', { x: mx, y: my }, {
          isAnnotation: true,
          notes: '',
          visual: { color: '#ffffff', borderColor: '#e5e7eb', shape: 'rectangle', size: 'medium', icon: null, image: null, customWidth: 200 },
        });
        if (activeTabId) addTabMembers(activeTabId, [annotation.id]);
        pushAction({ type: 'create-element', undo: {}, redo: { elements: [annotation], elementIds: [annotation.id] } });
        selectElement(annotation.id);
      }

      // New visual group with G (no modifier) at cursor position
      if (event.key === 'g' && !isCtrlOrMeta && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        const bounds = reactFlowWrapper.current?.getBoundingClientRect();
        const mx = bounds ? (lastMousePosRef.current.x - bounds.left - viewport.x) / viewport.zoom : 0;
        const my = bounds ? (lastMousePosRef.current.y - bounds.top - viewport.y) / viewport.zoom : 0;
        const group = await createGroup('Groupe', { x: mx, y: my }, { width: 300, height: 200 });
        pushAction({
          type: 'create-element',
          undo: {},
          redo: { elements: [group], elementIds: [group.id] },
        });
        selectElement(group.id);
      }

      if (event.key === 'z' && isCtrlOrMeta && !event.shiftKey) {
        event.preventDefault();
        await handleUndo();
      }

      if ((event.key === 'z' && isCtrlOrMeta && event.shiftKey) ||
          (event.key === 'y' && isCtrlOrMeta)) {
        event.preventDefault();
        await handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    getSelectedElementIds,
    getSelectedLinkIds,
    selectedLinkIds,
    deleteElementsWithHistory,
    deleteLinks,
    clearSelection,
    selectElements,
    selectElement,
    selectLinks,
    allEdges,
    createElement,
    createGroup,
    pasteElements,
    currentDossier,
    elements,
    links,
    pushAction,
    handleUndo,
    handleRedo,
    writeClipboard,
    activeTabId,
    tabMemberSet,
    addTabMembers,
    updateElementPositions,
    // Stable refs, listed because they come in as parameters
    reactFlowWrapper,
    lastMousePosRef,
  ]);
}
