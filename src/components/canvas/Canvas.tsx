import { useCallback, useMemo, useRef, useEffect, useLayoutEffect, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  useReactFlow,
  applyNodeChanges,
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
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, Share2, Grid3x3, Magnet, Map as MapIcon, Box, Link2, X } from 'lucide-react';
import '@xyflow/react/dist/style.css';


import { ElementNode, type ElementNodeData } from './ElementNode';
import { GroupNode, type GroupNodeData } from './GroupNode';
import { AnnotationNode, type AnnotationNodeData } from './AnnotationNode';
import { DraggableMinimap } from './DraggableMinimap';
import { AlignmentGuides, computeGuides, type Guide } from './AlignmentGuides';
import { CustomEdge } from './CustomEdge';
import { ContextMenu } from './ContextMenu';
import { CanvasContextMenu } from './CanvasContextMenu';
import { LayoutDropdown } from './LayoutDropdown';
import { ViewToolbar } from '../common/ViewToolbar';
import { SyncStatusIndicator, PresenceAvatars, ShareModal, LocalUserAvatar } from '../collaboration';
import { useInvestigationStore, useSelectionStore, useViewStore, useInsightsStore, useHistoryStore, useUIStore, useSyncStore } from '../../stores';
import { toPng } from 'html-to-image';
import type { Element, Link, Position, Asset } from '../../types';
import { generateUUID } from '../../utils';
import { getDimmedElementIds, getNeighborIds } from '../../utils/filterUtils';
import { fileService } from '../../services/fileService';

interface ContextMenuState {
  x: number;
  y: number;
  elementId: string;
  elementLabel: string;
  previewAsset: Asset | null;
}

