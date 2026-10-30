/**
 * Dossier data to React Flow: an element becomes a node, a link an edge,
 * with the handles it attaches to. Pure, no store.
 */

import { type Node, type Edge } from '@xyflow/react';

import { type ElementNodeData } from './ElementNode';
import { type GroupNodeData } from './GroupNode';
import { type AnnotationNodeData } from './AnnotationNode';
import { type HandleSlots } from '../../utils/edgeRouting';

import type { Element, Link, Position, EvaluationModel } from '../../types';
import { getEvaluationBadge } from '../../utils/evaluation';
import { FONT_SIZE_PX } from '../../types';
import type { RemoteUserPresence } from './ElementNode';
import { type TemporalEventSummary } from '../../utils/temporalUtils';

// Calculate best handles based on element positions
export function calculateBestHandles(
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

// Convert our Element to React Flow Node
export function elementToNode(
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
  isFocused?: boolean,
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
      isFocused: !!isFocused,
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

/** Handles a link is drawn between: per-link anchor override, else dossier anchor mode. */
export function resolveLinkHandles(
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

// Convert our Link to React Flow Edge
export function linkToEdge(
  link: Link,
  isSelected: boolean,
  isDimmed: boolean,
  nodePositions: Map<string, Position>,
  linkAnchorMode: 'auto' | 'manual',
  linkCurveMode: 'straight' | 'curved' | 'orthogonal',
  isEditing?: boolean,
  onLabelChange?: (newLabel: string) => void,
  onStopEditing?: () => void,
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
        hasStartArrow,
        hasEndArrow,
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
