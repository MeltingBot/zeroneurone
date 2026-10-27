/**
 * DOT export (Graphviz), readable by Graphviz, NetworkX, Gephi and the DOT
 * import of ZeroNeurone.
 *
 * `digraph` as soon as one link has an arrow, else `graph`; each edge states
 * its `dir`, so undirected links stay undirected in a digraph. Positions are
 * written as pinned `pos="x,y!"` in points, Y up (`neato -n` keeps them).
 * Node ids are the DOT ids an import kept (`dot_id`) when they are unique,
 * else n0, n1… Labels and notes use Graphviz escapes (\n); other values are
 * written as they are, so paths keep their backslashes.
 */

import type { Element, ElementShape, Link, Property } from '../types';
import { computeElementDimensions } from '../utils/elementDimensions';
import { formatEvaluation } from '../utils/evaluation';
import { EDGE_READ, NODE_READ } from './importDOT';

const DOT_SHAPES: Record<ElementShape, string> = {
  circle: 'ellipse',
  square: 'square',
  rectangle: 'box',
  diamond: 'diamond',
  hexagon: 'hexagon',
};

/** Pixels per point, as read back by the DOT import (sizes are written too). */
const PX_PER_POINT = 2;
const POINTS_PER_INCH = 72;

/** Quoted escString (label, notes): backslash, quote and line breaks escaped. */
export function dotLabel(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;
}

/**
 * Quoted value taken as written on import: only the quote is escaped. A
 * backslash closing the value is doubled, else it would escape the closing
 * quote (reimported, it reads as two).
 */
export function dotString(value: string): string {
  return `"${value.replace(/"/g, '\\"').replace(/\\$/, '\\\\')}"`;
}

/** A node id: kept bare when it is a DOT identifier, quoted otherwise. */
function dotId(id: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(id) && !/^(node|edge|graph|digraph|subgraph|strict)$/i.test(id)
    ? id
    : dotString(id);
}

function dotNumber(n: number): string {
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : '0';
}

const HEX_RE = /^#[0-9a-f]{6}$/i;
const SHORT_HEX_RE = /^#[0-9a-f]{3}$/i;

