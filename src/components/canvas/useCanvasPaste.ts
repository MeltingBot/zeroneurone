import { useCallback, useEffect } from 'react';

import { useViewStore, useUIStore, useClipboardStore, toast } from '../../stores';
import type { Element, Link } from '../../types';
import { isMappableJson } from '../../utils/jsonMapping';
import { isMermaidFlowchart } from '../../services/importMermaid';
import { startMermaidPlacement } from '../../services/mermaidPlacement';
import { isDotGraph } from '../../services/importDOT';
import { startDotPlacement } from '../../services/dotPlacement';
import { importService } from '../../services/importService';
import { cloneClipboardForPaste } from './canvasClipboard';
import type { CanvasMenuPosition, DossierStore, HistoryStore, MousePosRef, SelectionStore, TabStore, WrapperRef } from './canvasHookTypes';

export interface CanvasPasteParams {
  reactFlowWrapper: WrapperRef;
  lastMousePosRef: MousePosRef;
  /** Written to the system clipboard by an internal copy */
  clipboardMarker: string;
  canvasContextMenu: CanvasMenuPosition | null;
  elements: Element[];
  links: Link[];
  currentDossier: DossierStore['currentDossier'];
  getSelectedElementIds: SelectionStore['getSelectedElementIds'];
  selectElements: SelectionStore['selectElements'];
  createElement: DossierStore['createElement'];
  addAsset: DossierStore['addAsset'];
  pasteElements: DossierStore['pasteElements'];
  pushAction: HistoryStore['pushAction'];
  activeTabId: TabStore['activeTabId'];
  addTabMembers: TabStore['addMembers'];
}

/**
 * Paste on the canvas: Ctrl+V (internal copy, external files, Mermaid, DOT,
 * JSON) and the canvas menu's paste at the right-clicked point.
 */
