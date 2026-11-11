/** Ring layout of an element's neighbourhood (NeighborhoodGraph.tsx) */

import type { Element, Link } from '../types';

/** Room per node along a ring (px): React Flow fits the result to the screen */
const NODE_ARC = 130;
const MAX_RING1 = 16;
const MAX_RING2 = 32;
const LABEL_CHARS = 14;

export interface PlacedNode {
  id: string;
  x: number;
  y: number;
  label: string;
  color: string;
  ring: 0 | 1 | 2;
}

export interface Layout {
  nodes: PlacedNode[];
  edges: { from: string; to: string }[];
  hidden: number;
}

function shortLabel(label: string, fallback: string): string {
  const text = label.trim() || fallback;
  return text.length > LABEL_CHARS ? `${text.slice(0, LABEL_CHARS - 1)}…` : text;
}

/** Neighbour ids of every element, links in either direction */
function adjacency(links: Link[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (a === b) return;
    let set = adj.get(a);
    if (!set) adj.set(a, (set = new Set()));
    set.add(b);
  };
  for (const l of links) {
    add(l.fromId, l.toId);
    add(l.toId, l.fromId);
  }
  return adj;
}

export function layoutNeighborhood(
  centerId: string,
  elements: Map<string, Element>,
  links: Link[],
  depth: 1 | 2,
  untitled: string,
): Layout {
  const adj = adjacency(links);
  const cx = 0;
  const cy = 0;
  const nodes: PlacedNode[] = [];
  const placed = new Set<string>();
  let hidden = 0;

  const place = (id: string, x: number, y: number, ring: 0 | 1 | 2) => {
    const el = elements.get(id);
    if (!el) return false;
    nodes.push({ id, x, y, ring, label: shortLabel(el.label, untitled), color: el.visual.color || '#ffffff' });
    placed.add(id);
    return true;
  };

  place(centerId, cx, cy, 0);
  const ring1 = [...(adj.get(centerId) ?? [])].filter((id) => elements.has(id));
  const shown1 = ring1.slice(0, MAX_RING1);
  hidden += ring1.length - shown1.length;
  const step1 = (2 * Math.PI) / Math.max(shown1.length, 1);
  const r1 = Math.max(150, (shown1.length * NODE_ARC) / (2 * Math.PI));
  const r2 = r1 + 190;
  const angles = new Map<string, number>();
  shown1.forEach((id, i) => {
    const a = -Math.PI / 2 + i * step1;
    angles.set(id, a);
    place(id, cx + r1 * Math.cos(a), cy + r1 * Math.sin(a), 1);
  });

  if (depth === 2) {
    let budget = MAX_RING2;
    for (const parent of shown1) {
      const children = [...(adj.get(parent) ?? [])].filter((id) => !placed.has(id) && elements.has(id));
      const shown = children.slice(0, Math.max(0, budget));
      hidden += children.length - shown.length;
      budget -= shown.length;
      const base = angles.get(parent)!;
      const spread = Math.min(step1 * 0.8, Math.PI / 2);
      shown.forEach((id, i) => {
        const a = shown.length === 1 ? base : base - spread / 2 + (spread * i) / (shown.length - 1);
        place(id, cx + r2 * Math.cos(a), cy + r2 * Math.sin(a), 2);
      });
    }
  }

  const edges: { from: string; to: string }[] = [];
  const seen = new Set<string>();
  for (const l of links) {
    if (!placed.has(l.fromId) || !placed.has(l.toId) || l.fromId === l.toId) continue;
    const key = l.fromId < l.toId ? `${l.fromId}|${l.toId}` : `${l.toId}|${l.fromId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ from: l.fromId, to: l.toId });
  }
  return { nodes, edges, hidden };
}
