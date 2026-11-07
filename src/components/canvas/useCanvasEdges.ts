/* eslint-disable react-hooks/refs -- the memos read and write caches kept in
   refs on purpose (incremental edge patching, progressive insertion): moved
   as is from Canvas, where the compiler lint did not analyze them. */
import { useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { Edge, Node } from '@xyflow/react';

import type { EvaluationModel, Link, OrthogonalRoute, Position } from '../../types';
import type { RouteHandles } from './CustomEdge';
import type { Point } from '../../utils/freeBends';
import { propertiesOf, VALUES_SEPARATOR } from '../../utils/propertyRows';
import { formatPropertyValue } from '../../utils/dates';
import { computeHandleSlots as computeLinkHandleSlots, type HandleSlots } from '../../utils/edgeRouting';
import { linkVisualState, type LinkVisualContext } from '../../utils/linkVisualState';
import { computeAbsoluteNodePositions } from './overview/overviewScene';
import { resolveLinkHandles, linkToEdge, calculateBestHandles } from './canvasConversion';
import type { SelectionStore, ViewStore } from './canvasHookTypes';

const EMPTY_EDGES: Edge[] = [];

interface EdgeCallbacks {
  onLabelChange: (newLabel: string) => void;
  onCurveOffsetChange: (offset: { x: number; y: number }) => void;
  onOrthogonalRouteChange: (route: OrthogonalRoute, handles: RouteHandles) => void;
  onBendPointsChange: (points: Point[] | null, handles: RouteHandles) => void;
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

export interface CanvasEdgesParams {
  /** Bumped to rebuild the edges (drag end, move end, debounced position changes) */
  edgeVersion: number;
  setEdgeVersion: Dispatch<SetStateAction<number>>;
  edgeVersionTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
  links: Link[];
  displayNodes: Node[];
  nodePositionsRef: RefObject<Map<string, Position>>;
  isDraggingRef: RefObject<boolean>;
  isViewportMovingRef: RefObject<boolean>;
  cullingViewportRef: RefObject<ViewStore['viewport']>;
  wrapperSize: { width: number; height: number };
  overviewActive: boolean;
  isLowDetail: boolean;
  linkVisualContext: LinkVisualContext;
  temporalHiddenLinkIds: ReadonlySet<string>;
  viewHiddenIds: ReadonlySet<string>;
  selectedLinkIds: SelectionStore['selectedLinkIds'];
  selectedElementIds: SelectionStore['selectedElementIds'];
  dimmedElementIds: LinkVisualContext['dimmedElementIds'];
  emphasizedElementIds: ReadonlySet<string>;
  cycleLinkFlow: NonNullable<LinkVisualContext['flowLinks']>;
  pathGlowLinks: NonNullable<LinkVisualContext['glowLinks']>;
  queryFilterActive: boolean;
  queryMatchLinkIds: ReadonlySet<string>;
  temporalClassification: LinkVisualContext['temporal'];
  showUndated: boolean;
  linkAnchorMode: 'auto' | 'manual';
  linkCurveMode: 'straight' | 'curved' | 'orthogonal';
  confidenceDisplay: EvaluationModel | null;
  propertyDateLocale: string;
  language: string;
  displayedProperties: string[];
  editingLinkId: string | null;
  stopEditing: SelectionStore['stopEditing'];
  remoteUsersByLink: Map<string, { name: string; color: string; isEditing?: boolean }[]>;
  getEdgeCallbacks: (linkId: string) => EdgeCallbacks;
}

/**
 * React Flow edges of the canvas: viewport culling, cap, simplified edges past
 * a count, progressive insertion, single-handle edges zoomed far out.
 */
export function useCanvasEdges({
  edgeVersion,
  setEdgeVersion,
  edgeVersionTimerRef,
  links,
  displayNodes,
  nodePositionsRef,
  isDraggingRef,
  isViewportMovingRef,
  cullingViewportRef,
  wrapperSize,
  overviewActive,
  isLowDetail,
  linkVisualContext,
  temporalHiddenLinkIds,
  viewHiddenIds,
  selectedLinkIds,
  selectedElementIds,
  dimmedElementIds,
  emphasizedElementIds,
  cycleLinkFlow,
  pathGlowLinks,
  queryFilterActive,
  queryMatchLinkIds,
  temporalClassification,
  showUndated,
  linkAnchorMode,
  linkCurveMode,
  confidenceDisplay,
  propertyDateLocale,
  language,
  displayedProperties,
  editingLinkId,
  stopEditing,
  remoteUsersByLink,
  getEdgeCallbacks,
}: CanvasEdgesParams) {
  // Positions ref from displayNodes (cheap, no re-render)
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
  // Refs and setter: stable, listed because they come in as parameters
  }, [displayNodes, nodePositionsRef, isDraggingRef, isViewportMovingRef, edgeVersionTimerRef, setEdgeVersion]);

  // --- Edge computation: viewport culling → cap → simplification → progressive rendering ---
  const MAX_RENDERED_EDGES = 800;
  const SIMPLE_EDGE_THRESHOLD = 200;

  // Cache previous edges by ID for incremental patching (selection/dimming changes)
  const prevEdgeCacheRef = useRef(new Map<string, Edge>());
  // Stable reference: avoid creating a new array when all edges are cache hits
  const prevEdgesArrayRef = useRef<Edge[]>([]);

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

    // Cap edges: the selected links and those touching a selected element are
    // always kept, the rest fill the budget. The original order is kept, so a
    // click only swaps the few links it has to instead of reordering them all.
    let cappedLinks = visibleLinks;
    if (visibleLinks.length > MAX_RENDERED_EDGES) {
      const isPriority = (link: Link) => selectedLinkIds.has(link.id) || cycleLinkFlow.has(link.id) || pathGlowLinks.has(link.id)
        || selectedElementIds.has(link.fromId) || selectedElementIds.has(link.toId);
      let priorityCount = 0;
      for (const link of visibleLinks) if (isPriority(link)) priorityCount++;
      const budget = MAX_RENDERED_EDGES - priorityCount;
      let restKept = 0;
      cappedLinks = visibleLinks.filter(link => isPriority(link) || restKept++ < budget);
    }

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
      const { isSelected, isDimmed: isLinkDimmed, isHighlighted: isLinkHighlighted, flow } = linkVisualState(link, linkVisualContext);
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
          && cd?._dateLocale === propertyDateLocale
          // The properties shown under labels (Views panel): ticking one redraws the links
          && cd?._displayedProperties === displayedProperties;
        if (linkUnchanged && globalsUnchanged) {
          const sameVisuals = cached.selected === isSelected
            && cd?.isDimmed === isLinkDimmed
            && cd?.isHighlighted === isLinkHighlighted
            && cd?.flow === flow
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
          undefined, undefined, undefined,
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
            const valueStr = props.map((p) => formatPropertyValue(p.value, p.type, language, p.timeZone)).join(VALUES_SEPARATOR);
            return { key, value: valueStr };
          })
          .filter((p): p is { key: string; value: string } => p !== null);

        edge = linkToEdge(
          link, isSelected, isLinkDimmed, nodePositions,
          linkAnchorMode, linkCurveMode,
          editingLinkId === link.id,
          edgeCbs.onLabelChange, stopEditing,
          parallel.index, parallel.count,
          edgeCbs.onCurveOffsetChange,
          confidenceDisplay, linkDisplayedPropertyValues,
          remoteUsersByLink.get(link.id),
          false,
          handleSlots.get(link.id)
        );
        const routeCallbacks = edge.data as Partial<Pick<EdgeCallbacks, 'onOrthogonalRouteChange' | 'onBendPointsChange'>>;
        routeCallbacks.onOrthogonalRouteChange = edgeCbs.onOrthogonalRouteChange;
        routeCallbacks.onBendPointsChange = edgeCbs.onBendPointsChange;
      }

      const edgeData = edge.data as any;
      edgeData._linkRef = link;
      edgeData._curveMode = linkCurveMode;
      edgeData._anchorMode = linkAnchorMode;
      edgeData._showConfidence = confidenceDisplay;
      edgeData._dateLocale = propertyDateLocale;
      edgeData._displayedProperties = displayedProperties;
      edgeData.isHighlighted = isLinkHighlighted;
      edgeData.flow = flow;
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
  }, [overviewActive, linkVisualContext, links, edgeVersion, wrapperSize, selectedLinkIds, selectedElementIds, dimmedElementIds, emphasizedElementIds, linkAnchorMode, linkCurveMode, editingLinkId, stopEditing, confidenceDisplay, displayedProperties, remoteUsersByLink, queryFilterActive, queryMatchLinkIds, temporalClassification, temporalHiddenLinkIds, showUndated, propertyDateLocale, viewHiddenIds]);

  // Progressive edge rendering: avoid injecting 800+ edges at once into the DOM.
  // Only the edges not already on screen are added in batches; those already
  // shown stay, so a click or a small pan never makes the links blink.
  const EDGE_BATCH_SIZE = 250;
  const shownEdgeIdsRef = useRef<Set<string>>(new Set());
  const edgeProgressRef = useRef<{ source: Edge[]; base: Set<string>; limit: number } | null>(null);
  const [edgeProgressTick, setEdgeProgressTick] = useState(0);

  const cappedEdges = useMemo(() => {
    let progress = edgeProgressRef.current;
    if (!progress || progress.source !== allEdges) {
      const shown = shownEdgeIdsRef.current;
      let newCount = 0;
      for (const e of allEdges) if (!shown.has(e.id)) newCount++;
      progress = newCount > EDGE_BATCH_SIZE
        ? { source: allEdges, base: shown, limit: EDGE_BATCH_SIZE }
        : null;
    }
    let result = allEdges;
    if (progress) {
      const { base, limit } = progress;
      let added = 0;
      const partial = allEdges.filter(e => {
        if (base.has(e.id)) return true;
        if (added >= limit) return false;
        added++;
        return true;
      });
      if (partial.length < allEdges.length) result = partial;
      else progress = null;
    }
    edgeProgressRef.current = progress;
    shownEdgeIdsRef.current = new Set(result.map(e => e.id));
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEdges, edgeProgressTick]);

  useEffect(() => {
    if (!edgeProgressRef.current) return;
    const timer = setTimeout(() => {
      const progress = edgeProgressRef.current;
      if (!progress) return;
      progress.limit += EDGE_BATCH_SIZE;
      setEdgeProgressTick(t => t + 1);
    }, 60);
    return () => clearTimeout(timer);
  }, [cappedEdges]);
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

  return { allEdges, edges };
}
