import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type NodeMouseHandler,
  type OnConnect,
  type OnReconnect,
  SelectionMode,
  ConnectionMode,
  type NodeChange,
} from '@xyflow/react';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw } from 'lucide-react';
import '@xyflow/react/dist/style.css';


import { ElementNode, type ElementNodeData } from './ElementNode';
import { CustomEdge } from './CustomEdge';
import { ContextMenu } from './ContextMenu';
import { ViewToolbar } from '../common/ViewToolbar';
import { useInvestigationStore, useSelectionStore, useViewStore, useInsightsStore, useHistoryStore, useUIStore } from '../../stores';
import html2canvas from 'html2canvas';
import type { Element, Link, Position } from '../../types';
import { generateUUID } from '../../utils';
import { getDimmedElementIds, getNeighborIds } from '../../utils/filterUtils';

interface ContextMenuState {
  x: number;
  y: number;
  elementId: string;
  elementLabel: string;
}

const nodeTypes = {
  element: ElementNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

// Capture handler for report screenshots - must be inside ReactFlowProvider
function CanvasCaptureHandler() {
  const { fitView } = useReactFlow();
  const { registerCaptureHandler, unregisterCaptureHandler } = useUIStore();

  useEffect(() => {
    const captureHandler = async (): Promise<string | null> => {
      console.log('Canvas capture: starting');

      // Fit view to show all elements
      fitView({ padding: 0.15, duration: 0 });

      // Wait for React Flow to fully render
      await new Promise(resolve => setTimeout(resolve, 500));

      // Capture
      const element = document.querySelector('[data-report-capture="canvas"]') as HTMLElement;
      if (!element) {
        console.error('Canvas capture: element not found');
        return null;
      }

      console.log('Canvas capture: element found, enhancing edges...');

      // Temporarily increase stroke widths for better capture
      const edges = element.querySelectorAll('.react-flow__edge path');
      const originalStrokes: { el: SVGPathElement; value: string }[] = [];
      edges.forEach((edge) => {
        const pathEl = edge as SVGPathElement;
        const currentWidth = pathEl.style.strokeWidth ||
                            edge.getAttribute('stroke-width') || '1';
        originalStrokes.push({ el: pathEl, value: currentWidth });
        // Ensure minimum 2px stroke for visibility, multiply by 2 for better capture
        const width = Math.max(3, parseFloat(currentWidth) * 2);
        pathEl.style.strokeWidth = `${width}px`;
      });

      console.log(`Canvas capture: enhanced ${edges.length} edges`);

      try {
        const canvas = await html2canvas(element, {
          backgroundColor: '#faf8f5',
          scale: 3, // Higher scale for better quality
          logging: false,
          useCORS: true,
          allowTaint: true,
          imageTimeout: 5000,
          foreignObjectRendering: false,
        });
        console.log('Canvas capture: success');
        return canvas.toDataURL('image/png');
      } catch (error) {
        console.error('Canvas capture failed:', error);
        return null;
      } finally {
        // Restore original stroke widths
        originalStrokes.forEach(({ el, value }) => {
          el.style.strokeWidth = value;
        });
      }
    };

    registerCaptureHandler('canvas', captureHandler);
    return () => unregisterCaptureHandler('canvas');
  }, [fitView, registerCaptureHandler, unregisterCaptureHandler]);

  return null;
}

// Zoom controls for the toolbar - must be inside ReactFlowProvider
function CanvasZoomControls() {
  const { zoomIn, zoomOut, fitView, setViewport } = useReactFlow();

  const handleZoomIn = useCallback(() => {
    zoomIn({ duration: 200 });
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    zoomOut({ duration: 200 });
  }, [zoomOut]);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 300 });
  }, [fitView]);

  const handleReset = useCallback(() => {
    setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 300 });
  }, [setViewport]);

  return (
    <>
      <button
        onClick={handleZoomOut}
        className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded"
        title="Zoom arrière"
      >
        <ZoomOut size={16} />
      </button>
      <button
        onClick={handleZoomIn}
        className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded"
        title="Zoom avant"
      >
        <ZoomIn size={16} />
      </button>
      <div className="w-px h-4 bg-border-default mx-1" />
      <button
        onClick={handleFitView}
        className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded"
        title="Ajuster à la vue"
      >
        <Maximize2 size={16} />
      </button>
      <button
        onClick={handleReset}
        className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded"
        title="Reinitialiser la vue"
      >
        <RotateCcw size={16} />
      </button>
    </>
  );
}


// Convert our Element to React Flow Node
function elementToNode(
  element: Element,
  isSelected: boolean,
  isDimmed: boolean,
  thumbnail: string | null,
  onResize?: (width: number, height: number) => void,
  isEditing?: boolean,
  onLabelChange?: (newLabel: string) => void,
  onStopEditing?: () => void
): Node {
  return {
    id: element.id,
    type: 'element',
    position: element.position,
    data: {
      element,
      isSelected,
      isDimmed,
      thumbnail,
      onResize,
      isEditing,
      onLabelChange,
      onStopEditing,
    } satisfies ElementNodeData,
    selected: isSelected,
  };
}