/** #rrggbb, or undefined for theme variables and other CSS colours. */
function hexColor(color: string | undefined): string | undefined {
  if (!color) return undefined;
  if (HEX_RE.test(color)) return color.toLowerCase();
  if (SHORT_HEX_RE.test(color)) return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`.toLowerCase();
  return undefined;
}

/** Properties as attributes; a key Graphviz or the import reads gets a `prop_` prefix. */
function propertyAttrs(properties: Property[] | undefined, read: Set<string>): string[] {
  const attrs: string[] = [];
  const used = new Set<string>();
  for (const prop of properties ?? []) {
    if (prop.value === null || prop.value === undefined || prop.value === '' || prop.key === 'dot_id') continue;
    let key = prop.key;
    if (read.has(key.toLowerCase()) || key.toLowerCase() === 'evaluation') key = `prop_${key}`;
    if (used.has(key)) continue;
    used.add(key);
    const value = prop.value instanceof Date ? prop.value.toISOString() : prop.value;
    attrs.push(`${dotId(key)}=${typeof value === 'number' && Number.isFinite(value) ? dotNumber(value) : dotString(String(value))}`);
  }
  return attrs;
}

function commonAttrs(item: Element | Link): string[] {
  const attrs: string[] = [];
  if (item.notes) attrs.push(`tooltip=${dotLabel(item.notes)}`);
  if (item.tags?.length) attrs.push(`tags=${dotString(item.tags.join(';'))}`);
  if (typeof item.confidence === 'number') attrs.push(`confidence=${item.confidence}`);
  if (item.source) attrs.push(`source=${dotString(item.source)}`);
  const evaluation = formatEvaluation(item.evaluation);
  if (evaluation) attrs.push(`evaluation=${dotString(evaluation)}`);
  return attrs;
}

/** Node ids: the DOT ids kept by an import when unique, else n0, n1… */
function nodeIds(elements: Element[]): Map<string, string> {
  const original = elements.map((el) => {
    const prop = el.properties?.find((p) => p.key === 'dot_id');
    return typeof prop?.value === 'string' && prop.value ? prop.value : null;
  });
  const counts = new Map<string, number>();
  for (const id of original) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  const taken = new Set<string>();
  const ids = new Map<string, string>();
  elements.forEach((el, i) => {
    const kept = original[i];
    if (kept && counts.get(kept) === 1) { ids.set(el.id, kept); taken.add(kept); }
  });
  let n = 0;
  for (const el of elements) {
    if (ids.has(el.id)) continue;
    while (taken.has(`n${n}`)) n++;
    ids.set(el.id, `n${n}`);
    taken.add(`n${n}`);
  }
  return ids;
}

const directionOf = (l: Link) => l.direction ?? (l.directed ? 'forward' : 'none');

export function buildDOTExport(name: string, elements: Element[], links: Link[]): string {
  const ids = nodeIds(elements);
  const directed = links.some((l) => directionOf(l) !== 'none');
  const op = directed ? '->' : '--';

  const out: string[] = [
    '// ZeroNeurone',
    `${directed ? 'digraph' : 'graph'} ${dotString(name || 'ZeroNeurone')} {`,
  ];

  for (const el of elements) {
    const { width, height } = computeElementDimensions(el.visual, el.label, false);
    const fill = hexColor(el.visual.color);
    const outline = hexColor(el.visual.borderColor);
    const style = ['filled'];
    if (el.visual.borderStyle === 'dashed' || el.visual.borderStyle === 'dotted') style.push(el.visual.borderStyle);
    const cx = (el.position.x + width / 2) / PX_PER_POINT;
    const cy = -(el.position.y + height / 2) / PX_PER_POINT;
    const attrs = [
      `label=${dotLabel(el.label)}`,
      `shape=${DOT_SHAPES[el.visual.shape] ?? 'ellipse'}`,
      `style=${dotString(style.join(','))}`,
      ...(fill ? [`fillcolor=${dotString(fill)}`] : []),
      ...(outline ? [`color=${dotString(outline)}`] : []),
      `pos=${dotString(`${dotNumber(cx)},${dotNumber(cy)}!`)}`,
      `width=${dotNumber(width / PX_PER_POINT / POINTS_PER_INCH)}`,
      `height=${dotNumber(height / PX_PER_POINT / POINTS_PER_INCH)}`,
      ...commonAttrs(el),
      ...propertyAttrs(el.properties, NODE_READ),
    ];
    out.push(`  ${dotId(ids.get(el.id)!)} [${attrs.join(', ')}]`);
  }

  for (const link of links) {
    const from = ids.get(link.fromId);
    const to = ids.get(link.toId);
    if (!from || !to) continue;
    const dir = directionOf(link);
    const color = hexColor(link.visual.color);
    const attrs = [
      ...(link.label ? [`label=${dotLabel(link.label)}`] : []),
      // A digraph draws forward by default; a graph has no arrows
      ...(directed && dir !== 'forward' ? [`dir=${dir === 'backward' ? 'back' : dir}`] : []),
      ...(color ? [`color=${dotString(color)}`] : []),
      ...(link.visual.thickness && link.visual.thickness !== 2 ? [`penwidth=${dotNumber(link.visual.thickness)}`] : []),
      ...(link.visual.style === 'dashed' || link.visual.style === 'dotted' ? [`style=${link.visual.style}`] : []),
      ...commonAttrs(link),
      ...propertyAttrs(link.properties, EDGE_READ),
    ];
    out.push(`  ${dotId(from)} ${op} ${dotId(to)}${attrs.length ? ` [${attrs.join(', ')}]` : ''}`);
  }

  out.push('}');
  return out.join('\n') + '\n';
}
