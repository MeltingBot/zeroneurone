/**
 * Builds what the canvas overview layer draws, from the nodes the canvas
 * already assembled for React Flow (tab, hidden and time filters applied,
 * selection and dimming resolved) and the dossier links.
 *
 * Node sizes follow the canvas itself (measured size, else
 * computeElementDimensions, as LowDetailElementNode does), so what is hit in
 * the overview is what React Flow shows once zoomed in.
 */

import type { Node } from '@xyflow/react';
import type { Element, Link } from '../../../types';
import { computeElementDimensions } from '../../../utils/elementDimensions';
import { getThemeAwareColor } from '../../../utils/themeColors';
import { buildGrid } from './overviewHitTest';
import {
  LINK_ARROW_END, LINK_ARROW_START, LINK_DIMMED, LINK_SELECTED,
  NODE_DIMMED, NODE_EMPHASIZED, NODE_GHOST, NODE_REMOTE, NODE_SELECTED,
  SHAPE_ANNOTATION, SHAPE_CIRCLE, SHAPE_DIAMOND, SHAPE_GROUP, SHAPE_HEXAGON, SHAPE_RECT, SHAPE_SQUARE,
  STYLE_DASHED, STYLE_DOTTED, STYLE_SOLID,
  type OverviewScene,
} from './overviewTypes';

/** Absolute position of every node: children of a group are relative to it. */
export function computeAbsoluteNodePositions(nodes: readonly Node[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const parentPositions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    if (node.type === 'groupFrame') parentPositions.set(node.id, node.position);
  }
  for (const node of nodes) {
    const parentId = (node as { parentId?: string }).parentId;
    const parentPos = parentId ? parentPositions.get(parentId) : undefined;
    positions.set(node.id, parentPos
      ? { x: node.position.x + parentPos.x, y: node.position.y + parentPos.y }
      : node.position);
  }
  return positions;
}

/** Per-node values that only change with the node object or the theme. */
interface NodeRecord {
  dark: boolean;
  measuredW: number | undefined;
  measuredH: number | undefined;
  shape: number;
  w: number;
  h: number;
  fill: string;
  stroke: string;
  borderWidth: number;
  borderStyle: number;
  flags: number;
  remote: string | null;
}

const recordCache = new WeakMap<Node, NodeRecord>();

const SHAPE_CODES: Record<string, number> = {
  rectangle: SHAPE_RECT,
  square: SHAPE_SQUARE,
  circle: SHAPE_CIRCLE,
  diamond: SHAPE_DIAMOND,
  hexagon: SHAPE_HEXAGON,
};

function styleCode(style: string | undefined): number {
  return style === 'dashed' ? STYLE_DASHED : style === 'dotted' ? STYLE_DOTTED : STYLE_SOLID;
}

interface NodeData {
  element: Element;
  isSelected?: boolean;
  isDimmed?: boolean;
  isHighlighted?: boolean;
  isGhost?: boolean;
  thumbnail?: string | null;
  remoteSelectors?: { color: string }[];
}

function buildRecord(node: Node, dark: boolean, fallbackLabel: string): NodeRecord {
  const data = node.data as unknown as NodeData;
  const el = data.element;
  const v = el.visual;
  const measuredW = node.measured?.width;
  const measuredH = node.measured?.height;

  let flags = 0;
  if (data.isSelected) flags |= NODE_SELECTED;
  if (data.isDimmed) flags |= NODE_DIMMED;
  if (data.isHighlighted) flags |= NODE_EMPHASIZED;
  if (data.isGhost) flags |= NODE_GHOST;
  const remote = data.remoteSelectors?.[0]?.color ?? null;
  if (remote) flags |= NODE_REMOTE;

  if (node.type === 'groupFrame') {
    return {
      dark, measuredW, measuredH, shape: SHAPE_GROUP,
      w: measuredW ?? (v.customWidth || 300),
      h: measuredH ?? (v.customHeight || 200),
      // Drawn as a tint, see the renderer
      fill: v.color && v.color !== '#ffffff' ? v.color : '',
      stroke: v.borderColor || '#e5e7eb',
      borderWidth: v.borderWidth ?? 1,
      borderStyle: styleCode(v.borderStyle),
      flags, remote,
    };
  }
  if (node.type === 'annotation') {
    return {
      dark, measuredW, measuredH, shape: SHAPE_ANNOTATION,
      w: measuredW ?? (v.customWidth || 200),
      h: measuredH ?? (v.customHeight || 80),
      fill: v.color || (dark ? '#2a2623' : '#ffffff'),
      stroke: v.borderColor || (dark ? '#4a4440' : '#e5e7eb'),
      borderWidth: v.borderWidth ?? 1,
      borderStyle: styleCode(v.borderStyle),
      flags, remote,
    };
  }

  const hasThumbnail = Boolean(data.thumbnail) && v.hideMedia !== true;
  const dims = measuredW && measuredH
    ? { width: measuredW, height: measuredH }
    : computeElementDimensions(v, el.label || fallbackLabel, hasThumbnail);
  return {
    dark, measuredW, measuredH,
    shape: SHAPE_CODES[v.shape] ?? SHAPE_RECT,
    w: dims.width,
    h: dims.height,
    fill: getThemeAwareColor(v.color, dark),
    stroke: dark ? getThemeAwareColor(v.borderColor, true) : v.borderColor,
    borderWidth: v.borderWidth ?? 2,
    borderStyle: data.isGhost ? STYLE_DASHED : styleCode(v.borderStyle),
    flags, remote,
  };
}

