import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { SimpleEdge } from './SimpleEdge';
import { ContextMenu } from './ContextMenu';
import { CanvasContextMenu } from './CanvasContextMenu';
import { LayoutDropdown } from './LayoutDropdown';
import { ImportPlacementOverlay } from './ImportPlacementOverlay';
import { ViewToolbar } from '../common/ViewToolbar';
import { SyncStatusIndicator, PresenceAvatars, ShareModal, LocalUserAvatar } from '../collaboration';
import { useInvestigationStore, useSelectionStore, useViewStore, useInsightsStore, useHistoryStore, useUIStore, useSyncStore, useTabStore, toast } from '../../stores';
import { toPng } from 'html-to-image';
import type { Element, Link, Position, Asset } from '../../types';
import { FONT_SIZE_PX } from '../../types';
import type { RemoteUserPresence } from './ElementNode';
import { generateUUID, sanitizeLinkLabel } from '../../utils';
import { getDimmedElementIds, getNeighborIds } from '../../utils/filterUtils';
import { fileService } from '../../services/fileService';
import { metadataService } from '../../services/metadataService';
import { importService } from '../../services/importService';
import { syncService } from '../../services/syncService';
import { elementRepository } from '../../db/repositories/elementRepository';

/** Capture tab membership for undo restore (tabId → elementIds[]) */
function captureTabMembership(elementIds: string[]): Record<string, string[]> | undefined {
  const { getTabsForElement } = useTabStore.getState();
  const membership: Record<string, string[]> = {};
  let hasAny = false;
  for (const elId of elementIds) {
    for (const tab of getTabsForElement(elId)) {
      if (!membership[tab.id]) membership[tab.id] = [];
      membership[tab.id].push(elId);
      hasAny = true;
    }
  }
  return hasAny ? membership : undefined;
}

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
  simple: SimpleEdge,
};