// Calculate best handles based on element positions
function calculateBestHandles(
  sourcePos: Position,
  targetPos: Position
): { sourceHandle: string; targetHandle: string } {
  const dx = targetPos.x - sourcePos.x;
  const dy = targetPos.y - sourcePos.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx > absDy) {
    // Horizontal: use left/right
    return dx > 0
      ? { sourceHandle: 'right', targetHandle: 'left' }
      : { sourceHandle: 'left', targetHandle: 'right' };
  } else {
    // Vertical: use top/bottom
    return dy > 0
      ? { sourceHandle: 'bottom', targetHandle: 'top' }
      : { sourceHandle: 'top', targetHandle: 'bottom' };
  }
}

// Convert link style to strokeDasharray
function getStrokeDasharray(style: string, thickness: number): string | undefined {
  switch (style) {
    case 'dashed':
      return `${thickness * 4} ${thickness * 2}`;
    case 'dotted':
      return `${thickness} ${thickness * 2}`;
    default:
      return undefined;
  }
}

// Convert our Link to React Flow Edge
function linkToEdge(
  link: Link,
  isSelected: boolean,
  isDimmed: boolean,
  elements: Element[],
  isEditing?: boolean,
  onLabelChange?: (newLabel: string) => void,
  onStopEditing?: () => void,
  parallelIndex?: number,
  parallelCount?: number,
  onCurveOffsetChange?: (offset: { x: number; y: number }) => void
): Edge {
  // Find source and target elements to calculate best handles
  const sourceEl = elements.find(e => e.id === link.fromId);
  const targetEl = elements.find(e => e.id === link.toId);

  let sourceHandle = link.sourceHandle;
  let targetHandle = link.targetHandle;

  // If handles not specified, calculate best ones based on positions
  if ((!sourceHandle || !targetHandle) && sourceEl && targetEl) {
    const bestHandles = calculateBestHandles(sourceEl.position, targetEl.position);
    sourceHandle = sourceHandle || bestHandles.sourceHandle;
    targetHandle = targetHandle || bestHandles.targetHandle;
  }

  const strokeDasharray = getStrokeDasharray(link.visual.style, link.visual.thickness);

  // Handle direction (with fallback to legacy 'directed' field)
  const direction = link.direction || (link.directed ? 'forward' : 'none');
  const hasStartArrow = direction === 'backward' || direction === 'both';
  const hasEndArrow = direction === 'forward' || direction === 'both';

  return {
    id: link.id,
    source: link.fromId,
    target: link.toId,
    sourceHandle: sourceHandle ?? 'right',
    targetHandle: targetHandle ?? 'left',
    type: 'custom',
    label: link.label || undefined,
    labelStyle: {
      fontSize: 11,
      fontWeight: 500,
      // fill handled by CustomEdge with CSS variables
    },
    labelBgStyle: {
      // fill handled by CustomEdge with CSS variables
      fillOpacity: 0.9,
    },
    labelBgPadding: [4, 2] as [number, number],
    labelBgBorderRadius: 3,
    style: {
      stroke: link.visual.color,
      strokeDasharray,
    },
    data: {
      color: link.visual.color,
      thickness: link.visual.thickness,
      dashArray: strokeDasharray,
      hasStartArrow,
      hasEndArrow,
      isSelected,
      isDimmed,
      isEditing,
      onLabelChange,
      onStopEditing,
      parallelIndex,
      parallelCount,
      curveOffset: link.curveOffset ?? { x: 0, y: 0 },
      onCurveOffsetChange,
    },
    selected: isSelected,
  };
}

