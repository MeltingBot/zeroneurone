import { useCallback, useMemo, useRef, useEffect, useState, type MutableRefObject } from 'react';
import { propertiesOf, VALUES_SEPARATOR } from '../../utils/propertyRows';
import { useTranslation } from 'react-i18next';
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore as useFlowStore,
  useStoreApi as useFlowStoreApi,
  applyNodeChanges,
  type Connection,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type NodeMouseHandler,
  type OnConnect,
  type OnConnectStart,
  type OnReconnect,
  type HandleType,
  SelectionMode,
  ConnectionMode,
  type NodeChange,
} from '@xyflow/react';

import { ZoomIn, ZoomOut, Maximize2, RotateCcw, Grid3x3, Magnet, Map as MapIcon, Box, Link2, X, Eye, EyeOff } from 'lucide-react';
import '@xyflow/react/dist/style.css';


import { ElementNode, LowDetailContext, type ElementNodeData } from './ElementNode';
import { LowDetailHandleRepair } from './lowDetailHandles';
import type { TabMembershipSnapshot } from '../../stores/historyStore';
import { GroupNode, type GroupNodeData } from './GroupNode';
import { AnnotationNode, type AnnotationNodeData } from './AnnotationNode';
import { DraggableMinimap } from './DraggableMinimap';
import { CanvasGrid } from './CanvasGrid';
import { SuggestionPreviewLines } from './SuggestionPreviewLines';
import { AlignmentGuides, computeGuides, type Guide } from './AlignmentGuides';
import { CustomEdge } from './CustomEdge';
import { SimpleEdge } from './SimpleEdge';
import { ContextMenu } from './ContextMenu';
import { CanvasContextMenu } from './CanvasContextMenu';
import { LinkContextMenu } from './LinkContextMenu';
import { computeHandleSlots as computeLinkHandleSlots, type HandleSlots } from '../../utils/edgeRouting';
import { MergeElementsModal } from '../modals/MergeElementsModal';
import { usePlugins } from '../../plugins/usePlugins';
import { AlignDropdown } from './AlignDropdown';
import { LayoutDropdown } from './LayoutDropdown';
import { ImportPlacementOverlay } from './ImportPlacementOverlay';
import { OverviewLayer, type OverviewHandle } from './overview/OverviewLayer';
import { buildOverviewScene, computeAbsoluteNodePositions, linkFlagsOf, nodeFootprint } from './overview/overviewScene';
import { linksTouching } from './overview/overviewHitTest';
import { NODE_GHOST, type OverviewScene } from './overview/overviewTypes';
import { linkVisualState, type LinkVisualContext } from '../../utils/linkVisualState';
import { estimateHandles } from './estimatedHandles';
import { ViewToolbar } from '../common/ViewToolbar';

import { useDossierStore, useSelectionStore, useViewStore, useInsightsStore, useHistoryStore, useUIStore, useSyncStore, useTabStore, useQueryStore, useClipboardStore, useSuggestionsStore, toast, MAX_TABS } from '../../stores';
import type { Element, Link, Position, Asset, EvaluationModel } from '../../types';
import { computeElementDimensions } from '../../utils/elementDimensions';
import { AssetPreviewModal } from '../modals/AssetPreviewModal';
import { sourceWebLinks } from '../../utils/sourceLinks';
import { getEvaluationBadge } from '../../utils/evaluation';
import { withDossierLinkDefaults } from '../../utils/dossierOptions';
import { useEvaluationModel } from '../../hooks/useEvaluationModel';
import { FONT_SIZE_PX } from '../../types';
import type { RemoteUserPresence } from './ElementNode';
import { generateUUID, sanitizeLinkLabel, isUrl, toUrl } from '../../utils';
import { getDimmedElementIds, getNeighborIds } from '../../utils/filterUtils';
import { useHiddenElementIds } from '../../hooks/useHiddenElementIds';
import { dateLocale, formatPropertyValue } from '../../utils/dates';
import { isRenderedPartOf } from '../../utils/selectionEcho';
import { collectTemporalDates, datePropertyRules, computeCanvasTemporalClassification, closestDateIndex, shiftNavigator, summarizeActiveEvents, sameEventSummary, type TemporalEventSummary } from '../../utils/temporalUtils';
import { TemporalNavigatorBar, TemporalToggleButton } from '../common/TemporalNavigatorBar';
import { isMappableJson } from '../../utils/jsonMapping';
import { isMermaidFlowchart } from '../../services/importMermaid';
import { buildMermaidExport } from '../../services/exportMermaid';
import { startMermaidPlacement } from '../../services/mermaidPlacement';
import { serializeQuery } from '../../services/query/serializer';
import { insightsService } from '../../services/insightsService';
import { metadataService } from '../../services/metadataService';
import { importService } from '../../services/importService';
import { snapshotBeforeImport, commitImportToYDoc } from '../../services/importCommit';
import { withImportProgress } from '../../services/importProgress';
import { useTabFilterIds } from '../../hooks/useTabFilterIds';
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

/**
 * Clone clipboard elements + links into the target dossier, anchored at (anchorX, anchorY).
 * Elements get fresh UUIDs and the target dossierId; internal links are remapped to the
 * new ids. On a cross-dossier paste, asset references are dropped (assets live per-dossier
 * in OPFS/Dexie, so keeping their ids would dangle).
 */
function cloneClipboardForPaste(
  clip: { elements: Element[]; links: Link[]; sourceDossierId: string | null },
  dossierId: string,
  anchorX: number,
  anchorY: number,
): { newElements: Element[]; newLinks: Link[] } {
  const now = new Date();
  const oldToNewIdMap = new Map<string, string>();
  const crossDossier = clip.sourceDossierId !== dossierId;

  const sumX = clip.elements.reduce((s, el) => s + el.position.x, 0);
  const sumY = clip.elements.reduce((s, el) => s + el.position.y, 0);
  const centerX = sumX / clip.elements.length;
  const centerY = sumY / clip.elements.length;

  const newElements: Element[] = clip.elements.map((el) => {
    const newId = generateUUID();
    oldToNewIdMap.set(el.id, newId);
    return {
      ...el,
      id: newId,
      dossierId: dossierId as Element['dossierId'],
      position: { x: anchorX + (el.position.x - centerX), y: anchorY + (el.position.y - centerY) },
      parentGroupId: null,
      assetIds: crossDossier ? [] : el.assetIds,
      createdAt: now,
      updatedAt: now,
    };
  });

  const newLinks: Link[] = clip.links
    .map((link) => ({
      ...link,
      id: generateUUID(),
      dossierId: dossierId as Link['dossierId'],
      fromId: oldToNewIdMap.get(link.fromId)!,
      toId: oldToNewIdMap.get(link.toId)!,
      createdAt: now,
      updatedAt: now,
    }))
    .filter((l) => l.fromId && l.toId);

  return { newElements, newLinks };
}

interface ContextMenuState {
  x: number;
  y: number;
  elementId: string;
  elementLabel: string;
  previewAsset: Asset | null;
}

interface LinkContextMenuState {
  x: number;
  y: number;
  linkId: string;
  linkLabel: string;
}

/** Zoom below which nodes render as plain boxes. Labels are unreadable there. */
const LOW_DETAIL_ZOOM = 0.35;

/** Below this many elements, drawing every label and thumbnail costs nothing
 *  measurable, so zooming out keeps the full rendering. Stripping a 26-element
 *  board down to flat shapes bought no frame time and only made it unreadable. */
const LOW_DETAIL_MIN_ELEMENTS = 400;

/** Overview layer (flag canvasOverviewLayer): replaces React Flow only when
 *  zoomed out (below LOW_DETAIL_ZOOM) over so many nodes that mounting them
 *  would stall. Below that count React Flow stays, nodes can be dragged and
 *  linked. Left once a gesture ends above OVERVIEW_EXIT_ZOOM or over fewer
 *  than OVERVIEW_EXIT_VISIBLE nodes: the gaps keep a gesture hovering around
 *  a threshold from flipping thousands of nodes back and forth. */
const OVERVIEW_ENTER_VISIBLE = 1500;
const OVERVIEW_EXIT_VISIBLE = 1000;
const OVERVIEW_EXIT_ZOOM = 0.4;

const EMPTY_EDGES: Edge[] = [];

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
      // The overview layer hides every node: count them
      fitView({ padding: 0.15, duration: 0, includeHiddenNodes: useUIStore.getState().canvasOverviewLayer });

      // Wait for React Flow to fully render
      await new Promise(resolve => setTimeout(resolve, 500));

      // Capture
      const element = document.querySelector('[data-report-capture="canvas"]') as HTMLElement;
      if (!element) {
        return null;
      }

      try {
        // Chargement a la demande : la capture PNG n'est pas sur le chemin nominal.
        const { toPng } = await import('html-to-image');
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
    fitView({ padding: 0.2, duration: 300, includeHiddenNodes: useUIStore.getState().canvasOverviewLayer });
  }, [fitView]);

  const handleReset = useCallback(() => {
    setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 300 });
  }, [setViewport]);

  return (
    <>
      <button
        onClick={handleZoomOut}
        className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded"
        title={t('dossier.toolbar.zoomOut')}
      >
        <ZoomOut size={16} />
      </button>
      <button
        onClick={handleZoomIn}
        className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded"
        title={t('dossier.toolbar.zoomIn')}
      >
        <ZoomIn size={16} />
      </button>
      <div className="w-px h-4 bg-border-default mx-1" />
      <button
        onClick={handleFitView}
        data-testid="fit-view"
        className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded"
        title={t('dossier.toolbar.fitView')}
      >
        <Maximize2 size={16} />
      </button>
      <button
        onClick={handleReset}
        className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded"
        title={t('dossier.toolbar.resetView')}
      >
        <RotateCcw size={16} />
      </button>
    </>
  );
}

// Selection held when the canvas was last left (the store replaces the Set on
// every change, so identity tells whether it changed in another view)
let selectionWhenCanvasLeft: ReadonlySet<string> | null = null;

// Arriving on the canvas with a selection made elsewhere (map, timeline):
// centre it, at most at zoom 1 like the search. A selection unchanged since
// the canvas was left keeps the restored viewport. Once per mount, when the
// pane has its size.
function RevealSelectionOnOpen() {
  const { getInternalNode, setCenter } = useReactFlow();
  const width = useFlowStore((s) => s.width);
  const height = useFlowStore((s) => s.height);
  const doneRef = useRef(false);
  // Decided on the first mount only: refs survive StrictMode's remount,
  // whose cleanup would otherwise record the selection as already seen
  const changedRef = useRef<boolean | null>(null);

  useEffect(() => {
    changedRef.current ??= useSelectionStore.getState().selectedElementIds !== selectionWhenCanvasLeft;
    return () => { selectionWhenCanvasLeft = useSelectionStore.getState().selectedElementIds; };
  }, []);

  useEffect(() => {
    if (doneRef.current || width === 0 || height === 0) return;
    doneRef.current = true;
    const ids = useSelectionStore.getState().selectedElementIds;
    if (ids.size === 0 || !changedRef.current) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of ids) {
      const node = getInternalNode(id);
      if (!node) continue; // not on this tab, or hidden
      const { x, y } = node.internals.positionAbsolute;
      const w = node.measured?.width ?? node.width ?? 56;
      const h = node.measured?.height ?? node.height ?? 56;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
    }
    if (minX === Infinity) return;
    const pad = 1.3;
    const zoom = Math.min(1, width / ((maxX - minX) * pad), height / ((maxY - minY) * pad));
    setCenter((minX + maxX) / 2, (minY + maxY) / 2, { zoom, duration: 300 });
  }, [width, height, getInternalNode, setCenter]);

  return null;
}

type FlowStoreApi = ReturnType<typeof useFlowStoreApi>;

/** Hands React Flow's store to the canvas, which renders the provider itself. */
function FlowStoreBridge({ storeRef }: { storeRef: MutableRefObject<FlowStoreApi | null> }) {
  storeRef.current = useFlowStoreApi();
  return null;
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
  const { pendingFitView, pendingFitViewIds, clearPendingFitView } = useViewStore();

  useEffect(() => {
    if (!pendingFitView) return;

    // Wait for nodes to be rendered and measured before fitting.
    // After import/load, nodes may not exist yet when this effect first fires.
    let attempts = 0;
    const maxAttempts = 20; // 20 × 100ms = 2s max
    const interval = setInterval(() => {
      attempts++;
      const nodes = getNodes();
      // Framing given elements (a tab just opened): wait for them, not for
      // the nodes still shown from before
      const wanted = pendingFitViewIds ? new Set(pendingFitViewIds) : null;
      // A node hidden by the overview layer may never have been measured: its
      // estimated size (initialWidth) is enough to frame it
      const hasMeasuredNodes = nodes.length > 0 && nodes.some(n => (n.measured?.width || n.initialWidth) && (!wanted || wanted.has(n.id)));
      if (hasMeasuredNodes || attempts >= maxAttempts) {
        clearInterval(interval);
        fitView({
          padding: 0.2,
          duration: 300,
          includeHiddenNodes: useUIStore.getState().canvasOverviewLayer,
          ...(pendingFitViewIds ? { nodes: pendingFitViewIds.map((id) => ({ id })) } : {}),
        });
        clearPendingFitView();
      }
    }, 100);
    return () => clearInterval(interval);
  }, [pendingFitView, pendingFitViewIds, fitView, clearPendingFitView, getNodes]);

  return null;
}


const EMPTY_ID_SET: Set<string> = new Set();