// Capture handler for report screenshots - must be inside ReactFlowProvider
function CanvasCaptureHandler() {
  const { fitView } = useReactFlow();
  const { registerCaptureHandler, unregisterCaptureHandler } = useUIStore();

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
  const { t } = useTranslation('pages');
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
        title={t('investigation.toolbar.zoomOut')}
      >
        <ZoomOut size={16} />
      </button>
      <button
        onClick={handleZoomIn}
        className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded"
        title={t('investigation.toolbar.zoomIn')}
      >
        <ZoomIn size={16} />
      </button>
      <div className="w-px h-4 bg-border-default mx-1" />
      <button
        onClick={handleFitView}
        className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded"
        title={t('investigation.toolbar.fitView')}
      >
        <Maximize2 size={16} />
      </button>
      <button
        onClick={handleReset}
        className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded"
        title={t('investigation.toolbar.resetView')}
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

// FitView controller - watches for pending fitView requests and applies them
function FitViewController() {
  const { fitView, getNodes } = useReactFlow();
  const { pendingFitView, clearPendingFitView } = useViewStore();

  useEffect(() => {
    if (!pendingFitView) return;

    // Wait for nodes to be rendered and measured before fitting.
    // After import/load, nodes may not exist yet when this effect first fires.
    let attempts = 0;
    const maxAttempts = 20; // 20 × 100ms = 2s max
    const interval = setInterval(() => {
      attempts++;
      const nodes = getNodes();
      const hasMeasuredNodes = nodes.length > 0 && nodes.some(n => n.measured?.width);
      if (hasMeasuredNodes || attempts >= maxAttempts) {
        clearInterval(interval);
        fitView({ padding: 0.2, duration: 300 });
        clearPendingFitView();
      }
    }, 100);
    return () => clearInterval(interval);
  }, [pendingFitView, fitView, clearPendingFitView, getNodes]);

  return null;
}


// Convert our Element to React Flow Node
function elementToNode(
  element: Element,
  isSelected: boolean,
  isDimmed: boolean,
  thumbnail: string | null,
  onResize?: (width: number, height: number, position?: { x: number; y: number }) => void,
  isEditing?: boolean,
  remoteSelectors?: RemoteUserPresence[],
  onLabelChange?: (newLabel: string) => void,
  onStopEditing?: () => void,
  unresolvedCommentCount?: number,
  isLoadingAsset?: boolean,
  badgeProperty?: { value: string; type: string } | null,
  showConfidenceIndicator?: boolean,
  displayedPropertyValues?: { key: string; value: string }[],
  tagDisplayMode?: 'none' | 'icons' | 'labels' | 'both',
  tagDisplaySize?: 'small' | 'medium' | 'large',
  themeMode?: 'light' | 'dark',
  isGhost?: boolean,
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
      draggable: !element.isPositionLocked && !isGhost,
      data: {
        element,
        isSelected: isGhost ? false : isSelected,
        isDimmed: isGhost || isDimmed,
        isEditing: isGhost ? false : isEditing,
        onLabelChange: isGhost ? undefined : onLabelChange,
        onStopEditing: isGhost ? undefined : onStopEditing,
        onResize: isGhost ? undefined : onResize,
      } satisfies AnnotationNodeData,
      selected: isGhost ? false : isSelected,
      selectable: !isGhost,
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
      draggable: !element.isPositionLocked && !isGhost,
      data: {
        element,
        isSelected: isGhost ? false : isSelected,
        isDimmed: isGhost || isDimmed,
        isGhost,
        onResize: isGhost ? undefined : onResize,
        isEditing: isGhost ? false : isEditing,
        onLabelChange: isGhost ? undefined : onLabelChange,
        onStopEditing: isGhost ? undefined : onStopEditing,
        themeMode,
        unresolvedCommentCount,
        showConfidenceIndicator,
        displayedPropertyValues,
        tagDisplayMode,
        tagDisplaySize,
      } satisfies GroupNodeData,
      selected: isGhost ? false : isSelected,
      selectable: !isGhost,
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
    draggable: !element.isPositionLocked && !isGhost,
    selectable: !isGhost,
    data: {
      element,
      isSelected: isGhost ? false : isSelected,
      isDimmed: isGhost || isDimmed,
      isGhost,
      thumbnail,
      onResize: isGhost ? undefined : onResize,
      isEditing: isGhost ? false : isEditing,
      onLabelChange: isGhost ? undefined : onLabelChange,
      onStopEditing: isGhost ? undefined : onStopEditing,
      remoteSelectors,
      unresolvedCommentCount,
      isLoadingAsset,
      badgeProperty,
      showConfidenceIndicator,
      displayedPropertyValues,
      tagDisplayMode,
      tagDisplaySize,
      themeMode,
    } satisfies ElementNodeData,
    selected: isGhost ? false : isSelected,
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
  displayedPropertyValues?: { key: string; value: string }[],
  remoteLinkSelectors?: { name: string; color: string; isEditing?: boolean }[],
  simplified?: boolean
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

  // Simplified mode: minimal data for SimpleEdge (1 SVG path instead of 10-15 elements)
  if (simplified) {
    return {
      id: link.id,
      source: link.fromId,
      target: link.toId,
      sourceHandle: sourceHandle ?? 'source-right',
      targetHandle: targetHandle ?? 'target-left',
      type: 'simple',
      data: {
        color: link.visual.color,
        thickness: link.visual.thickness,
        dashArray: strokeDasharray,
        isDimmed,
        isSelected,
      },
      selected: isSelected,
    };
  }

  return {
    id: link.id,
    source: link.fromId,
    target: link.toId,
    sourceHandle: sourceHandle ?? 'source-right',
    targetHandle: targetHandle ?? 'target-left',
    type: 'custom',
    label: link.label || undefined,
    labelStyle: {
      fontSize: FONT_SIZE_PX[link.visual.fontSize || 'sm'],
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
      // Remote user presence (passed from Canvas, not subscribed per-edge)
      remoteLinkSelectors,
      // Font size
      fontSize: link.visual.fontSize,
    },
    selected: isSelected,
  };
}

export function Canvas() {
  const { t } = useTranslation('common');
  const { t: tPages } = useTranslation('pages');
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Stores — individual selectors to avoid re-renders when unrelated state changes
  const currentInvestigation = useInvestigationStore((s) => s.currentInvestigation);
  const elements = useInvestigationStore((s) => s.elements);
  const links = useInvestigationStore((s) => s.links);

  // O(1) element lookup map — avoids O(n) .find() in hot paths (drag, resize, context menu)
  const elementMap = useMemo(() => new Map(elements.map(el => [el.id, el])), [elements]);
  const assets = useInvestigationStore((s) => s.assets);
  const comments = useInvestigationStore((s) => s.comments);
  const createElement = useInvestigationStore((s) => s.createElement);
  const updateElement = useInvestigationStore((s) => s.updateElement);
  const updateElementPositions = useInvestigationStore((s) => s.updateElementPositions);
  const createLink = useInvestigationStore((s) => s.createLink);
  const updateLink = useInvestigationStore((s) => s.updateLink);
  const deleteElements = useInvestigationStore((s) => s.deleteElements);
  const deleteLinks = useInvestigationStore((s) => s.deleteLinks);
  const addAsset = useInvestigationStore((s) => s.addAsset);
  const createGroup = useInvestigationStore((s) => s.createGroup);
  const removeFromGroup = useInvestigationStore((s) => s.removeFromGroup);
  const dissolveGroup = useInvestigationStore((s) => s.dissolveGroup);
  const pasteElements = useInvestigationStore((s) => s.pasteElements);
  const loadInvestigation = useInvestigationStore((s) => s.loadInvestigation);

  // Wrapper size for viewport culling
  const [wrapperSize, setWrapperSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    if (!reactFlowWrapper.current) return;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => setWrapperSize({ width, height }), 250);
    });
    observer.observe(reactFlowWrapper.current);
    return () => { observer.disconnect(); if (resizeTimer) clearTimeout(resizeTimer); };
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

  // Build clipboard data with element/link info for cross-component paste
  const buildClipboardData = useCallback((elementIds: string[], linkIds: string[] = []) => {
    const copiedElements = elements.filter(el => elementIds.includes(el.id));
    const copiedLinks = links.filter(l => linkIds.includes(l.id) ||
      (elementIds.includes(l.fromId) && elementIds.includes(l.toId) && l.label));

    const data = {
      // Sanitize labels to escape special characters (| and ]]) that would break link format
      elements: copiedElements.map(el => ({
        id: el.id,
        label: sanitizeLinkLabel(el.label, el.id),
      })),
      links: copiedLinks
        .filter(l => l.label)
        .map(l => ({
          id: l.id,
          label: sanitizeLinkLabel(l.label || '', l.id),
        })),
    };

    return `${CLIPBOARD_MARKER}:${JSON.stringify(data)}`;
  }, [elements, links]);

  // History store for undo/redo
  const { pushAction, popUndo, popRedo } = useHistoryStore();

  // State for copied elements indicator
  const [hasCopiedElements, setHasCopiedElements] = useState(false);

  // Selection store — individual selectors prevent re-renders when unrelated selection state changes
  const selectedElementIds = useSelectionStore((s) => s.selectedElementIds);
  const selectedLinkIds = useSelectionStore((s) => s.selectedLinkIds);
  const editingElementId = useSelectionStore((s) => s.editingElementId);
  const editingLinkId = useSelectionStore((s) => s.editingLinkId);
  const selectElement = useSelectionStore((s) => s.selectElement);
  const selectElements = useSelectionStore((s) => s.selectElements);
  const selectLink = useSelectionStore((s) => s.selectLink);
  const selectBoth = useSelectionStore((s) => s.selectBoth);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const getSelectedElementIds = useSelectionStore((s) => s.getSelectedElementIds);
  const getSelectedLinkIds = useSelectionStore((s) => s.getSelectedLinkIds);
  const startEditingElement = useSelectionStore((s) => s.startEditingElement);
  const startEditingLink = useSelectionStore((s) => s.startEditingLink);
  const stopEditing = useSelectionStore((s) => s.stopEditing);

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
    requestFitView,
  } = useViewStore();

  // Tab filtering
  const activeTabId = useTabStore((s) => s.activeTabId);
  const tabMemberSet = useTabStore((s) => s.memberSet);
  const tabExcludedSet = useTabStore((s) => s.excludedSet);
  const canvasTabs = useTabStore((s) => s.tabs);
  const addTabMembers = useTabStore((s) => s.addMembers);
  const removeTabMembers = useTabStore((s) => s.removeMembers);
  const excludeFromTab = useTabStore((s) => s.excludeFromTab);
  const getTabsForElement = useTabStore((s) => s.getTabsForElement);
  const setActiveTab = useTabStore((s) => s.setActiveTab);

  // Synchronous ghost computation — no useEffect delay
  const localGhostIds = useMemo(() => {
    if (activeTabId === null || tabMemberSet.size === 0) return new Set<string>();
    const ghosts = new Set<string>();
    for (const link of links) {
      if (tabMemberSet.has(link.fromId) && !tabMemberSet.has(link.toId)) {
        if (!tabExcludedSet.has(link.toId)) ghosts.add(link.toId);
      }
      if (tabMemberSet.has(link.toId) && !tabMemberSet.has(link.fromId)) {
        if (!tabExcludedSet.has(link.fromId)) ghosts.add(link.fromId);
      }
    }
    return ghosts;
  }, [links, activeTabId, tabMemberSet, tabExcludedSet]);

  // Frozen viewport for edge culling — edges are NOT recalculated during pan/zoom.
  // React Flow already applies CSS transform during movement, so edges scale naturally.
  // We only recalculate edge visibility when movement stops (onMoveEnd).
  // Additionally, edges are hidden via CSS during movement to avoid Firefox SVG painting cost.
  // cullingViewport is a ref (not state) to avoid triggering a re-render on every move-end.
  // Edge recomputation is triggered via edgeVersion bump instead.
  const isViewportMovingRef = useRef(false);
  const cullingViewportRef = useRef(viewport);
  const [isViewportMoving, setIsViewportMoving] = useState(false);

  const handleMoveStart = useCallback(() => {
    isViewportMovingRef.current = true;
    setIsViewportMoving(true);
  }, []);

  const handleMoveEnd = useCallback(() => {
    isViewportMovingRef.current = false;
    setIsViewportMoving(false);
    cullingViewportRef.current = viewportRef.current;
    // Bump edgeVersion to trigger re-cull with the updated viewport
    setEdgeVersion(v => v + 1);
  }, []);

  // Keep a ref to the latest viewport for handleMoveEnd
  const viewportRef = useRef(viewport);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  const {
    highlightedElementIds: insightsHighlightedIds,
    findPaths,
  } = useInsightsStore();

  // Sync store for collaboration presence
  const { updateSelection, updateLinkSelection, updateDragging, updateEditing, updateEditingLink } = useSyncStore();
  const syncMode = useSyncStore((state) => state.mode);
  const remoteUsers = useSyncStore((state) => state.remoteUsers);

  // Pre-compute remote user presence per element/link (single subscription instead of n+m)
  // Structural comparison: returns same Map reference if content hasn't changed,
  // preventing unnecessary node/edge rebuilds when awareness fires for cursor moves
  const prevRemoteElementMapRef = useRef(new Map<string, RemoteUserPresence[]>());
  const remoteUsersByElement = useMemo(() => {
    if (!remoteUsers || remoteUsers.length === 0) {
      if (prevRemoteElementMapRef.current.size === 0) return prevRemoteElementMapRef.current;
      prevRemoteElementMapRef.current = new Map();
      return prevRemoteElementMapRef.current;
    }
    const map = new Map<string, RemoteUserPresence[]>();
    for (const user of remoteUsers) {
      const dragging = user.dragging || [];
      const selections = user.selection || [];
      const allIds = new Set([...dragging, ...selections]);
      for (const id of allIds) {
        const list = map.get(id) || [];
        list.push({
          name: user.name,
          color: user.color,
          isDragging: dragging.includes(id),
        });
        map.set(id, list);
      }
    }
    // Structural equality check: reuse previous reference if content is identical
    const prev = prevRemoteElementMapRef.current;
    if (map.size === prev.size) {
      let identical = true;
      for (const [id, users] of map) {
        const prevUsers = prev.get(id);
        if (!prevUsers || prevUsers.length !== users.length) { identical = false; break; }
        for (let i = 0; i < users.length; i++) {
          if (users[i].name !== prevUsers[i].name || users[i].color !== prevUsers[i].color || users[i].isDragging !== prevUsers[i].isDragging) {
            identical = false; break;
          }
        }
        if (!identical) break;
      }
      if (identical) return prev;
    }
    prevRemoteElementMapRef.current = map;
    return map;
  }, [remoteUsers]);

  const prevRemoteLinkMapRef = useRef(new Map<string, { name: string; color: string; isEditing?: boolean }[]>());
  const remoteUsersByLink = useMemo(() => {
    if (!remoteUsers || remoteUsers.length === 0) {
      if (prevRemoteLinkMapRef.current.size === 0) return prevRemoteLinkMapRef.current;
      prevRemoteLinkMapRef.current = new Map();
      return prevRemoteLinkMapRef.current;
    }
    const map = new Map<string, { name: string; color: string; isEditing?: boolean }[]>();
    for (const user of remoteUsers) {
      const linkSelections = user.linkSelection || [];
      const editingLink = user.editingLink;
      const allLinkIds = new Set([...linkSelections, ...(editingLink ? [editingLink] : [])]);
      for (const id of allLinkIds) {
        const list = map.get(id) || [];
        list.push({
          name: user.name,
          color: user.color,
          isEditing: editingLink === id,
        });
        map.set(id, list);
      }
    }
    // Structural equality check
    const prev = prevRemoteLinkMapRef.current;
    if (map.size === prev.size) {
      let identical = true;
      for (const [id, users] of map) {
        const prevUsers = prev.get(id);
        if (!prevUsers || prevUsers.length !== users.length) { identical = false; break; }
        for (let i = 0; i < users.length; i++) {
          if (users[i].name !== prevUsers[i].name || users[i].color !== prevUsers[i].color || users[i].isEditing !== prevUsers[i].isEditing) {
            identical = false; break;
          }
        }
        if (!identical) break;
      }
      if (identical) return prev;
    }
    prevRemoteLinkMapRef.current = map;
    return map;
  }, [remoteUsers]);

  // UI store for theme mode and canvas settings
  const pushMetadataImport = useUIStore((state) => state.pushMetadataImport);
  const themeMode = useUIStore((state) => state.themeMode);
  const snapToGrid = useUIStore((state) => state.snapToGrid);
  const showAlignGuides = useUIStore((state) => state.showAlignGuides);
  const gridSize = useUIStore((state) => state.gridSize);
  const toggleSnapToGrid = useUIStore((state) => state.toggleSnapToGrid);
  const toggleAlignGuides = useUIStore((state) => state.toggleAlignGuides);
  const showMinimap = useUIStore((state) => state.showMinimap);
  const toggleMinimap = useUIStore((state) => state.toggleMinimap);

  // Import placement mode
  const importPlacementMode = useUIStore((state) => state.importPlacementMode);
  const importPlacementData = useUIStore((state) => state.importPlacementData);
  const exitImportPlacementMode = useUIStore((state) => state.exitImportPlacementMode);

  // Calculate dimmed element IDs based on filters, focus, and insights highlighting
  // Stabilized: returns the same Set reference if contents haven't changed,
  // preventing unnecessary cascading to nodes and edges useMemos.
  const prevDimmedRef = useRef(new Set<string>());
  const dimmedElementIds = useMemo(() => {
    let newDimmed: Set<string>;

    // If insights highlighting is active, dim everything except highlighted elements
    if (insightsHighlightedIds.size > 0) {
      newDimmed = new Set<string>();
      elements.forEach((el) => {
        if (!insightsHighlightedIds.has(el.id)) {
          newDimmed.add(el.id);
        }
      });
    } else if (focusElementId) {
      // If in focus mode, dim everything except focus element and neighbors
      const visibleIds = getNeighborIds(focusElementId, links, focusDepth);
      newDimmed = new Set<string>();
      elements.forEach((el) => {
        if (!visibleIds.has(el.id)) {
          newDimmed.add(el.id);
        }
      });
    } else {
      // Otherwise use filter-based dimming
      newDimmed = getDimmedElementIds(elements, filters, hiddenElementIds);
    }

    // Stabilize reference: return previous Set if contents are identical
    const prev = prevDimmedRef.current;
    if (newDimmed.size === prev.size) {
      let same = true;
      for (const id of newDimmed) {
        if (!prev.has(id)) { same = false; break; }
      }
      if (same) return prev;
    }
    prevDimmedRef.current = newDimmed;
    return newDimmed;
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
    (elementId: string, width: number, height: number, position?: { x: number; y: number }) => {
      const element = elementMap.get(elementId);
      if (element) {
        updateElement(elementId, {
          visual: {
            customWidth: width,
            customHeight: height,
          },
        });
        // When resizing from non-bottom-right corners, NodeResizer changes the position
        if (position) {
          updateElementPositions([{ id: elementId, position }]);
        }
        // Switch back from localNodes to store-derived nodes
        isDraggingRef.current = false;
      }
    },
    [elementMap, updateElement, updateElementPositions]
  );

  // Handle element label change (inline editing)
  const handleElementLabelChange = useCallback(
    (elementId: string, newLabel: string) => {
      // Get the old label for undo
      const element = elementMap.get(elementId);
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
    [elementMap, updateElement, pushAction]
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
    onResize: (w: number, h: number, pos?: { x: number; y: number }) => void;
    onLabelChange: (val: string) => void;
  }>());

  function getCallbacks(elementId: string, isAnnotation: boolean) {
    let cached = callbacksCache.current.get(elementId);
    if (!cached) {
      cached = {
        onResize: (w: number, h: number, pos?: { x: number; y: number }) => handleResizeRef.current(elementId, w, h, pos),
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
  // Incremental: only rebuild structures for elements whose reference changed.
  // When 1 element changes out of 3000, only 1 structure is rebuilt.
  type NodeStructure = { el: Element; thumbnail: string | null; isLoadingAsset: boolean; unresolvedCommentCount: number; badgeProperty: { value: string; type: string } | null; displayedPropertyValues: { key: string; value: string }[] };
  const prevElementsByIdRef = useRef(new Map<string, Element>());
  const nodeStructureCacheRef = useRef(new Map<string, NodeStructure>());

  const nodeStructures = useMemo(() => {
    const prevElements = prevElementsByIdRef.current;
    const cache = nodeStructureCacheRef.current;

    const buildStructure = (el: Element): NodeStructure => {
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
    };

    // Tab filtering: on "Tous" all elements pass, on specific tab only members + ghosts
    const visible = elements.filter((el) => {
      if (hiddenElementIds.has(el.id)) return false;
      if (activeTabId !== null && !tabMemberSet.has(el.id) && !localGhostIds.has(el.id)) return false;
      return true;
    });

    const result = visible.map(el => {
      // Reuse cached structure if element reference AND comment count are unchanged
      const cached = cache.get(el.id);
      if (cached && prevElements.get(el.id) === el &&
          cached.unresolvedCommentCount === (commentCountMap.get(el.id) || 0)) {
        return cached;
      }
      const ns = buildStructure(el);
      cache.set(el.id, ns);
      return ns;
    });

    // Update tracking refs
    const newPrev = new Map<string, Element>();
    for (const el of visible) newPrev.set(el.id, el);
    prevElementsByIdRef.current = newPrev;

    // Clean removed elements from cache
    for (const id of cache.keys()) {
      if (!newPrev.has(id)) cache.delete(id);
    }

    return result;
  }, [elements, hiddenElementIds, assetMap, commentCountMap, filters.badgePropertyKey, displayedProperties, activeTabId, tabMemberSet, localGhostIds]);

  // --- Measured dimensions cache ---
  // React Flow (controlled mode) sends dimension changes via onNodesChange after ResizeObserver
  // measurement. We must persist these on our node objects so the MiniMap's nodeHasDimensions()
  // check passes. Without this, nodes never get `measured` set and the MiniMap is empty.
  const measuredDimensionsRef = useRef(new Map<string, { width: number; height: number }>());

  // --- Phase B: Final node assembly (incremental patching for performance) ---
  // Instead of rebuilding ALL nodes on every visual change (selection, dimming, remote presence),
  // we only rebuild nodes whose visual state actually changed. Unchanged nodes keep the same
  // object reference, so React.memo (arePropsEqual) skips re-rendering them entirely.
  const prevNodesRef = useRef<Node[]>([]);
  const prevNodeStructuresByIdRef = useRef(new Map<string, typeof nodeStructures[number]>());
  const prevNodesByIdRef = useRef(new Map<string, Node>());
  const prevSelectedIdsRef = useRef(selectedElementIds);
  const prevDimmedIdsRef = useRef(dimmedElementIds);
  const prevEditingIdRef = useRef(editingElementId);
  const prevRemoteUsersRef = useRef(remoteUsersByElement);
  const prevShowConfRef = useRef(showConfidenceIndicator);
  const prevTagModeRef = useRef(tagDisplayMode);
  const prevTagSizeRef = useRef(tagDisplaySize);
  const prevThemeRef = useRef(themeMode);
  const prevTabMemberSetRef = useRef(tabMemberSet);

  const nodes = useMemo(() => {
    const globalSettingsChanged =
      prevShowConfRef.current !== showConfidenceIndicator ||
      prevTagModeRef.current !== tagDisplayMode ||
      prevTagSizeRef.current !== tagDisplaySize ||
      prevThemeRef.current !== themeMode;

    // Helper: build a single node from its structure
    const buildNode = (ns: typeof nodeStructures[number]) => {
      const callbacks = getCallbacks(ns.el.id, Boolean(ns.el.isAnnotation));
      const node = elementToNode(
        ns.el,
        selectedElementIds.has(ns.el.id),
        dimmedElementIds.has(ns.el.id),
        ns.thumbnail,
        callbacks.onResize,
        editingElementId === ns.el.id,
        remoteUsersByElement.get(ns.el.id),
        callbacks.onLabelChange,
        stopEditing,
        ns.unresolvedCommentCount,
        ns.isLoadingAsset,
        ns.badgeProperty,
        showConfidenceIndicator,
        ns.displayedPropertyValues,
        tagDisplayMode,
        tagDisplaySize,
        themeMode,
        activeTabId !== null && !tabMemberSet.has(ns.el.id),
      );
      // Restore measured dimensions so React Flow's MiniMap nodeHasDimensions() returns true
      const dims = measuredDimensionsRef.current.get(ns.el.id);
      if (dims) {
        (node as any).measured = dims;
      }
      return node;
    };

    // Full rebuild on first render or global settings change (theme, tag mode, etc.)
    if (globalSettingsChanged || prevNodesRef.current.length === 0) {
      const result = nodeStructures.map(buildNode)
        .sort((a, b) => {
          if (a.type === 'groupFrame' && b.type !== 'groupFrame') return -1;
          if (a.type !== 'groupFrame' && b.type === 'groupFrame') return 1;
          return 0;
        });
      prevNodesRef.current = result;
      const newStructMap = new Map<string, typeof nodeStructures[number]>();
      const newNodeMap = new Map<string, Node>();
      for (let i = 0; i < nodeStructures.length; i++) {
        newStructMap.set(nodeStructures[i].el.id, nodeStructures[i]);
        newNodeMap.set(result[i].id, result[i]);
      }
      prevNodeStructuresByIdRef.current = newStructMap;
      prevNodesByIdRef.current = newNodeMap;
      prevSelectedIdsRef.current = selectedElementIds;
      prevDimmedIdsRef.current = dimmedElementIds;
      prevEditingIdRef.current = editingElementId;
      prevRemoteUsersRef.current = remoteUsersByElement;
      prevShowConfRef.current = showConfidenceIndicator;
      prevTagModeRef.current = tagDisplayMode;
      prevTagSizeRef.current = tagDisplaySize;
      prevThemeRef.current = themeMode;
      return result;
    }

    // Incremental: identify which nodes need rebuilding
    const needsRebuild = new Set<string>();
    const structMap = prevNodeStructuresByIdRef.current;
    const nodeMap = prevNodesByIdRef.current;

    // Structure diff + update refs in single pass
    // Also collect changed structures for lookup during patching
    const changedStructures = new Map<string, typeof nodeStructures[number]>();
    for (const ns of nodeStructures) {
      if (structMap.get(ns.el.id) !== ns) {
        needsRebuild.add(ns.el.id);
        changedStructures.set(ns.el.id, ns);
      }
      structMap.set(ns.el.id, ns); // Mutate ref in place
    }

    // Selection diff
    if (prevSelectedIdsRef.current !== selectedElementIds) {
      for (const id of selectedElementIds) {
        if (!prevSelectedIdsRef.current.has(id)) needsRebuild.add(id);
      }
      for (const id of prevSelectedIdsRef.current) {
        if (!selectedElementIds.has(id)) needsRebuild.add(id);
      }
    }

    // Dimmed diff (often skipped: dimmedElementIds is now reference-stable)
    if (prevDimmedIdsRef.current !== dimmedElementIds) {
      for (const id of dimmedElementIds) {
        if (!prevDimmedIdsRef.current.has(id)) needsRebuild.add(id);
      }
      for (const id of prevDimmedIdsRef.current) {
        if (!dimmedElementIds.has(id)) needsRebuild.add(id);
      }
    }

    // Editing diff
    if (prevEditingIdRef.current !== editingElementId) {
      if (prevEditingIdRef.current) needsRebuild.add(prevEditingIdRef.current);
      if (editingElementId) needsRebuild.add(editingElementId);
    }

    // Remote presence diff
    if (prevRemoteUsersRef.current !== remoteUsersByElement) {
      const allRemoteIds = new Set([
        ...remoteUsersByElement.keys(),
        ...prevRemoteUsersRef.current.keys(),
      ]);
      for (const id of allRemoteIds) {
        if (remoteUsersByElement.get(id) !== prevRemoteUsersRef.current.get(id)) {
          needsRebuild.add(id);
        }
      }
    }

    // Ghost status diff (membership change: member ↔ ghost)
    if (prevTabMemberSetRef.current !== tabMemberSet) {
      for (const ns of nodeStructures) {
        const wasMember = prevTabMemberSetRef.current.has(ns.el.id);
        const isMember = tabMemberSet.has(ns.el.id);
        if (wasMember !== isMember) needsRebuild.add(ns.el.id);
      }
    }

    // Update visual state refs
    prevSelectedIdsRef.current = selectedElementIds;
    prevDimmedIdsRef.current = dimmedElementIds;
    prevEditingIdRef.current = editingElementId;
    prevRemoteUsersRef.current = remoteUsersByElement;
    prevTabMemberSetRef.current = tabMemberSet;

    // Detect additions/removals by comparing count
    const hasAdditionsOrRemovals = nodeStructures.length !== prevNodesRef.current.length;

    if (hasAdditionsOrRemovals) {
      // Rebuild array structure but reuse unchanged node objects
      const result = nodeStructures.map(ns => {
        if (!needsRebuild.has(ns.el.id)) {
          const existing = nodeMap.get(ns.el.id);
          if (existing) return existing;
        }
        const newNode = buildNode(ns);
        nodeMap.set(ns.el.id, newNode); // Mutate ref in place
        return newNode;
      }).sort((a, b) => {
        if (a.type === 'groupFrame' && b.type !== 'groupFrame') return -1;
        if (a.type !== 'groupFrame' && b.type === 'groupFrame') return 1;
        return 0;
      });

      // Clean removed elements from structMap/nodeMap
      if (nodeStructures.length < prevNodesRef.current.length) {
        const currentIds = new Set(nodeStructures.map(ns => ns.el.id));
        for (const id of nodeMap.keys()) {
          if (!currentIds.has(id)) { nodeMap.delete(id); structMap.delete(id); }
        }
      }

      prevNodesRef.current = result;
      return result;
    }

    // No additions/removals: early exit when nothing changed
    if (needsRebuild.size === 0) {
      return prevNodesRef.current;
    }

    // Patch only affected nodes — unchanged nodes keep same object reference
    const result = prevNodesRef.current.map(node => {
      if (!needsRebuild.has(node.id)) return node; // Same reference = React.memo skip
      const ns = changedStructures.get(node.id) ?? structMap.get(node.id);
      if (!ns) return node;
      const newNode = buildNode(ns);
      nodeMap.set(node.id, newNode); // Mutate ref in place
      return newNode;
    });

    prevNodesRef.current = result;
    return result;
  }, [nodeStructures, selectedElementIds, dimmedElementIds, editingElementId, stopEditing, showConfidenceIndicator, tagDisplayMode, tagDisplaySize, themeMode, remoteUsersByElement, activeTabId, tabMemberSet]);

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

  // --- Stable edge callback refs (eliminates closure recreations per edge recalc) ---
  const handleLinkLabelChangeRef = useRef(handleLinkLabelChange);
  const handleCurveOffsetChangeRef = useRef(handleCurveOffsetChange);
  const selectLinkRef = useRef(selectLink);
  const startEditingLinkRef = useRef(startEditingLink);

  useEffect(() => {
    handleLinkLabelChangeRef.current = handleLinkLabelChange;
    handleCurveOffsetChangeRef.current = handleCurveOffsetChange;
    selectLinkRef.current = selectLink;
    startEditingLinkRef.current = startEditingLink;
  });

  const edgeCallbacksCache = useRef(new Map<string, {
    onLabelChange: (newLabel: string) => void;
    onCurveOffsetChange: (offset: { x: number; y: number }) => void;
    onStartEditing: () => void;
  }>());

  function getEdgeCallbacks(linkId: string) {
    let cached = edgeCallbacksCache.current.get(linkId);
    if (!cached) {
      cached = {
        onLabelChange: (newLabel: string) => handleLinkLabelChangeRef.current(linkId, newLabel),
        onCurveOffsetChange: (offset: { x: number; y: number }) => handleCurveOffsetChangeRef.current(linkId, offset),
        onStartEditing: () => {
          selectLinkRef.current(linkId);
          startEditingLinkRef.current(linkId);
        },
      };
      edgeCallbacksCache.current.set(linkId, cached);
    }
    return cached;
  }

  // Clean stale entries from edge callbacks cache when links change
  useEffect(() => {
    const currentIds = new Set(links.map(l => l.id));
    for (const id of edgeCallbacksCache.current.keys()) {
      if (!currentIds.has(id)) edgeCallbacksCache.current.delete(id);
    }
  }, [links]);

  // Dragging state refs (no state to avoid re-renders during drag)
  const isDraggingRef = useRef(false);
  const draggingNodeIdsRef = useRef<Set<string>>(new Set());
  // lastDragEndRef removed — no longer needed after eliminating useLayoutEffect double-render
  const isHandlingSelectionRef = useRef(false);

  // Ref for sync mode - used inside handleNodesChange without adding it as dependency
  const syncModeRef = useRef(syncMode);
  syncModeRef.current = syncMode;

  // Local nodes state for smooth drag - ReactFlow controls this during drag
  const [localNodes, setLocalNodes] = useState<Node[]>(nodes);

  // Ref to access latest nodes from store in handleNodesChange without adding as dep
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  // Alignment guides state
  const [_activeGuides, setActiveGuides] = useState<Guide[]>([]);
  const [draggedNodeInfo, setDraggedNodeInfo] = useState<{ id: string; position: { x: number; y: number } } | null>(null);
  const lastGuideUpdateRef = useRef<number>(0);
  const GUIDE_THROTTLE_MS = 100;

  // Use store-derived nodes when not dragging (avoids double render),
  // local nodes during drag for smooth visual updates
  const displayNodes = isDraggingRef.current ? localNodes : nodes;

  // Track node positions in a ref (updated every frame, but doesn't trigger re-renders)
  const nodePositionsRef = useRef(new Map<string, Position>());
  // Version counter to trigger edge recomputation on drag-end / structural changes
  const [edgeVersion, setEdgeVersion] = useState(0);
  const edgeVersionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    // Debounced edge recomputation: during continuous remote updates, edges
    // only rebuild ~3/sec instead of on every position change. The positions
    // ref is always up-to-date, so handles will be correct once edges rebuild.
    if (!isDraggingRef.current && !isViewportMovingRef.current) {
      if (edgeVersionTimerRef.current) clearTimeout(edgeVersionTimerRef.current);
      edgeVersionTimerRef.current = setTimeout(() => {
        setEdgeVersion(v => v + 1);
        edgeVersionTimerRef.current = null;
      }, 300);
    }
  }, [displayNodes]);

  // --- Edge computation: viewport culling → cap → simplification → progressive rendering ---
  const MAX_RENDERED_EDGES = 800;
  const SIMPLE_EDGE_THRESHOLD = 200;

  // Cache previous edges by ID for incremental patching (selection/dimming changes)
  const prevEdgeCacheRef = useRef(new Map<string, Edge>());
  // Stable reference: avoid creating a new array when all edges are cache hits
  const prevEdgesArrayRef = useRef<Edge[]>([]);

  const allEdges = useMemo(() => {
    const nodePositions = nodePositionsRef.current;
    const edgeCache = prevEdgeCacheRef.current;

    // Skip edge computation until node positions are initialized.
    // At first render, nodePositionsRef is empty — computing edges with unknown positions
    // wastes CPU (all links pass culling) and produces edges with incorrect auto-handles.
    // Edges will be computed once edgeVersion bumps after positions are populated.
    if (nodePositions.size === 0 && links.length > 0) {
      return [];
    }

    // Viewport culling: filter edges whose both endpoints are off-screen
    const cv = cullingViewportRef.current;
    const bufferPx = 200;
    const vLeft = (-cv.x - bufferPx) / cv.zoom;
    const vTop = (-cv.y - bufferPx) / cv.zoom;
    const vRight = (-cv.x + (wrapperSize.width + bufferPx)) / cv.zoom;
    const vBottom = (-cv.y + (wrapperSize.height + bufferPx)) / cv.zoom;

    const visibleLinks = links.filter(link => {
      const fromPos = nodePositions.get(link.fromId);
      const toPos = nodePositions.get(link.toId);
      if (!fromPos || !toPos) return true;
      const fromVisible = fromPos.x >= vLeft && fromPos.x <= vRight && fromPos.y >= vTop && fromPos.y <= vBottom;
      const toVisible = toPos.x >= vLeft && toPos.x <= vRight && toPos.y >= vTop && toPos.y <= vBottom;
      return fromVisible || toVisible;
    });

    // Cap edges: prioritize selected, then connected-to-selected, then rest
    let cappedLinks = visibleLinks;
    if (visibleLinks.length > MAX_RENDERED_EDGES) {
      const selected: Link[] = [];
      const connectedToSelected: Link[] = [];
      const rest: Link[] = [];
      for (const link of visibleLinks) {
        if (selectedLinkIds.has(link.id)) {
          selected.push(link);
        } else if (selectedElementIds.has(link.fromId) || selectedElementIds.has(link.toId)) {
          connectedToSelected.push(link);
        } else {
          rest.push(link);
        }
      }
      const budget = MAX_RENDERED_EDGES - selected.length - connectedToSelected.length;
      cappedLinks = [...selected, ...connectedToSelected, ...rest.slice(0, Math.max(0, budget))];
    }

    // Build parallel edges lookup
    const pairGroupMap = new Map<string, string[]>();
    for (const link of cappedLinks) {
      const pairKey = link.fromId < link.toId
        ? `${link.fromId}-${link.toId}`
        : `${link.toId}-${link.fromId}`;
      let group = pairGroupMap.get(pairKey);
      if (!group) { group = []; pairGroupMap.set(pairKey, group); }
      group.push(link.id);
    }
    const parallelLookup = new Map<string, { index: number; count: number }>();
    for (const group of pairGroupMap.values()) {
      for (let i = 0; i < group.length; i++) {
        parallelLookup.set(group[i], { index: i, count: group.length });
      }
    }

    const useSimpleEdges = cappedLinks.length > SIMPLE_EDGE_THRESHOLD;

    const newCache = new Map<string, Edge>();
    const result = cappedLinks.map(link => {
      const isSelected = selectedLinkIds.has(link.id);
      const isLinkDimmed = dimmedElementIds.has(link.fromId) || dimmedElementIds.has(link.toId);
      const simplified = useSimpleEdges && !isSelected;

      // Reuse cached edge if visual state is unchanged (same reference → memo skip)
      const cached = edgeCache.get(link.id);
      if (cached) {
        const cd = cached.data as any;
        // Check that the link data itself hasn't changed (reference equality — Zustand immutability)
        // AND that global settings affecting edge rendering haven't changed
        const linkUnchanged = cd?._linkRef === link;
        const globalsUnchanged = cd?._curveMode === linkCurveMode
          && cd?._anchorMode === linkAnchorMode
          && cd?._showConfidence === showConfidenceIndicator;
        if (linkUnchanged && globalsUnchanged) {
          const sameVisuals = cached.selected === isSelected
            && cd?.isDimmed === isLinkDimmed
            && (cached.type === 'simple') === simplified;
          if (sameVisuals) {
            // In auto anchor mode, verify handles are still optimal for current positions
            let handlesStale = false;
            if (linkAnchorMode === 'auto') {
              const sourcePos = nodePositions.get(link.fromId);
              const targetPos = nodePositions.get(link.toId);
              if (sourcePos && targetPos) {
                const best = calculateBestHandles(sourcePos, targetPos);
                handlesStale = cached.sourceHandle !== best.sourceHandle || cached.targetHandle !== best.targetHandle;
              }
            }
            if (!handlesStale) {
              if (simplified) {
                newCache.set(link.id, cached);
                return cached;
              }
              // CustomEdge: also check editing, remote users, parallel layout
              const sameEditing = cd?.isEditing === (editingLinkId === link.id);
              const sameRemote = remoteUsersByLink.get(link.id) === cd?.remoteLinkSelectors;
              const parallel = parallelLookup.get(link.id);
              const sameParallel = cd?._parallelIndex === parallel?.index && cd?._parallelCount === parallel?.count;
              if (sameEditing && sameRemote && sameParallel) {
                newCache.set(link.id, cached);
                return cached;
              }
            }
          }
        }
      }

      let edge: Edge;
      if (simplified) {
        edge = linkToEdge(
          link, isSelected, isLinkDimmed, nodePositions,
          linkAnchorMode, linkCurveMode,
          undefined, undefined, undefined, undefined,
          undefined, undefined, undefined, undefined, undefined, undefined,
          true
        );
      } else {
        const edgeCbs = getEdgeCallbacks(link.id);
        const parallel = parallelLookup.get(link.id)!;

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

        edge = linkToEdge(
          link, isSelected, isLinkDimmed, nodePositions,
          linkAnchorMode, linkCurveMode,
          editingLinkId === link.id,
          edgeCbs.onLabelChange, stopEditing, edgeCbs.onStartEditing,
          parallel.index, parallel.count,
          edgeCbs.onCurveOffsetChange,
          showConfidenceIndicator, linkDisplayedPropertyValues,
          remoteUsersByLink.get(link.id)
        );
      }

      // Stamp cache metadata for next comparison
      const edgeData = edge.data as any;
      edgeData._linkRef = link;
      edgeData._curveMode = linkCurveMode;
      edgeData._anchorMode = linkAnchorMode;
      edgeData._showConfidence = showConfidenceIndicator;
      if (!simplified) {
        const parallel = parallelLookup.get(link.id);
        edgeData._parallelIndex = parallel?.index;
        edgeData._parallelCount = parallel?.count;
      }
      newCache.set(link.id, edge);
      return edge;
    });

    prevEdgeCacheRef.current = newCache;

    // Referential stability: if all edges are the same objects as previous array,
    // return the previous array to avoid triggering downstream re-renders.
    const prev = prevEdgesArrayRef.current;
    if (prev.length === result.length && result.every((e, i) => e === prev[i])) {
      return prev;
    }
    prevEdgesArrayRef.current = result;
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, edgeVersion, wrapperSize, selectedLinkIds, selectedElementIds, dimmedElementIds, linkAnchorMode, linkCurveMode, editingLinkId, stopEditing, showConfidenceIndicator, displayedProperties, remoteUsersByLink]);

  // Progressive edge rendering: avoid injecting 800+ edges at once into the DOM.
  // Start with a small batch and grow to full count over a few frames.
  // Only reset when the SET of visible edges changes (not on selection/dimming changes).
  const EDGE_BATCH_SIZE = 250;
  const [edgeRenderLimit, setEdgeRenderLimit] = useState(EDGE_BATCH_SIZE);
  const edgeProgressionRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevEdgeIdsRef = useRef<string[]>([]);

  useEffect(() => {
    const prevIds = prevEdgeIdsRef.current;
    const currentIds = allEdges.map(e => e.id);
    prevEdgeIdsRef.current = currentIds;

    // Check if edge set changed structurally (different IDs or order)
    const structuralChange = prevIds.length !== currentIds.length ||
      currentIds.some((id, i) => id !== prevIds[i]);

    if (!structuralChange) {
      // Visual-only change (selection/dimming) — show all immediately, no progressive reset
      setEdgeRenderLimit(allEdges.length);
      return;
    }

    // Structural change — progressive rendering
    if (allEdges.length <= EDGE_BATCH_SIZE) {
      setEdgeRenderLimit(allEdges.length);
      return;
    }

    setEdgeRenderLimit(EDGE_BATCH_SIZE);
    if (edgeProgressionRef.current) clearTimeout(edgeProgressionRef.current);

    let current = EDGE_BATCH_SIZE;
    const step = () => {
      current = Math.min(current + EDGE_BATCH_SIZE, allEdges.length);
      setEdgeRenderLimit(current);
      if (current < allEdges.length) {
        edgeProgressionRef.current = setTimeout(step, 60);
      }
    };
    edgeProgressionRef.current = setTimeout(step, 60);

    return () => { if (edgeProgressionRef.current) clearTimeout(edgeProgressionRef.current); };
  }, [allEdges]);

  const edges = edgeRenderLimit >= allEdges.length
    ? allEdges
    : allEdges.slice(0, edgeRenderLimit);


  // Track starting positions for undo
  const dragStartPositionsRef = useRef<Map<string, Position>>(new Map());

  // Throttle for position sync during drag (for collaboration)
  const lastDragSyncRef = useRef<number>(0);
  const DRAG_SYNC_THROTTLE_MS = 200; // Sync positions every 200ms during drag (reduced for performance)

  // Handle node changes (position, selection)
  // HYBRID: Apply position changes locally for smooth drag, sync to Zustand periodically and on drag end
  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      // Filter out changes we handle ourselves:
      // - 'remove': deletion controlled by Zustand
      // - 'select': selection controlled by selectionStore (avoid double-processing)
      // - 'position' on locked elements
      const safeChanges = changes.filter(c => {
        if (c.type === 'remove') return false;
        if (c.type === 'select') return false;
        if (c.type === 'position') {
          const element = elementMap.get(c.id);
          if (element?.isPositionLocked) return false;
        }
        return true;
      });
      if (safeChanges.length === 0) return;

      // Capture dimension changes from React Flow's ResizeObserver measurement.
      // In controlled mode, React Flow doesn't internally apply these — we must persist
      // them so the MiniMap (which checks nodeHasDimensions on the user node) can render.
      // Mutate existing node objects in-place: React 18 batches the zustand set({}) from
      // updateNodeInternals with our mutation, so the MiniMap sees measured dims on re-render.
      for (const change of safeChanges) {
        if (change.type === 'dimensions' && 'dimensions' in change && change.dimensions) {
          measuredDimensionsRef.current.set(change.id, change.dimensions as { width: number; height: number });
          // Mutate current node object so the MiniMap picks it up immediately
          const existing = nodesRef.current.find(n => n.id === change.id);
          if (existing) {
            (existing as any).measured = { ...change.dimensions };
          }
        }
      }

      // Track dragging state BEFORE applying changes to localNodes
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
            const element = elementMap.get(change.id);
            if (element) {
              dragStartPositionsRef.current.set(change.id, { ...element.position });
            }
          }
        }
      }

      const wasDragging = isDraggingRef.current;
      const isNowDragging = nowDragging.size > 0;

      // Apply changes to local nodes only during drag/resize (for smooth visual updates).
      // When not dragging, displayNodes uses `nodes` directly → avoids double render.
      if (!wasDragging && isNowDragging) {
        // Drag START: initialize localNodes from current store-derived nodes
        isDraggingRef.current = true;
        setLocalNodes(applyNodeChanges(safeChanges, nodesRef.current));
      } else if (wasDragging && isNowDragging) {
        // DURING drag: update localNodes incrementally
        setLocalNodes(nds => applyNodeChanges(safeChanges, nds));
      } else if (wasDragging && !isNowDragging) {
        // Drag END or DURING resize: keep isDraggingRef = true for now.
        // It will be set to false AFTER updateElementPositions updates the store,
        // so displayNodes = nodes already has the final positions when the switch happens.
        setLocalNodes(nds => applyNodeChanges(safeChanges, nds));
      } else if (!isNowDragging && positionChanges.some(c => c.position)) {
        // Non-drag position changes (e.g., from NodeResizer on non-bottom-right corners).
        // Switch to localNodes mode so the node visually moves during resize.
        isDraggingRef.current = true;
        setLocalNodes(applyNodeChanges(safeChanges, nodesRef.current));
      }

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
          const guides = computeGuides(update.id, update.position, nodesRef.current);
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

        draggingNodeIdsRef.current.clear();

        // Clear alignment guides
        setDraggedNodeInfo(null);
        setActiveGuides([]);

        // Update store FIRST (synchronous), then release isDraggingRef.
        // This ensures displayNodes = nodes has the final positions when the switch happens.
        updateElementPositions(updates);
        isDraggingRef.current = false;

        // Trigger edge recomputation now that drag is done (cancel any pending debounce)
        if (edgeVersionTimerRef.current) {
          clearTimeout(edgeVersionTimerRef.current);
          edgeVersionTimerRef.current = null;
        }
        setEdgeVersion(v => v + 1);
      }
    },
    [updateElementPositions, updateDragging, elementMap, pushAction, showAlignGuides]
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

      const element = elementMap.get(node.id);
      if (element) {
        // Find first previewable asset (image or PDF)
        const previewableAsset = element.assetIds
          .map(id => assets.find(a => a.id === id))
          .find(a => a && (a.mimeType.startsWith('image/') || a.mimeType === 'application/pdf')) || null;

        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          elementId: element.id,
          elementLabel: element.label || t('empty.unnamed'),
          previewAsset: previewableAsset,
        });
      }
    },
    [elementMap, assets]
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
    (event: MouseEvent | React.MouseEvent<globalThis.Element, MouseEvent>) => {
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

    // Auto-add to active tab
    if (activeTabId) {
      addTabMembers(activeTabId, [newElement.id]);
    }

    // Save for undo
    pushAction({
      type: 'create-element',
      undo: {},
      redo: { elements: [newElement], elementIds: [newElement.id] },
    });

    // Select the new element
    selectElement(newElement.id);
  }, [canvasContextMenu, createElement, selectElement, pushAction, activeTabId, addTabMembers]);

  // Create group from canvas context menu
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

    // Auto-add to active tab
    if (activeTabId) {
      addTabMembers(activeTabId, [annotation.id]);
    }

    selectElement(annotation.id);
  }, [canvasContextMenu, createElement, selectElement, activeTabId, addTabMembers]);

  // Selection handlers for canvas context menu (work without contextMenu state)
  const handleSelectionCopy = useCallback(() => {
    const selectedEls = getSelectedElementIds();
    if (selectedEls.length === 0) return;
    const elsToCopy = elements.filter(el => selectedEls.includes(el.id));
    if (elsToCopy.length > 0) {
      copiedElementsRef.current = elsToCopy;
      setHasCopiedElements(true);
      const clipboardData = buildClipboardData(selectedEls, [...selectedLinkIds]);
      navigator.clipboard.writeText(clipboardData).catch(() => {});
    }
  }, [elements, getSelectedElementIds, selectedLinkIds, buildClipboardData]);

  const handleSelectionCut = useCallback(async () => {
    const selectedEls = getSelectedElementIds();
    if (selectedEls.length === 0) return;
    const elsToCut = elements.filter(el => selectedEls.includes(el.id));
    if (elsToCut.length > 0) {
      copiedElementsRef.current = elsToCut;
      setHasCopiedElements(true);
      const clipboardData = buildClipboardData(selectedEls, [...selectedLinkIds]);
      navigator.clipboard.writeText(clipboardData).catch(() => {});
      // Save for undo
      const relevantLinks = links.filter(l => selectedEls.includes(l.fromId) || selectedEls.includes(l.toId));
      const tabMembership = captureTabMembership(selectedEls);
      pushAction({
        type: 'delete-elements',
        undo: { elements: elsToCut, links: relevantLinks, tabMembership },
        redo: { elementIds: selectedEls, linkIds: relevantLinks.map(l => l.id) },
      });
      await deleteElements(selectedEls);
      clearSelection();
    }
  }, [elements, links, getSelectedElementIds, selectedLinkIds, deleteElements, clearSelection, pushAction, buildClipboardData]);

  const handleSelectionDuplicate = useCallback(async () => {
    const selectedEls = getSelectedElementIds();
    if (selectedEls.length === 0 || !currentInvestigation) return;
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
        investigationId: currentInvestigation.id,
        position: { x: el.position.x + offset, y: el.position.y + offset },
        parentGroupId: null,
        createdAt: now,
        updatedAt: now,
      };
    });

    const elIdSet = new Set(selectedEls);
    const relevantLinks = links.filter(l => elIdSet.has(l.fromId) && elIdSet.has(l.toId));
    const newLinks: Link[] = relevantLinks.map(link => ({
      ...link,
      id: generateUUID(),
      investigationId: currentInvestigation.id,
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
      redo: { elements: newElements, elementIds: newElementIds, linkIds: newLinkIds },
    });
    selectElements(newElementIds);
  }, [elements, links, getSelectedElementIds, currentInvestigation, pasteElements, selectElements, pushAction, activeTabId, addTabMembers]);

  const handleSelectionDelete = useCallback(async () => {
    const selectedEls = getSelectedElementIds();
    if (selectedEls.length === 0) return;
    const elsToDelete = elements.filter(el => selectedEls.includes(el.id));
    const relevantLinks = links.filter(l => selectedEls.includes(l.fromId) || selectedEls.includes(l.toId));
    const tabMembership = captureTabMembership(selectedEls);
    pushAction({
      type: 'delete-elements',
      undo: { elements: elsToDelete, links: relevantLinks, tabMembership },
      redo: { elementIds: selectedEls, linkIds: relevantLinks.map(l => l.id) },
    });
    await deleteElements(selectedEls);
    clearSelection();
  }, [elements, links, getSelectedElementIds, deleteElements, clearSelection, pushAction]);

  const handleSelectionHide = useCallback(() => {
    const selectedEls = getSelectedElementIds();
    if (selectedEls.length === 0) return;
    hideElements(selectedEls);
    clearSelection();
  }, [getSelectedElementIds, hideElements, clearSelection]);

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
        // Auto-add to active tab
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
    if (pastedFromClipboard || copiedElementsRef.current.length === 0) return;

    const now = new Date();
    const oldToNewIdMap = new Map<string, string>();

    // Calculate center of copied elements and offset to paste position
    const sumX = copiedElementsRef.current.reduce((sum, el) => sum + el.position.x, 0);
    const sumY = copiedElementsRef.current.reduce((sum, el) => sum + el.position.y, 0);
    const centerX = sumX / copiedElementsRef.current.length;
    const centerY = sumY / copiedElementsRef.current.length;

    // Build all elements centered at paste position
    const newElements: Element[] = copiedElementsRef.current.map(el => {
      const newId = generateUUID();
      oldToNewIdMap.set(el.id, newId);
      return {
        ...el,
        id: newId,
        investigationId: currentInvestigation!.id,
        position: {
          x: canvasX + (el.position.x - centerX),
          y: canvasY + (el.position.y - centerY),
        },
        parentGroupId: null,
        createdAt: now,
        updatedAt: now,
      };
    });

    // Build all links between copied elements
    const copiedIds = new Set(copiedElementsRef.current.map(el => el.id));
    const relevantLinks = links.filter(l =>
      copiedIds.has(l.fromId) && copiedIds.has(l.toId)
    );
    const newLinks: Link[] = relevantLinks.map(link => ({
      ...link,
      id: generateUUID(),
      investigationId: currentInvestigation!.id,
      fromId: oldToNewIdMap.get(link.fromId)!,
      toId: oldToNewIdMap.get(link.toId)!,
      createdAt: now,
      updatedAt: now,
    })).filter(l => l.fromId && l.toId);

    // Single Y.js transaction
    pasteElements(newElements, newLinks);

    // Save for undo (include both element and link IDs)
    const newElementIds = newElements.map(el => el.id);
    if (activeTabId) {
      addTabMembers(activeTabId, newElementIds);
    }
    const newLinkIds = newLinks.map(l => l.id);
    pushAction({
      type: 'create-elements',
      undo: {},
      redo: { elements: newElements, elementIds: newElementIds, linkIds: newLinkIds },
    });

    // Select all pasted elements
    selectElements(newElementIds);
  }, [canvasContextMenu, links, currentInvestigation, pasteElements, selectElements, pushAction, addAsset, activeTabId, addTabMembers]);

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
      const elementId = contextMenu.elementId;
      // Collect data for undo
      const el = elementMap.get(elementId);
      const elementsToDelete = el ? [el] : [];
      const linksToDelete = links.filter(l => l.fromId === elementId || l.toId === elementId);
      const tabMembership = captureTabMembership([elementId]);
      pushAction({
        type: 'delete-elements',
        undo: { elements: elementsToDelete, links: linksToDelete, tabMembership },
        redo: { elementIds: [elementId] },
      });
      await deleteElements([elementId]);
      clearSelection();
    }
  }, [contextMenu, elementMap, links, deleteElements, clearSelection, pushAction]);

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
      const elementIds = elsToCopy.map(el => el.id);
      const clipboardData = buildClipboardData(elementIds, [...selectedLinkIds]);
      navigator.clipboard.writeText(clipboardData).catch(() => {});
    }
  }, [elements, getSelectedElementIds, contextMenu, selectedLinkIds, buildClipboardData]);

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
      const elementIds = elsToCut.map(el => el.id);
      const clipboardData = buildClipboardData(elementIds, [...selectedLinkIds]);
      navigator.clipboard.writeText(clipboardData).catch(() => {});

      // Then delete
      const idsToDelete = elsToCut.map(el => el.id);
      const linksToDelete = links.filter(l =>
        idsToDelete.includes(l.fromId) || idsToDelete.includes(l.toId)
      );

      const tabMembership = captureTabMembership(idsToDelete);
      pushAction({
        type: 'delete-elements',
        undo: { elements: elsToCut, links: linksToDelete, tabMembership },
        redo: { elementIds: idsToDelete },
      });

      await deleteElements(idsToDelete);
      clearSelection();
    }
  }, [elements, links, getSelectedElementIds, contextMenu, selectedLinkIds, deleteElements, clearSelection, pushAction, buildClipboardData]);

  // Paste handler for context menu (paste at context menu position)
  const handleContextMenuPaste = useCallback(() => {
    if (copiedElementsRef.current.length === 0) return;
    if (!reactFlowWrapper.current || !contextMenu) return;

    const now = new Date();
    const oldToNewIdMap = new Map<string, string>();

    // Calculate paste position relative to context menu click
    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const pasteX = (contextMenu.x - bounds.left - viewport.x) / viewport.zoom;
    const pasteY = (contextMenu.y - bounds.top - viewport.y) / viewport.zoom;

    // Calculate center of copied elements
    const sumX = copiedElementsRef.current.reduce((sum, el) => sum + el.position.x, 0);
    const sumY = copiedElementsRef.current.reduce((sum, el) => sum + el.position.y, 0);
    const centerX = sumX / copiedElementsRef.current.length;
    const centerY = sumY / copiedElementsRef.current.length;

    // Build all elements with positions centered at paste position
    const newElements: Element[] = copiedElementsRef.current.map(el => {
      const newId = generateUUID();
      oldToNewIdMap.set(el.id, newId);
      return {
        ...el,
        id: newId,
        investigationId: currentInvestigation!.id,
        position: {
          x: pasteX + (el.position.x - centerX),
          y: pasteY + (el.position.y - centerY),
        },
        parentGroupId: null,
        createdAt: now,
        updatedAt: now,
      };
    });

    // Build all links between copied elements
    const copiedIds = new Set(copiedElementsRef.current.map(el => el.id));
    const relevantLinks = links.filter(l =>
      copiedIds.has(l.fromId) && copiedIds.has(l.toId)
    );
    const newLinks: Link[] = relevantLinks.map(link => ({
      ...link,
      id: generateUUID(),
      investigationId: currentInvestigation!.id,
      fromId: oldToNewIdMap.get(link.fromId)!,
      toId: oldToNewIdMap.get(link.toId)!,
      createdAt: now,
      updatedAt: now,
    })).filter(l => l.fromId && l.toId);

    // Single Y.js transaction for all elements + links
    pasteElements(newElements, newLinks);

    // Save for undo (include both element and link IDs)
    const newElementIds = newElements.map(el => el.id);
    if (activeTabId) {
      addTabMembers(activeTabId, newElementIds);
    }
    const newLinkIds = newLinks.map(l => l.id);
    pushAction({
      type: 'create-elements',
      undo: {},
      redo: { elements: newElements, elementIds: newElementIds, linkIds: newLinkIds },
    });

    // Select all pasted elements
    selectElements(newElementIds);
  }, [contextMenu, viewport, currentInvestigation, pasteElements, links, selectElements, pushAction, activeTabId, addTabMembers]);

  // Duplicate handler for context menu
  const handleContextMenuDuplicate = useCallback(() => {
    if (!contextMenu) return;
    const selectedEls = getSelectedElementIds();
    const elIds = selectedEls.length > 0 ? selectedEls : [contextMenu.elementId];
    const elsToDuplicate = elements.filter(el => elIds.includes(el.id));
    if (elsToDuplicate.length === 0) return;

    const now = new Date();
    const offset = 40;
    const oldToNewIdMap = new Map<string, string>();

    // Build all elements with offset
    const newElements: Element[] = elsToDuplicate.map(el => {
      const newId = generateUUID();
      oldToNewIdMap.set(el.id, newId);
      return {
        ...el,
        id: newId,
        investigationId: currentInvestigation!.id,
        position: {
          x: el.position.x + offset,
          y: el.position.y + offset,
        },
        parentGroupId: null,
        createdAt: now,
        updatedAt: now,
      };
    });

    // Build all links between duplicated elements
    const elIdSet = new Set(elIds);
    const relevantLinks = links.filter(l =>
      elIdSet.has(l.fromId) && elIdSet.has(l.toId)
    );
    const newLinks: Link[] = relevantLinks.map(link => ({
      ...link,
      id: generateUUID(),
      investigationId: currentInvestigation!.id,
      fromId: oldToNewIdMap.get(link.fromId)!,
      toId: oldToNewIdMap.get(link.toId)!,
      createdAt: now,
      updatedAt: now,
    })).filter(l => l.fromId && l.toId);

    // Single Y.js transaction
    pasteElements(newElements, newLinks);

    // Save for undo (include both element and link IDs)
    const newElementIds = newElements.map(el => el.id);
    if (activeTabId) {
      addTabMembers(activeTabId, newElementIds);
    }
    const newLinkIds = newLinks.map(l => l.id);
    pushAction({
      type: 'create-elements',
      undo: {},
      redo: { elements: newElements, elementIds: newElementIds, linkIds: newLinkIds },
    });
    selectElements(newElementIds);
  }, [contextMenu, elements, links, getSelectedElementIds, currentInvestigation, pasteElements, selectElements, pushAction, activeTabId, addTabMembers]);

  // Group selection handler for context menu
  const handleGroupSelection = useCallback(async () => {
    const selectedEls = getSelectedElementIds();
    if (selectedEls.length < 2) return;
    const selectedElements = elements.filter(el => selectedEls.includes(el.id) && !el.isGroup);
    if (selectedElements.length < 2) return;

    // Snapshot absolute positions for undo
    const absolutePositions = selectedElements.map(el => ({
      id: el.id,
      position: { ...el.position },
    }));

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

    const group = await createGroup('Groupe', groupPos, groupSize, selectedEls);

    // Compute relative positions for redo
    const relativePositions = selectedElements.map(el => ({
      id: el.id,
      position: { x: el.position.x - groupPos.x, y: el.position.y - groupPos.y },
    }));

    // Get fresh group snapshot from store (with childIds set)
    const groupSnapshot = useInvestigationStore.getState().elements.find(el => el.id === group.id);
    if (groupSnapshot) {
      pushAction({
        type: 'create-group',
        undo: { positions: absolutePositions },
        redo: { elements: [groupSnapshot], elementIds: [group.id], positions: relativePositions },
      });
    }

    clearSelection();
  }, [elements, getSelectedElementIds, createGroup, clearSelection, pushAction]);

  // Dissolve group handler
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

  // Remove from group handler
  const handleRemoveFromGroup = useCallback(async () => {
    if (!contextMenu) return;
    const child = elementMap.get(contextMenu.elementId);
    if (!child?.parentGroupId) return;

    const group = elementMap.get(child.parentGroupId);
    if (!group) return;

    // Snapshot old state for undo
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

  // Toggle position lock handler - applies to all selected elements
  const handleToggleLock = useCallback(async () => {
    if (!contextMenu) return;
    const clickedElement = elementMap.get(contextMenu.elementId);
    if (!clickedElement) return;

    // Determine new lock state based on the clicked element
    const newLockState = !clickedElement.isPositionLocked;

    // Apply to all selected elements if multiple are selected
    const targetIds = selectedElementIds.size > 1
      ? Array.from(selectedElementIds)
      : [contextMenu.elementId];

    // Update all target elements
    await Promise.all(
      targetIds.map(id => updateElement(id, { isPositionLocked: newLockState }))
    );
  }, [contextMenu, elementMap, selectedElementIds, updateElement]);

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
        return elementMap.get(otherId);
      }
    }
    return undefined;
  }, [contextMenu, selectedElementIds, elementMap]);

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

  // State for import placement in progress
  const [isImportingPlacement, setIsImportingPlacement] = useState(false);

  // Handle pane click (deselect or placement import)
  const handlePaneClick = useCallback(async (event: React.MouseEvent) => {
    // If in import placement mode, handle the placement
    if (importPlacementMode && importPlacementData && !isImportingPlacement) {
      setIsImportingPlacement(true);

      try {
        // Calculate flow position from click
        if (!reactFlowWrapper.current) return;
        const bounds = reactFlowWrapper.current.getBoundingClientRect();
        const flowPosition = {
          x: (event.clientX - bounds.left - viewport.x) / viewport.zoom,
          y: (event.clientY - bounds.top - viewport.y) / viewport.zoom,
        };

        // Calculate offset: we want the top-left of the bounding box to be at the click position
        const offsetX = flowPosition.x - importPlacementData.boundingBox.minX;
        const offsetY = flowPosition.y - importPlacementData.boundingBox.minY;

        let result: Awaited<ReturnType<typeof importService.importFromZip>>;
        const fileName = importPlacementData.file.name.toLowerCase();
        // Snapshot element IDs before import (for tab assignment after reload)
        const preImportIds = new Set(elements.map(e => e.id));

        if (importPlacementData.fileContent != null) {
          // ── Non-ZIP format: import then shift new elements ──
          const content = importPlacementData.fileContent;
          const invId = importPlacementData.investigationId;

          // Snapshot existing element IDs before import
          const existingElements = await elementRepository.getByInvestigation(invId);
          const existingIds = new Set(existingElements.map(e => e.id));

          // Dispatch to the appropriate import function
          if (fileName.endsWith('.osintracker')) {
            result = await importService.importFromOsintracker(content, invId);
          } else if (fileName.endsWith('.csv')) {
            result = await importService.importFromCSV(content, invId, {
              createMissingElements: importPlacementData.importOptions?.createMissingElements ?? true,
            });
          } else if (fileName.endsWith('.graphml') || fileName.endsWith('.xml')) {
            result = await importService.importFromGraphML(content, invId);
          } else if (fileName.endsWith('.ged') || fileName.endsWith('.gw')) {
            result = await importService.importFromGenealogy(importPlacementData.file, invId);
          } else if (fileName.endsWith('.json') || fileName.endsWith('.excalidraw')) {
            result = await importService.importFromJSON(content, invId);
          } else {
            // Fallback: try JSON
            try {
              JSON.parse(content);
              result = await importService.importFromJSON(content, invId);
            } catch {
              result = { success: false, elementsImported: 0, linksImported: 0, assetsImported: 0, reportImported: false, errors: ['Unsupported format'], warnings: [] };
            }
          }

          // Shift newly created elements to the click position
          if (result.success && result.elementsImported > 0) {
            const allElements = await elementRepository.getByInvestigation(invId);
            const newElements = allElements.filter(e => !existingIds.has(e.id));

            if (newElements.length > 0) {
              // Compute bounding box of new elements
              let minX = Infinity, minY = Infinity;
              for (const el of newElements) {
                if (el.position.x < minX) minX = el.position.x;
                if (el.position.y < minY) minY = el.position.y;
              }

              // Shift so top-left of new elements lands at click position
              const shiftX = flowPosition.x - minX;
              const shiftY = flowPosition.y - minY;

              const positionUpdates = newElements.map(el => ({
                id: el.id,
                position: {
                  x: el.position.x + shiftX,
                  y: el.position.y + shiftY,
                },
              }));

              await elementRepository.updatePositions(positionUpdates);
            }
          }
        } else {
          // ── ZIP format: import with built-in offset ──
          result = await importService.importFromZip(
            importPlacementData.file,
            importPlacementData.investigationId,
            { x: offsetX, y: offsetY }
          );
        }

        if (result.success) {
          toast.success(tPages('investigation.importPlacement.success', {
            count: result.elementsImported
          }));

          // Save shared-mode state before closing Y.Doc so we can restore it after reload
          const syncState = syncService.getState();
          const wasShared = syncState.mode === 'shared';
          const savedEncryptionKey = syncService.getEncryptionKey();
          const savedRoomId = syncState.roomId;

          // Close Y.Doc, delete its persistence, and reload from Dexie
          // This forces rebuild of Y.Doc from Dexie which now includes imported elements
          await syncService.close();
          await syncService.deleteLocalData(importPlacementData.investigationId);
          await loadInvestigation(importPlacementData.investigationId);

          // Restore shared mode if we were collaborating
          if (wasShared && savedEncryptionKey && savedRoomId) {
            await syncService.openShared(
              importPlacementData.investigationId,
              savedEncryptionKey,
              savedRoomId
            );
          }

          // Request fitView to show all elements including imported ones
          requestFitView();

          // Add imported elements to active tab
          if (activeTabId) {
            const importedIds = useInvestigationStore.getState().elements
              .filter(el => !preImportIds.has(el.id))
              .map(el => el.id);
            if (importedIds.length > 0) {
              addTabMembers(activeTabId, importedIds);
            }
          }

          // Call completion callback if provided
          importPlacementData.onComplete?.();
        } else {
          toast.error(result.errors[0] || tPages('investigation.importPlacement.error'));
        }
      } catch (error) {
        toast.error(tPages('investigation.importPlacement.error'));
      } finally {
        setIsImportingPlacement(false);
        exitImportPlacementMode();
      }
      return;
    }

    clearSelection();
  }, [clearSelection, importPlacementMode, importPlacementData, isImportingPlacement, viewport, loadInvestigation, exitImportPlacementMode, tPages, requestFitView, elements, activeTabId, addTabMembers]);

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

      const newElement = await createElement(t('labels.newElement'), position);

      // Auto-add to active tab
      if (activeTabId) {
        addTabMembers(activeTabId, [newElement.id]);
      }

      // Save for undo
      pushAction({
        type: 'create-element',
        undo: {},
        redo: { elements: [newElement], elementIds: [newElement.id] },
      });

      selectElement(newElement.id);
    },
    [createElement, selectElement, viewport, pushAction, activeTabId, addTabMembers]
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
          const targetElement = elementMap.get(elementId);
          for (const file of files) {
            await addAsset(elementId, file);
            try {
              const buffer = await file.arrayBuffer();
              const metadata = await metadataService.extractMetadata(file, buffer);
              if (metadata && (metadata.properties.length > 0 || metadata.geo)) {
                pushMetadataImport({
                  elementId,
                  elementLabel: targetElement?.label || '',
                  filename: file.name,
                  metadata,
                });
              }
            } catch (err) {
              console.error('Metadata extraction failed:', err);
            }
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
        // Auto-add to active tab
        if (activeTabId) {
          addTabMembers(activeTabId, [newElement.id]);
        }
        await addAsset(newElement.id, file);
        try {
          const buffer = await file.arrayBuffer();
          const metadata = await metadataService.extractMetadata(file, buffer);
          if (metadata && (metadata.properties.length > 0 || metadata.geo)) {
            pushMetadataImport({
              elementId: newElement.id,
              elementLabel: newElement.label,
              filename: file.name,
              metadata,
            });
          }
        } catch (err) {
          console.error('Metadata extraction failed:', err);
        }
      }
    },
    [createElement, addAsset, viewport, elementMap, pushMetadataImport, activeTabId, addTabMembers]
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

      case 'update-link':
        // Restore previous link values
        if (action.undo.linkId && action.undo.linkChanges) {
          await updateLink(action.undo.linkId, action.undo.linkChanges);
        }
        break;

      case 'move-elements':
      case 'move-element':
        // Restore previous positions
        if (action.undo.positions) {
          await updateElementPositions(action.undo.positions);
        }
        break;

      case 'extract-to-element':
        // Restore property/event on source element
        if (action.undo.elementId && action.undo.changes) {
          await updateElement(action.undo.elementId, action.undo.changes);
        }
        // Delete created element (cascades to delete connected link)
        if (action.redo.elementIds) {
          await deleteElements(action.redo.elementIds);
        }
        break;

      case 'dissolve-group':
        // Recreate the group element
        if (action.undo.elements) {
          pasteElements(action.undo.elements, []);
        }
        // Restore children to relative positions with parentGroupId
        if (action.undo.positions && action.undo.elements?.[0]) {
          const groupId = action.undo.elements[0].id;
          for (const child of action.undo.positions) {
            await updateElement(child.id, {
              parentGroupId: groupId,
              position: child.position,
            });
          }
        }
        break;

      case 'remove-from-group': {
        // Restore child to relative position with parentGroupId
        if (action.undo.elementId && action.undo.changes) {
          await updateElement(action.undo.elementId, action.undo.changes);
          // Add child back to group's childIds
          const groupId = action.undo.changes.parentGroupId;
          if (groupId) {
            const group = elementMap.get(groupId);
            if (group && !group.childIds.includes(action.undo.elementId)) {
              await updateElement(groupId, {
                childIds: [...group.childIds, action.undo.elementId],
              });
            }
          }
        }
        break;
      }

      case 'create-group':
        // Undo: restore children to absolute positions, delete group
        if (action.undo.positions) {
          for (const child of action.undo.positions) {
            await updateElement(child.id, { parentGroupId: null, position: child.position });
          }
        }
        if (action.redo.elementIds) {
          await deleteElements(action.redo.elementIds);
        }
        break;

      case 'delete-tab':
        if (action.undo.snapshot) {
          const { useTabStore } = await import('../../stores');
          await useTabStore.getState().restoreTab(action.undo.snapshot);
        }
        break;

      case 'delete-view':
        if (action.undo.snapshot) {
          const { useViewStore } = await import('../../stores');
          useViewStore.getState().restoreView(action.undo.snapshot);
        }
        break;

      case 'delete-section':
        if (action.undo.snapshot) {
          const { useReportStore } = await import('../../stores');
          await useReportStore.getState().restoreSection(action.undo.snapshot);
        }
        break;

      case 'clear-filters':
        if (action.undo.snapshot) {
          const { useViewStore } = await import('../../stores');
          const vs = useViewStore.getState();
          vs.setFilters(action.undo.snapshot.filters);
          if (action.undo.snapshot.hiddenElementIds?.length > 0) {
            vs.hideElements(action.undo.snapshot.hiddenElementIds);
          }
        }
        break;
    }
  }, [popUndo, createElement, createLink, deleteElements, updateElement, updateLink, updateElementPositions, pasteElements, elementMap]);

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

      case 'update-link':
        // Re-apply link changes
        if (action.redo.linkId && action.redo.linkChanges) {
          await updateLink(action.redo.linkId, action.redo.linkChanges);
        }
        break;

      case 'move-elements':
      case 'move-element':
        // Apply new positions
        if (action.redo.positions) {
          await updateElementPositions(action.redo.positions);
        }
        break;

      case 'extract-to-element':
        // Re-create element and link
        if (action.redo.elements) {
          for (const el of action.redo.elements) {
            await createElement(el.label, el.position, el);
          }
        }
        if (action.redo.links) {
          for (const link of action.redo.links) {
            await createLink(link.fromId, link.toId, { ...link, id: link.id });
          }
        }
        // Remove property/event from source again
        if (action.redo.elementId && action.redo.changes) {
          await updateElement(action.redo.elementId, action.redo.changes);
        }
        break;

      case 'dissolve-group':
        // Convert children to absolute positions and clear parentGroupId
        if (action.undo.positions && action.undo.elements?.[0]) {
          const group = action.undo.elements[0];
          for (const child of action.undo.positions) {
            await updateElement(child.id, {
              parentGroupId: null,
              position: {
                x: child.position.x + group.position.x,
                y: child.position.y + group.position.y,
              },
            });
          }
        }
        // Delete the group element
        if (action.redo.elementIds) {
          await deleteElements(action.redo.elementIds);
        }
        break;

      case 'remove-from-group': {
        // Remove child from group (set absolute position, clear parentGroupId)
        if (action.redo.elementId && action.redo.changes) {
          await updateElement(action.redo.elementId, action.redo.changes);
          // Remove child from group's childIds
          const groupId = action.undo.changes?.parentGroupId;
          if (groupId) {
            const group = elementMap.get(groupId);
            if (group) {
              await updateElement(groupId, {
                childIds: group.childIds.filter(id => id !== action.redo.elementId),
              });
            }
          }
        }
        break;
      }

      case 'create-group':
        // Redo: recreate group, move children to relative positions
        if (action.redo.elements) {
          pasteElements(action.redo.elements, []);
          const group = action.redo.elements[0];
          if (action.redo.positions) {
            for (const child of action.redo.positions) {
              await updateElement(child.id, { parentGroupId: group.id, position: child.position });
            }
          }
        }
        break;

      case 'delete-tab':
        if (action.redo.snapshot) {
          const { useTabStore } = await import('../../stores');
          await useTabStore.getState().deleteTab(action.redo.snapshot);
        }
        break;

      case 'delete-view':
        if (action.redo.snapshot) {
          const { useViewStore } = await import('../../stores');
          await useViewStore.getState().deleteView(action.redo.snapshot);
        }
        break;

      case 'delete-section':
        if (action.redo.snapshot) {
          const { useReportStore } = await import('../../stores');
          await useReportStore.getState().removeSection(action.redo.snapshot);
        }
        break;

      case 'clear-filters': {
        const { useViewStore } = await import('../../stores');
        const vs = useViewStore.getState();
        vs.clearFilters();
        vs.showAllElements();
        break;
      }
    }
  }, [popRedo, deleteElements, deleteLinks, createElement, createLink, updateElement, updateLink, updateElementPositions, elementMap, pasteElements]);

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

      // Escape: deselect all
      if (event.key === 'Escape') {
        clearSelection();
        return;
      }

      // Arrow keys: move selected elements (1px, +Shift = 10px)
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
          const tabMembership = captureTabMembership(selectedEls);
          pushAction({
            type: 'delete-elements',
            undo: { elements: elementsToDelete, links: linksToDelete, tabMembership },
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

      // Select all with Ctrl+A (only visible elements in active tab)
      if (event.key === 'a' && isCtrlOrMeta) {
        event.preventDefault();
        const visibleIds = activeTabId !== null
          ? elements.filter((el) => tabMemberSet.has(el.id)).map((el) => el.id)
          : elements.map((el) => el.id);
        selectElements(visibleIds);
      }

      // Copy with Ctrl+C
      if (event.key === 'c' && isCtrlOrMeta) {
        const selectedEls = getSelectedElementIds();
        if (selectedEls.length > 0) {
          copiedElementsRef.current = elements.filter(el => selectedEls.includes(el.id));
          setHasCopiedElements(true);
          const clipboardData = buildClipboardData(selectedEls, [...selectedLinkIds]);
          navigator.clipboard.writeText(clipboardData).catch(() => {});
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
          const clipboardData = buildClipboardData(selectedEls, [...selectedLinkIds]);
          navigator.clipboard.writeText(clipboardData).catch(() => {});

          // Delete the cut elements
          const linksToDelete = links.filter(l =>
            selectedEls.includes(l.fromId) || selectedEls.includes(l.toId)
          );

          const tabMembership = captureTabMembership(selectedEls);
          pushAction({
            type: 'delete-elements',
            undo: { elements: elsToCut, links: linksToDelete, tabMembership },
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
          const now = new Date();
          const offset = 40;
          const oldToNewIdMap = new Map<string, string>();

          const newElements: Element[] = elsToDuplicate.map(el => {
            const newId = generateUUID();
            oldToNewIdMap.set(el.id, newId);
            return {
              ...el,
              id: newId,
              investigationId: currentInvestigation!.id,
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

          // Build links between duplicated elements
          const selectedSet = new Set(selectedEls);
          const relevantLinks = links.filter(l =>
            selectedSet.has(l.fromId) && selectedSet.has(l.toId)
          );
          const newLinks: Link[] = relevantLinks.map(link => ({
            ...link,
            id: generateUUID(),
            investigationId: currentInvestigation!.id,
            fromId: oldToNewIdMap.get(link.fromId)!,
            toId: oldToNewIdMap.get(link.toId)!,
            createdAt: now,
            updatedAt: now,
          })).filter(l => l.fromId && l.toId);

          // Single Y.js transaction
          pasteElements(newElements, newLinks);

          // Save for undo (include both element and link IDs)
          const newElementIds = newElements.map(el => el.id);
          if (activeTabId) {
            addTabMembers(activeTabId, newElementIds);
          }
          const newLinkIds = newLinks.map(l => l.id);
          pushAction({
            type: 'create-elements',
            undo: {},
            redo: { elements: newElements, elementIds: newElementIds, linkIds: newLinkIds },
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
    selectedLinkIds,
    deleteElements,
    deleteLinks,
    clearSelection,
    selectElements,
    selectElement,
    createElement,
    createGroup,
    pasteElements,
    currentInvestigation,
    elements,
    links,
    viewport,
    pushAction,
    handleUndo,
    handleRedo,
    buildClipboardData,
    activeTabId,
    tabMemberSet,
    addTabMembers,
    updateElementPositions,
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

      // Calculate paste position: mouse cursor if inside canvas, fallback to viewport center
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
        // Auto-add to active tab
        if (activeTabId) {
          addTabMembers(activeTabId, [newElement.id]);
        }
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

        const now = new Date();
        const oldToNewIdMap = new Map<string, string>();

        // Calculate center of copied elements
        const sumX = copiedElementsRef.current.reduce((sum, el) => sum + el.position.x, 0);
        const sumY = copiedElementsRef.current.reduce((sum, el) => sum + el.position.y, 0);
        const copiedCenterX = sumX / copiedElementsRef.current.length;
        const copiedCenterY = sumY / copiedElementsRef.current.length;

        // Build all elements with positions centered at viewport center
        const newElements: Element[] = copiedElementsRef.current.map(el => {
          const newId = generateUUID();
          oldToNewIdMap.set(el.id, newId);
          return {
            ...el,
            id: newId,
            investigationId: currentInvestigation!.id,
            position: {
              x: centerX + (el.position.x - copiedCenterX),
              y: centerY + (el.position.y - copiedCenterY),
            },
            parentGroupId: null,
            createdAt: now,
            updatedAt: now,
          };
        });

        // Build all links between copied elements
        const copiedIds = new Set(copiedElementsRef.current.map(el => el.id));
        const relevantLinks = links.filter(l =>
          copiedIds.has(l.fromId) && copiedIds.has(l.toId)
        );
        const newLinks: Link[] = relevantLinks.map(link => ({
          ...link,
          id: generateUUID(),
          investigationId: currentInvestigation!.id,
          fromId: oldToNewIdMap.get(link.fromId)!,
          toId: oldToNewIdMap.get(link.toId)!,
          createdAt: now,
          updatedAt: now,
        })).filter(l => l.fromId && l.toId);

        // Single Y.js transaction for all elements + links
        pasteElements(newElements, newLinks);

        // Save for undo (include both element and link IDs)
        const newElementIds = newElements.map(el => el.id);
        if (activeTabId) {
          addTabMembers(activeTabId, newElementIds);
        }
        const newLinkIds = newLinks.map(l => l.id);
        pushAction({
          type: 'create-elements',
          undo: {},
          redo: { elements: newElements, elementIds: newElementIds, linkIds: newLinkIds },
        });

        // Select all pasted elements
        selectElements(newElementIds);
        return;
      }

      // No files and no copied elements - nothing to paste
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [viewport, pasteElements, currentInvestigation, addAsset, selectElements, elements, links, pushAction, getSelectedElementIds, activeTabId, addTabMembers]);

  // Handle viewport change
  const handleViewportChange = useCallback(
    ({ x, y, zoom }: { x: number; y: number; zoom: number }) => {
      setViewport({ x, y, zoom });
    },
    [setViewport]
  );

  // Handle selection change from selection box — throttled to avoid 60fps store updates
  const selectionChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSelectionRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const SELECTION_THROTTLE_MS = 80;

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: Node[]; edges: Edge[] }) => {
      if (isHandlingSelectionRef.current) return;

      // Store the latest selection and throttle the update
      pendingSelectionRef.current = { nodes: selectedNodes, edges: selectedEdges };

      if (selectionChangeTimerRef.current) return; // already scheduled

      selectionChangeTimerRef.current = setTimeout(() => {
        selectionChangeTimerRef.current = null;
        const pending = pendingSelectionRef.current;
        if (!pending) return;
        pendingSelectionRef.current = null;

        if (pending.nodes.length > 0 || pending.edges.length > 0) {
          isHandlingSelectionRef.current = true;
          selectBoth(
            pending.nodes.map((n) => n.id),
            pending.edges.map((e) => e.id),
            false
          );
          queueMicrotask(() => {
            isHandlingSelectionRef.current = false;
          });
        }
      }, SELECTION_THROTTLE_MS);
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
                title={tPages('investigation.toolbar.share')}
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
                        ? tPages('investigation.toolbar.oneElement')
                        : selectedLinkIds.size === 1 && selectedElementIds.size === 0
                        ? tPages('investigation.toolbar.oneLink')
                        : tPages('investigation.toolbar.selectedCount', { count: selectedElementIds.size + selectedLinkIds.size })}
                    </span>
                    <button
                      onClick={clearSelection}
                      className="p-0.5 text-text-tertiary hover:text-text-primary rounded transition-colors"
                      title={tPages('investigation.toolbar.deselect')}
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
                title={tPages('investigation.toolbar.snapToGrid')}
              >
                <Grid3x3 size={16} />
              </button>
              <button
                onClick={toggleAlignGuides}
                className={`p-1.5 rounded transition-colors ${showAlignGuides ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-bg-tertiary'}`}
                title={tPages('investigation.toolbar.alignGuides')}
              >
                <Magnet size={16} />
              </button>
              <button
                onClick={toggleMinimap}
                className={`p-1.5 rounded transition-colors ${showMinimap ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-bg-tertiary'}`}
                title={tPages('investigation.toolbar.minimap')}
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
          className={`flex-1 relative outline-none ${importPlacementMode ? 'cursor-crosshair' : ''} ${isViewportMoving && elements.length > 500 ? 'edges-hidden' : ''}`}
          data-testid="canvas"
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
                const tabMembership = captureTabMembership(selectedEls);
                pushAction({
                  type: 'delete-elements',
                  undo: { elements: elementsToDelete, links: linksToDelete, tabMembership },
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
            onMoveStart={handleMoveStart}
            onMoveEnd={handleMoveEnd}
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
            <FitViewController />
            <DraggableMinimap />
            <ImportPlacementOverlay />
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
              otherSelectedLabel={otherSelectedElement?.label || t('empty.unnamed')}
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
              isGroup={!!elementMap.get(contextMenu.elementId)?.isGroup}
              isInGroup={!!elementMap.get(contextMenu.elementId)?.parentGroupId}
              hasMultipleSelected={selectedElementIds.size > 1}
              onGroupSelection={handleGroupSelection}
              onDissolveGroup={handleDissolveGroup}
              onRemoveFromGroup={handleRemoveFromGroup}
              isPositionLocked={!!elementMap.get(contextMenu.elementId)?.isPositionLocked}
              onToggleLock={handleToggleLock}
              tabs={canvasTabs}
              activeTabId={activeTabId}
              onAddToTab={(tabId) => {
                const ids = selectedElementIds.size > 1
                  ? Array.from(selectedElementIds)
                  : [contextMenu.elementId];
                addTabMembers(tabId, ids);
              }}
              onRemoveFromTab={() => {
                if (!activeTabId) return;
                const id = contextMenu.elementId;
                if (!tabMemberSet.has(id)) {
                  // Ghost → dismiss (exclude from ghost computation)
                  excludeFromTab(activeTabId, [id]);
                } else {
                  // Member → remove from tab membership
                  removeTabMembers(activeTabId, [id]);
                }
              }}
              isGhostElement={activeTabId !== null && !tabMemberSet.has(contextMenu.elementId)}
              elementTabIds={getTabsForElement(contextMenu.elementId).map(t => t.id)}
              onGoToTab={(tabId) => {
                setActiveTab(tabId);
                closeContextMenu();
              }}
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
              selectedCount={selectedElementIds.size}
              onCopySelection={handleSelectionCopy}
              onCutSelection={handleSelectionCut}
              onDuplicateSelection={handleSelectionDuplicate}
              onDeleteSelection={handleSelectionDelete}
              onHideSelection={handleSelectionHide}
              onGroupSelection={handleGroupSelection}
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
  const { t } = useTranslation('pages');
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
        className={`bg-bg-primary rounded shadow-lg ${
          isPdf ? 'w-[90vw] h-[90vh] flex flex-col' : 'max-w-[90vw] max-h-[90vh] flex flex-col'
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
            title={t('investigation.toolbar.closeEsc')}
          >
            <span className="sr-only">{t('investigation.toolbar.close')}</span>
            ×
          </button>
        </div>

        {/* Content */}
        <div className={isPdf ? 'flex-1 min-h-0 overflow-hidden' : 'overflow-auto'}>
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-text-secondary">{t('investigation.toolbar.loading')}</span>
              </div>
            </div>
          ) : isPdf && fileUrl ? (
            <iframe
              src={fileUrl}
              className="w-full h-full border-0"
              title={asset.filename}
            />
          ) : isImage && fileUrl ? (
            <div className="p-4 text-center">
              <img
                src={fileUrl}
                alt={asset.filename}
                className="max-w-full inline-block"
              />
            </div>
          ) : asset.thumbnailDataUrl ? (
            <div className="p-4 text-center">
              <img
                src={asset.thumbnailDataUrl}
                alt={asset.filename}
                className="max-w-full inline-block"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 py-8 text-text-tertiary">
              <span className="text-4xl">📄</span>
              <p className="text-sm">Aperçu non disponible</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