export function Canvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Stores
  const {
    elements,
    links,
    assets,
    createElement,
    updateElement,
    updateElementPosition,
    updateElementPositions,
    createLink,
    updateLink,
    deleteElements,
    deleteLinks,
    addAsset,
  } = useInvestigationStore();

  // File drag state
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Clipboard for copy/paste of elements
  const copiedElementsRef = useRef<Element[]>([]);

  // History store for undo/redo
  const { pushAction, undo: undoAction, redo: redoAction } = useHistoryStore();

  // State for copied elements indicator
  const [hasCopiedElements, setHasCopiedElements] = useState(false);

  const {
    selectedElementIds,
    selectedLinkIds,
    selectElement,
    selectElements,
    selectLink,
    clearSelection,
    getSelectedElementIds,
    getSelectedLinkIds,
    editingElementId,
    editingLinkId,
    startEditingElement,
    startEditingLink,
    stopEditing,
  } = useSelectionStore();

  const {
    viewport,
    setViewport,
    filters,
    hiddenElementIds,
    focusElementId,
    focusDepth,
    setFocus,
    clearFocus,
    hideElement,
    showElement,
  } = useViewStore();

  const {
    highlightedElementIds: insightsHighlightedIds,
    pathResults,
    findPaths,
    clearHighlight: clearInsightsHighlight,
  } = useInsightsStore();

  // Calculate dimmed element IDs based on filters, focus, and insights highlighting
  const dimmedElementIds = useMemo(() => {
    // If insights highlighting is active, dim everything except highlighted elements
    if (insightsHighlightedIds.size > 0) {
      const dimmed = new Set<string>();
      elements.forEach((el) => {
        if (!insightsHighlightedIds.has(el.id)) {
          dimmed.add(el.id);
        }
      });
      return dimmed;
    }

    // If in focus mode, dim everything except focus element and neighbors
    if (focusElementId) {
      const visibleIds = getNeighborIds(focusElementId, links, focusDepth);
      const dimmed = new Set<string>();
      elements.forEach((el) => {
        if (!visibleIds.has(el.id)) {
          dimmed.add(el.id);
        }
      });
      return dimmed;
    }

    // Otherwise use filter-based dimming
    return getDimmedElementIds(elements, filters, hiddenElementIds);
  }, [elements, links, filters, hiddenElementIds, focusElementId, focusDepth, insightsHighlightedIds]);

  // Create asset lookup map for thumbnail retrieval
  const assetMap = useMemo(() => {
    const map = new Map<string, string | null>();
    assets.forEach((asset) => {
      // Store thumbnailDataUrl keyed by asset ID
      map.set(asset.id, asset.thumbnailDataUrl);
    });
    return map;
  }, [assets]);

  // Handle element resize
  const handleElementResize = useCallback(
    (elementId: string, width: number, height: number) => {
      const element = elements.find((el) => el.id === elementId);
      if (element) {
        updateElement(elementId, {
          visual: {
            ...element.visual,
            customWidth: width,
            customHeight: height,
          },
        });
      }
    },
    [elements, updateElement]
  );

  // Handle element label change (inline editing)
  const handleElementLabelChange = useCallback(
    (elementId: string, newLabel: string) => {
      updateElement(elementId, { label: newLabel });
    },
    [updateElement]
  );

  // Handle link label change (inline editing)
  const handleLinkLabelChange = useCallback(
    (linkId: string, newLabel: string) => {
      updateLink(linkId, { label: newLabel });
    },
    [updateLink]
  );

  // Convert to React Flow format
  const nodes = useMemo(
    () => elements
      .filter((el) => !hiddenElementIds.has(el.id))
      .map((el) => {
        // Get thumbnail from first asset if available
        const firstAssetId = el.assetIds?.[0];
        const thumbnail = firstAssetId ? assetMap.get(firstAssetId) ?? null : null;
        // Create resize handler for this element
        const onResize = (width: number, height: number) => {
          handleElementResize(el.id, width, height);
        };
        // Create label change handler for this element
        const onLabelChange = (newLabel: string) => {
          handleElementLabelChange(el.id, newLabel);
        };
        return elementToNode(
          el,
          selectedElementIds.has(el.id),
          dimmedElementIds.has(el.id),
          thumbnail,
          onResize,
          editingElementId === el.id,
          onLabelChange,
          stopEditing
        );
      }),
    [elements, selectedElementIds, hiddenElementIds, dimmedElementIds, assetMap, handleElementResize, editingElementId, handleElementLabelChange, stopEditing]
  );

  // Handle curve offset change for edge dragging (2D offset)
  const handleCurveOffsetChange = useCallback(
    (linkId: string, offset: { x: number; y: number }) => {
      updateLink(linkId, { curveOffset: offset });
    },
    [updateLink]
  );

  const edges = useMemo(() => {
    // Build a map of parallel edges (edges between the same two nodes)
    // Key is normalized "nodeA-nodeB" where nodeA < nodeB alphabetically
    const parallelEdgesMap = new Map<string, Link[]>();

    for (const link of links) {
      const key = link.fromId < link.toId
        ? `${link.fromId}-${link.toId}`
        : `${link.toId}-${link.fromId}`;

      if (!parallelEdgesMap.has(key)) {
        parallelEdgesMap.set(key, []);
      }
      parallelEdgesMap.get(key)!.push(link);
    }

    return links.map(link => {
      const onLabelChange = (newLabel: string) => {
        handleLinkLabelChange(link.id, newLabel);
      };

      const onCurveOffsetChange = (offset: { x: number; y: number }) => {
        handleCurveOffsetChange(link.id, offset);
      };

      // Find parallel edges for this link
      const key = link.fromId < link.toId
        ? `${link.fromId}-${link.toId}`
        : `${link.toId}-${link.fromId}`;
      const parallelEdges = parallelEdgesMap.get(key) || [link];
      const parallelIndex = parallelEdges.indexOf(link);
      const parallelCount = parallelEdges.length;

      // Link is dimmed if either connected element is dimmed
      const isLinkDimmed = dimmedElementIds.has(link.fromId) || dimmedElementIds.has(link.toId);

      return linkToEdge(
        link,
        selectedLinkIds.has(link.id),
        isLinkDimmed,
        elements,
        editingLinkId === link.id,
        onLabelChange,
        stopEditing,
        parallelIndex,
        parallelCount,
        onCurveOffsetChange
      );
    });
  }, [links, elements, selectedLinkIds, dimmedElementIds, editingLinkId, handleLinkLabelChange, stopEditing, handleCurveOffsetChange]);

  // React Flow state
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(nodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(edges);

  // Sync with our state when elements/links change
  useEffect(() => {
    setRfNodes(nodes);
  }, [nodes, setRfNodes]);

  useEffect(() => {
    setRfEdges(edges);
  }, [edges, setRfEdges]);

  // Handle node changes (position, selection)
  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);

      // Handle position changes
      const positionChanges = changes.filter(
        (c): c is NodeChange & { type: 'position'; id: string; position: Position; dragging: boolean } =>
          c.type === 'position' && 'position' in c && c.position !== undefined && 'dragging' in c && !c.dragging
      );

      if (positionChanges.length === 1) {
        const change = positionChanges[0];
        updateElementPosition(change.id, change.position);
      } else if (positionChanges.length > 1) {
        const updates = positionChanges.map((c) => ({
          id: c.id,
          position: c.position,
        }));
        updateElementPositions(updates);
      }
    },
    [onNodesChange, updateElementPosition, updateElementPositions]
  );

  // Handle edge changes
  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
    },
    [onEdgesChange]
  );

  // Handle connection (link creation)
  const handleConnect: OnConnect = useCallback(
    async (connection: Connection) => {
      if (
        connection.source &&
        connection.target &&
        connection.source !== connection.target
      ) {
        await createLink(connection.source, connection.target, {
          sourceHandle: connection.sourceHandle ?? null,
          targetHandle: connection.targetHandle ?? null,
        });
      }
    },
    [createLink]
  );

  // Handle edge reconnection (moving edge endpoints)
  const handleReconnect: OnReconnect = useCallback(
    async (oldEdge: Edge, newConnection: Connection) => {
      if (
        newConnection.source &&
        newConnection.target &&
        newConnection.source !== newConnection.target
      ) {
        await updateLink(oldEdge.id, {
          fromId: newConnection.source,
          toId: newConnection.target,
          sourceHandle: newConnection.sourceHandle ?? null,
          targetHandle: newConnection.targetHandle ?? null,
        });
      }
    },
    [updateLink]
  );

  // Handle node click (Shift or Ctrl for multi-select)
  const handleNodeClick: NodeMouseHandler = useCallback(
    (event, node) => {
      const isMultiSelect = event.shiftKey || event.ctrlKey || event.metaKey;
      selectElement(node.id, isMultiSelect);
    },
    [selectElement]
  );

  // Handle node context menu (right-click)
  const handleNodeContextMenu: NodeMouseHandler = useCallback(
    (event, node) => {
      event.preventDefault();
      const element = elements.find((el) => el.id === node.id);
      if (element) {
        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          elementId: element.id,
          elementLabel: element.label || 'Sans nom',
        });
      }
    },
    [elements]
  );

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Context menu actions
  const handleContextMenuFocus = useCallback(
    (depth: number) => {
      if (contextMenu) {
        setFocus(contextMenu.elementId, depth);
      }
    },
    [contextMenu, setFocus]
  );

  const handleContextMenuHide = useCallback(() => {
    if (contextMenu) {
      hideElement(contextMenu.elementId);
    }
  }, [contextMenu, hideElement]);

  const handleContextMenuShow = useCallback(() => {
    if (contextMenu) {
      showElement(contextMenu.elementId);
    }
  }, [contextMenu, showElement]);

  const handleContextMenuDelete = useCallback(async () => {
    if (contextMenu) {
      await deleteElements([contextMenu.elementId]);
      clearSelection();
    }
  }, [contextMenu, deleteElements, clearSelection]);

  // Copy handler for context menu
  const handleContextMenuCopy = useCallback(() => {
    const selectedEls = getSelectedElementIds();
    const elsToCopy = selectedEls.length > 0
      ? elements.filter(el => selectedEls.includes(el.id))
      : contextMenu
        ? elements.filter(el => el.id === contextMenu.elementId)
        : [];

    if (elsToCopy.length > 0) {
      copiedElementsRef.current = elsToCopy;
      setHasCopiedElements(true);
    }
  }, [elements, getSelectedElementIds, contextMenu]);

  // Cut handler for context menu
  const handleContextMenuCut = useCallback(async () => {
    const selectedEls = getSelectedElementIds();
    const elsToCut = selectedEls.length > 0
      ? elements.filter(el => selectedEls.includes(el.id))
      : contextMenu
        ? elements.filter(el => el.id === contextMenu.elementId)
        : [];

    if (elsToCut.length > 0) {
      // Copy first
      copiedElementsRef.current = elsToCut;
      setHasCopiedElements(true);

      // Then delete
      const idsToDelete = elsToCut.map(el => el.id);
      const linksToDelete = links.filter(l =>
        idsToDelete.includes(l.fromId) || idsToDelete.includes(l.toId)
      );

      pushAction({
        type: 'delete-elements',
        undo: { elements: elsToCut, links: linksToDelete },
        redo: { elementIds: idsToDelete },
      });

      await deleteElements(idsToDelete);
      clearSelection();
    }
  }, [elements, links, getSelectedElementIds, contextMenu, deleteElements, clearSelection, pushAction]);

  // Paste handler for context menu (paste at context menu position)
  const handleContextMenuPaste = useCallback(async () => {
    if (copiedElementsRef.current.length === 0) return;
    if (!reactFlowWrapper.current || !contextMenu) return;

    // Calculate paste position relative to context menu click
    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const pasteX = (contextMenu.x - bounds.left - viewport.x) / viewport.zoom;
    const pasteY = (contextMenu.y - bounds.top - viewport.y) / viewport.zoom;

    // Calculate center of copied elements
    const sumX = copiedElementsRef.current.reduce((sum, el) => sum + el.position.x, 0);
    const sumY = copiedElementsRef.current.reduce((sum, el) => sum + el.position.y, 0);
    const centerX = sumX / copiedElementsRef.current.length;
    const centerY = sumY / copiedElementsRef.current.length;

    const newElementIds: string[] = [];
    const oldToNewIdMap = new Map<string, string>();
    const newElements: Element[] = [];

    // Create all elements with offset from paste position
    for (const el of copiedElementsRef.current) {
      const newId = generateUUID();
      oldToNewIdMap.set(el.id, newId);

      const newPosition = {
        x: pasteX + (el.position.x - centerX),
        y: pasteY + (el.position.y - centerY),
      };

      const newElement = await createElement(el.label, newPosition, {
        ...el,
        id: newId,
        assetIds: [...el.assetIds],
      });
      newElementIds.push(newId);
      newElements.push(newElement);
    }

    // Recreate links between copied elements
    const copiedIds = new Set(copiedElementsRef.current.map(el => el.id));
    const relevantLinks = links.filter(l =>
      copiedIds.has(l.fromId) && copiedIds.has(l.toId)
    );

    for (const link of relevantLinks) {
      const newFromId = oldToNewIdMap.get(link.fromId);
      const newToId = oldToNewIdMap.get(link.toId);
      if (newFromId && newToId) {
        await createLink(newFromId, newToId, {
          label: link.label,
          visual: link.visual,
          direction: link.direction,
        });
      }
    }

    // Save for undo
    pushAction({
      type: 'create-elements',
      undo: {},
      redo: { elements: newElements, elementIds: newElementIds },
    });

    // Select all pasted elements
    selectElements(newElementIds);
  }, [contextMenu, viewport, createElement, createLink, links, selectElements, pushAction]);

  const handleFindPaths = useCallback(
    (fromId: string, toId: string) => {
      findPaths(fromId, toId);
    },
    [findPaths]
  );

  // Get the "other" selected element when exactly 2 are selected
  const otherSelectedElement = useMemo(() => {
    if (contextMenu && selectedElementIds.size === 2) {
      const otherId = Array.from(selectedElementIds).find(
        (id) => id !== contextMenu.elementId
      );
      if (otherId) {
        return elements.find((el) => el.id === otherId);
      }
    }
    return undefined;
  }, [contextMenu, selectedElementIds, elements]);

  // Handle edge click
  const handleEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      const isShiftKey = event.shiftKey;
      selectLink(edge.id, isShiftKey);
    },
    [selectLink]
  );

  // Handle pane click (deselect)
  const handlePaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  // Handle double click on pane to create element
  const handlePaneDoubleClick = useCallback(
    async (event: React.MouseEvent) => {
      if (!reactFlowWrapper.current) return;

      // Get position relative to the flow
      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = {
        x: (event.clientX - bounds.left - viewport.x) / viewport.zoom,
        y: (event.clientY - bounds.top - viewport.y) / viewport.zoom,
      };

      const newElement = await createElement('Nouvel élément', position);
      selectElement(newElement.id);
    },
    [createElement, selectElement, viewport]
  );

  // Handle double click on node - start inline label editing
  const handleNodeDoubleClick: NodeMouseHandler = useCallback(
    (event, node) => {
      event.stopPropagation(); // Prevent pane double-click from creating new element
      selectElement(node.id);
      startEditingElement(node.id);
    },
    [selectElement, startEditingElement]
  );

  // Handle double click on edge - start inline label editing
  const handleEdgeDoubleClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.stopPropagation(); // Prevent pane double-click from creating new element
      selectLink(edge.id);
      startEditingLink(edge.id);
    },
    [selectLink, startEditingLink]
  );

  // Handle file drop on canvas
  const handleFileDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      setIsDraggingFile(false);

      const files = Array.from(event.dataTransfer.files);
      if (files.length === 0) return;
      if (!reactFlowWrapper.current) return;

      // Get drop position
      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const basePosition = {
        x: (event.clientX - bounds.left - viewport.x) / viewport.zoom,
        y: (event.clientY - bounds.top - viewport.y) / viewport.zoom,
      };

      // Check if dropped on an element
      const target = event.target as HTMLElement;
      const nodeElement = target.closest('[data-id]');

      if (nodeElement) {
        // Dropped on an element - attach files to it
        const elementId = nodeElement.getAttribute('data-id');
        if (elementId) {
          for (const file of files) {
            await addAsset(elementId, file);
          }
          return;
        }
      }

      // Dropped on empty canvas - create new elements with files
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const position = {
          x: basePosition.x + i * 80,
          y: basePosition.y + i * 20,
        };

        // Use filename as element label
        const label = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
        const newElement = await createElement(label, position);
        await addAsset(newElement.id, file);
      }
    },
    [createElement, addAsset, viewport]
  );

  const handleFileDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    // Check if dragging files (not internal drag)
    if (event.dataTransfer.types.includes('Files')) {
      setIsDraggingFile(true);
    }
  }, []);

  const handleFileDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    // Only set false if leaving the wrapper entirely
    const relatedTarget = event.relatedTarget as HTMLElement;
    if (!reactFlowWrapper.current?.contains(relatedTarget)) {
      setIsDraggingFile(false);
    }
  }, []);

  // Handle undo
  const handleUndo = useCallback(async () => {
    const action = undoAction();
    if (!action) return;

    switch (action.type) {
      case 'delete-elements':
      case 'delete-element':
        // Restore deleted elements
        if (action.undo.elements) {
          for (const el of action.undo.elements) {
            await createElement(el.label, el.position, {
              ...el,
              id: el.id, // Keep original ID
            });
          }
        }
        // Restore deleted links
        if (action.undo.links) {
          for (const link of action.undo.links) {
            await createLink(link.fromId, link.toId, {
              ...link,
              id: link.id,
            });
          }
        }
        break;

      case 'create-elements':
      case 'create-element':
        // Delete created elements
        if (action.redo.elementIds) {
          await deleteElements(action.redo.elementIds);
        }
        break;

      case 'move-elements':
      case 'move-element':
        // Restore previous positions
        if (action.undo.positions) {
          await updateElementPositions(action.undo.positions);
        }
        break;
    }
  }, [undoAction, createElement, createLink, deleteElements, updateElementPositions]);

  // Handle redo
  const handleRedo = useCallback(async () => {
    const action = redoAction();
    if (!action) return;

    switch (action.type) {
      case 'delete-elements':
      case 'delete-element':
        // Re-delete elements
        if (action.redo.elementIds) {
          await deleteElements(action.redo.elementIds);
        }
        if (action.redo.linkIds) {
          await deleteLinks(action.redo.linkIds);
        }
        break;

      case 'create-elements':
      case 'create-element':
        // Re-create elements
        if (action.redo.elements) {
          for (const el of action.redo.elements) {
            await createElement(el.label, el.position, el);
          }
        }
        break;

      case 'move-elements':
      case 'move-element':
        // Apply new positions
        if (action.redo.positions) {
          await updateElementPositions(action.redo.positions);
        }
        break;
    }
  }, [redoAction, deleteElements, deleteLinks, createElement, updateElementPositions]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const isCtrlOrMeta = event.ctrlKey || event.metaKey;

      // Delete selected elements
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selectedEls = getSelectedElementIds();
        const selectedLks = getSelectedLinkIds();

        if (selectedEls.length > 0) {
          // Save for undo
          const elementsToDelete = elements.filter(el => selectedEls.includes(el.id));
          const linksToDelete = links.filter(l =>
            selectedEls.includes(l.fromId) || selectedEls.includes(l.toId)
          );
          pushAction({
            type: 'delete-elements',
            undo: { elements: elementsToDelete, links: linksToDelete },
            redo: { elementIds: selectedEls },
          });
          await deleteElements(selectedEls);
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

      // Select all with Ctrl+A
      if (event.key === 'a' && isCtrlOrMeta) {
        event.preventDefault();
        selectElements(elements.map((el) => el.id));
      }

      // Copy with Ctrl+C
      if (event.key === 'c' && isCtrlOrMeta) {
        const selectedEls = getSelectedElementIds();
        if (selectedEls.length > 0) {
          copiedElementsRef.current = elements.filter(el => selectedEls.includes(el.id));
          setHasCopiedElements(true);
        }
      }

      // Cut with Ctrl+X
      if (event.key === 'x' && isCtrlOrMeta) {
        event.preventDefault();
        const selectedEls = getSelectedElementIds();
        if (selectedEls.length > 0) {
          const elsToCut = elements.filter(el => selectedEls.includes(el.id));
          copiedElementsRef.current = elsToCut;
          setHasCopiedElements(true);

          // Delete the cut elements
          const linksToDelete = links.filter(l =>
            selectedEls.includes(l.fromId) || selectedEls.includes(l.toId)
          );

          pushAction({
            type: 'delete-elements',
            undo: { elements: elsToCut, links: linksToDelete },
            redo: { elementIds: selectedEls },
          });

          await deleteElements(selectedEls);
          clearSelection();
        }
      }

      // Undo with Ctrl+Z
      if (event.key === 'z' && isCtrlOrMeta && !event.shiftKey) {
        event.preventDefault();
        await handleUndo();
      }

      // Redo with Ctrl+Shift+Z or Ctrl+Y
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
    deleteElements,
    deleteLinks,
    clearSelection,
    selectElements,
    elements,
    links,
    pushAction,
    handleUndo,
    handleRedo,
  ]);

  // Handle paste (Ctrl+V) for elements or media
  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      // Ignore if typing in an input
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Calculate paste position (center of visible viewport)
      const centerX = (-viewport.x + (reactFlowWrapper.current?.clientWidth || 800) / 2) / viewport.zoom;
      const centerY = (-viewport.y + (reactFlowWrapper.current?.clientHeight || 600) / 2) / viewport.zoom;

      // Check if we have copied elements to paste
      if (copiedElementsRef.current.length > 0) {
        event.preventDefault();

        const offset = 40; // Offset for pasted elements
        const newElementIds: string[] = [];
        const oldToNewIdMap = new Map<string, string>();

        // First pass: create all elements with new IDs
        for (const el of copiedElementsRef.current) {
          const newId = generateUUID();
          oldToNewIdMap.set(el.id, newId);

          const newPosition = {
            x: el.position.x + offset,
            y: el.position.y + offset,
          };

          await createElement(el.label, newPosition, {
            ...el,
            id: newId,
            assetIds: [...el.assetIds], // Keep same assets
          });
          newElementIds.push(newId);
        }

        // Second pass: recreate links between copied elements
        const copiedIds = new Set(copiedElementsRef.current.map(el => el.id));
        const relevantLinks = links.filter(l =>
          copiedIds.has(l.fromId) && copiedIds.has(l.toId)
        );

        for (const link of relevantLinks) {
          const newFromId = oldToNewIdMap.get(link.fromId);
          const newToId = oldToNewIdMap.get(link.toId);
          if (newFromId && newToId) {
            await createLink(newFromId, newToId, {
              label: link.label,
              visual: link.visual,
              direction: link.direction,
            });
          }
        }

        // Save for undo
        const createdElements = elements.filter(el => newElementIds.includes(el.id));
        pushAction({
          type: 'create-elements',
          undo: {},
          redo: { elements: createdElements, elementIds: newElementIds },
        });

        // Select all pasted elements
        selectElements(newElementIds);

        // Update copied elements positions for next paste
        copiedElementsRef.current = copiedElementsRef.current.map(el => ({
          ...el,
          position: { x: el.position.x + offset, y: el.position.y + offset },
        }));

        return;
      }

      // Fall back to file paste
      const items = event.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length === 0) return;

      // If an element is selected, let AssetsPanel handle the paste
      // (it will add the file to the selected element instead of creating a new one)
      const selectedIds = getSelectedElementIds();
      if (selectedIds.length > 0) {
        return; // AssetsPanel will handle this
      }

      event.preventDefault();

      // Create elements for each pasted file (no element selected)
      const newElementIds: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const position = {
          x: centerX + i * 120,
          y: centerY + i * 30,
        };

        // Use filename (without extension) as label
        const label = file.name.replace(/\.[^/.]+$/, '');
        const newElement = await createElement(label, position);
        await addAsset(newElement.id, file);
        newElementIds.push(newElement.id);
      }

      // Select all created elements
      selectElements(newElementIds);
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [viewport, createElement, createLink, addAsset, selectElements, elements, links, pushAction, getSelectedElementIds]);

  // Handle viewport change
  const handleViewportChange = useCallback(
    ({ x, y, zoom }: { x: number; y: number; zoom: number }) => {
      setViewport({ x, y, zoom });
    },
    [setViewport]
  );

  // Handle selection change from selection box
  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: Node[]; edges: Edge[] }) => {
      if (selectedNodes.length > 0) {
        selectElements(
          selectedNodes.map((n) => n.id),
          false
        );
      }
    },
    [selectElements]
  );

  return (
    <ReactFlowProvider>
      <div className="w-full h-full flex flex-col">
        {/* Toolbar */}
        <ViewToolbar
          showFontToggle
          leftContent={
            <span className="text-xs text-text-secondary">
              {elements.length} element{elements.length > 1 ? 's' : ''}, {links.length} lien{links.length > 1 ? 's' : ''}
            </span>
          }
          rightContent={<CanvasZoomControls />}
        />

        {/* Canvas */}
        <div
          ref={reactFlowWrapper}
          className="flex-1 relative"
          data-report-capture="canvas"
          onDrop={handleFileDrop}
          onDragOver={handleFileDragOver}
          onDragLeave={handleFileDragLeave}
          tabIndex={0}
        >
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onReconnect={handleReconnect}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            onNodeContextMenu={handleNodeContextMenu}
            onEdgeClick={handleEdgeClick}
            onEdgeDoubleClick={handleEdgeDoubleClick}
            onPaneClick={handlePaneClick}
            onDoubleClick={handlePaneDoubleClick}
            onViewportChange={handleViewportChange}
            onSelectionChange={handleSelectionChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultViewport={viewport}
            minZoom={0.1}
            maxZoom={4}
            selectionMode={SelectionMode.Partial}
            connectionMode={ConnectionMode.Loose}
            edgesReconnectable
            selectNodesOnDrag={false}
            panOnScroll
            zoomOnScroll
            zoomOnDoubleClick={false}
            fitView={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="var(--color-border-strong)"
              style={{ backgroundColor: 'var(--color-bg-canvas)' }}
            />
            <CanvasCaptureHandler />
          </ReactFlow>

          {/* File drop overlay */}
          {isDraggingFile && (
            <div className="absolute inset-0 bg-accent/10 border-2 border-dashed border-accent flex items-center justify-center pointer-events-none z-50">
              <div className="bg-bg-primary px-4 py-2 sketchy-border-soft node-shadow">
                <p className="text-sm text-accent font-medium">
                  Deposer pour creer un element
                </p>
              </div>
            </div>
          )}

          {/* Context menu */}
          {contextMenu && (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              elementId={contextMenu.elementId}
              elementLabel={contextMenu.elementLabel}
              isFocused={focusElementId === contextMenu.elementId}
              isHidden={hiddenElementIds.has(contextMenu.elementId)}
              hasCopiedElements={hasCopiedElements}
              otherSelectedId={otherSelectedElement?.id}
              otherSelectedLabel={otherSelectedElement?.label || 'Sans nom'}
              onFocus={handleContextMenuFocus}
              onClearFocus={clearFocus}
              onHide={handleContextMenuHide}
              onShow={handleContextMenuShow}
              onDelete={handleContextMenuDelete}
              onCopy={handleContextMenuCopy}
              onCut={handleContextMenuCut}
              onPaste={handleContextMenuPaste}
              onFindPaths={handleFindPaths}
              onClose={closeContextMenu}
            />
          )}

          {/* Focus mode indicator */}
          {focusElementId && (
            <div className="absolute top-4 left-4 z-40 flex items-center gap-2 px-3 py-2 bg-accent-light border border-accent sketchy-border-soft node-shadow animate-soft-pulse">
              <span className="text-sm text-accent font-medium">Mode focus actif</span>
              <button
                onClick={clearFocus}
                className="text-xs text-accent hover:text-accent-hover underline"
              >
                Quitter
              </button>
            </div>
          )}

          {/* Path results indicator */}
          {pathResults.length > 0 && (
            <div className="absolute top-4 left-4 z-40 flex items-center gap-2 px-3 py-2 bg-pastel-green border border-success sketchy-border-soft node-shadow">
              <span className="text-sm text-success font-medium">
                Chemin trouve ({pathResults[0].length} lien{pathResults[0].length > 1 ? 's' : ''})
              </span>
              <button
                onClick={clearInsightsHighlight}
                className="text-xs text-success hover:opacity-80 underline"
              >
                Fermer
              </button>
            </div>
          )}

          {/* Insights highlight indicator */}
          {insightsHighlightedIds.size > 0 && pathResults.length === 0 && (
            <div className="absolute top-4 left-4 z-40 flex items-center gap-2 px-3 py-2 bg-pastel-purple border border-border-sketchy sketchy-border-soft node-shadow">
              <span className="text-sm text-text-primary font-medium">
                {insightsHighlightedIds.size} element{insightsHighlightedIds.size > 1 ? 's' : ''} surligne{insightsHighlightedIds.size > 1 ? 's' : ''}
              </span>
              <button
                onClick={clearInsightsHighlight}
                className="text-xs text-text-secondary hover:text-text-primary underline"
              >
                Fermer
              </button>
            </div>
          )}
        </div>
      </div>
    </ReactFlowProvider>
  );
}