export function useCanvasPaste({
  reactFlowWrapper,
  lastMousePosRef,
  clipboardMarker: CLIPBOARD_MARKER,
  canvasContextMenu,
  elements,
  links,
  currentDossier,
  getSelectedElementIds,
  selectElements,
  createElement,
  addAsset,
  pasteElements,
  pushAction,
  activeTabId,
  addTabMembers,
}: CanvasPasteParams) {
  const handleCanvasContextMenuPaste = useCallback(async () => {
    if (!canvasContextMenu) return;

    const { canvasX, canvasY } = canvasContextMenu;

    // Try to read clipboard for external content (images, files)
    let pastedFromClipboard = false;
    try {
      const clipboardItems = await navigator.clipboard.read();
      let imageFile: File | null = null;

      // Only take the first image found (clipboard may have multiple representations)
      let textItem: ClipboardItem | null = null;
      for (const item of clipboardItems) {
        if (imageFile) break;
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            imageFile = new File([blob], `image.${type.split('/')[1]}`, { type });
            break;
          }
          if (type === 'text/plain' && !textItem) textItem = item;
        }
      }

      // Mermaid flowchart text → import placement mode (same as Ctrl+V)
      if (!imageFile && textItem && currentDossier) {
        const text = (await (await textItem.getType('text/plain')).text()).trim();
        if (isMermaidFlowchart(text)) {
          const res = startMermaidPlacement(text, currentDossier.id);
          if (!res.ok) toast.error(res.error);
          return;
        }
        // DOT graph (Graphviz) → import placement mode
        if (isDotGraph(text)) {
          const res = startDotPlacement(text, currentDossier.id);
          if (!res.ok) toast.error(res.error);
          return;
        }
      }

      if (imageFile) {
        pastedFromClipboard = true;
        const position = { x: canvasX, y: canvasY };
        const label = imageFile.name.replace(/\.[^/.]+$/, '') || 'Image';
        const newElement = await createElement(label, position, { date: new Date() });
        if (activeTabId) {
          addTabMembers(activeTabId, [newElement.id]);
        }

        try {
          await addAsset(newElement.id, imageFile);
        } catch (assetError) {
          console.error('Failed to add asset:', assetError);
          // Element was created, asset failed - still consider it a success
        }

        pushAction({
          type: 'create-element',
          undo: {},
          redo: { elements: [newElement], elementIds: [newElement.id] },
        });

        selectElements([newElement.id]);
        return;
      }
    } catch {
      // Clipboard API not available or permission denied
      // Only fall back to internal paste if we didn't already create an element
    }

    // Fall back to internal copied elements (only if we didn't paste from clipboard)
    const clip = useClipboardStore.getState();
    if (pastedFromClipboard || clip.elements.length === 0 || !currentDossier) return;

    const { newElements, newLinks } = cloneClipboardForPaste(clip, currentDossier.id, canvasX, canvasY);

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
  }, [canvasContextMenu, links, currentDossier, pasteElements, selectElements, pushAction, addAsset, createElement, activeTabId, addTabMembers]);

  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Calculate paste position: mouse cursor if inside canvas, fallback to viewport center
      const viewport = useViewStore.getState().viewport;
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      const mouseX = lastMousePosRef.current.x;
      const mouseY = lastMousePosRef.current.y;
      const mouseInCanvas = bounds && mouseX >= bounds.left && mouseX <= bounds.right && mouseY >= bounds.top && mouseY <= bounds.bottom;
      const centerX = mouseInCanvas
        ? (mouseX - bounds.left - viewport.x) / viewport.zoom
        : (-viewport.x + (reactFlowWrapper.current?.clientWidth || 800) / 2) / viewport.zoom;
      const centerY = mouseInCanvas
        ? (mouseY - bounds.top - viewport.y) / viewport.zoom
        : (-viewport.y + (reactFlowWrapper.current?.clientHeight || 600) / 2) / viewport.zoom;

      // Check clipboard text for our marker (to know if last copy was internal elements)
      const clipboardText = event.clipboardData?.getData('text/plain') || '';
      const hasInternalCopyMarker = clipboardText.startsWith(CLIPBOARD_MARKER);

      // Collect files from clipboard (only if NO internal marker - external copy overwrites marker)
      let files: File[] = [];
      if (!hasInternalCopyMarker) {
        const items = event.clipboardData?.items;
        if (items) {
          for (const item of items) {
            if (item.kind === 'file') {
              const file = item.getAsFile();
              if (file) files.push(file);
            }
          }
        }

        // Deduplicate: if all files have generic names (image.xxx, blob, etc.), keep only the first
        // This handles clipboard having multiple representations of the same image
        if (files.length > 1) {
          const allGeneric = files.every(f => /^(image|blob|pasted-|Capture|Screenshot)/i.test(f.name));
          if (allGeneric) {
            files = [files[0]];
          }
        }
      }

      // PRIORITY 0: External JSON text. A recognized format (ZN native, GeoJSON,
      // STIX2, Excalidraw, OSINT Industries…) goes through the standard import
      // (placement mode); otherwise, generic JSON opens the field mapper.
      const trimmedClip = clipboardText.trim();

      // PRIORITY 0a: Mermaid flowchart text (e.g. produced by an LLM) → placement mode
      const inRichText = event.target instanceof HTMLElement && event.target.isContentEditable;
      if (!inRichText && !hasInternalCopyMarker && files.length === 0 && currentDossier && isMermaidFlowchart(trimmedClip)) {
        event.preventDefault();
        const res = startMermaidPlacement(trimmedClip, currentDossier.id);
        if (!res.ok) toast.error(res.error);
        return;
      }
      // PRIORITY 0b: DOT graph (Graphviz, tool output) → placement mode
      if (!inRichText && !hasInternalCopyMarker && files.length === 0 && currentDossier && isDotGraph(trimmedClip)) {
        event.preventDefault();
        const res = startDotPlacement(trimmedClip, currentDossier.id);
        if (!res.ok) toast.error(res.error);
        return;
      }
      if (!hasInternalCopyMarker && files.length === 0 && (trimmedClip.startsWith('{') || trimmedClip.startsWith('['))) {
        try {
          const data = JSON.parse(trimmedClip);
          const format = importService.detectJsonFormat(data);
          if (format !== 'unknown') {
            // Known format → enter import placement mode with the pasted content
            event.preventDefault();
            if (currentDossier) {
              const count = Array.isArray(data) ? data.length
                : Array.isArray((data as { elements?: unknown[] }).elements) ? (data as { elements: unknown[] }).elements.length
                : Array.isArray((data as { features?: unknown[] }).features) ? (data as { features: unknown[] }).features.length
                : Array.isArray((data as { objects?: unknown[] }).objects) ? (data as { objects: unknown[] }).objects.length
                : Array.isArray((data as { nodes?: unknown[] }).nodes) ? (data as { nodes: unknown[] }).nodes.length
                : 10;
              const grid = Math.ceil(Math.sqrt(Math.max(count, 1)));
              const w = grid * 200, h = grid * 150;
              useUIStore.getState().enterImportPlacementMode({
                boundingBox: { minX: 0, minY: 0, maxX: w, maxY: h, width: w, height: h, elementCount: count },
                file: new File([trimmedClip], 'pasted.json', { type: 'application/json' }),
                dossierId: currentDossier.id,
                fileContent: trimmedClip,
                importOptions: { createMissingElements: true },
              });
            }
            return;
          }
          if (isMappableJson(data)) {
            // Unknown format but mappable → open the generic field mapper
            event.preventDefault();
            window.dispatchEvent(new CustomEvent('zn:json-mapping-paste', { detail: { text: trimmedClip } }));
            return;
          }
        } catch { /* not JSON — fall through to normal paste handling */ }
      }

      // PRIORITY 1: External files (no internal marker means user copied externally)
      if (files.length > 0) {
        // If an element is selected, let AssetsPanel handle the paste
        // (it will add the file to the selected element instead of creating a new one)
        const selectedIds = getSelectedElementIds();
        if (selectedIds.length > 0) {
          return; // AssetsPanel will handle this via its own paste listener
        }

        // No element selected: create new element with the first file only
        event.preventDefault();

        const file = files[0];
        const position = { x: centerX, y: centerY };
        const label = file.name.replace(/\.[^/.]+$/, '') || 'Image';

        const newElement = await createElement(label, position, { date: new Date() });
        if (activeTabId) {
          addTabMembers(activeTabId, [newElement.id]);
        }
        try {
          await addAsset(newElement.id, file);
        } catch (err) {
          console.error('Failed to add asset:', err);
        }

        pushAction({
          type: 'create-element',
          undo: {},
          redo: { elements: [newElement], elementIds: [newElement.id] },
        });

        selectElements([newElement.id]);
        return;
      }

      // PRIORITY 2: Internal copied elements (marker present)
      const clip = useClipboardStore.getState();
      if (clip.elements.length > 0 && currentDossier) {
        event.preventDefault();

        const { newElements, newLinks } = cloneClipboardForPaste(clip, currentDossier.id, centerX, centerY);

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
        return;
      }

    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [pasteElements, currentDossier, createElement, addAsset, selectElements, elements, links, pushAction, getSelectedElementIds, activeTabId, addTabMembers,
    // Constant and stable refs, listed because they come in as parameters
    CLIPBOARD_MARKER, reactFlowWrapper, lastMousePosRef]);

  return { handleCanvasContextMenuPaste };
}