function recordFor(node: Node, dark: boolean, fallbackLabel: string): NodeRecord {
  const cached = recordCache.get(node);
  if (cached && cached.dark === dark &&
      cached.measuredW === node.measured?.width && cached.measuredH === node.measured?.height) {
    return cached;
  }
  const record = buildRecord(node, dark, fallbackLabel);
  recordCache.set(node, record);
  return record;
}

export interface OverviewSceneInput {
  /** Nodes as given to React Flow, before they are hidden for the overview. */
  nodes: readonly Node[];
  links: readonly Link[];
  /** Same filter as the React Flow edges (time cursor, hidden ends). */
  isLinkShown: (link: Link) => boolean;
  /** LINK_* flags of a shown link. */
  linkFlags: (link: Link) => number;
  dark: boolean;
  /** Label used to size an element that has none ("Unnamed"). */
  fallbackLabel: string;
  /** Nodes only, no links and no hit-test grid (the minimap). */
  nodesOnly?: boolean;
}

export function buildOverviewScene(input: OverviewSceneInput): OverviewScene {
  const { nodes, links, dark, fallbackLabel } = input;
  const n = nodes.length;
  const positions = computeAbsoluteNodePositions(nodes);

  const palette: string[] = [];
  const paletteIndex = new Map<string, number>();
  const colorIndex = (c: string) => {
    let i = paletteIndex.get(c);
    if (i === undefined) {
      i = palette.length;
      palette.push(c);
      paletteIndex.set(c, i);
    }
    return i;
  };
  colorIndex(''); // 0: no colour

  const ids: string[] = new Array(n);
  const indexById = new Map<string, number>();
  const x = new Float32Array(n), y = new Float32Array(n), w = new Float32Array(n), h = new Float32Array(n);
  const shape = new Uint8Array(n);
  const fill = new Uint16Array(n), stroke = new Uint16Array(n), remoteColor = new Uint16Array(n);
  const borderWidth = new Float32Array(n);
  const borderStyle = new Uint8Array(n);
  const flags = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    const r = recordFor(node, dark, fallbackLabel);
    const pos = positions.get(node.id) ?? node.position;
    ids[i] = node.id;
    indexById.set(node.id, i);
    x[i] = pos.x;
    y[i] = pos.y;
    w[i] = r.w;
    h[i] = r.h;
    shape[i] = r.shape;
    fill[i] = colorIndex(r.fill);
    stroke[i] = colorIndex(r.stroke);
    remoteColor[i] = r.remote ? colorIndex(r.remote) : 0;
    borderWidth[i] = r.borderWidth;
    borderStyle[i] = r.borderStyle;
    flags[i] = r.flags;
  }

  // Links whose two ends are drawn, self-loops aside (nothing to draw at this size)
  const shownLinks: Link[] = [];
  const ends: number[] = [];
  for (const link of input.nodesOnly ? [] : links) {
    if (link.fromId === link.toId) continue;
    const a = indexById.get(link.fromId);
    const b = indexById.get(link.toId);
    if (a === undefined || b === undefined) continue;
    if (!input.isLinkShown(link)) continue;
    shownLinks.push(link);
    ends.push(a, b);
  }
  const m = shownLinks.length;
  const linkIds: string[] = new Array(m);
  const from = new Int32Array(m), to = new Int32Array(m);
  const linkColor = new Uint16Array(m);
  const linkStyle = new Uint8Array(m);
  const linkWidth = new Float32Array(m);
  const linkFlagsArr = new Uint8Array(m);
  for (let l = 0; l < m; l++) {
    const link = shownLinks[l];
    linkIds[l] = link.id;
    from[l] = ends[2 * l];
    to[l] = ends[2 * l + 1];
    linkColor[l] = colorIndex(link.visual.color);
    linkStyle[l] = styleCode(link.visual.style);
    linkWidth[l] = link.visual.thickness || 1;
    const direction = link.direction || (link.directed ? 'forward' : 'none');
    linkFlagsArr[l] = input.linkFlags(link)
      | (direction === 'backward' || direction === 'both' ? LINK_ARROW_START : 0)
      | (direction === 'forward' || direction === 'both' ? LINK_ARROW_END : 0);
  }

  return {
    nodeCount: n, ids, indexById, x, y, w, h, shape, fill, stroke, remoteColor, borderWidth, borderStyle, flags,
    linkCount: m, linkIds, from, to, linkColor, linkStyle, linkWidth, linkFlags: linkFlagsArr,
    palette,
    grid: input.nodesOnly
      ? { cells: new Map(), large: [], stamp: new Uint32Array(0), stampValue: 0 }
      : buildGrid(x, y, w, h, shape, n),
  };
}

/** LINK_* flags from the shared link visual state. */
export function linkFlagsOf(state: { isSelected: boolean; isDimmed: boolean }): number {
  return (state.isSelected ? LINK_SELECTED : 0) | (state.isDimmed ? LINK_DIMMED : 0);
}

/** Drawn size of a node (measured, else estimated as the canvas renders it). */
export function nodeFootprint(node: Node, dark: boolean, fallbackLabel: string): { width: number; height: number } {
  const r = recordFor(node, dark, fallbackLabel);
  return { width: r.w, height: r.h };
}