// Return `prev` when both sets hold the same ids (keeps memo dependencies stable)
function reuseIfSameSet(prev: Set<string>, next: Set<string>): Set<string> {
  if (prev === next) return prev;
  if (prev.size !== next.size) return next;
  for (const id of next) {
    if (!prev.has(id)) return next;
  }
  return prev;
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
  confidenceDisplay?: EvaluationModel | null,
  displayedPropertyValues?: { key: string; value: string }[],
  tagDisplayMode?: 'none' | 'icons' | 'labels' | 'both',
  tagDisplaySize?: 'small' | 'medium' | 'large',
  themeMode?: 'light' | 'dark',
  isGhost?: boolean,
  isHighlighted?: boolean,
  hasLinks?: boolean,
  activeEvents?: TemporalEventSummary,
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
        ...(element.visual.customHeight ? { height: element.visual.customHeight } : {}),
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
        showConfidenceIndicator: !!confidenceDisplay,
        evaluationModel: confidenceDisplay ?? 'zeroneurone',
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
      // A ghost highlighted by Insights (a relay between two tabs, a path
      // through another tab) shows with its glow instead of faded
      isDimmed: (isGhost && !isHighlighted) || isDimmed,
      isHighlighted: !!isHighlighted,
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
      showConfidenceIndicator: !!confidenceDisplay,
      evaluationModel: confidenceDisplay ?? 'zeroneurone',
      displayedPropertyValues,
      tagDisplayMode,
      tagDisplaySize,
      themeMode,
      hasLinks,
      activeEvents,
    } satisfies ElementNodeData,
    selected: isGhost ? false : isSelected,
  };

  // Only set parentId for non-ghost nodes — ghost elements may have a parent group
  // that isn't visible on the current tab, causing React Flow to misposition them
  // (relative position interpreted as absolute → elements appear near top-left)
  if (element.parentGroupId && !isGhost) {
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

/** Handle slots of every link, from the handles it is drawn between (see utils/edgeRouting). */
function computeHandleSlots(
  links: Link[],
  nodePositions: Map<string, Position>,
  linkAnchorMode: 'auto' | 'manual',
  parallelLookup: Map<string, { index: number; count: number }>
): Map<string, HandleSlots> {
  return computeLinkHandleSlots(
    links.map(link => ({
      id: link.id,
      fromId: link.fromId,
      toId: link.toId,
      ...resolveLinkHandles(link, nodePositions, linkAnchorMode),
      tie: parallelLookup.get(link.id)?.index ?? 0,
    })),
    nodePositions
  );
}

/** Handles a link is drawn between: per-link anchor override, else dossier anchor mode. */
function resolveLinkHandles(
  link: Link,
  nodePositions: Map<string, Position>,
  linkAnchorMode: 'auto' | 'manual'
): { sourceHandle: string; targetHandle: string } {
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

  // Calculate handles based on anchor mode.
  // A per-link override (set when the user drags an endpoint) wins over the dossier setting.
  let sourceHandle: string;
  let targetHandle: string;
  const effectiveAnchorMode = link.anchorMode ?? linkAnchorMode;

  if (effectiveAnchorMode === 'auto') {
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

  return { sourceHandle, targetHandle };
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
  confidenceDisplay?: EvaluationModel | null,
  displayedPropertyValues?: { key: string; value: string }[],
  remoteLinkSelectors?: { name: string; color: string; isEditing?: boolean }[],
  simplified?: boolean,
  handleSlots?: HandleSlots
): Edge {
  const { sourceHandle, targetHandle } = resolveLinkHandles(link, nodePositions, linkAnchorMode);

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
      // Offsets along the node side, shared by every link attached to the same handle
      sourceSlot: handleSlots?.source ?? 0,
      targetSlot: handleSlots?.target ?? 0,
      // Each route style keeps its own manual offset
      curveOffset: (linkCurveMode === 'orthogonal' ? link.orthogonalOffset : link.curveOffset) ?? { x: 0, y: 0 },
      onCurveOffsetChange,
      // Curve mode: straight or curved
      curveMode: linkCurveMode,
      // Include handles in data to force React Flow to re-render when they change
      _sourceHandle: sourceHandle,
      _targetHandle: targetHandle,
      // Confidence / grading indicator
      showConfidenceIndicator: !!confidenceDisplay,
      confidenceBadge: confidenceDisplay
        ? getEvaluationBadge(link.confidence, link.evaluation, confidenceDisplay)
        : null,
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
  // Below this zoom a label is a few pixels tall and unreadable, so the node's
  // text, tags, badges and thumbnail cost DOM for nothing. Rendering a plain
  // coloured box instead is what makes a 5 000-element overview usable — but it
  // is only worth the loss of legibility once there are enough nodes to pay for
  // it, hence the element-count gate below.
  const [isZoomedOut, setIsZoomedOut] = useState(false);

  const { t } = useTranslation('common');
  const { t: tPages, i18n } = useTranslation('pages');
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Stores — individual selectors to avoid re-renders when unrelated state changes
  const currentDossier = useDossierStore((s) => s.currentDossier);
  const evaluationModel = useEvaluationModel();
  const elements = useDossierStore((s) => s.elements);

  // Zooming out only strips detail on boards big enough for it to buy anything.
  // With the overview layer on, zooming out far over many nodes switches to it.
  const overviewEnabled = useUIStore((s) => s.canvasOverviewLayer);
  const isLowDetail = isZoomedOut && elements.length >= LOW_DETAIL_MIN_ELEMENTS;
  const links = useDossierStore((s) => s.links);

  // Overview layer: zoomed far out on a large board, React Flow keeps its
  // nodes hidden and one <canvas> draws them all (see overview/OverviewLayer)
  const [overviewActive, setOverviewActiveState] = useState(false);
  const overviewActiveRef = useRef(false);
  const overviewHandleRef = useRef<OverviewHandle | null>(null);
  const overviewEnabledRef = useRef(overviewEnabled);
  overviewEnabledRef.current = overviewEnabled;
  /** Last viewport change, current even before React re-renders. */
  const liveViewportRef = useRef(useViewStore.getState().viewport);
  const setOverviewActive = useCallback((next: boolean) => {
    if (overviewActiveRef.current === next) return;
    overviewActiveRef.current = next;
    setOverviewActiveState(next);
  }, []);

  // O(1) element lookup map — avoids O(n) .find() in hot paths (drag, resize, context menu)
  const elementMap = useMemo(() => new Map(elements.map(el => [el.id, el])), [elements]);
  const assets = useDossierStore((s) => s.assets);
  const comments = useDossierStore((s) => s.comments);
  const createElement = useDossierStore((s) => s.createElement);
  const updateElement = useDossierStore((s) => s.updateElement);
  const updateElementPositions = useDossierStore((s) => s.updateElementPositions);
  const createLink = useDossierStore((s) => s.createLink);
  const updateLink = useDossierStore((s) => s.updateLink);
  const deleteElements = useDossierStore((s) => s.deleteElements);
  const deleteLinks = useDossierStore((s) => s.deleteLinks);
  const addAsset = useDossierStore((s) => s.addAsset);
  const createGroup = useDossierStore((s) => s.createGroup);
  const removeFromGroup = useDossierStore((s) => s.removeFromGroup);
  const dissolveGroup = useDossierStore((s) => s.dissolveGroup);
  const mergeElementsAction = useDossierStore((s) => s.mergeElements);
  const pasteElements = useDossierStore((s) => s.pasteElements);
  const loadDossier = useDossierStore((s) => s.loadDossier);

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

  // Merge modal state
  const [mergeElements, setMergeElements] = useState<Element[] | null>(null);

  // Link context menu state
  const [linkContextMenu, setLinkContextMenu] = useState<LinkContextMenuState | null>(null);

  // Plugin context menu extensions
  const canvasPlugins = usePlugins('contextMenu:canvas');
  const elementPlugins = usePlugins('contextMenu:element');
  const linkPlugins = usePlugins('contextMenu:link');

  // Asset preview modal state
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);

  // Global in-memory clipboard (module-level store) — survives dossier switch,
  // which is what enables cross-dossier paste. See clipboardStore.
  const setClipboard = useClipboardStore((s) => s.setClipboard);
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

  // Write elements (and the links between them) to the global clipboard + system
  // clipboard marker. Links are captured now (not rebuilt at paste time) so paste
  // works even in another dossier where the source links are no longer loaded.
  const writeClipboard = useCallback((elsToCopy: Element[], linkIds: string[] = []) => {
    if (elsToCopy.length === 0) return;
    const idSet = new Set(elsToCopy.map((el) => el.id));
    const linksToCopy = links.filter((l) => idSet.has(l.fromId) && idSet.has(l.toId));
    setClipboard(elsToCopy, linksToCopy, currentDossier?.id ?? null);
    const clipboardData = buildClipboardData(elsToCopy.map((el) => el.id), linkIds);
    navigator.clipboard.writeText(clipboardData).catch(() => {});
  }, [links, currentDossier, setClipboard, buildClipboardData]);

  // History store for undo/redo
  const { pushAction, popUndo, popRedo } = useHistoryStore();

  // Selection store — individual selectors prevent re-renders when unrelated selection state changes
  const selectedElementIds = useSelectionStore((s) => s.selectedElementIds);
  const selectedLinkIds = useSelectionStore((s) => s.selectedLinkIds);
  const editingElementId = useSelectionStore((s) => s.editingElementId);
  const editingLinkId = useSelectionStore((s) => s.editingLinkId);
  const selectElement = useSelectionStore((s) => s.selectElement);
  const selectElements = useSelectionStore((s) => s.selectElements);
  const selectLink = useSelectionStore((s) => s.selectLink);
  const selectLinks = useSelectionStore((s) => s.selectLinks);
  const toggleLink = useSelectionStore((s) => s.toggleLink);
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
  const requestViewportChange = useViewStore((s) => s.requestViewportChange);
  // Hidden by hand, or outside the filters when the user chose to hide them
  const viewHiddenIds = useHiddenElementIds();

  // Tab filtering
  const activeTabId = useTabStore((s) => s.activeTabId);
  const extraTabIds = useTabStore((s) => s.extraTabIds);
  const tabMemberSet = useTabStore((s) => s.memberSet);
  const tabExcludedSet = useTabStore((s) => s.excludedSet);
  const canvasTabs = useTabStore((s) => s.tabs);
  const addTabMembers = useTabStore((s) => s.addMembers);
  const removeTabMembers = useTabStore((s) => s.removeMembers);
  const excludeFromTab = useTabStore((s) => s.excludeFromTab);
  const getTabsForElement = useTabStore((s) => s.getTabsForElement);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const createTab = useTabStore((s) => s.createTab);
  const saveTabViewport = useTabStore((s) => s.saveTabViewport);

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
    // Leave the overview once the gesture is over, never during it
    const live = liveViewportRef.current;
    if (overviewActiveRef.current &&
        (live.zoom >= OVERVIEW_EXIT_ZOOM || countNodesInView(live, OVERVIEW_EXIT_VISIBLE) < OVERVIEW_EXIT_VISIBLE)) {
      setOverviewActive(false);
    }
    cullingViewportRef.current = viewportRef.current;
    // Bump edgeVersion to trigger re-cull with the updated viewport
    setEdgeVersion(v => v + 1);
  }, [setOverviewActive]);

  // Keep a ref to the latest viewport for handleMoveEnd
  const viewportRef = useRef(viewport);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  const {
    highlightedElementIds: insightsHighlightedIds,
    findPaths,
    findAllPaths,
    clearHighlight,
  } = useInsightsStore();

  // Query store for ZNQuery canvas filter
  const queryFilterActive = useQueryStore((s) => s.isFilterActive);
  const queryMatchElementIds = useQueryStore((s) => s.matchingElementIds);
  const queryMatchLinkIds = useQueryStore((s) => s.matchingLinkIds);

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
  const setSidePanelTab = useUIStore((state) => state.setSidePanelTab);
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

  // Temporal navigator (same controls as the map): classify elements and links
  // at the selected instant or over the selected period. Display-only state
  // (viewStore.canvasTemporal), never persisted nor synced.
  const canvasTemporal = useViewStore((s) => s.canvasTemporal);
  const setCanvasTemporal = useViewStore((s) => s.setCanvasTemporal);
  // Date properties kept in the filters panel date the elements, as on the
  // timeline and the map
  const includedDateProperties = useViewStore((s) => s.filters.includedDateProperties);
  const excludedDateProperties = useViewStore((s) => s.filters.excludedDateProperties);
  const dateRangeProperties = useViewStore((s) => s.filters.dateRangeProperties);
  const keepDateProperty = useMemo(
    () => datePropertyRules({ includedDateProperties, excludedDateProperties, dateRangeProperties }),
    [includedDateProperties, excludedDateProperties, dateRangeProperties]
  );
  const temporalDates = useMemo(
    () => collectTemporalDates(elements, links, keepDateProperty),
    [elements, links, keepDateProperty]
  );
  const [isTemporalPlaying, setIsTemporalPlaying] = useState(false);
  const temporalClassification = useMemo(() => {
    if (!canvasTemporal.active || !canvasTemporal.date) return null;
    return computeCanvasTemporalClassification(elements, links, canvasTemporal.date, canvasTemporal.periodEnd, keepDateProperty);
  }, [canvasTemporal.active, canvasTemporal.date, canvasTemporal.periodEnd, elements, links, keepDateProperty]);

  const handleToggleTemporal = useCallback(() => {
    if (!canvasTemporal.active && temporalDates.length > 0) {
      setCanvasTemporal({ active: true, date: temporalDates[closestDateIndex(temporalDates, Date.now())] });
    } else {
      setCanvasTemporal({ active: false, date: null, periodEnd: null });
      setIsTemporalPlaying(false);
    }
  }, [canvasTemporal.active, temporalDates, setCanvasTemporal]);

  // Play every 800ms (same pace as the map): next date, or slide the period
  // one step keeping its width; stop at the end
  useEffect(() => {
    if (!isTemporalPlaying || temporalDates.length === 0) return;
    const interval = setInterval(() => {
      const { date, periodEnd } = useViewStore.getState().canvasTemporal;
      const next = date ? shiftNavigator(temporalDates, date, periodEnd, 1) : { start: temporalDates[0], periodEnd: null };
      if (!next) {
        setIsTemporalPlaying(false);
        return;
      }
      setCanvasTemporal({ date: next.start, periodEnd: next.periodEnd });
    }, 800);
    return () => clearInterval(interval);
  }, [isTemporalPlaying, temporalDates, setCanvasTemporal]);

  // Undated elements/links hidden by the cursor (stable references: the window moves often)
  const prevTemporalHiddenElementsRef = useRef(EMPTY_ID_SET);
  const temporalHiddenElementIds = useMemo(() => {
    const next = temporalClassification && !canvasTemporal.showUndated
      ? temporalClassification.undatedElementIds
      : EMPTY_ID_SET;
    prevTemporalHiddenElementsRef.current = reuseIfSameSet(prevTemporalHiddenElementsRef.current, next);
    return prevTemporalHiddenElementsRef.current;
  }, [temporalClassification, canvasTemporal.showUndated]);
  const prevTemporalHiddenLinksRef = useRef(EMPTY_ID_SET);
  const temporalHiddenLinkIds = useMemo(() => {
    const next = temporalClassification && !canvasTemporal.showUndated
      ? temporalClassification.undatedLinkIds
      : EMPTY_ID_SET;
    prevTemporalHiddenLinksRef.current = reuseIfSameSet(prevTemporalHiddenLinksRef.current, next);
    return prevTemporalHiddenLinksRef.current;
  }, [temporalClassification, canvasTemporal.showUndated]);

  // Events shown under each active element: the most recent one, a count of
  // the others (period mode), and the full dated list (clickable popover).
  const prevTemporalEventSummariesRef = useRef(new Map<string, TemporalEventSummary>());
  const temporalEventSummaries = useMemo(() => {
    const next = new Map<string, TemporalEventSummary>();
    if (temporalClassification) {
      for (const [id, events] of temporalClassification.activeEventsByElement) {
        next.set(id, summarizeActiveEvents(events, i18n.language));
      }
    }
    // Keep previous summary objects when unchanged, so only nodes whose events
    // changed are rebuilt; keep the previous Map when nothing changed at all.
    const prev = prevTemporalEventSummariesRef.current;
    let changed = prev.size !== next.size;
    for (const [id, summary] of next) {
      const p = prev.get(id);
      if (p && sameEventSummary(p, summary)) {
        next.set(id, p);
      } else {
        changed = true;
      }
    }
    if (!changed) return prev;
    prevTemporalEventSummariesRef.current = next;
    return next;
  }, [temporalClassification, i18n.language]);

  // Calculate dimmed element IDs based on filters, focus, and insights highlighting
  // Stabilized: returns the same Set reference if contents haven't changed,
  // preventing unnecessary cascading to nodes and edges useMemos.
  const prevDimmedRef = useRef(new Set<string>());
  const tabFilterIds = useTabFilterIds();
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
      newDimmed = getDimmedElementIds(elements, filters, hiddenElementIds, evaluationModel, tabFilterIds);
    }

    // ZNQuery canvas filter: dim elements not matching the query
    if (queryFilterActive && queryMatchElementIds.size > 0) {
      for (const el of elements) {
        if (!queryMatchElementIds.has(el.id)) {
          newDimmed.add(el.id);
        }
      }
    }

    // Temporal navigator: dated elements with nothing at the instant/period,
    // and undated ones when shown greyed (hidden otherwise, see visible filter)
    if (temporalClassification) {
      for (const id of temporalClassification.inactiveElementIds) newDimmed.add(id);
      if (canvasTemporal.showUndated) {
        for (const id of temporalClassification.undatedElementIds) newDimmed.add(id);
      }
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
  }, [elements, links, filters, hiddenElementIds, focusElementId, focusDepth, insightsHighlightedIds, queryFilterActive, queryMatchElementIds, evaluationModel, temporalClassification, canvasTemporal.showUndated, tabFilterIds]);

  // Emphasized (glow) element IDs: the positive "result set" of an active
  // narrowing — insights highlight, ZNQuery filter, or view filters. These are
  // the non-dimmed elements, so they pop with a glow instead of relying only on
  // the others being faded. Focus mode alone does not emphasize (navigational).
  const filtersActive = useViewStore((s) => s.hasActiveFilters());
  const prevEmphasizedRef = useRef(new Set<string>());
  const emphasizedElementIds = useMemo(() => {
    const narrowingActive =
      insightsHighlightedIds.size > 0 ||
      (queryFilterActive && queryMatchElementIds.size > 0) ||
      filtersActive;

    let next: Set<string>;
    if (temporalClassification) {
      // Canvas time cursor: glow on elements with an event inside the window
      next = new Set<string>();
      for (const id of temporalClassification.activeElementIds) {
        if (!dimmedElementIds.has(id)) next.add(id);
      }
    } else if (!narrowingActive) {
      next = new Set<string>();
    } else {
      next = new Set<string>();
      for (const el of elements) {
        if (!dimmedElementIds.has(el.id)) next.add(el.id);
      }
    }

    // Stabilize reference to avoid cascading re-renders when unchanged
    const prev = prevEmphasizedRef.current;
    if (next.size === prev.size) {
      let same = true;
      for (const id of next) {
        if (!prev.has(id)) { same = false; break; }
      }
      if (same) return prev;
    }
    prevEmphasizedRef.current = next;
    return next;
  }, [elements, dimmedElementIds, insightsHighlightedIds, queryFilterActive, queryMatchElementIds, filtersActive, temporalClassification]);

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
      const oldLink = links.find((l) => l.id === linkId);
      if (oldLink && oldLink.label !== newLabel) {
        pushAction({
          type: 'update-link',
          undo: { linkId, linkChanges: { label: oldLink.label } },
          redo: { linkId, linkChanges: { label: newLabel } },
        });
      }
      updateLink(linkId, { label: newLabel });
    },
    [links, updateLink, pushAction]
  );

  // Get display settings from dossier using specific selectors for reactivity
  const showConfidenceIndicator = useDossierStore(
    (state) => state.currentDossier?.settings?.showConfidenceIndicator ?? false
  );
  // Model whose badge is shown on nodes/edges, null when badges are off
  const confidenceDisplay = showConfidenceIndicator ? evaluationModel : null;
  const tagDisplayMode = useDossierStore(
    (state) => state.currentDossier?.settings?.tagDisplayMode ?? 'icons'
  );
  const tagDisplaySize = useDossierStore(
    (state) => state.currentDossier?.settings?.tagDisplaySize ?? 'small'
  );
  const linkAnchorMode = useDossierStore(
    (state) => state.currentDossier?.settings?.linkAnchorMode ?? 'manual'
  );
  const linkCurveMode = useDossierStore(
    (state) => state.currentDossier?.settings?.linkCurveMode ?? 'curved'
  );
  const displayedProperties = useMemo(
    () => currentDossier?.settings?.displayedProperties ?? [],
    [currentDossier?.settings?.displayedProperties]
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

  // Track property display settings to invalidate cache when they change
  const prevBadgeKeyRef = useRef(filters.badgePropertyKey);
  const prevDisplayedPropsRef = useRef(displayedProperties);
  // Date property values are formatted in the UI language
  const propertyDateLocale = dateLocale(i18n.language);
  const prevPropertyDateLocaleRef = useRef(propertyDateLocale);

  const nodeStructures = useMemo(() => {
    const prevElements = prevElementsByIdRef.current;
    const cache = nodeStructureCacheRef.current;

    // Invalidate entire cache when property display settings change
    if (prevBadgeKeyRef.current !== filters.badgePropertyKey ||
        prevDisplayedPropsRef.current !== displayedProperties ||
        prevPropertyDateLocaleRef.current !== propertyDateLocale) {
      cache.clear();
      prevBadgeKeyRef.current = filters.badgePropertyKey;
      prevDisplayedPropsRef.current = displayedProperties;
      prevPropertyDateLocaleRef.current = propertyDateLocale;
    }

    const buildStructure = (el: Element): NodeStructure => {
      const firstAssetId = el.assetIds?.[0];
      const thumbnail = firstAssetId ? assetMap.get(firstAssetId) ?? null : null;
      const isLoadingAsset = Boolean(firstAssetId) && !assetMap.has(firstAssetId);
      const unresolvedCommentCount = commentCountMap.get(el.id) || 0;

      let badgeProperty: { value: string; type: string } | null = null;
      if (filters.badgePropertyKey) {
        const props = propertiesOf(el.properties, filters.badgePropertyKey);
        if (props.length > 0) {
          const valueStr = props.map((p) => formatPropertyValue(p.value, p.type, i18n.language, p.timeZone)).join(VALUES_SEPARATOR);
          badgeProperty = { value: valueStr, type: props[0].type || 'text' };
        }
      }

      const displayedPropertyValues = displayedProperties
        .map(key => {
          // Every value of the key (a merge may leave several)
          const props = propertiesOf(el.properties, key);
          if (props.length === 0) return null;
          const valueStr = props.map((p) => formatPropertyValue(p.value, p.type, i18n.language, p.timeZone)).join(VALUES_SEPARATOR);
          return { key, value: valueStr };
        })
        .filter((p): p is { key: string; value: string } => p !== null);

      return { el, thumbnail, isLoadingAsset, unresolvedCommentCount, badgeProperty, displayedPropertyValues };
    };

    // Tab filtering: on "Tous" all elements pass, on specific tab only members + ghosts
    const visible = elements.filter((el) => {
      if (viewHiddenIds.has(el.id)) return false;
      if (temporalHiddenElementIds.has(el.id)) return false;
      if (activeTabId !== null && !tabMemberSet.has(el.id) && !localGhostIds.has(el.id)) return false;
      return true;
    });

    const result = visible.map(el => {
      // Reuse cached structure only when nothing affecting its output has changed.
      // Important: asset thumbnail availability can flip mid-session when chunks
      // finish arriving over a low-bandwidth link, so we must compare it too.
      const cached = cache.get(el.id);
      const firstAssetId = el.assetIds?.[0];
      const currentThumbnail = firstAssetId ? assetMap.get(firstAssetId) ?? null : null;
      const currentIsLoadingAsset = Boolean(firstAssetId) && !assetMap.has(firstAssetId);
      if (cached && prevElements.get(el.id) === el &&
          cached.unresolvedCommentCount === (commentCountMap.get(el.id) || 0) &&
          cached.thumbnail === currentThumbnail &&
          cached.isLoadingAsset === currentIsLoadingAsset) {
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
  }, [elements, viewHiddenIds, temporalHiddenElementIds, assetMap, commentCountMap, filters.badgePropertyKey, displayedProperties, propertyDateLocale, activeTabId, tabMemberSet, localGhostIds]);

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
  const prevHighlightedIdsRef = useRef(emphasizedElementIds);
  const prevEditingIdRef = useRef(editingElementId);
  const prevRemoteUsersRef = useRef(remoteUsersByElement);
  const prevShowConfRef = useRef(confidenceDisplay);
  const prevTagModeRef = useRef(tagDisplayMode);
  const prevTagSizeRef = useRef(tagDisplaySize);
  const prevThemeRef = useRef(themeMode);
  const prevTabMemberSetRef = useRef(tabMemberSet);
  const prevActiveTabIdRef = useRef(activeTabId);
  const prevEventSummariesRef = useRef(temporalEventSummaries);

  // Which nodes carry at least one link. Stable: it depends on the links
  // themselves, not on the viewport, so panning never invalidates it.
  const linkedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const lk of links) {
      ids.add(lk.fromId);
      ids.add(lk.toId);
    }
    return ids;
  }, [links]);

  const nodes = useMemo(() => {
    // Switching tab is not a global change: only the nodes whose ghost status
    // changes are rebuilt (see the ghost status diff below)
    const globalSettingsChanged =
      prevShowConfRef.current !== confidenceDisplay ||
      prevTagModeRef.current !== tagDisplayMode ||
      prevTagSizeRef.current !== tagDisplaySize ||
      prevThemeRef.current !== themeMode;

    // Helper: build a single node from its structure
    const buildNode = (ns: typeof nodeStructures[number]) => {
      const callbacks = getCallbacks(ns.el.id, Boolean(ns.el.isAnnotation));
      const isGhostNode = activeTabId !== null && !tabMemberSet.has(ns.el.id);
      // Ghost elements that are children of a group have relative positions
      // but their parent group may not be visible on this tab. Convert to absolute.
      let el = ns.el;
      if (isGhostNode && el.parentGroupId) {
        const parentGroup = elementMap.get(el.parentGroupId);
        if (parentGroup) {
          el = { ...el, position: { x: el.position.x + parentGroup.position.x, y: el.position.y + parentGroup.position.y } };
        }
      }
      const node = elementToNode(
        el,
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
        confidenceDisplay,
        ns.displayedPropertyValues,
        tagDisplayMode,
        tagDisplaySize,
        themeMode,
        isGhostNode,
        emphasizedElementIds.has(ns.el.id),
        linkedNodeIds.has(ns.el.id),
        temporalEventSummaries.get(ns.el.id),
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
      prevHighlightedIdsRef.current = emphasizedElementIds;
      prevEventSummariesRef.current = temporalEventSummaries;
      prevEditingIdRef.current = editingElementId;
      prevRemoteUsersRef.current = remoteUsersByElement;
      prevShowConfRef.current = confidenceDisplay;
      prevTagModeRef.current = tagDisplayMode;
      prevTagSizeRef.current = tagDisplaySize;
      prevThemeRef.current = themeMode;
      prevTabMemberSetRef.current = tabMemberSet;
      prevActiveTabIdRef.current = activeTabId;
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

    // Emphasis diff (glow): rebuild nodes entering/leaving the result set
    if (prevHighlightedIdsRef.current !== emphasizedElementIds) {
      for (const id of emphasizedElementIds) {
        if (!prevHighlightedIdsRef.current.has(id)) needsRebuild.add(id);
      }
      for (const id of prevHighlightedIdsRef.current) {
        if (!emphasizedElementIds.has(id)) needsRebuild.add(id);
      }
    }

    // Temporal navigator event summary diff (summaries are recreated only when
    // their content changes, so reference inequality means a visual change)
    if (prevEventSummariesRef.current !== temporalEventSummaries) {
      for (const [id, summary] of temporalEventSummaries) {
        if (prevEventSummariesRef.current.get(id) !== summary) needsRebuild.add(id);
      }
      for (const id of prevEventSummariesRef.current.keys()) {
        if (!temporalEventSummaries.has(id)) needsRebuild.add(id);
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

    // Ghost status diff: a node is a ghost inside a tab when it is not a
    // member. Switching tab (or to "All", where nothing is a ghost) rebuilds
    // only the nodes whose status changes.
    if (prevTabMemberSetRef.current !== tabMemberSet || prevActiveTabIdRef.current !== activeTabId) {
      const prevTab = prevActiveTabIdRef.current;
      const prevMembers = prevTabMemberSetRef.current;
      for (const ns of nodeStructures) {
        const wasGhost = prevTab !== null && !prevMembers.has(ns.el.id);
        const isGhost = activeTabId !== null && !tabMemberSet.has(ns.el.id);
        if (wasGhost !== isGhost) needsRebuild.add(ns.el.id);
      }
    }

    // Update visual state refs
    prevSelectedIdsRef.current = selectedElementIds;
    prevDimmedIdsRef.current = dimmedElementIds;
    prevHighlightedIdsRef.current = emphasizedElementIds;
    prevEventSummariesRef.current = temporalEventSummaries;
    prevEditingIdRef.current = editingElementId;
    prevRemoteUsersRef.current = remoteUsersByElement;
    prevTabMemberSetRef.current = tabMemberSet;
    prevActiveTabIdRef.current = activeTabId;

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
  }, [nodeStructures, selectedElementIds, dimmedElementIds, emphasizedElementIds, temporalEventSummaries, editingElementId, stopEditing, confidenceDisplay, tagDisplayMode, tagDisplaySize, themeMode, remoteUsersByElement, activeTabId, tabMemberSet, elementMap, linkedNodeIds]);

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

  // Handle curve offset change for edge dragging (2D offset), stored for the current route style
  const handleCurveOffsetChange = useCallback(
    (linkId: string, offset: { x: number; y: number }) => {
      updateLink(linkId, linkCurveMode === 'orthogonal' ? { orthogonalOffset: offset } : { curveOffset: offset });
    },
    [updateLink, linkCurveMode]
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
  const lastElementCreatedAtRef = useRef(0);
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

  // Many nodes leaving at once (switching to a smaller tab): React Flow drops
  // them from its store before their components unmount, and each still
  // subscribed component then reads a missing node and throws, an error React
  // swallows. At 10 000 nodes that is most of a second. So they leave in two
  // renders: first kept but hidden (unmounted cleanly), then removed. Nodes
  // arriving wait for the second render too: placed among thousands of
  // siblings being removed, each insertion scans them.
  const RETIRE_IN_TWO_STEPS = 500;
  const lastFlowNodesRef = useRef<Node[]>([]);
  const overviewNodeCacheRef = useRef(new WeakMap<Node, Node>());
  const hiddenCopy = (n: Node, dark: boolean, unnamed: string): Node => {
    const cache = overviewNodeCacheRef.current;
    let hidden = cache.get(n);
    if (!hidden) {
      const size = nodeFootprint(n, dark, unnamed);
      hidden = { ...n, hidden: true, selected: false, draggable: false, initialWidth: size.width, initialHeight: size.height };
      cache.set(n, hidden);
    }
    return hidden;
  };
  // Entering the overview mid-gesture: React Flow applies the new zoom at
  // once but gets the hidden nodes only a render later (its nodes prop is
  // synced in an effect). For that one frame it would show the far-out view
  // with every node visible and mount thousands of them, a blank canvas for
  // seconds. So the hidden nodes go straight into its store first. Same
  // cached copies as the render that follows.
  const flowStoreRef = useRef<FlowStoreApi | null>(null);
  const hideAllFlowNodesNow = () => {
    const store = flowStoreRef.current;
    if (!store) return;
    const dark = themeMode === 'dark';
    const unnamed = t('empty.unnamed');
    store.getState().setNodes(lastFlowNodesRef.current.map((n) => (n.hidden ? n : hiddenCopy(n, dark, unnamed))));
  };
  const hideAllFlowNodesNowRef = useRef(hideAllFlowNodesNow);
  hideAllFlowNodesNowRef.current = hideAllFlowNodesNow;
  const sizedNodeCacheRef = useRef(new WeakMap<Node, { node: Node; measured: boolean }>());
  const [retireTick, setRetireTick] = useState(0);
  const flowNodes = useMemo(() => {
    const last = lastFlowNodesRef.current;
    let result = displayNodes;
    // Cheap guard first: only a large drop in count can hide a large exit.
    if (displayNodes.length + RETIRE_IN_TWO_STEPS <= last.length) {
      const kept = new Set(displayNodes.map((n) => n.id));
      const leaving: Node[] = [];
      for (const n of last) {
        if (!n.hidden && !kept.has(n.id)) leaving.push({ ...n, hidden: true, selected: false });
      }
      if (leaving.length >= RETIRE_IN_TWO_STEPS) {
        // Same order as before for the nodes that stay: a reordered node is
        // moved in the DOM, and each move scans its siblings.
        const next = new Map(displayNodes.map((n) => [n.id, n]));
        const leavingById = new Map(leaving.map((n) => [n.id, n]));
        result = last.flatMap((n) => next.get(n.id) ?? leavingById.get(n.id) ?? []);
      }
    }
    // With the overview layer, React Flow must never mount a node only because
    // it was not measured (its forced initial render): after the overview, or
    // on a dossier opened zoomed out, that is thousands of full nodes at once
    // and a blank canvas for seconds. React Flow drops a node's handles when
    // the object it gets has no `measured`, so a node measured before gets its
    // size back; one never measured gets an estimated size and handles, and is
    // measured for real once on screen.
    const dark = themeMode === 'dark';
    const unnamed = t('empty.unnamed');
    if (overviewEnabled) {
      const sizedCache = sizedNodeCacheRef.current;
      result = result.map((n) => {
        const dims = measuredDimensionsRef.current.get(n.id);
        const cached = sizedCache.get(n);
        if (cached && cached.measured === Boolean(dims)) return cached.node;
        let sized: Node;
        if (dims) {
          sized = n.measured ? n : { ...n, measured: dims };
        } else {
          const size = nodeFootprint(n, dark, unnamed);
          const shape = (n.data as { element?: Element }).element?.visual.shape;
          // `measured` too: React Flow holds fitView back until every shown
          // node has one, then runs it late, at the next real measurement
          sized = {
            ...n,
            measured: size,
            initialWidth: size.width,
            initialHeight: size.height,
            handles: estimateHandles(n.type, shape, size.width, size.height),
          };
        }
        sizedCache.set(n, { node: sized, measured: Boolean(dims) });
        return sized;
      });
    }

    // Overview: every node stays in React Flow (keeping its measured size and
    // handles) but hidden, so none is mounted. An empty array would remount
    // them all on the way back. Cached per node: unchanged nodes keep their copy.
    if (overviewActive) {
      result = result.map((n) => hiddenCopy(n, dark, unnamed));
    }
    lastFlowNodesRef.current = result;
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayNodes, retireTick, overviewActive, overviewEnabled]);
  const hasRetiringNodes = !overviewActive && flowNodes !== displayNodes;
  useEffect(() => {
    if (!hasRetiringNodes) return;
    const id = requestAnimationFrame(() => setRetireTick((t) => t + 1));
    return () => cancelAnimationFrame(id);
  }, [hasRetiringNodes, flowNodes]);

  // Track node positions in a ref (updated every frame, but doesn't trigger re-renders)
  const nodePositionsRef = useRef(new Map<string, Position>());
  /** Displayed nodes whose corner lies in a viewport (with a margin), counted up to `cap`. */
  function countNodesInView(v: { x: number; y: number; zoom: number }, cap: number): number {
    const flow = flowStoreRef.current?.getState();
    if (!flow || v.zoom <= 0) return 0;
    const margin = 100;
    const x0 = -v.x / v.zoom - margin, y0 = -v.y / v.zoom - margin;
    const x1 = (flow.width - v.x) / v.zoom, y1 = (flow.height - v.y) / v.zoom;
    let count = 0;
    for (const p of nodePositionsRef.current.values()) {
      if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && ++count >= cap) break;
    }
    return count;
  }
  // Version counter to trigger edge recomputation on drag-end / structural changes
  const [edgeVersion, setEdgeVersion] = useState(0);
  const edgeVersionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update positions ref from displayNodes (cheap, no re-render)
  useEffect(() => {
    nodePositionsRef.current = computeAbsoluteNodePositions(displayNodes);

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

  const linkVisualContext: LinkVisualContext = useMemo(() => ({
    selectedLinkIds,
    dimmedElementIds,
    emphasizedElementCount: emphasizedElementIds.size,
    queryFilterActive,
    queryMatchLinkIds,
    temporal: temporalClassification,
    showUndated: canvasTemporal.showUndated,
  }), [selectedLinkIds, dimmedElementIds, emphasizedElementIds, queryFilterActive, queryMatchLinkIds, temporalClassification, canvasTemporal.showUndated]);

  const allEdges = useMemo(() => {
    // The overview layer draws every link itself. Returning before the cache
    // keeps it for the way back.
    if (overviewActive) return EMPTY_EDGES;
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
      if (temporalHiddenLinkIds.has(link.id)) return false;
      if (viewHiddenIds.has(link.fromId) || viewHiddenIds.has(link.toId)) return false;
      const fromPos = nodePositions.get(link.fromId);
      const toPos = nodePositions.get(link.toId);
      // An endpoint with no position is not displayed (outside the active
      // tab, filtered, hidden): the edge cannot be drawn. Letting it through
      // would also take a place under MAX_RENDERED_EDGES from a drawable one.
      if (!fromPos || !toPos) return false;
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
    // Links sharing a node side, whatever their other end, get their own point along it
    const handleSlots = computeHandleSlots(cappedLinks, nodePositions, linkAnchorMode, parallelLookup);

    const useSimpleEdges = cappedLinks.length > SIMPLE_EDGE_THRESHOLD;

    const newCache = new Map<string, Edge>();
    const result = cappedLinks.map(link => {
      const { isSelected, isDimmed: isLinkDimmed, isHighlighted: isLinkHighlighted } = linkVisualState(link, linkVisualContext);
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
          && cd?._showConfidence === confidenceDisplay
          && cd?._dateLocale === propertyDateLocale;
        if (linkUnchanged && globalsUnchanged) {
          const sameVisuals = cached.selected === isSelected
            && cd?.isDimmed === isLinkDimmed
            && cd?.isHighlighted === isLinkHighlighted
            && (cached.type === 'simple') === simplified;
          if (sameVisuals) {
            // In auto anchor mode, verify handles are still optimal for current positions
            let handlesStale = false;
            if ((link.anchorMode ?? linkAnchorMode) === 'auto') {
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
              const slots = handleSlots.get(link.id);
              const sameSlots = cd?.sourceSlot === (slots?.source ?? 0) && cd?.targetSlot === (slots?.target ?? 0);
              if (sameEditing && sameRemote && sameParallel && sameSlots) {
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
            const props = propertiesOf(link.properties, key);
            if (props.length === 0) return null;
            const valueStr = props.map((p) => formatPropertyValue(p.value, p.type, i18n.language, p.timeZone)).join(VALUES_SEPARATOR);
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
          confidenceDisplay, linkDisplayedPropertyValues,
          remoteUsersByLink.get(link.id),
          false,
          handleSlots.get(link.id)
        );
      }

      // Stamp cache metadata for next comparison
      const edgeData = edge.data as any;
      edgeData._linkRef = link;
      edgeData._curveMode = linkCurveMode;
      edgeData._anchorMode = linkAnchorMode;
      edgeData._showConfidence = confidenceDisplay;
      edgeData._dateLocale = propertyDateLocale;
      edgeData.isHighlighted = isLinkHighlighted;
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
  }, [overviewActive, linkVisualContext, links, edgeVersion, wrapperSize, selectedLinkIds, selectedElementIds, dimmedElementIds, emphasizedElementIds, linkAnchorMode, linkCurveMode, editingLinkId, stopEditing, confidenceDisplay, displayedProperties, remoteUsersByLink, queryFilterActive, queryMatchLinkIds, temporalClassification, temporalHiddenLinkIds, canvasTemporal.showUndated, propertyDateLocale, viewHiddenIds]);

  // What the overview layer draws: the nodes as assembled for React Flow (tab,
  // hidden and time filters applied, selection and dimming resolved) and the
  // links the edges would show, with no viewport culling and no cap.
  const overviewScene = useMemo<OverviewScene | null>(() => {
    if (!overviewActive) return null;
    return buildOverviewScene({
      nodes,
      links,
      isLinkShown: (link) => !temporalHiddenLinkIds.has(link.id) && !viewHiddenIds.has(link.fromId) && !viewHiddenIds.has(link.toId),
      linkFlags: (link) => linkFlagsOf(linkVisualState(link, linkVisualContext)),
      dark: themeMode === 'dark',
      fallbackLabel: t('empty.unnamed'),
    });
  }, [overviewActive, nodes, links, temporalHiddenLinkIds, viewHiddenIds, linkVisualContext, themeMode, t]);
  // Minimap outside the overview: drawn from the same kind of scene, nodes
  // only. React Flow's own minimap mounts one subscribed component per node,
  // which every viewport change then re-evaluates (seconds at 10 000 nodes).
  const minimapScene = useMemo<OverviewScene | null>(() => {
    if (!overviewEnabled || !showMinimap || overviewActive) return null;
    return buildOverviewScene({
      nodes,
      links: [],
      isLinkShown: () => false,
      linkFlags: () => 0,
      dark: themeMode === 'dark',
      fallbackLabel: t('empty.unnamed'),
      nodesOnly: true,
    });
  }, [overviewEnabled, showMinimap, overviewActive, nodes, themeMode, t]);
  const overviewSceneRef = useRef(overviewScene);
  overviewSceneRef.current = overviewScene;

  // Dragging in the overview: an element, or the selection it belongs to.
  // The press is taken from React Flow (capture phase) only when it lands on
  // a movable element, so a press on empty canvas still pans and Shift still
  // draws a selection box. A press that does not move stays a click.
  const OVERVIEW_DRAG_THRESHOLD_PX = 3;
  /** Clicks before this time end a drag: they select nothing. */
  const suppressClickUntilRef = useRef(0);
  const overviewDragDepsRef = useRef({ elementMap, updateElementPositions, pushAction, updateDragging, snapToGrid, gridSize });
  overviewDragDepsRef.current = { elementMap, updateElementPositions, pushAction, updateDragging, snapToGrid, gridSize };
  const handleOverviewPointerDown = useCallback((event: React.PointerEvent) => {
    if (!overviewActiveRef.current || event.button !== 0 || event.shiftKey) return;
    const handle = overviewHandleRef.current;
    const scene = overviewSceneRef.current;
    if (!handle || !scene) return;
    // A drag takes an element only when pressed right on it: the click reach
    // around tiny nodes covers most of a dense view, which must still pan.
    // An element already selected keeps that reach (aimed at on purpose).
    const selected = useSelectionStore.getState().selectedElementIds;
    let hitId = handle.hitTestClient(event.clientX, event.clientY, 0);
    if (!hitId) {
      const near = handle.hitTestClient(event.clientX, event.clientY);
      if (near && selected.has(near)) hitId = near;
    }
    if (!hitId) return;
    const { elementMap: els } = overviewDragDepsRef.current;

    // What moves: the selection if the element is in it, else the element alone;
    // never a locked element or a ghost, nor a child whose group moves too
    const candidates = selected.has(hitId) ? [...selected] : [hitId];
    const candidateSet = new Set(candidates);
    const ids = candidates.filter((id) => {
      const el = els.get(id);
      const i = scene.indexById.get(id);
      if (!el || i === undefined || el.isPositionLocked || scene.flags[i] & NODE_GHOST) return false;
      return !(el.parentGroupId && candidateSet.has(el.parentGroupId));
    });
    if (ids.length === 0) return;

    // Drawn nodes to offset: the moved ones and the children of moved groups
    const moving = new Set(ids);
    const indices: number[] = [];
    for (let i = 0; i < scene.nodeCount; i++) {
      const el = els.get(scene.ids[i]);
      if (moving.has(scene.ids[i]) || (el?.parentGroupId && moving.has(el.parentGroupId))) indices.push(i);
    }

    event.preventDefault(); // no compatibility mousedown: d3-zoom does not pan
    event.stopPropagation(); // nor does React Flow's pane start a selection
    const startX = event.clientX, startY = event.clientY;
    const zoom = useViewStore.getState().viewport.zoom || 1;
    let dragging = false;
    let cancelled = false;
    let dx = 0, dy = 0;
    const swallowClick = () => { suppressClickUntilRef.current = performance.now() + 300; };

    const onMove = (e: PointerEvent) => {
      if (cancelled) return;
      if (!dragging) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < OVERVIEW_DRAG_THRESHOLD_PX) return;
        dragging = true;
        overviewDragDepsRef.current.updateDragging(ids);
      }
      dx = (e.clientX - startX) / zoom;
      dy = (e.clientY - startY) / zoom;
      handle.previewOffset(indices, dx, dy);
    };
    const stop = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey, true);
    };
    const cancel = () => {
      cancelled = true;
      if (!dragging) return;
      handle.cancelOffset();
      overviewDragDepsRef.current.updateDragging([]);
    };
    const onCancel = () => { stop(); cancel(); };
    // Escape puts everything back; the button is still down, the release that
    // follows must not count as a click
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || cancelled) return;
      e.preventDefault();
      e.stopPropagation();
      cancel();
    };
    const onUp = () => {
      stop();
      if (cancelled) { swallowClick(); return; }
      if (!dragging) return; // a click: React Flow's pane click selects it
      swallowClick();
      const { elementMap: current, updateElementPositions: commit, pushAction: push, updateDragging: setDragging, snapToGrid: snap, gridSize: grid } = overviewDragDepsRef.current;
      const undoPositions: { id: string; position: Position }[] = [];
      const redoPositions: { id: string; position: Position }[] = [];
      for (const id of ids) {
        const el = current.get(id);
        if (!el) continue;
        let x = el.position.x + dx, y = el.position.y + dy;
        if (snap && grid > 0) { x = Math.round(x / grid) * grid; y = Math.round(y / grid) * grid; }
        if (x === el.position.x && y === el.position.y) continue;
        undoPositions.push({ id, position: { ...el.position } });
        redoPositions.push({ id, position: { x, y } });
      }
      setDragging([]);
      if (redoPositions.length === 0) {
        handle.cancelOffset();
        return;
      }
      handle.endOffset();
      push({ type: 'move-elements', undo: { positions: undoPositions }, redo: { positions: redoPositions } });
      commit(redoPositions);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey, true);
  }, []);

  // The click that ends a drag is not a selection click
  const handleOverviewClickCapture = useCallback((event: React.MouseEvent) => {
    if (performance.now() > suppressClickUntilRef.current) return;
    suppressClickUntilRef.current = 0;
    event.stopPropagation();
  }, []);

  // Shift+box over the overview: same result as React Flow's partial selection
  const handleOverviewBoxSelect = useCallback((scene: OverviewScene, indices: number[]) => {
    selectBoth(indices.map((i) => scene.ids[i]), linksTouching(scene, indices), false);
  }, [selectBoth]);

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

  const cappedEdges = edgeRenderLimit >= allEdges.length
    ? allEdges
    : allEdges.slice(0, edgeRenderLimit);
  // Zoomed far out, element nodes carry a single handle: edges drop their
  // handle ids so React Flow anchors them to a node's first handle. The
  // per-edge cache keeps these objects stable across renders.
  const lowDetailEdgeCacheRef = useRef(new WeakMap<Edge, Edge>());
  const edges = useMemo(() => {
    if (!isLowDetail) return cappedEdges;
    const cache = lowDetailEdgeCacheRef.current;
    return cappedEdges.map((e) => {
      let lod = cache.get(e);
      if (!lod) {
        lod = { ...e, sourceHandle: null, targetHandle: null };
        cache.set(e, lod);
      }
      return lod;
    });
  }, [cappedEdges, isLowDetail]);
  const edgesRef = useRef(edges);
  edgesRef.current = edges;



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
      } else if (!isNowDragging && !wasDragging && safeChanges.some(c => c.type === 'dimensions' && 'resizing' in c && (c as any).resizing)) {
        // NodeResizer dimension changes (resize from bottom-right corner, no position change).
        // Switch to localNodes mode so dimensions update smoothly during resize.
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

  // Track the node the user actually started dragging from. In ConnectionMode.Loose
  // each side has overlapping source+target handles, so React Flow's normalized
  // connection.source/target don't reliably reflect the drag origin — the true
  // origin is what onConnectStart reports.
  const connectStartNodeRef = useRef<string | null>(null);
  const handleConnectStart: OnConnectStart = useCallback((_event, params) => {
    connectStartNodeRef.current = params.nodeId ?? null;
  }, []);

  // Handle connection (link creation). The relation goes from the drag origin
  // (fromId) to the drop target (toId), so a link drawn A→B is stored A→B.
  const handleConnect: OnConnect = useCallback(
    async (connection: Connection) => {
      if (
        connection.source &&
        connection.target &&
        connection.source !== connection.target
      ) {
        // If the drag started from the node React Flow labeled as `target`, swap
        // so the origin becomes fromId. Fall back to source when origin unknown.
        const origin = connectStartNodeRef.current;
        const swap = origin === connection.target && origin !== connection.source;

        const fromId = swap ? connection.target : connection.source;
        const toId = swap ? connection.source : connection.target;

        const linkDossier = useDossierStore.getState().currentDossier;
        const created = await createLink(fromId, toId, withDossierLinkDefaults(linkDossier, {
          sourceHandle: swap
            ? (connection.targetHandle ?? null)
            : (connection.sourceHandle ?? null),
          targetHandle: swap
            ? (connection.sourceHandle ?? null)
            : (connection.targetHandle ?? null),
        }));

        // Drawn from an element of a multi-selection: link every other selected
        // element to the same target too (auto anchors), as one undo step.
        const selected = useSelectionStore.getState().selectedElementIds;
        const others = selected.has(fromId)
          ? useDossierStore.getState().elements.filter(
              (el) => selected.has(el.id) && el.id !== fromId && el.id !== toId && !el.isAnnotation
            )
          : [];
        const links = [created];
        for (const el of others) {
          links.push(await createLink(el.id, toId, withDossierLinkDefaults(linkDossier)));
        }

        pushAction({
          type: 'create-link',
          undo: {},
          redo: { linkIds: links.map((l) => l.id), links },
        });
        connectStartNodeRef.current = null;
      }
    },
    [createLink, pushAction]
  );

  // Which endpoint stayed put during a reconnect. In ConnectionMode.Loose every
  // node exposes overlapping source+target handles, so React Flow's normalized
  // connection.source/target don't say which end moved — onReconnectStart does.
  // Careful: it reports the type of the OPPOSITE (anchored) handle, so grabbing
  // the tail (source) yields 'target' here.
  const reconnectFixedEndRef = useRef<HandleType | null>(null);
  const handleReconnectStart = useCallback(
    (_event: React.MouseEvent | React.TouchEvent, _edge: Edge, fixedEndType: HandleType) => {
      reconnectFixedEndRef.current = fixedEndType;
    },
    []
  );

  // Handle edge reconnection (moving edge endpoints)
  const handleReconnect: OnReconnect = useCallback(
    async (oldEdge: Edge, newConnection: Connection) => {
      const fixedEnd = reconnectFixedEndRef.current;
      reconnectFixedEndRef.current = null;

      if (
        !newConnection.source ||
        !newConnection.target ||
        newConnection.source === newConnection.target
      ) {
        return;
      }

      // The head (target) moved when the anchored end is the source.
      // Fall back to the old prefix heuristic if the drag origin is unknown.
      const startedFromTarget =
        fixedEnd !== null
          ? fixedEnd === 'source'
          : (newConnection.sourceHandle?.startsWith('target-') ||
             newConnection.targetHandle?.startsWith('source-')) ?? false;

      // The end that stayed put keeps the node + handle it was rendered with.
      const fixedNodeId = startedFromTarget ? oldEdge.source : oldEdge.target;
      const fixedHandleId = startedFromTarget
        ? (oldEdge.sourceHandle ?? null)
        : (oldEdge.targetHandle ?? null);

      // Identify the moved end by elimination: whichever side of the new
      // connection isn't the untouched one.
      const sourceSideIsFixed =
        newConnection.source === fixedNodeId &&
        (newConnection.sourceHandle ?? null) === fixedHandleId;
      const movedNodeId = sourceSideIsFixed ? newConnection.target : newConnection.source;
      const movedHandleId = sourceSideIsFixed
        ? (newConnection.targetHandle ?? null)
        : (newConnection.sourceHandle ?? null);

      // Loose mode can report a handle of the opposite type (e.g. 'target-left'
      // grabbed while moving the tail) — realign the prefix with the role.
      const alignHandle = (handle: string | null, type: 'source' | 'target'): string | null => {
        if (!handle) return null;
        const position = handle.split('-')[1];
        return position ? `${type}-${position}` : handle;
      };

      const fromId = startedFromTarget ? fixedNodeId : movedNodeId;
      const toId = startedFromTarget ? movedNodeId : fixedNodeId;
      if (!fromId || !toId || fromId === toId) return;

      // Dropping an endpoint back on the node it already sat on means the user is
      // repositioning the anchor, not rewiring the link — pin it to 'manual' so the
      // chosen handle survives an auto-mode dossier. Rewiring to another node keeps
      // the existing mode, letting auto placement resume.
      const isReanchor = oldEdge.source === fromId && oldEdge.target === toId;

      const previous = links.find((l) => l.id === oldEdge.id);
      const changes = {
        fromId,
        toId,
        sourceHandle: alignHandle(startedFromTarget ? fixedHandleId : movedHandleId, 'source'),
        targetHandle: alignHandle(startedFromTarget ? movedHandleId : fixedHandleId, 'target'),
        ...(isReanchor ? { anchorMode: 'manual' as const } : {}),
      };

      await updateLink(oldEdge.id, changes);

      if (previous) {
        pushAction({
          type: 'update-link',
          undo: {
            linkId: oldEdge.id,
            linkChanges: {
              fromId: previous.fromId,
              toId: previous.toId,
              sourceHandle: previous.sourceHandle ?? null,
              targetHandle: previous.targetHandle ?? null,
              ...(isReanchor ? { anchorMode: previous.anchorMode } : {}),
            },
          },
          redo: { linkId: oldEdge.id, linkChanges: changes },
        });
      }
    },
    [updateLink, links, pushAction]
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
      // Close other context menus
      setCanvasContextMenu(null);
      setLinkContextMenu(null);

      const element = elementMap.get(node.id);
      if (element) {
        // Find first previewable asset (image or PDF)
        const previewableAsset = element.assetIds
          .map(id => assets.find(a => a.id === id))
          .find(a => a && (a.mimeType.startsWith('image/') || a.mimeType === 'application/pdf')) || null;

        // For annotations, show a notes excerpt instead of "unnamed"
        let elementLabel = element.label;
        if (!elementLabel && element.isAnnotation && element.notes) {
          const firstLine = element.notes.split('\n')[0].trim();
          elementLabel = firstLine.length > 40 ? firstLine.slice(0, 40) + '...' : firstLine;
        }

        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          elementId: element.id,
          elementLabel: elementLabel || t('empty.unnamed'),
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

  // Close link context menu
  const closeLinkContextMenu = useCallback(() => {
    setLinkContextMenu(null);
  }, []);

  // Handle right-click on a link (edge)
  const handleEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();

      // Close other context menus
      setContextMenu(null);
      setCanvasContextMenu(null);

      const link = links.find((l) => l.id === edge.id);

      setLinkContextMenu({
        x: event.clientX,
        y: event.clientY,
        linkId: edge.id,
        linkLabel: link?.label || '',
      });
    },
    [links]
  );

  // Handle right-click on empty canvas
  const handlePaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent<globalThis.Element, MouseEvent>) => {
      event.preventDefault();
      // Overview: nodes are drawn on a canvas, a right-click on one reaches
      // the pane. Same menu as on the node, acting on the selection when the
      // element belongs to a multiple one.
      if (overviewActiveRef.current) {
        const hitId = overviewHandleRef.current?.hitTestClient(event.clientX, event.clientY);
        if (hitId) {
          handleNodeContextMenu(event as React.MouseEvent, { id: hitId } as Node);
          return;
        }
      }
      // Close other context menus
      setContextMenu(null);
      setLinkContextMenu(null);

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
    [viewport, handleNodeContextMenu]
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

    pushAction({
      type: 'create-element',
      undo: {},
      redo: { elements: [annotation], elementIds: [annotation.id] },
    });
    selectElement(annotation.id);
  }, [canvasContextMenu, createElement, selectElement, pushAction, activeTabId, addTabMembers]);

  // Selection handlers for canvas context menu (work without contextMenu state)
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
  }, [elements, links, getSelectedElementIds, selectedLinkIds, deleteElements, clearSelection, pushAction, writeClipboard]);

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
    const newLinks: Link[] = relevantLinks.map(link => ({
      ...link,
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
  const canCreateTab = !!currentDossier && canvasTabs.length < MAX_TABS;
  const createTabFromIds = useCallback(async (ids: string[]) => {
    if (!currentDossier || ids.length === 0) return;
    const from = activeTabId;
    const sources = viewTabIds.map((tabId) => ({ tabId, removed: ids.filter((id) => tabMembers(tabId).has(id)) }));
    const tab = await createTab(currentDossier.id, tPages('dossier.tabs.defaultName', { n: canvasTabs.length + 1 }));
    // The new tab opens where the view stands (the elements are on screen)
    await saveTabViewport(tab.id, viewport);
    await addTabMembers(tab.id, ids);
    for (const { tabId, removed } of sources) if (removed.length > 0) await removeTabMembers(tabId, removed);
    setActiveTab(tab.id);
    pushTabMembership({
      changes: [{ tabId: tab.id, added: ids, removed: [] }, ...sources.map(({ tabId, removed }) => ({ tabId, added: [], removed }))],
      createdTab: tab,
      activeBefore: from,
      activeAfter: tab.id,
    });
  }, [currentDossier, activeTabId, viewTabIds, viewport, canvasTabs.length, saveTabViewport, createTab, tPages, addTabMembers, removeTabMembers, setActiveTab, tabMembers, pushTabMembership]);

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

  const handleSelectionHide = useCallback(() => {
    const selectedEls = getSelectedElementIds();
    if (selectedEls.length === 0) return;
    hideElements(selectedEls);
    clearSelection();
  }, [getSelectedElementIds, hideElements, clearSelection]);

  // Query: Find similar (single element — search by tags)
  const handleFindSimilar = useCallback(() => {
    // Element menu: right-clicked element; canvas menu: the single selected element
    const targetId = contextMenu?.elementId ?? getSelectedElementIds()[0];
    if (!targetId) return;
    const el = elements.find(e => e.id === targetId);
    if (!el) return;
    // A label close to it (LIKE: case, accents, small typos) AND one of its
    // tags; either part alone when the element lacks the other
    type Q = import('../../services/query/types').QueryNode;
    const label = el.label.trim();
    const tags = el.tags.filter(Boolean);
    if (tags.length === 0 && !label) {
      useUIStore.getState().showToast('warning', tPages('dossier.findSimilarNoTags'));
      return;
    }

    const tagConditions: Q[] = tags.map(tag => ({ type: 'condition' as const, field: 'tag', operator: 'eq' as const, value: tag }));
    const tagPart: Q | null = tagConditions.length === 0 ? null
      : tagConditions.length === 1 ? tagConditions[0]
      : { type: 'or' as const, children: tagConditions };
    const labelPart: Q | null = label ? { type: 'condition' as const, field: 'label', operator: 'like' as const, value: label } : null;
    const ast: Q = labelPart && tagPart
      ? { type: 'and' as const, children: [labelPart, tagPart] }
      : (labelPart ?? tagPart)!;

    const text = serializeQuery(ast);
    useQueryStore.getState().setText(text);
    useQueryStore.getState().execute();
    useUIStore.getState().setSidePanelTab('query');
  }, [contextMenu, elements, getSelectedElementIds]);

  // Open a URL from an element property in a new tab.
  const handleOpenUrl = useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
    closeContextMenu();
  }, [closeContextMenu]);

  // Copy a URL from an element property to the clipboard.
  const handleCopyUrl = useCallback((url: string) => {
    navigator.clipboard.writeText(url)
      .then(() => toast.success(tPages('dossier.urlCopied')))
      .catch(() => toast.error(tPages('dossier.urlCopyFailed')));
    closeContextMenu();
  }, [closeContextMenu, tPages]);

  // Query: Query from selection (multiple elements — search by labels)
  const handleQueryFromSelection = useCallback(() => {
    const selectedEls = getSelectedElementIds();
    if (selectedEls.length < 2) return;

    const conditions: import('../../services/query/types').QueryCondition[] = selectedEls
      .map(id => elements.find(e => e.id === id))
      .filter(Boolean)
      .map(el => ({
        type: 'condition' as const,
        field: 'label',
        operator: 'eq' as const,
        value: el!.label,
      }));

    if (conditions.length === 0) return;

    const ast = conditions.length === 1
      ? conditions[0]
      : { type: 'or' as const, children: conditions } as import('../../services/query/types').QueryOr;

    const text = serializeQuery(ast);
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
      .then(() => toast.success(tPages('dossier.mermaidCopied')))
      .catch(() => toast.error(tPages('dossier.mermaidCopyFailed')));
  }, [getSelectedElementIds, elements, links, tPages]);

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
      }

      // If we found an image in clipboard, create element with it
      if (imageFile) {
        pastedFromClipboard = true;
        const position = { x: canvasX, y: canvasY };
        const label = imageFile.name.replace(/\.[^/.]+$/, '') || 'Image';
        const newElement = await createElement(label, position, { date: new Date() });
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
    const clip = useClipboardStore.getState();
    if (pastedFromClipboard || clip.elements.length === 0 || !currentDossier) return;

    const { newElements, newLinks } = cloneClipboardForPaste(clip, currentDossier.id, canvasX, canvasY);

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
      redo: { elements: newElements, links: newLinks, elementIds: newElementIds, linkIds: newLinkIds },
    });

    // Select all pasted elements
    selectElements(newElementIds);
  }, [canvasContextMenu, links, currentDossier, pasteElements, selectElements, pushAction, addAsset, createElement, activeTabId, addTabMembers]);

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
      writeClipboard(elsToCopy, [...selectedLinkIds]);
    }
  }, [elements, getSelectedElementIds, contextMenu, selectedLinkIds, writeClipboard]);

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
      writeClipboard(elsToCut, [...selectedLinkIds]);

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
  }, [elements, links, getSelectedElementIds, contextMenu, selectedLinkIds, deleteElements, clearSelection, pushAction, writeClipboard]);

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

    // Build all links between duplicated elements
    const elIdSet = new Set(elIds);
    const relevantLinks = links.filter(l =>
      elIdSet.has(l.fromId) && elIdSet.has(l.toId)
    );
    const newLinks: Link[] = relevantLinks.map(link => ({
      ...link,
      id: generateUUID(),
      dossierId: currentDossier!.id,
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
      redo: { elements: newElements, links: newLinks, elementIds: newElementIds, linkIds: newLinkIds },
    });
    selectElements(newElementIds);
  }, [contextMenu, elements, links, getSelectedElementIds, currentDossier, pasteElements, selectElements, pushAction, activeTabId, addTabMembers]);

  // Group selection handler for context menu
  // Elements a new group can take: top-level, non-group elements. Groups are
  // a single level (child position = group position + relative offset), and
  // undo only knows how to put children back at the top level, so groups and
  // elements already inside a group are left out.
  const groupableSelectedIds = useMemo(() => {
    const ids: string[] = [];
    for (const id of selectedElementIds) {
      const el = elementMap.get(id);
      if (el && !el.isGroup && !el.parentGroupId) ids.push(id);
    }
    return ids;
  }, [selectedElementIds, elementMap]);
  const canGroupSelection = groupableSelectedIds.length >= 2;

  const handleGroupSelection = useCallback(async () => {
    const selectedElements = groupableSelectedIds
      .map(id => elementMap.get(id))
      .filter((el): el is Element => !!el);
    if (selectedElements.length < 2) return;
    const childIds = selectedElements.map(el => el.id);

    // Snapshot absolute positions for undo
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
      const { width: w, height: h } = computeElementDimensions(el.visual, el.label || t('empty.unnamed'), hasImage);
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

    const group = await createGroup('Groupe', groupPos, groupSize, childIds);

    // Compute relative positions for redo
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
  }, [groupableSelectedIds, elementMap, assetMap, t, createGroup, clearSelection, pushAction]);

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
    if (!contextMenu || selectedElementIds.size < 2) return;
    const chosen = Array.from(selectedElementIds)
      .map((id) => elementMap.get(id))
      .filter((el): el is Element => !!el);
    if (chosen.length >= 2) {
      setMergeElements(chosen);
      setContextMenu(null);
    }
  }, [contextMenu, selectedElementIds, elementMap]);

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
      // Shift / Ctrl / Cmd adds the link to the selection, or removes it
      const isMultiSelect = event.shiftKey || event.ctrlKey || event.metaKey;

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
        if (isMultiSelect) toggleLink(edge.id);
        else selectLink(edge.id);
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
    [selectLink, toggleLink, startEditingLink]
  );

  // Link suggestions for the selected elements, shown in their side-panel tab
  const handleSuggestLinks = useCallback(() => {
    useSuggestionsStore.getState().analyze(getSelectedElementIds());
    useUIStore.getState().setSidePanelTab('suggestions');
  }, [getSelectedElementIds]);

  // Links shown on the canvas (filters, tab, hidden elements applied) touching
  // the selected elements — or all of them when nothing is selected.
  const handleSelectLinks = useCallback(() => {
    const selected = useSelectionStore.getState().selectedElementIds;
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
  }, [allEdges, selectLinks]);

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
        // Counted for the progress shown in the placement bar
        await withImportProgress(async () => {
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

          // ── Pre-built elements/links (e.g. JSON mapping import): shift to click + paste ──
          if (importPlacementData.prebuilt) {
            const shifted = importPlacementData.prebuilt.elements.map((el) => ({
              ...el,
              position: { x: el.position.x + offsetX, y: el.position.y + offsetY },
            }));
            const placedLinks = importPlacementData.prebuilt.links;
            pasteElements(shifted, placedLinks);
            const placedIds = shifted.map((e) => e.id);
            if (activeTabId) addTabMembers(activeTabId, placedIds);
            pushAction({
              type: 'create-elements',
              undo: {},
              redo: { elements: shifted, links: placedLinks, elementIds: placedIds, linkIds: placedLinks.map((l) => l.id) },
            });
            selectElements(placedIds);
            toast.success(tPages('dossier.importPlacement.success', { count: shifted.length }));
            importPlacementData.onComplete?.();
            setIsImportingPlacement(false);
            exitImportPlacementMode();

            // Download + attach media assets (after creation). Network-dependent (CORS):
            // attach what succeeds, report failures. Runs async; doesn't block placement.
            const assetJobs = importPlacementData.prebuilt.assets ?? [];
            if (assetJobs.length > 0) {
              void (async () => {
                let ok = 0, fail = 0;
                for (const job of assetJobs) {
                  for (const url of job.urls) {
                    try {
                      const res = await fetch(url);
                      if (!res.ok) { fail++; continue; }
                      const blob = await res.blob();
                      if (blob.size > 50 * 1024 * 1024) { fail++; continue; } // 50 MB hard cap
                      const name = (url.split('/').pop() || 'media').split('?')[0] || 'media';
                      await addAsset(job.elementId, new File([blob], name, { type: blob.type || 'application/octet-stream' }));
                      ok++;
                    } catch { fail++; }
                  }
                }
                if (ok > 0 || fail > 0) toast.success(tPages('dossier.importPlacement.mediaResult', { ok, fail }));
              })();
            }
            return;
          }

          if (!importPlacementData.file) { setIsImportingPlacement(false); exitImportPlacementMode(); return; }
          let result: Awaited<ReturnType<typeof importService.importFromZip>>;
          const fileName = importPlacementData.file.name.toLowerCase();
          // Snapshot element IDs before import (for tab assignment after reload)
          const preImportIds = new Set(elements.map(e => e.id));
          const snapshot = await snapshotBeforeImport(importPlacementData.dossierId);

          if (importPlacementData.fileContent != null) {
            // ── Non-ZIP format: import then shift new elements ──
            const content = importPlacementData.fileContent;
            const invId = importPlacementData.dossierId;

            const existingIds = snapshot.elementIds;
            const geojsonOptions = importPlacementData.importOptions?.geojson;

            // Dispatch to the appropriate import function
            if (geojsonOptions || fileName.endsWith('.geojson')) {
              result = await importService.importFromGeoJSON(content, invId, geojsonOptions);
            } else if (fileName.endsWith('.osintracker')) {
              result = await importService.importFromOsintracker(content, invId);
            } else if (fileName.endsWith('.csv')) {
              result = await importService.importFromCSV(content, invId, {
                createMissingElements: importPlacementData.importOptions?.createMissingElements ?? true,
              });
            } else if (fileName.endsWith('.gexf')) {
              const { importGEXF } = await import('../../services/importGephi');
              result = await importGEXF(content, invId);
            } else if (fileName.endsWith('.anx')) {
              const { importANX } = await import('../../services/importANX');
              result = await importANX(content, invId);
            } else if (fileName.endsWith('.graphml') || fileName.endsWith('.xml') || fileName.endsWith('.drawio')) {
              const { isANXFormat } = await import('../../services/importANX');
              const { isDrawioFormat, importDrawio } = await import('../../services/importDrawio');
              if (isDrawioFormat(content)) {
                result = await importDrawio(content, invId);
              } else if (isANXFormat(content)) {
                const { importANX } = await import('../../services/importANX');
                result = await importANX(content, invId);
              } else {
                result = await importService.importFromGraphML(content, invId);
              }
            } else if (fileName.endsWith('.ged') || fileName.endsWith('.gw')) {
              result = await importService.importFromGenealogy(importPlacementData.file, invId);
            } else if (fileName.endsWith('.txt') || fileName.endsWith('.fec')) {
              const { importFEC, isFECFormat } = await import('../../services/importFEC');
              result = isFECFormat(content)
                ? await importFEC(content, invId, importPlacementData.importOptions?.fec)
                : { success: false, elementsImported: 0, linksImported: 0, assetsImported: 0, reportImported: false, errors: ['Unsupported format'], warnings: [] };
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
              const allElements = await elementRepository.getByDossier(invId);
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
              importPlacementData.dossierId,
              { x: offsetX, y: offsetY },
              importPlacementData.importOptions?.zipTabs,
            );
          }

          if (result.success) {
            toast.success(tPages('dossier.importPlacement.success', {
              count: result.elementsImported
            }));

            // The import wrote to Dexie: bring it into the open Y.Doc (kept, with
            // its comments and shared session), then reload assets and report.
            await commitImportToYDoc(snapshot);
            await loadDossier(importPlacementData.dossierId);

            // Request fitView to show all elements including imported ones
            requestFitView();

            // Chosen archive tabs: into the dossier's tab of the same name, or a
            // new one; what no tab takes (and tabs beyond the limit) goes to the open tab
            const placed = new Set<string>(result.linkedOnlyIds ?? []);
            const createdTabIds: string[] = [];
            for (const plan of result.tabPlan ?? []) {
              if (plan.memberIds.length === 0) continue;
              const { tabs } = useTabStore.getState();
              const key = plan.name.trim().toLowerCase();
              let target = tabs.find((tab) => tab.name.trim().toLowerCase() === key) ?? null;
              if (!target && tabs.length < MAX_TABS) {
                target = await useTabStore.getState().createTab(importPlacementData.dossierId, plan.name);
                createdTabIds.push(target.id);
              }
              if (!target) {
                toast.warning(tPages('dossier.importPlacement.tabLimit', { name: plan.name, max: MAX_TABS }));
                continue;
              }
              await addTabMembers(target.id, plan.memberIds);
              plan.memberIds.forEach((id) => placed.add(id));
            }

            // Add imported elements to active tab
            if (activeTabId) {
              const importedIds = useDossierStore.getState().elements
                .filter(el => !preImportIds.has(el.id) && !placed.has(el.id))
                .map(el => el.id);
              if (importedIds.length > 0) {
                addTabMembers(activeTabId, importedIds);
              }
            }

            // One undoable action: Ctrl+Z removes what the import added (and the
            // tabs it created); the imported elements stay selected
            {
              const after = useDossierStore.getState();
              const newElements = after.elements.filter((el) => !preImportIds.has(el.id));
              const newLinks = after.links.filter((l) => !snapshot.linkIds.has(l.id));
              if (newElements.length > 0) {
                pushAction({
                  type: 'create-elements',
                  undo: { createdTabIds },
                  redo: {
                    elements: newElements,
                    links: newLinks,
                    elementIds: newElements.map((el) => el.id),
                    linkIds: newLinks.map((l) => l.id),
                  },
                });
                selectElements(newElements.map((el) => el.id));
              }
            }

            // Call completion callback if provided
            importPlacementData.onComplete?.();
          } else {
            toast.error(result.errors[0] || tPages('dossier.importPlacement.error'));
          }
        });
      } catch (error) {
        toast.error(tPages('dossier.importPlacement.error'));
      } finally {
        setIsImportingPlacement(false);
        exitImportPlacementMode();
      }
      return;
    }

    // Overview: nodes are drawn on a canvas, so a click on one reaches the pane
    if (overviewActiveRef.current) {
      const hitId = overviewHandleRef.current?.hitTestClient(event.clientX, event.clientY);
      if (hitId) {
        selectElement(hitId, event.shiftKey || event.ctrlKey || event.metaKey);
        return;
      }
    }

    clearSelection();
    // Also reset any Insights highlight (bridges, clusters, centrality…) so a
    // click on empty canvas restores the normal display.
    clearHighlight();
  }, [selectElement, clearSelection, clearHighlight, importPlacementMode, importPlacementData, isImportingPlacement, viewport, loadDossier, exitImportPlacementMode, tPages, requestFitView, elements, activeTabId, addTabMembers, pasteElements, pushAction, selectElements, addAsset]);

  // Handle double click on pane to create element
  const handlePaneDoubleClick = useCallback(
    async (event: React.MouseEvent) => {
      if (!reactFlowWrapper.current) return;

      // Overview: a double-click zooms in (nothing can be edited at this
      // scale), centred on the element under the cursor if any. The move end
      // that follows brings React Flow's nodes back. Checked before the
      // moving guard: the pane's own pointer-down still counts as a gesture
      // in progress when the double-click arrives.
      if (overviewActiveRef.current && !isDraggingRef.current) {
        const bounds = reactFlowWrapper.current.getBoundingClientRect();
        const sx = event.clientX - bounds.left;
        const sy = event.clientY - bounds.top;
        const { x: vx, y: vy, zoom } = useViewStore.getState().viewport;
        const hitId = overviewHandleRef.current?.hitTestClient(event.clientX, event.clientY);
        const scene = overviewSceneRef.current;
        const i = hitId && scene ? scene.indexById.get(hitId) : undefined;
        if (hitId && scene && i !== undefined) {
          selectElement(hitId);
          const cx = scene.x[i] + scene.w[i] / 2;
          const cy = scene.y[i] + scene.h[i] / 2;
          requestViewportChange({ x: bounds.width / 2 - cx, y: bounds.height / 2 - cy, zoom: 1 });
        } else {
          // Keep the point under the cursor in place
          const nextZoom = Math.min(1, Math.max(zoom * 4, OVERVIEW_EXIT_ZOOM * 1.25));
          const fx = (sx - vx) / zoom;
          const fy = (sy - vy) / zoom;
          requestViewportChange({ x: sx - fx * nextZoom, y: sy - fy * nextZoom, zoom: nextZoom });
        }
        return;
      }

      // Guard: skip if dragging or viewport is moving
      if (isDraggingRef.current || isViewportMovingRef.current) return;

      // Guard: cooldown to prevent rapid successive element creation (500ms)
      const now = Date.now();
      if (now - lastElementCreatedAtRef.current < 500) return;
      lastElementCreatedAtRef.current = now;

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
    [createElement, selectElement, viewport, pushAction, activeTabId, addTabMembers, requestViewportChange]
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
          const batchId = generateUUID();
          for (const [index, file] of files.entries()) {
            const asset = await addAsset(elementId, file);
            // Record in history so the attachment can be undone
            pushAction({
              type: 'add-asset',
              undo: { snapshot: { elementId, assetId: asset.id } },
              redo: { snapshot: { elementId, file } },
            });
            try {
              const buffer = await file.arrayBuffer();
              const metadata = await metadataService.extractMetadata(file, buffer);
              if (metadata && (metadata.properties.length > 0 || metadata.geo)) {
                pushMetadataImport({
                  elementId,
                  elementLabel: targetElement?.label || '',
                  filename: file.name,
                  metadata,
                  batch: { id: batchId, index, size: files.length },
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
      const createdElements: Element[] = [];
      const batchId = generateUUID();
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const position = {
          x: basePosition.x + i * 80,
          y: basePosition.y + i * 20,
        };

        // Use filename as element label
        const label = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
        const newElement = await createElement(label, position, { date: new Date() });
        createdElements.push(newElement);
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
              batch: { id: batchId, index: i, size: files.length },
            });
          }
        } catch (err) {
          console.error('Metadata extraction failed:', err);
        }
      }

      // Record creation so the dropped element(s) can be undone (undo deletes them).
      if (createdElements.length > 0) {
        pushAction({
          type: 'create-elements',
          undo: {},
          redo: { elements: createdElements, elementIds: createdElements.map((e) => e.id) },
        });
      }
    },
    [createElement, addAsset, viewport, elementMap, pushMetadataImport, activeTabId, addTabMembers, pushAction]
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
      // Deletions (elements, links) are undone by the history store: one
      // Y.Doc transaction for the lot, tab membership restored. Re-creating
      // them here one by one cost a render each, seconds for a few hundred.
      case 'delete-elements':
      case 'delete-element':
      case 'delete-link':
        await useHistoryStore.getState().applyUndo(action);
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

      default:
        // Types without canvas-specific handling (create-link, update-bulk,
        // merge-elements, add-asset…) use the history store's own executor
        await useHistoryStore.getState().applyUndo(action);
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


      case 'update-element':
        // Re-apply changes
        if (action.redo.elementId && action.redo.changes) {
          await updateElement(action.redo.elementId, action.redo.changes);
        }
        break;

      case 'delete-link':
        // Re-delete links
        if (action.redo.linkIds) {
          await deleteLinks(action.redo.linkIds);
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

      default:
        await useHistoryStore.getState().applyRedo(action);
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

      // Delete selected elements. The canvas's own key handler (focus on the
      // canvas) may have done it already: it bubbles here first. Twice would
      // stack two history entries, the second without tab membership, and an
      // undo would bring the elements back outside their tabs.
      if ((event.key === 'Delete' || event.key === 'Backspace') && !event.defaultPrevented) {
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
      }

      // Text selected in a preview (PDF, text file): let the browser copy it.
      // Writing elements to the clipboard here would overwrite it right after.
      if ((event.key === 'c' || event.key === 'x') && isCtrlOrMeta && window.getSelection()?.toString()) {
        return;
      }

      // Copy with Ctrl+C
      if (event.key === 'c' && isCtrlOrMeta) {
        const selectedEls = getSelectedElementIds();
        if (selectedEls.length > 0) {
          writeClipboard(elements.filter(el => selectedEls.includes(el.id)), [...selectedLinkIds]);
        }
      }

      // Cut with Ctrl+X
      if (event.key === 'x' && isCtrlOrMeta) {
        event.preventDefault();
        const selectedEls = getSelectedElementIds();
        if (selectedEls.length > 0) {
          const elsToCut = elements.filter(el => selectedEls.includes(el.id));
          writeClipboard(elsToCut, [...selectedLinkIds]);

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

          // Build links between duplicated elements
          const selectedSet = new Set(selectedEls);
          const relevantLinks = links.filter(l =>
            selectedSet.has(l.fromId) && selectedSet.has(l.toId)
          );
          const newLinks: Link[] = relevantLinks.map(link => ({
            ...link,
            id: generateUUID(),
            dossierId: currentDossier!.id,
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
    selectLinks,
    allEdges,
    createElement,
    createGroup,
    pasteElements,
    currentDossier,
    elements,
    links,
    viewport,
    pushAction,
    handleUndo,
    handleRedo,
    writeClipboard,
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
      const clip = useClipboardStore.getState();
      if (clip.elements.length > 0 && currentDossier) {
        event.preventDefault();

        const { newElements, newLinks } = cloneClipboardForPaste(clip, currentDossier.id, centerX, centerY);

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
          redo: { elements: newElements, links: newLinks, elementIds: newElementIds, linkIds: newLinkIds },
        });

        // Select all pasted elements
        selectElements(newElementIds);
        return;
      }

      // No files and no copied elements - nothing to paste
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [viewport, pasteElements, currentDossier, createElement, addAsset, selectElements, elements, links, pushAction, getSelectedElementIds, activeTabId, addTabMembers]);

  // Halo scale at load and after a programmatic viewport change (fit, tab switch)
  useEffect(() => {
    reactFlowWrapper.current?.style.setProperty('--zn-inv-zoom', String(1 / Math.max(viewport.zoom, 0.01)));
  }, [viewport.zoom]);

  // Handle viewport change
  const handleViewportChange = useCallback(
    ({ x, y, zoom }: { x: number; y: number; zoom: number }) => {
      setViewport({ x, y, zoom });
      // Halos keep their on-screen size: read by the nodes through CSS, so
      // zooming re-renders nothing
      reactFlowWrapper.current?.style.setProperty('--zn-inv-zoom', String(1 / Math.max(zoom, 0.01)));
      // Only re-render on a threshold crossing: setting the same value is a
      // no-op in React, so this stays free during a pan.
      setIsZoomedOut((prev) => {
        const next = zoom < LOW_DETAIL_ZOOM;
        return prev === next ? prev : next;
      });
      liveViewportRef.current = { x, y, zoom };
      // Enter the overview as soon as the zoom drops, before React Flow mounts
      // more and more nodes during the gesture
      if (overviewEnabledRef.current && !overviewActiveRef.current && zoom < LOW_DETAIL_ZOOM &&
          countNodesInView({ x, y, zoom }, OVERVIEW_ENTER_VISIBLE) >= OVERVIEW_ENTER_VISIBLE) {
        // Called before React Flow stores the new transform
        hideAllFlowNodesNowRef.current();
        setOverviewActive(true);
      }
    },
    [setViewport, setOverviewActive]
  );

  // Flag switched, or what is displayed changed (another tab, an import):
  // follow at the current viewport. A small tab of a large dossier stays in
  // React Flow.
  useEffect(() => {
    if (!overviewEnabled) {
      setOverviewActive(false);
      return;
    }
    const live = liveViewportRef.current;
    if (overviewActiveRef.current) {
      if (countNodesInView(live, OVERVIEW_EXIT_VISIBLE) < OVERVIEW_EXIT_VISIBLE) setOverviewActive(false);
    } else if (live.zoom < LOW_DETAIL_ZOOM && countNodesInView(live, OVERVIEW_ENTER_VISIBLE) >= OVERVIEW_ENTER_VISIBLE) {
      hideAllFlowNodesNowRef.current();
      setOverviewActive(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overviewEnabled, nodes.length, setOverviewActive]);

  // Handle selection change from selection box — throttled to avoid 60fps store updates
  const selectionChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSelectionRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const SELECTION_THROTTLE_MS = 80;

  // Whether React Flow's selected nodes/edges are exactly the rendered part of
  // the selection in the store
  const isRenderedPartOfSelection = useCallback((selNodes: Node[], selEdges: Edge[]) => {
    const { selectedElementIds: storeEls, selectedLinkIds: storeLinks } = useSelectionStore.getState();
    return isRenderedPartOf(
      selNodes.map((n) => n.id), storeEls, new Set(nodesRef.current.map((n) => n.id)),
    ) && isRenderedPartOf(
      selEdges.map((e) => e.id), storeLinks, new Set(edgesRef.current.map((e) => e.id)),
    );
  }, []);

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

        // Echo of a selection made elsewhere (filters, query): React Flow only
        // reports what it renders, and edges off screen are not rendered.
        // Writing that back would drop them from the selection.
        if (isRenderedPartOfSelection(pending.nodes, pending.edges)) return;

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
    [selectBoth, isRenderedPartOfSelection]
  );

  // Toolbar counts: the dossier, or in a tab its members and the links between them
  const toolbarCounts = useMemo(() => {
    if (activeTabId === null) return { elements: elements.length, links: links.length };
    let elementCount = 0;
    for (const el of elements) if (tabMemberSet.has(el.id)) elementCount++;
    let linkCount = 0;
    for (const link of links) if (tabMemberSet.has(link.fromId) && tabMemberSet.has(link.toId)) linkCount++;
    return { elements: elementCount, links: linkCount };
  }, [activeTabId, tabMemberSet, elements, links]);

  return (
    <ReactFlowProvider>
      <div className="w-full h-full flex flex-col">
        {/* Toolbar */}
        <ViewToolbar
          leftContent={
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <span className="flex items-center gap-1">
                  <Box size={12} />
                  {toolbarCounts.elements}
                </span>
                <span className="flex items-center gap-1">
                  <Link2 size={12} />
                  {toolbarCounts.links}
                </span>
              </div>
              {selectedElementIds.size + selectedLinkIds.size > 0 && (
                <>
                  <div className="w-px h-4 bg-border-default" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-accent font-medium">
                      {selectedElementIds.size === 1 && selectedLinkIds.size === 0
                        ? tPages('dossier.toolbar.oneElement')
                        : selectedLinkIds.size === 1 && selectedElementIds.size === 0
                        ? tPages('dossier.toolbar.oneLink')
                        : tPages('dossier.toolbar.selectedCount', { count: selectedElementIds.size + selectedLinkIds.size })}
                    </span>
                    <button
                      onClick={clearSelection}
                      className="p-0.5 text-text-tertiary hover:text-text-primary rounded transition-colors"
                      title={tPages('dossier.toolbar.deselect')}
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
                title={tPages('dossier.toolbar.snapToGrid')}
              >
                <Grid3x3 size={16} />
              </button>
              <button
                onClick={toggleAlignGuides}
                className={`p-1.5 rounded transition-colors ${showAlignGuides ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-bg-tertiary'}`}
                title={tPages('dossier.toolbar.alignGuides')}
              >
                <Magnet size={16} />
              </button>
              <button
                onClick={toggleMinimap}
                className={`p-1.5 rounded transition-colors ${showMinimap ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-bg-tertiary'}`}
                title={tPages('dossier.toolbar.minimap')}
              >
                <MapIcon size={16} />
              </button>
              {(temporalDates.length > 0 || canvasTemporal.active) && (
                <TemporalToggleButton active={canvasTemporal.active} onClick={handleToggleTemporal} />
              )}
              <div className="w-px h-4 bg-border-default mx-1" />
              <AlignDropdown />
              <LayoutDropdown />
              <div className="w-px h-4 bg-border-default mx-1" />
              <CanvasZoomControls />
            </>
          }
        />

        {/* Temporal navigator: glows what happens at the instant/period, dims the rest */}
        {canvasTemporal.active && temporalDates.length > 0 && (
          <TemporalNavigatorBar
            dates={temporalDates}
            selectedDate={canvasTemporal.date}
            periodEnd={canvasTemporal.periodEnd}
            onChange={(date, periodEnd) => setCanvasTemporal({ date, periodEnd })}
            isPlaying={isTemporalPlaying}
            onTogglePlay={() => setIsTemporalPlaying(!isTemporalPlaying)}
            extraControls={
              <button
                onClick={() => setCanvasTemporal({ showUndated: !canvasTemporal.showUndated })}
                className={`p-1 rounded ${!canvasTemporal.showUndated ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'}`}
                title={tPages(canvasTemporal.showUndated ? 'dossier.toolbar.temporalUndatedHide' : 'dossier.toolbar.temporalUndatedShow')}
              >
                {canvasTemporal.showUndated ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            }
          />
        )}

        {/* Canvas */}
        <div
          ref={reactFlowWrapper}
          className={`zn-canvas-surface flex-1 relative outline-none ${importPlacementMode ? 'cursor-crosshair' : ''} ${isViewportMoving && elements.length > 500 ? 'edges-hidden' : ''}`}
          data-testid="canvas"
          data-tutorial="canvas"
          data-report-capture="canvas"
          onPointerDownCapture={handleOverviewPointerDown}
          onClickCapture={handleOverviewClickCapture}
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
          <LowDetailContext.Provider value={isLowDetail}>
            <ReactFlow
              nodes={flowNodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnectStart={handleConnectStart}
              onConnect={handleConnect}
              onReconnectStart={handleReconnectStart}
              onReconnect={handleReconnect}
              onNodeClick={handleNodeClick}
              onNodeDoubleClick={handleNodeDoubleClick}
              onNodeContextMenu={handleNodeContextMenu}
              onEdgeClick={handleEdgeClick}
              onEdgeDoubleClick={handleEdgeDoubleClick}
              onEdgeContextMenu={handleEdgeContextMenu}
              onPaneClick={handlePaneClick}
              onPaneContextMenu={handlePaneContextMenu}
              onSelectionContextMenu={handlePaneContextMenu}
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
              minZoom={0.005}
              maxZoom={4}
              selectionMode={SelectionMode.Partial}
              connectionMode={ConnectionMode.Loose}
              connectionRadius={40}
              edgesReconnectable
              selectNodesOnDrag={false}
              selectionOnDrag
              panOnDrag
              selectionKeyCode="Shift"
              deleteKeyCode={null}
              disableKeyboardA11y
              panOnScroll
              zoomOnScroll
              zoomOnDoubleClick={false}
              fitView={false}
              nodeDragThreshold={2}
              onlyRenderVisibleElements
              proOptions={{ hideAttribution: true }}
            >
              <CanvasGrid gridSize={gridSize} lines={snapToGrid} />
              {overviewEnabled && (
                <OverviewLayer
                  active={overviewActive}
                  scene={overviewScene}
                  themeMode={themeMode}
                  handleRef={overviewHandleRef}
                  onBoxSelect={handleOverviewBoxSelect}
                />
              )}
              <FlowStoreBridge storeRef={flowStoreRef} />
              <CanvasCaptureHandler />
              <LowDetailHandleRepair isLowDetail={isLowDetail} />
              <ViewportController />
              <RevealSelectionOnOpen />
              <FitViewController />
              {/* With the overview layer, drawn from a scene on a canvas: React Flow's
                  minimap skips hidden nodes and costs one component per node */}
              <DraggableMinimap scene={overviewActive ? overviewScene : minimapScene} />
              <ImportPlacementOverlay />
              <SuggestionPreviewLines />
            </ReactFlow>
          </LowDetailContext.Provider>

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

          {/* Empty-canvas hint (onboarding) — fades out once content exists */}
          {elements.length === 0 && !isDraggingFile && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <p className="text-xs text-text-tertiary text-center px-4 max-w-md leading-relaxed">
                {tPages('home.onboarding.canvasHint')}
              </p>
            </div>
          )}

          {/* Context menu for elements */}
          {contextMenu && (() => {
            // URLs of the right-clicked element (single selection): the source
            // metadata field if it's a URL, or each web link written in it as
            // Markdown, plus any URL property (type 'link' or a value that
            // looks like a URL).
            const ctxEl = selectedElementIds.size <= 1 ? elementMap.get(contextMenu.elementId) : undefined;
            const propertyUrls = (ctxEl?.properties ?? [])
              .filter(p => {
                const v = String(p.value ?? '').trim();
                return v.length > 0 && (p.type === 'link' || isUrl(v));
              })
              .map(p => ({ key: p.key, url: toUrl(String(p.value)) }));
            const sourceUrls = !ctxEl?.source
              ? []
              : isUrl(ctxEl.source) && !/\s/.test(ctxEl.source.trim())
                ? [{ key: t('labels.source'), url: toUrl(ctxEl.source) }]
                : sourceWebLinks(ctxEl.source).map(l => ({ key: `${t('labels.source')} · ${l.label}`, url: l.target }));
            const elementUrls = [...sourceUrls, ...propertyUrls];
            return (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              elementId={contextMenu.elementId}
              elementLabel={contextMenu.elementLabel}
              isFocused={focusElementId === contextMenu.elementId}
              isHidden={hiddenElementIds.has(contextMenu.elementId)}
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
              onDuplicate={handleContextMenuDuplicate}
              onCopyAsMermaid={handleCopyAsMermaid}
              onPreview={handleContextMenuPreview}
              onFindPaths={handleFindPaths}
              onFindAllPaths={handleFindAllPaths}
              onMerge={selectedElementIds.size >= 2 ? handleMergeElements : undefined}
              isGroup={!!elementMap.get(contextMenu.elementId)?.isGroup}
              isInGroup={!!elementMap.get(contextMenu.elementId)?.parentGroupId}
              hasMultipleSelected={selectedElementIds.size > 1}
              selectedCount={selectedElementIds.size}
              onGroupSelection={canGroupSelection ? handleGroupSelection : undefined}
              onDissolveGroup={handleDissolveGroup}
              onRemoveFromGroup={handleRemoveFromGroup}
              isPositionLocked={!!elementMap.get(contextMenu.elementId)?.isPositionLocked}
              onToggleLock={handleToggleLock}
              tabs={canvasTabs}
              activeTabId={activeTabId}
              onAddToTab={(tabId) => addIdsToTab(
                tabId,
                selectedElementIds.size > 1 ? Array.from(selectedElementIds) : [contextMenu.elementId],
              )}
              onNewTabFromSelection={canCreateTab ? () => createTabFromIds(
                selectedElementIds.size > 1 ? Array.from(selectedElementIds) : [contextMenu.elementId],
              ) : undefined}
              onMoveToTab={activeTabId !== null ? (tabId) => moveIdsToTab(
                tabId,
                selectedElementIds.size > 1 ? Array.from(selectedElementIds) : [contextMenu.elementId],
              ) : undefined}
              onMoveHere={activeTabId !== null ? () => moveIdsHere([contextMenu.elementId]) : undefined}
              onRemoveFromTab={() => removeIdsFromActiveTab(
                selectedElementIds.size > 1 ? Array.from(selectedElementIds) : [contextMenu.elementId],
              )}
              isGhostElement={activeTabId !== null && !tabMemberSet.has(contextMenu.elementId)}
              elementTabIds={getTabsForElement(contextMenu.elementId).map(t => t.id)}
              viewTabIds={viewTabIds}
              onGoToTab={(tabId) => {
                setActiveTab(tabId);
                closeContextMenu();
              }}
              onFindSimilar={selectedElementIds.size === 1 ? handleFindSimilar : undefined}
              onQueryFromSelection={selectedElementIds.size > 1 ? handleQueryFromSelection : undefined}
              urls={elementUrls}
              onOpenUrl={handleOpenUrl}
              onCopyUrl={handleCopyUrl}
              pluginExtensions={elementPlugins}
              menuContext={{
                elementIds: selectedElementIds.size > 1
                  ? Array.from(selectedElementIds)
                  : [contextMenu.elementId],
                linkIds: [],
                dossierId: currentDossier?.id || '',
                hasTextAssets: !!contextMenu.previewAsset,
              }}
              onClose={closeContextMenu}
            />
            );
          })()}

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
              selectionLocked={selectionLocked}
              onToggleLockSelection={handleSelectionToggleLock}
              onGroupSelection={canGroupSelection ? handleGroupSelection : undefined}
              onCopyAsMermaid={handleCopyAsMermaid}
              onFindSimilar={handleFindSimilar}
              onQueryFromSelection={handleQueryFromSelection}
              onSelectLinks={allEdges.length > 0 || (overviewScene?.linkCount ?? 0) > 0 ? handleSelectLinks : undefined}
              onSuggestLinks={handleSuggestLinks}
              tabs={canvasTabs}
              onAddSelectionToTab={(tabId) => addIdsToTab(tabId, Array.from(selectedElementIds))}
              onNewTabFromSelection={canCreateTab ? () => createTabFromIds(Array.from(selectedElementIds)) : undefined}
              activeTabId={activeTabId}
              onMoveSelectionToTab={activeTabId !== null ? (tabId) => moveIdsToTab(tabId, Array.from(selectedElementIds)) : undefined}
              onRemoveSelectionFromTab={activeTabId !== null ? () => removeIdsFromActiveTab(Array.from(selectedElementIds)) : undefined}
              onClose={closeCanvasContextMenu}
              pluginExtensions={[
                ...canvasPlugins,
                ...(selectedElementIds.size > 0 ? elementPlugins : []),
              ]}
              menuContext={{
                elementIds: Array.from(selectedElementIds),
                linkIds: Array.from(selectedLinkIds),
                canvasPosition: { x: canvasContextMenu.canvasX, y: canvasContextMenu.canvasY },
                hasTextAssets: false,
                dossierId: currentDossier?.id || '',
              }}
            />
          )}

          {/* Context menu for links */}
          {linkContextMenu && (
            <LinkContextMenu
              x={linkContextMenu.x}
              y={linkContextMenu.y}
              linkId={linkContextMenu.linkId}
              linkLabel={linkContextMenu.linkLabel}
              onEditLabel={() => {
                startEditingLink(linkContextMenu.linkId);
                closeLinkContextMenu();
              }}
              onResetRoute={(() => {
                // Offset of the current route style only (curves and right angles keep their own)
                const menuLink = links.find((l) => l.id === linkContextMenu.linkId);
                const offset = linkCurveMode === 'orthogonal' ? menuLink?.orthogonalOffset : menuLink?.curveOffset;
                if (!offset || (offset.x === 0 && offset.y === 0)) return undefined;
                return () => {
                  updateLink(linkContextMenu.linkId, linkCurveMode === 'orthogonal'
                    ? { orthogonalOffset: null }
                    : { curveOffset: { x: 0, y: 0 } });
                  closeLinkContextMenu();
                };
              })()}
              onDelete={() => {
                const linkToDelete = links.find((l) => l.id === linkContextMenu.linkId);
                if (linkToDelete) {
                  pushAction({
                    type: 'delete-link',
                    undo: { links: [linkToDelete] },
                    redo: { linkIds: [linkContextMenu.linkId] },
                  });
                }
                deleteLinks([linkContextMenu.linkId]);
                closeLinkContextMenu();
              }}
              onClose={closeLinkContextMenu}
              pluginExtensions={linkPlugins}
              menuContext={{
                elementIds: [],
                linkIds: [linkContextMenu.linkId],
                dossierId: currentDossier?.id || '',
                hasTextAssets: false,
              }}
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

        {/* Merge Elements Modal */}
        {mergeElements && (
          <MergeElementsModal
            isOpen={true}
            onClose={() => setMergeElements(null)}
            elements={mergeElements}
            onMerge={async (targetId, sourceIds) => {
              // One after the other into the kept element; one Ctrl+Z undoes them all
              const snapshots = [];
              for (const sourceId of sourceIds) snapshots.push(await mergeElementsAction(targetId, sourceId));
              pushAction({
                type: 'merge-elements',
                undo: { snapshot: snapshots },
                redo: { snapshot: snapshots },
              });
              clearSelection();
            }}
          />
        )}

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