const nodeTypes = {
  element: ElementNode,
  groupFrame: GroupNode,
  annotation: AnnotationNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

// Capture handler for report screenshots - must be inside ReactFlowProvider
function CanvasCaptureHandler() {
  const { fitView } = useReactFlow();
  const { registerCaptureHandler, unregisterCaptureHandler, themeMode } = useUIStore();

  useEffect(() => {
    const captureHandler = async (): Promise<string | null> => {

      // Fit view to show all elements
      fitView({ padding: 0.15, duration: 0 });

      // Wait for React Flow to fully render
      await new Promise(resolve => setTimeout(resolve, 500));

      // Capture
      const element = document.querySelector('[data-report-capture="canvas"]') as HTMLElement;
      if (!element) {
        return null;
      }

      try {
        return await toPng(element, {
          backgroundColor: '#faf8f5',
          pixelRatio: 3,
          skipFonts: true,
        });
      } catch (error) {
        console.error('Canvas capture failed:', error);
        return null;
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

// Viewport controller - watches for pending viewport changes and applies them
function ViewportController() {
  const { setViewport } = useReactFlow();
  const { pendingViewport, clearPendingViewport } = useViewStore();

  useEffect(() => {
    if (pendingViewport) {
      setViewport(pendingViewport, { duration: 300 });
      clearPendingViewport();
    }
  }, [pendingViewport, setViewport, clearPendingViewport]);

  return null;
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
  onStopEditing?: () => void,
  unresolvedCommentCount?: number,
  isLoadingAsset?: boolean,
  badgeProperty?: { value: string; type: string } | null,
  showConfidenceIndicator?: boolean,
  displayedPropertyValues?: { key: string; value: string }[],
  tagDisplayMode?: 'none' | 'icons' | 'labels' | 'both',
  tagDisplaySize?: 'small' | 'medium' | 'large',
  themeMode?: 'light' | 'dark'
): Node {
  // Ensure position is valid - fallback to origin if corrupted
  const position = element.position &&
    Number.isFinite(element.position.x) &&
    Number.isFinite(element.position.y)
    ? element.position
    : { x: 0, y: 0 };

  if (position !== element.position) {
    console.warn('[elementToNode] Fixed invalid position for element:', element.id, 'original:', element.position);
  }

  if (element.isAnnotation) {
    return {
      id: element.id,
      type: 'annotation',
      position,
      data: {
        element,
        isSelected,
        isDimmed,
        isEditing,
        onLabelChange,
        onStopEditing,
        onResize,
      } satisfies AnnotationNodeData,
      selected: isSelected,
      style: {
        width: element.visual.customWidth || 200,
      },
    };
  }

  if (element.isGroup) {
    return {
      id: element.id,
      type: 'groupFrame',
      position,
      data: {
        element,
        isSelected,
        isDimmed,
        onResize,
        isEditing,
        onLabelChange,
        onStopEditing,
        themeMode,
        unresolvedCommentCount,
        showConfidenceIndicator,
        displayedPropertyValues,
        tagDisplayMode,
        tagDisplaySize,
      } satisfies GroupNodeData,
      selected: isSelected,
      style: {
        width: element.visual.customWidth || 300,
        height: element.visual.customHeight || 200,
      },
    };
  }

  const node: Node = {
    id: element.id,
    type: 'element',
    position,
    data: {
      element,
      isSelected,
      isDimmed,
      thumbnail,
      onResize,
      isEditing,
      onLabelChange,
      onStopEditing,
      unresolvedCommentCount,
      isLoadingAsset,
      badgeProperty,
      showConfidenceIndicator,
      displayedPropertyValues,
      tagDisplayMode,
      tagDisplaySize,
      themeMode,
    } satisfies ElementNodeData,
    selected: isSelected,
  };

  if (element.parentGroupId) {
    (node as any).parentId = element.parentGroupId;
  }

  return node;
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
      ? { sourceHandle: 'source-right', targetHandle: 'target-left' }
      : { sourceHandle: 'source-left', targetHandle: 'target-right' };
  } else {
    // Vertical: use top/bottom
    return dy > 0
      ? { sourceHandle: 'source-bottom', targetHandle: 'target-top' }
      : { sourceHandle: 'source-top', targetHandle: 'target-bottom' };
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
  nodePositions: Map<string, Position>,
  linkAnchorMode: 'auto' | 'manual',
  linkCurveMode: 'straight' | 'curved' | 'orthogonal',
  isEditing?: boolean,
  onLabelChange?: (newLabel: string) => void,
  onStopEditing?: () => void,
  onStartEditing?: () => void,
  parallelIndex?: number,
  parallelCount?: number,
  onCurveOffsetChange?: (offset: { x: number; y: number }) => void,
  showConfidenceIndicator?: boolean,
  displayedPropertyValues?: { key: string; value: string }[]
): Edge {
  // Helper to migrate old handle format and fix type mismatches
  const migrateHandle = (handle: string | null, type: 'source' | 'target'): string => {
    if (!handle) return type === 'source' ? 'source-right' : 'target-left';

    // Already in new format - check if type matches
    if (handle.startsWith('source-') || handle.startsWith('target-')) {
      const [prefix, position] = handle.split('-');
      // If handle type doesn't match expected type, convert it
      // e.g., "target-top" used as sourceHandle -> "source-top"
      if (prefix !== type) {
        return `${type}-${position}`;
      }
      return handle;
    }

    // Convert old format (top, bottom, left, right) to new format
    return `${type}-${handle}`;
  };

  // Calculate handles based on anchor mode
  let sourceHandle: string;
  let targetHandle: string;

  if (linkAnchorMode === 'auto') {
    // Auto mode: calculate optimal handles based on element positions
    const sourcePos = nodePositions.get(link.fromId);
    const targetPos = nodePositions.get(link.toId);

    if (sourcePos && targetPos) {
      const bestHandles = calculateBestHandles(sourcePos, targetPos);
      sourceHandle = bestHandles.sourceHandle;
      targetHandle = bestHandles.targetHandle;
    } else {
      // Fallback to stored handles if positions not available
      sourceHandle = migrateHandle(link.sourceHandle, 'source');
      targetHandle = migrateHandle(link.targetHandle, 'target');
    }
  } else {
    // Manual mode: use stored handles from the link
    sourceHandle = migrateHandle(link.sourceHandle, 'source');
    targetHandle = migrateHandle(link.targetHandle, 'target');
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
    sourceHandle: sourceHandle ?? 'source-right',
    targetHandle: targetHandle ?? 'target-left',
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
      onStartEditing,
      parallelIndex,
      parallelCount,
      curveOffset: link.curveOffset ?? { x: 0, y: 0 },
      onCurveOffsetChange,
      // Curve mode: straight or curved
      curveMode: linkCurveMode,
      // Include handles in data to force React Flow to re-render when they change
      _sourceHandle: sourceHandle,
      _targetHandle: targetHandle,
      // Confidence indicator
      showConfidenceIndicator,
      confidence: link.confidence,
      // Displayed properties
      displayedPropertyValues,
    },
    selected: isSelected,
  };
}

export function Canvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Stores
  const {
    currentInvestigation,
    elements,
    links,
    assets,
    comments,
    createElement,
    updateElement,
    updateElementPositions,
    createLink,
    updateLink,
    deleteElements,
    deleteLinks,
    addAsset,
    createGroup,
    removeFromGroup,
    dissolveGroup,
  } = useInvestigationStore();

  // Wrapper size for viewport culling
  const [wrapperSize, setWrapperSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    if (!reactFlowWrapper.current) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setWrapperSize({ width, height });
    });
    observer.observe(reactFlowWrapper.current);
    return () => observer.disconnect();
  }, []);

  // File drag state
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // Context menu state (for elements)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Canvas context menu state (for empty space right-click)
  const [canvasContextMenu, setCanvasContextMenu] = useState<{ x: number; y: number; canvasX: number; canvasY: number } | null>(null);

  // Share modal state
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // Asset preview modal state
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);

  // Clipboard for copy/paste of elements
  const copiedElementsRef = useRef<Element[]>([]);
  // Marker to write to system clipboard when copying elements internally
  // This allows detecting if user copied something else externally since then
  const CLIPBOARD_MARKER = '__ZERONEURONE_INTERNAL_COPY__';

  // History store for undo/redo
  const { pushAction, popUndo, popRedo } = useHistoryStore();

  // State for copied elements indicator
  const [hasCopiedElements, setHasCopiedElements] = useState(false);

  const {
    selectedElementIds,
    selectedLinkIds,
    selectElement,
    selectElements,
    selectLink,
    selectBoth,
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
    hideElements,
    showElement,
  } = useViewStore();

  const {
    highlightedElementIds: insightsHighlightedIds,
    pathResults,
    findPaths,
    clearHighlight: clearInsightsHighlight,
  } = useInsightsStore();

  // Sync store for collaboration presence
  // Note: remoteUsers is not used here directly anymore - ElementNode and CustomEdge subscribe to syncStore directly
  const { updateSelection, updateLinkSelection, updateDragging, updateEditing, updateEditingLink } = useSyncStore();
  const syncMode = useSyncStore((state) => state.mode);

  // UI store for theme mode and canvas settings
  const themeMode = useUIStore((state) => state.themeMode);
  const snapToGrid = useUIStore((state) => state.snapToGrid);
  const showAlignGuides = useUIStore((state) => state.showAlignGuides);
  const gridSize = useUIStore((state) => state.gridSize);
  const toggleSnapToGrid = useUIStore((state) => state.toggleSnapToGrid);
  const toggleAlignGuides = useUIStore((state) => state.toggleAlignGuides);
  const showMinimap = useUIStore((state) => state.showMinimap);
  const toggleMinimap = useUIStore((state) => state.toggleMinimap);

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

  // Pre-compute comment counts per element (O(c) instead of O(n*c))
  const commentCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of comments) {
      if (!c.resolved && c.targetType === 'element') {
        map.set(c.targetId, (map.get(c.targetId) || 0) + 1);
      }
    }
    return map;
  }, [comments]);

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
      // Get the old label for undo
      const element = elements.find(el => el.id === elementId);
      const oldLabel = element?.label ?? '';

      // Only track if label actually changed
      if (oldLabel !== newLabel) {
        pushAction({
          type: 'update-element',
          undo: { elementId, changes: { label: oldLabel } },
          redo: { elementId, changes: { label: newLabel } },
        });
      }

      updateElement(elementId, { label: newLabel });
    },
    [elements, updateElement, pushAction]
  );

  // Handle link label change (inline editing)
  const handleLinkLabelChange = useCallback(
    (linkId: string, newLabel: string) => {
      updateLink(linkId, { label: newLabel });
    },
    [updateLink]
  );

  // Get display settings from investigation using specific selectors for reactivity
  const showConfidenceIndicator = useInvestigationStore(
    (state) => state.currentInvestigation?.settings?.showConfidenceIndicator ?? false
  );
  const tagDisplayMode = useInvestigationStore(
    (state) => state.currentInvestigation?.settings?.tagDisplayMode ?? 'icons'
  );
  const tagDisplaySize = useInvestigationStore(
    (state) => state.currentInvestigation?.settings?.tagDisplaySize ?? 'small'
  );
  const linkAnchorMode = useInvestigationStore(
    (state) => state.currentInvestigation?.settings?.linkAnchorMode ?? 'manual'
  );
  const linkCurveMode = useInvestigationStore(
    (state) => state.currentInvestigation?.settings?.linkCurveMode ?? 'curved'
  );
  const displayedProperties = useMemo(
    () => currentInvestigation?.settings?.displayedProperties ?? [],
    [currentInvestigation?.settings?.displayedProperties]
  );

  // --- Stable callback refs (eliminates 500+ closure recreations per recalcul) ---
  const handleResizeRef = useRef(handleElementResize);
  const handleLabelChangeRef = useRef(handleElementLabelChange);
  const updateElementRef = useRef(updateElement);

  useEffect(() => {
    handleResizeRef.current = handleElementResize;
    handleLabelChangeRef.current = handleElementLabelChange;
    updateElementRef.current = updateElement;
  });

  const callbacksCache = useRef(new Map<string, {
    onResize: (w: number, h: number) => void;
    onLabelChange: (val: string) => void;
  }>());

  function getCallbacks(elementId: string, isAnnotation: boolean) {
    let cached = callbacksCache.current.get(elementId);
    if (!cached) {
      cached = {
        onResize: (w: number, h: number) => handleResizeRef.current(elementId, w, h),
        onLabelChange: isAnnotation
          ? (val: string) => updateElementRef.current(elementId, { notes: val })
          : (val: string) => handleLabelChangeRef.current(elementId, val),
      };
      callbacksCache.current.set(elementId, cached);
    }
    return cached;
  }

  // Clean stale entries from callbacks cache when elements change
  useEffect(() => {
    const currentIds = new Set(elements.map(el => el.id));
    for (const id of callbacksCache.current.keys()) {
      if (!currentIds.has(id)) callbacksCache.current.delete(id);
    }
  }, [elements]);

  // --- Phase A: Node structures (depends on data only) ---
  const nodeStructures = useMemo(() => {
    return elements
      .filter((el) => !hiddenElementIds.has(el.id))
      .map((el) => {
        const firstAssetId = el.assetIds?.[0];
        const thumbnail = firstAssetId ? assetMap.get(firstAssetId) ?? null : null;
        const isLoadingAsset = Boolean(firstAssetId) && !assetMap.has(firstAssetId);
        const unresolvedCommentCount = commentCountMap.get(el.id) || 0;

        let badgeProperty: { value: string; type: string } | null = null;
        if (filters.badgePropertyKey) {
          const prop = el.properties.find(p => p.key === filters.badgePropertyKey);
          if (prop && prop.value != null) {
            const valueStr = typeof prop.value === 'string'
              ? prop.value
              : prop.value instanceof Date
                ? prop.value.toLocaleDateString('fr-FR')
                : String(prop.value);
            badgeProperty = { value: valueStr, type: prop.type || 'text' };
          }
        }

        const displayedPropertyValues = displayedProperties
          .map(key => {
            const prop = el.properties.find(p => p.key === key);
            if (!prop || prop.value == null) return null;
            const valueStr = typeof prop.value === 'string'
              ? prop.value
              : prop.value instanceof Date
                ? prop.value.toLocaleDateString('fr-FR')
                : String(prop.value);
            return { key, value: valueStr };
          })
          .filter((p): p is { key: string; value: string } => p !== null);

        return { el, thumbnail, isLoadingAsset, unresolvedCommentCount, badgeProperty, displayedPropertyValues };
      });
  }, [elements, hiddenElementIds, assetMap, commentCountMap, filters.badgePropertyKey, displayedProperties]);

  // --- Phase B: Final node assembly (depends on visual state) ---
  const nodes = useMemo(() => {
    return nodeStructures
      .map(({ el, thumbnail, isLoadingAsset, unresolvedCommentCount, badgeProperty, displayedPropertyValues }) => {
        const callbacks = getCallbacks(el.id, Boolean(el.isAnnotation));
        return elementToNode(
          el,
          selectedElementIds.has(el.id),
          dimmedElementIds.has(el.id),
          thumbnail,
          callbacks.onResize,
          editingElementId === el.id,
          callbacks.onLabelChange,
          stopEditing,
          unresolvedCommentCount,
          isLoadingAsset,
          badgeProperty,
          showConfidenceIndicator,
          displayedPropertyValues,
          tagDisplayMode,
          tagDisplaySize,
          themeMode,
        );
      })
      .sort((a, b) => {
        if (a.type === 'groupFrame' && b.type !== 'groupFrame') return -1;
        if (a.type !== 'groupFrame' && b.type === 'groupFrame') return 1;
        return 0;
      });
  }, [nodeStructures, selectedElementIds, dimmedElementIds, editingElementId, stopEditing, showConfidenceIndicator, tagDisplayMode, tagDisplaySize, themeMode]);

  // Update awareness when selection changes
  useEffect(() => {
    const selectedIds = Array.from(selectedElementIds);
    updateSelection(selectedIds);
  }, [selectedElementIds, updateSelection]);

  // Update awareness when editing state changes
  useEffect(() => {
    updateEditing(editingElementId);
  }, [editingElementId, updateEditing]);

  // Update awareness when link selection changes
  useEffect(() => {
    const selectedIds = Array.from(selectedLinkIds);
    updateLinkSelection(selectedIds);
  }, [selectedLinkIds, updateLinkSelection]);

  // Update awareness when link editing state changes
  useEffect(() => {
    updateEditingLink(editingLinkId);
  }, [editingLinkId, updateEditingLink]);

  // Handle curve offset change for edge dragging (2D offset)
  const handleCurveOffsetChange = useCallback(
    (linkId: string, offset: { x: number; y: number }) => {
      updateLink(linkId, { curveOffset: offset });
    },
    [updateLink]
  );

  // Dragging state refs (no state to avoid re-renders during drag)
  const isDraggingRef = useRef(false);
  const draggingNodeIdsRef = useRef<Set<string>>(new Set());
  const lastDragEndRef = useRef<number>(0);
  const isHandlingSelectionRef = useRef(false);

  // Ref for sync mode - used inside handleNodesChange without adding it as dependency
  const syncModeRef = useRef(syncMode);
  syncModeRef.current = syncMode;

  // Local nodes state for smooth drag - ReactFlow controls this during drag
  const [localNodes, setLocalNodes] = useState<Node[]>(nodes);

  // Sync from store to local when NOT dragging
  // useLayoutEffect prevents one-frame flash when group structure changes
  useLayoutEffect(() => {
    if (!isDraggingRef.current) {
      setLocalNodes(nodes);
    }
  }, [nodes]);

  // Alignment guides state
  const [activeGuides, setActiveGuides] = useState<Guide[]>([]);
  const [draggedNodeInfo, setDraggedNodeInfo] = useState<{ id: string; position: { x: number; y: number } } | null>(null);
  const lastGuideUpdateRef = useRef<number>(0);
  const GUIDE_THROTTLE_MS = 100;

  // Use local nodes for display - this allows smooth drag
  const displayNodes = localNodes;

  // Track node positions in a ref (updated every frame, but doesn't trigger re-renders)
  const nodePositionsRef = useRef(new Map<string, Position>());
  // Version counter to trigger edge recomputation on drag-end / structural changes
  const [edgeVersion, setEdgeVersion] = useState(0);

  // Update positions ref from displayNodes (cheap, no re-render)
  useEffect(() => {
    const positions = new Map<string, Position>();
    const parentPositions = new Map<string, Position>();
    for (const node of displayNodes) {
      if (node.type === 'groupFrame') {
        parentPositions.set(node.id, node.position);
      }
    }
    for (const node of displayNodes) {
      const parentId = (node as any).parentId as string | undefined;
      if (parentId) {
        const parentPos = parentPositions.get(parentId);
        if (parentPos) {
          positions.set(node.id, {
            x: node.position.x + parentPos.x,
            y: node.position.y + parentPos.y,
          });
          continue;
        }
      }
      positions.set(node.id, node.position);
    }
    nodePositionsRef.current = positions;

    // Only trigger edge recomputation when not dragging
    if (!isDraggingRef.current) {
      setEdgeVersion(v => v + 1);
    }
  }, [displayNodes]);

  const edges = useMemo(() => {
    const nodePositions = nodePositionsRef.current;

    // Viewport culling: filter edges whose both endpoints are off-screen
    const bufferPx = 200;
    const vLeft = (-viewport.x - bufferPx) / viewport.zoom;
    const vTop = (-viewport.y - bufferPx) / viewport.zoom;
    const vRight = (-viewport.x + (wrapperSize.width + bufferPx)) / viewport.zoom;
    const vBottom = (-viewport.y + (wrapperSize.height + bufferPx)) / viewport.zoom;

    const visibleLinks = links.filter(link => {
      const fromPos = nodePositions.get(link.fromId);
      const toPos = nodePositions.get(link.toId);
      if (!fromPos || !toPos) return true; // keep if unknown position
      const fromVisible = fromPos.x >= vLeft && fromPos.x <= vRight && fromPos.y >= vTop && fromPos.y <= vBottom;
      const toVisible = toPos.x >= vLeft && toPos.x <= vRight && toPos.y >= vTop && toPos.y <= vBottom;
      return fromVisible || toVisible;
    });

    // Build parallel edges map with pre-computed indices (eliminates indexOf O(n))
    const parallelEdgesMap = new Map<string, { link: Link; index: number }[]>();

    for (const link of visibleLinks) {
      const key = link.fromId < link.toId
        ? `${link.fromId}-${link.toId}`
        : `${link.toId}-${link.fromId}`;

      if (!parallelEdgesMap.has(key)) {
        parallelEdgesMap.set(key, []);
      }
      const arr = parallelEdgesMap.get(key)!;
      arr.push({ link, index: arr.length });
    }

    return visibleLinks.map(link => {
      const onLabelChange = (newLabel: string) => {
        handleLinkLabelChange(link.id, newLabel);
      };

      const onCurveOffsetChange = (offset: { x: number; y: number }) => {
        handleCurveOffsetChange(link.id, offset);
      };

      const onStartEditing = () => {
        selectLink(link.id);
        startEditingLink(link.id);
      };

      // Get pre-computed parallel index (O(1) instead of indexOf O(n))
      const key = link.fromId < link.toId
        ? `${link.fromId}-${link.toId}`
        : `${link.toId}-${link.fromId}`;
      const parallelEntries = parallelEdgesMap.get(key)!;
      const entry = parallelEntries.find(e => e.link === link)!;
      const parallelIndex = entry.index;
      const parallelCount = parallelEntries.length;

      // Link is dimmed if either connected element is dimmed
      const isLinkDimmed = dimmedElementIds.has(link.fromId) || dimmedElementIds.has(link.toId);

      // Compute displayed property values for this link
      const linkDisplayedPropertyValues = displayedProperties
        .map(key => {
          const prop = link.properties?.find(p => p.key === key);
          if (!prop || prop.value == null) return null;
          const valueStr = typeof prop.value === 'string'
            ? prop.value
            : prop.value instanceof Date
              ? prop.value.toLocaleDateString('fr-FR')
              : String(prop.value);
          return { key, value: valueStr };
        })
        .filter((p): p is { key: string; value: string } => p !== null);

      return linkToEdge(
        link,
        selectedLinkIds.has(link.id),
        isLinkDimmed,
        nodePositions,
        linkAnchorMode,
        linkCurveMode,
        editingLinkId === link.id,
        onLabelChange,
        stopEditing,
        onStartEditing,
        parallelIndex,
        parallelCount,
        onCurveOffsetChange,
        showConfidenceIndicator,
        linkDisplayedPropertyValues
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, edgeVersion, viewport, wrapperSize, selectedLinkIds, dimmedElementIds, linkAnchorMode, linkCurveMode, editingLinkId, handleLinkLabelChange, stopEditing, handleCurveOffsetChange, selectLink, startEditingLink, showConfidenceIndicator, displayedProperties]);


  // Track starting positions for undo
  const dragStartPositionsRef = useRef<Map<string, Position>>(new Map());

  // Throttle for position sync during drag (for collaboration)
  const lastDragSyncRef = useRef<number>(0);
  const DRAG_SYNC_THROTTLE_MS = 200; // Sync positions every 200ms during drag (reduced for performance)

  // Handle node changes (position, selection)
  // HYBRID: Apply position changes locally for smooth drag, sync to Zustand periodically and on drag end
  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      // Filter out 'remove' changes - deletion is controlled by Zustand only
      const safeChanges = changes.filter(c => c.type !== 'remove');
      if (safeChanges.length === 0) return;

      // Apply changes to local nodes for smooth visual updates during drag
      setLocalNodes(nds => applyNodeChanges(safeChanges, nds));

      // Track dragging state
      const positionChanges = changes.filter(
        (c): c is NodeChange & { type: 'position'; id: string; dragging?: boolean; position?: Position } =>
          c.type === 'position'
      );

      // Check if any node is currently being dragged
      const nowDragging = new Set<string>();
      const draggingChangesWithPosition: { id: string; position: Position }[] = [];

      for (const change of positionChanges) {
        if ('dragging' in change && change.dragging === true) {
          nowDragging.add(change.id);
          if (change.position) {
            draggingChangesWithPosition.push({ id: change.id, position: change.position });
          }
          // Capture starting position for undo (only on first drag event)
          if (!dragStartPositionsRef.current.has(change.id)) {
            const element = elements.find(el => el.id === change.id);
            if (element) {
              dragStartPositionsRef.current.set(change.id, { ...element.position });
            }
          }
        }
      }

      // Update dragging ref
      isDraggingRef.current = nowDragging.size > 0;

      // Update alignment guides during drag (throttled to reduce recomputations)
      if (showAlignGuides && nowDragging.size === 1 && draggingChangesWithPosition.length > 0) {
        const now = Date.now();
        if (now - lastGuideUpdateRef.current >= GUIDE_THROTTLE_MS) {
          lastGuideUpdateRef.current = now;
          const dragInfo = draggingChangesWithPosition[0];
          setDraggedNodeInfo({ id: dragInfo.id, position: dragInfo.position });
        }
      } else if (nowDragging.size === 0) {
        setDraggedNodeInfo(null);
        setActiveGuides([]);
      }

      // Update awareness for collaboration
      const prevDragging = draggingNodeIdsRef.current;
      if (nowDragging.size !== prevDragging.size ||
          [...nowDragging].some(id => !prevDragging.has(id))) {
        draggingNodeIdsRef.current = nowDragging;
        updateDragging(Array.from(nowDragging));
      }

      // Throttled sync during drag - only needed for real-time collaboration
      // In local mode, positions are synced on drag end only (much better perf)
      if (syncModeRef.current === 'shared' && draggingChangesWithPosition.length > 0) {
        const now = Date.now();
        if (now - lastDragSyncRef.current >= DRAG_SYNC_THROTTLE_MS) {
          lastDragSyncRef.current = now;
          // Validate positions before syncing
          const validUpdates = draggingChangesWithPosition.filter(
            u => u.position && Number.isFinite(u.position.x) && Number.isFinite(u.position.y)
          );
          if (validUpdates.length > 0) {
            updateElementPositions(validUpdates);
          }
        }
      }

      // Final sync when drag ends (dragging: false with position)
      const dragEndChanges = positionChanges.filter(
        (c): c is NodeChange & { type: 'position'; id: string; position: Position; dragging: boolean } =>
          'position' in c && c.position !== undefined && 'dragging' in c && c.dragging === false
      );

      if (dragEndChanges.length > 0) {
        const updates = dragEndChanges.map((c) => ({
          id: c.id,
          position: { ...c.position },
        }));

        // Apply alignment guide snapping on drag end (single node only)
        if (showAlignGuides && updates.length === 1) {
          const update = updates[0];
          const guides = computeGuides(update.id, update.position, localNodes);
          if (guides.length > 0) {
            // Find the closest x and y guide to snap to
            const xGuide = guides.find(g => g.type === 'x');
            const yGuide = guides.find(g => g.type === 'y');
            if (xGuide) {
              update.position = { ...update.position, x: xGuide.snappedValue };
            }
            if (yGuide) {
              update.position = { ...update.position, y: yGuide.snappedValue };
            }
            // Update local nodes to reflect the snapped position
            setLocalNodes(nds => nds.map(n =>
              n.id === update.id ? { ...n, position: update.position } : n
            ));
          }
        }

        // Build undo/redo positions from tracked start positions
        const undoPositions: { id: string; position: Position }[] = [];
        const redoPositions: { id: string; position: Position }[] = [];

        for (const update of updates) {
          const startPos = dragStartPositionsRef.current.get(update.id);
          if (startPos) {
            // Only track if position actually changed
            if (startPos.x !== update.position.x || startPos.y !== update.position.y) {
              undoPositions.push({ id: update.id, position: startPos });
              redoPositions.push({ id: update.id, position: update.position });
            }
          }
        }

        // Push undo action if positions changed
        if (undoPositions.length > 0) {
          pushAction({
            type: 'move-elements',
            undo: { positions: undoPositions },
            redo: { positions: redoPositions },
          });
        }

        // Clear tracked positions
        for (const update of updates) {
          dragStartPositionsRef.current.delete(update.id);
        }

        // Mark drag end time to skip redundant sync from Zustand
        lastDragEndRef.current = Date.now();
        draggingNodeIdsRef.current.clear();

        // Clear alignment guides
        setDraggedNodeInfo(null);
        setActiveGuides([]);

        updateElementPositions(updates);

        // Trigger edge recomputation now that drag is done
        setEdgeVersion(v => v + 1);
      }
    },
    [updateElementPositions, updateDragging, elements, pushAction, showAlignGuides, localNodes]
  );

  // Handle edge changes - in controlled mode, we don't need to handle edge changes
  // All edge modifications go through our Zustand store (createLink, deleteLink, updateLink)
  const handleEdgesChange: OnEdgesChange = useCallback(
    (_changes) => {
      // Edges are controlled by Zustand store, no action needed here
    },
    []
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
      // Close canvas context menu if open
      setCanvasContextMenu(null);

      const element = elements.find((el) => el.id === node.id);
      if (element) {
        // Find first previewable asset (image or PDF)
        const previewableAsset = element.assetIds
          .map(id => assets.find(a => a.id === id))
          .find(a => a && (a.mimeType.startsWith('image/') || a.mimeType === 'application/pdf')) || null;

        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          elementId: element.id,
          elementLabel: element.label || 'Sans nom',
          previewAsset: previewableAsset,
        });
      }
    },
    [elements, assets]
  );

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Close canvas context menu
  const closeCanvasContextMenu = useCallback(() => {
    setCanvasContextMenu(null);
  }, []);

  // Handle right-click on empty canvas
  const handlePaneContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      // Close element context menu if open
      setContextMenu(null);

      // Calculate canvas position from screen position (same formula as double-click)
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      const canvasX = bounds
        ? (event.clientX - bounds.left - viewport.x) / viewport.zoom
        : (event.clientX - viewport.x) / viewport.zoom;
      const canvasY = bounds
        ? (event.clientY - bounds.top - viewport.y) / viewport.zoom
        : (event.clientY - viewport.y) / viewport.zoom;

      setCanvasContextMenu({
        x: event.clientX,
        y: event.clientY,
        canvasX,
        canvasY,
      });
    },
    [viewport]
  );

  // Create element from canvas context menu
  const handleCanvasContextMenuCreate = useCallback(async () => {
    if (!canvasContextMenu) return;

    const newElement = await createElement('', {
      x: canvasContextMenu.canvasX,
      y: canvasContextMenu.canvasY,
    });

    // Save for undo
    pushAction({
      type: 'create-element',
      undo: {},
      redo: { elements: [newElement], elementIds: [newElement.id] },
    });

    // Select the new element
    selectElement(newElement.id);
  }, [canvasContextMenu, createElement, selectElement, pushAction]);

  // Create group from canvas context menu
  const handleCanvasContextMenuCreateGroup = useCallback(async () => {
    if (!canvasContextMenu) return;

    const group = await createGroup('Groupe', {
      x: canvasContextMenu.canvasX,
      y: canvasContextMenu.canvasY,
    }, { width: 300, height: 200 });

    selectElement(group.id);
  }, [canvasContextMenu, createGroup, selectElement]);

  // Create annotation from canvas context menu
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

    selectElement(annotation.id);
  }, [canvasContextMenu, createElement, selectElement]);

  // Paste from canvas context menu (at cursor position)
  const handleCanvasContextMenuPaste = useCallback(async () => {
    if (!canvasContextMenu) return;

    const { canvasX, canvasY } = canvasContextMenu;

    // Try to read clipboard for external content (images, files)
    let pastedFromClipboard = false;
    try {
      const clipboardItems = await navigator.clipboard.read();
      let imageFile: File | null = null;

      // Only take the first image found (clipboard may have multiple representations)
      for (const item of clipboardItems) {
        if (imageFile) break;
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            imageFile = new File([blob], `image.${type.split('/')[1]}`, { type });
            break;
          }
        }
      }

      // If we found an image in clipboard, create element with it
      if (imageFile) {
        pastedFromClipboard = true;
        const position = { x: canvasX, y: canvasY };
        const label = imageFile.name.replace(/\.[^/.]+$/, '') || 'Image';
        const newElement = await createElement(label, position);

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
    if (pastedFromClipboard || copiedElementsRef.current.length === 0) return;

    const newElements: Element[] = [];
    const oldToNewIdMap = new Map<string, string>();

    // Calculate offset from original elements to paste position
    const firstElement = copiedElementsRef.current[0];
    const deltaX = canvasX - firstElement.position.x;
    const deltaY = canvasY - firstElement.position.y;

    // First pass: create all elements with new IDs
    for (const el of copiedElementsRef.current) {
      const newId = generateUUID();
      oldToNewIdMap.set(el.id, newId);

      const newPosition = {
        x: el.position.x + deltaX,
        y: el.position.y + deltaY,
      };

      const newElement = await createElement(el.label, newPosition, {
        ...el,
        id: newId,
        assetIds: [...el.assetIds],
      });
      newElements.push(newElement);
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
    const newElementIds = newElements.map(el => el.id);
    pushAction({
      type: 'create-elements',
      undo: {},
      redo: { elements: newElements, elementIds: newElementIds },
    });

    // Select all pasted elements
    selectElements(newElementIds);
  }, [canvasContextMenu, links, createElement, createLink, selectElements, pushAction, addAsset]);

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
      await deleteElements([contextMenu.elementId]);
      clearSelection();
    }
  }, [contextMenu, deleteElements, clearSelection]);

  // Preview handler for context menu
  const handleContextMenuPreview = useCallback(() => {
    if (contextMenu?.previewAsset) {
      setPreviewAsset(contextMenu.previewAsset);
    }
  }, [contextMenu]);

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
      // Write marker to system clipboard so we can detect external copies later
      navigator.clipboard.writeText(CLIPBOARD_MARKER).catch(() => {});
    }
  }, [elements, getSelectedElementIds, contextMenu, CLIPBOARD_MARKER]);

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
      // Write marker to system clipboard so we can detect external copies later
      navigator.clipboard.writeText(CLIPBOARD_MARKER).catch(() => {});

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
  }, [elements, links, getSelectedElementIds, contextMenu, deleteElements, clearSelection, pushAction, CLIPBOARD_MARKER]);

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

  // Duplicate handler for context menu
  const handleContextMenuDuplicate = useCallback(async () => {
    if (!contextMenu) return;
    const selectedEls = getSelectedElementIds();
    const elIds = selectedEls.length > 0 ? selectedEls : [contextMenu.elementId];
    const elsToDuplicate = elements.filter(el => elIds.includes(el.id));
    if (elsToDuplicate.length === 0) return;

    const offset = 40;
    const newElements: Element[] = [];
    const oldToNewIdMap = new Map<string, string>();

    for (const el of elsToDuplicate) {
      const newId = generateUUID();
      oldToNewIdMap.set(el.id, newId);
      const newPosition = {
        x: el.position.x + offset,
        y: el.position.y + offset,
      };
      const newElement = await createElement(el.label, newPosition, {
        ...el,
        id: newId,
        position: newPosition,
        assetIds: [...el.assetIds],
      });
      newElements.push(newElement);
    }

    // Recreate links between duplicated elements
    const elIdSet = new Set(elIds);
    const relevantLinks = links.filter(l =>
      elIdSet.has(l.fromId) && elIdSet.has(l.toId)
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

    const newElementIds = newElements.map(el => el.id);
    pushAction({
      type: 'create-elements',
      undo: {},
      redo: { elements: newElements, elementIds: newElementIds },
    });
    selectElements(newElementIds);
  }, [contextMenu, elements, links, getSelectedElementIds, createElement, createLink, selectElements, pushAction]);

  // Group selection handler for context menu
  const handleGroupSelection = useCallback(async () => {
    const selectedEls = getSelectedElementIds();
    if (selectedEls.length < 2) return;
    const selectedElements = elements.filter(el => selectedEls.includes(el.id) && !el.isGroup);
    if (selectedElements.length < 2) return;

    // Calculate bounding box of selected elements with padding
    const padding = 40;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of selectedElements) {
      const w = el.visual.customWidth || 120;
      const h = el.visual.customHeight || 60;
      minX = Math.min(minX, el.position.x);
      minY = Math.min(minY, el.position.y);
      maxX = Math.max(maxX, el.position.x + w);
      maxY = Math.max(maxY, el.position.y + h);
    }

    const groupPos = { x: minX - padding, y: minY - padding };
    const groupSize = {
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
    };

    await createGroup('Groupe', groupPos, groupSize, selectedEls);
    clearSelection();
  }, [elements, getSelectedElementIds, createGroup, clearSelection]);

  // Dissolve group handler
  const handleDissolveGroup = useCallback(async () => {
    if (!contextMenu) return;
    const el = elements.find(e => e.id === contextMenu.elementId);
    if (!el?.isGroup) return;
    await dissolveGroup(contextMenu.elementId);
    clearSelection();
  }, [contextMenu, elements, dissolveGroup, clearSelection]);

  // Remove from group handler
  const handleRemoveFromGroup = useCallback(async () => {
    if (!contextMenu) return;
    await removeFromGroup([contextMenu.elementId]);
  }, [contextMenu, removeFromGroup]);

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

  // Double-click detection for edges (since onEdgeDoubleClick doesn't work reliably)
  const edgeClickCountRef = useRef<{ id: string; count: number; timer: ReturnType<typeof setTimeout> | null }>({
    id: '',
    count: 0,
    timer: null,
  });

  // Handle edge click (with double-click detection)
  const handleEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      const isShiftKey = event.shiftKey;

      // Double-click detection
      const clickData = edgeClickCountRef.current;

      if (clickData.id === edge.id) {
        clickData.count += 1;
      } else {
        // Different edge - reset
        if (clickData.timer) clearTimeout(clickData.timer);
        clickData.id = edge.id;
        clickData.count = 1;
      }

      if (clickData.count === 1) {
        // First click - select and start timer
        selectLink(edge.id, isShiftKey);
        clickData.timer = setTimeout(() => {
          clickData.count = 0;
        }, 300);
      } else if (clickData.count >= 2) {
        // Double-click detected - start editing
        if (clickData.timer) {
          clearTimeout(clickData.timer);
          clickData.timer = null;
        }
        clickData.count = 0;
        startEditingLink(edge.id);
      }
    },
    [selectLink, startEditingLink]
  );

  // Focus canvas wrapper when component mounts (for keyboard events after view switch)
  useEffect(() => {
    // Small delay to ensure the component is fully rendered
    const timer = setTimeout(() => {
      reactFlowWrapper.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

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

      // Save for undo
      pushAction({
        type: 'create-element',
        undo: {},
        redo: { elements: [newElement], elementIds: [newElement.id] },
      });

      selectElement(newElement.id);
    },
    [createElement, selectElement, viewport, pushAction]
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
  // Note: This is kept as a fallback but main double-click detection is in handleEdgeClick
  const handleEdgeDoubleClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.stopPropagation();
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

  // Handle undo (for keyboard shortcut - uses popUndo to get action then executes)
  const handleUndo = useCallback(async () => {
    const action = popUndo();
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

      case 'update-element':
        // Restore previous values
        if (action.undo.elementId && action.undo.changes) {
          await updateElement(action.undo.elementId, action.undo.changes);
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
  }, [popUndo, createElement, createLink, deleteElements, updateElement, updateElementPositions]);

  // Handle redo (for keyboard shortcut - uses popRedo to get action then executes)
  const handleRedo = useCallback(async () => {
    const action = popRedo();
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

      case 'update-element':
        // Re-apply changes
        if (action.redo.elementId && action.redo.changes) {
          await updateElement(action.redo.elementId, action.redo.changes);
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
  }, [popRedo, deleteElements, deleteLinks, createElement, updateElement, updateElementPositions]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      // Ignore if typing in an input or editable element
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

      // Delete selected elements
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
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
          // Write marker to system clipboard so we can detect external copies later
          navigator.clipboard.writeText(CLIPBOARD_MARKER).catch(() => {});
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
          // Write marker to system clipboard so we can detect external copies later
          navigator.clipboard.writeText(CLIPBOARD_MARKER).catch(() => {});

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

      // Duplicate with Ctrl+D
      if (event.key === 'd' && isCtrlOrMeta) {
        event.preventDefault();
        const selectedEls = getSelectedElementIds();
        if (selectedEls.length > 0) {
          const elsToDuplicate = elements.filter(el => selectedEls.includes(el.id));
          const offset = 40;
          const newElements: Element[] = [];
          const oldToNewIdMap = new Map<string, string>();

          for (const el of elsToDuplicate) {
            const newId = generateUUID();
            oldToNewIdMap.set(el.id, newId);
            const newPosition = {
              x: el.position.x + offset,
              y: el.position.y + offset,
            };
            const newElement = await createElement(el.label, newPosition, {
              ...el,
              id: newId,
              position: newPosition,
              assetIds: [...el.assetIds],
            });
            newElements.push(newElement);
          }

          // Recreate links between duplicated elements
          const selectedSet = new Set(selectedEls);
          const relevantLinks = links.filter(l =>
            selectedSet.has(l.fromId) && selectedSet.has(l.toId)
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

          const newElementIds = newElements.map(el => el.id);
          pushAction({
            type: 'create-elements',
            undo: {},
            redo: { elements: newElements, elementIds: newElementIds },
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
        selectElement(annotation.id);
      }

      // New visual group with G (no modifier) at cursor position
      if (event.key === 'g' && !isCtrlOrMeta && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        const bounds = reactFlowWrapper.current?.getBoundingClientRect();
        const mx = bounds ? (lastMousePosRef.current.x - bounds.left - viewport.x) / viewport.zoom : 0;
        const my = bounds ? (lastMousePosRef.current.y - bounds.top - viewport.y) / viewport.zoom : 0;
        const group = await createGroup('Groupe', { x: mx, y: my }, { width: 300, height: 200 });
        selectElement(group.id);
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
    selectElement,
    createElement,
    createGroup,
    createLink,
    elements,
    links,
    viewport,
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

      // Check clipboard text for our marker (to know if last copy was internal elements)
      const clipboardText = event.clipboardData?.getData('text/plain') || '';
      const hasInternalCopyMarker = clipboardText === CLIPBOARD_MARKER;

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

        const newElement = await createElement(label, position);
        try {
          await addAsset(newElement.id, file);
        } catch (err) {
          console.error('Failed to add asset:', err);
        }

        // Save for undo
        pushAction({
          type: 'create-element',
          undo: {},
          redo: { elements: [newElement], elementIds: [newElement.id] },
        });

        // Select the created element
        selectElements([newElement.id]);
        return;
      }

      // PRIORITY 2: Internal copied elements (marker present)
      if (copiedElementsRef.current.length > 0) {
        event.preventDefault();

        const offset = 40; // Offset for pasted elements
        const newElements: Element[] = [];
        const oldToNewIdMap = new Map<string, string>();

        // First pass: create all elements with new IDs
        for (const el of copiedElementsRef.current) {
          const newId = generateUUID();
          oldToNewIdMap.set(el.id, newId);

          const newPosition = {
            x: el.position.x + offset,
            y: el.position.y + offset,
          };

          const newElement = await createElement(el.label, newPosition, {
            ...el,
            id: newId,
            assetIds: [...el.assetIds], // Keep same assets
          });
          newElements.push(newElement);
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
        const newElementIds = newElements.map(el => el.id);
        pushAction({
          type: 'create-elements',
          undo: {},
          redo: { elements: newElements, elementIds: newElementIds },
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

      // No files and no copied elements - nothing to paste
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
    ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: Node[]; edges: Edge[] }) => {
      // Prevent re-entry to avoid infinite loop
      if (isHandlingSelectionRef.current) return;

      if (selectedNodes.length > 0 || selectedEdges.length > 0) {
        isHandlingSelectionRef.current = true;
        selectBoth(
          selectedNodes.map((n) => n.id),
          selectedEdges.map((e) => e.id),
          false
        );
        // Reset flag after a microtask to allow React to settle
        queueMicrotask(() => {
          isHandlingSelectionRef.current = false;
        });
      }
    },
    [selectBoth]
  );


  return (
    <ReactFlowProvider>
      <div className="w-full h-full flex flex-col">
        {/* Toolbar */}
        <ViewToolbar
          showFontToggle
          leftContent={
            <div className="flex items-center gap-3">
              <LocalUserAvatar />
              <div className="w-px h-4 bg-border-default" />
              <SyncStatusIndicator />
              <PresenceAvatars />
              <button
                onClick={() => setIsShareModalOpen(true)}
                className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded transition-colors"
                title="Partager"
              >
                <Share2 size={16} />
              </button>
              <div className="w-px h-4 bg-border-default" />
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <span className="flex items-center gap-1">
                  <Box size={12} />
                  {elements.length}
                </span>
                <span className="flex items-center gap-1">
                  <Link2 size={12} />
                  {links.length}
                </span>
              </div>
              {selectedElementIds.size + selectedLinkIds.size > 0 && (
                <>
                  <div className="w-px h-4 bg-border-default" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-accent font-medium">
                      {selectedElementIds.size === 1 && selectedLinkIds.size === 0
                        ? '1 élément'
                        : selectedLinkIds.size === 1 && selectedElementIds.size === 0
                        ? '1 lien'
                        : `${selectedElementIds.size + selectedLinkIds.size} sélectionnés`}
                    </span>
                    <button
                      onClick={clearSelection}
                      className="p-0.5 text-text-tertiary hover:text-text-primary rounded transition-colors"
                      title="Désélectionner"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </>
              )}
            </div>
          }
          rightContent={
            <>
              <button
                onClick={toggleSnapToGrid}
                className={`p-1.5 rounded transition-colors ${snapToGrid ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-bg-tertiary'}`}
                title="Grille magnetique"
              >
                <Grid3x3 size={16} />
              </button>
              <button
                onClick={toggleAlignGuides}
                className={`p-1.5 rounded transition-colors ${showAlignGuides ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-bg-tertiary'}`}
                title="Guides d'alignement"
              >
                <Magnet size={16} />
              </button>
              <button
                onClick={toggleMinimap}
                className={`p-1.5 rounded transition-colors ${showMinimap ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-bg-tertiary'}`}
                title="Minimap"
              >
                <MapIcon size={16} />
              </button>
              <div className="w-px h-4 bg-border-default mx-1" />
              <LayoutDropdown />
              <div className="w-px h-4 bg-border-default mx-1" />
              <CanvasZoomControls />
            </>
          }
        />

        {/* Canvas */}
        <div
          ref={reactFlowWrapper}
          className="flex-1 relative outline-none"
          data-report-capture="canvas"
          onMouseMove={(e) => { lastMousePosRef.current = { x: e.clientX, y: e.clientY }; }}
          onDrop={handleFileDrop}
          onDragOver={handleFileDragOver}
          onDragLeave={handleFileDragLeave}
          tabIndex={0}
          onKeyDown={(e) => {
            // Backup handler for delete key when window listener doesn't work
            if ((e.key === 'Delete' || e.key === 'Backspace') &&
                !(e.target instanceof HTMLInputElement) &&
                !(e.target instanceof HTMLTextAreaElement)) {
              e.preventDefault();
              const selectedEls = getSelectedElementIds();
              const selectedLks = getSelectedLinkIds();
              if (selectedEls.length > 0) {
                const elementsToDelete = elements.filter(el => selectedEls.includes(el.id));
                const linksToDelete = links.filter(l =>
                  selectedEls.includes(l.fromId) || selectedEls.includes(l.toId)
                );
                pushAction({
                  type: 'delete-elements',
                  undo: { elements: elementsToDelete, links: linksToDelete },
                  redo: { elementIds: selectedEls },
                });
                deleteElements(selectedEls);
              }
              if (selectedLks.length > 0) {
                const linksToDelete = links.filter(l => selectedLks.includes(l.id));
                pushAction({
                  type: 'delete-link',
                  undo: { links: linksToDelete },
                  redo: { linkIds: selectedLks },
                });
                deleteLinks(selectedLks);
              }
              clearSelection();
            }
          }}
        >
          <ReactFlow
            nodes={displayNodes}
            edges={edges}
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
            onPaneContextMenu={handlePaneContextMenu}
            onDoubleClick={handlePaneDoubleClick}
            onViewportChange={handleViewportChange}
            onSelectionChange={handleSelectionChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultViewport={viewport}
            snapToGrid={snapToGrid}
            snapGrid={[gridSize, gridSize]}
            minZoom={0.02}
            maxZoom={4}
            selectionMode={SelectionMode.Partial}
            connectionMode={ConnectionMode.Loose}
            edgesReconnectable
            selectNodesOnDrag={false}
            selectionOnDrag
            panOnDrag
            selectionKeyCode="Shift"
            deleteKeyCode={null}
            panOnScroll
            zoomOnScroll
            zoomOnDoubleClick={false}
            fitView={false}
            nodeDragThreshold={2}
            onlyRenderVisibleElements
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={snapToGrid ? BackgroundVariant.Lines : BackgroundVariant.Dots}
              gap={gridSize}
              size={snapToGrid ? 0.5 : 1}
              color="var(--color-border-strong)"
              style={{ backgroundColor: 'var(--color-bg-canvas)' }}
            />
            <CanvasCaptureHandler />
            <ViewportController />
            <DraggableMinimap />
          </ReactFlow>

          {/* Alignment guides overlay */}
          {showAlignGuides && draggedNodeInfo && (
            <AlignmentGuides
              draggedNodeId={draggedNodeInfo.id}
              dragPosition={draggedNodeInfo.position}
              nodes={displayNodes}
            />
          )}

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

          {/* Context menu for elements */}
          {contextMenu && (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              elementId={contextMenu.elementId}
              elementLabel={contextMenu.elementLabel}
              isFocused={focusElementId === contextMenu.elementId}
              isHidden={hiddenElementIds.has(contextMenu.elementId)}
              hasCopiedElements={hasCopiedElements}
              hasPreviewableAsset={!!contextMenu.previewAsset}
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
              onDuplicate={handleContextMenuDuplicate}
              onPreview={handleContextMenuPreview}
              onFindPaths={handleFindPaths}
              isGroup={!!elements.find(el => el.id === contextMenu.elementId)?.isGroup}
              isInGroup={!!elements.find(el => el.id === contextMenu.elementId)?.parentGroupId}
              hasMultipleSelected={selectedElementIds.size > 1}
              onGroupSelection={handleGroupSelection}
              onDissolveGroup={handleDissolveGroup}
              onRemoveFromGroup={handleRemoveFromGroup}
              onClose={closeContextMenu}
            />
          )}

          {/* Context menu for canvas (empty space) */}
          {canvasContextMenu && (
            <CanvasContextMenu
              x={canvasContextMenu.x}
              y={canvasContextMenu.y}
              onCreateElement={handleCanvasContextMenuCreate}
              onCreateGroup={handleCanvasContextMenuCreateGroup}
              onCreateAnnotation={handleCanvasContextMenuCreateAnnotation}
              onPaste={handleCanvasContextMenuPaste}
              onClose={closeCanvasContextMenu}
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

        {/* Share Modal */}
        <ShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
        />

        {/* Asset Preview Modal */}
        {previewAsset && (
          <AssetPreviewModal
            asset={previewAsset}
            onClose={() => setPreviewAsset(null)}
          />
        )}
      </div>
    </ReactFlowProvider>
  );
}

// Asset preview modal component (reusable)
interface AssetPreviewModalProps {
  asset: Asset;
  onClose: () => void;
}

function AssetPreviewModal({ asset, onClose }: AssetPreviewModalProps) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isImage = asset.mimeType.startsWith('image/');
  const isPdf = asset.mimeType === 'application/pdf';

  // Load file from OPFS
  useEffect(() => {
    let mounted = true;
    let url: string | null = null;

    const loadFile = async () => {
      try {
        setIsLoading(true);
        url = await fileService.getAssetUrl(asset);
        if (mounted) {
          setFileUrl(url);
        }
      } catch (error) {
        console.error('Error loading file:', error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    if (isImage || isPdf) {
      loadFile();
    } else {
      setIsLoading(false);
    }

    return () => {
      mounted = false;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [asset, isImage, isPdf]);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className={`bg-bg-primary rounded shadow-lg flex flex-col ${
          isPdf ? 'w-[90vw] h-[90vh]' : 'max-w-4xl max-h-[90vh]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-border-default flex-shrink-0">
          <h3 className="text-sm font-medium text-text-primary truncate pr-4">
            {asset.filename}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-text-tertiary hover:text-text-primary flex-shrink-0"
            title="Fermer (Echap)"
          >
            <span className="sr-only">Fermer</span>
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-text-secondary">Chargement...</span>
              </div>
            </div>
          ) : isPdf && fileUrl ? (
            <iframe
              src={fileUrl}
              className="w-full h-full border-0"
              title={asset.filename}
            />
          ) : isImage && fileUrl ? (
            <div className="p-4 flex items-center justify-center h-full">
              <img
                src={fileUrl}
                alt={asset.filename}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ) : asset.thumbnailDataUrl ? (
            <div className="p-4 flex items-center justify-center h-full">
              <img
                src={asset.thumbnailDataUrl}
                alt={asset.filename}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 py-8 text-text-tertiary">
              <span className="text-4xl">📄</span>
              <p className="text-sm">Aperçu non disponible</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
