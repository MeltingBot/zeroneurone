/**
 * Mermaid export — a selection of elements as a `flowchart` block.
 *
 * Meant for pasting into Markdown (wikis, Obsidian, GitHub, reports), so it is
 * scoped to a selection: Mermaid re-computes the layout and becomes unreadable
 * beyond ~100 nodes. Positions, properties, notes and dates are not exported.
 */

import { DEFAULT_ELEMENT_VISUAL } from '../types';
import type { Element, ElementShape, Link } from '../types';

const SHAPE_DELIMS: Record<ElementShape, [string, string]> = {
  rectangle: ['[', ']'],
  square: ['[[', ']]'],
  circle: ['((', '))'],
  diamond: ['{', '}'],
  hexagon: ['{{', '}}'],
};

/** Quote a label for Mermaid: `"` and `|` as entity codes, newlines as <br/>. */
function quote(label: string): string {
  const s = label
    .replace(/"/g, '#quot;')
    .replace(/\|/g, '#124;')
    .replace(/\r?\n/g, '<br/>');
  return `"${s}"`;
}

const HEX_RE = /^#[0-9a-f]{3,8}$/i;

function styleFor(el: Element): string | null {
  const parts: string[] = [];
  const { color, borderColor, borderStyle } = el.visual;
  if (color && HEX_RE.test(color) && color !== DEFAULT_ELEMENT_VISUAL.color) parts.push(`fill:${color}`);
  if (borderColor && HEX_RE.test(borderColor) && borderColor !== DEFAULT_ELEMENT_VISUAL.borderColor) parts.push(`stroke:${borderColor}`);
  if (borderStyle === 'dashed' || borderStyle === 'dotted') parts.push('stroke-dasharray: 5 5');
  return parts.length > 0 ? parts.join(',') : null;
}

function edgeOperator(link: Link): string {
  const dashed = link.visual.style === 'dashed' || link.visual.style === 'dotted';
  const thick = !dashed && link.visual.thickness >= 4;
  const directed = link.direction !== 'none';
  const both = link.direction === 'both';
  let op: string;
  if (dashed) op = directed ? '-.->' : '-.-';
  else if (thick) op = directed ? '==>' : '===';
  else op = directed ? '-->' : '---';
  return both ? `<${op}` : op;
}

/**
 * Build a Mermaid flowchart from elements and the links between them.
 * Links with an endpoint outside `elements` are skipped. Annotations are skipped.
 */
export function buildMermaidExport(elements: Element[], links: Link[], direction: 'TD' | 'LR' = 'TD'): string {
  const nodes = elements.filter((e) => !e.isAnnotation);
  const ids = new Map<string, string>();
  nodes.forEach((el, i) => ids.set(el.id, `n${i + 1}`));

  const lines = [`flowchart ${direction}`];

  // Groups whose children are part of the export become subgraphs
  const groups = nodes.filter((g) => g.isGroup && nodes.some((c) => c.parentGroupId === g.id));
  const groupIds = new Set(groups.map((g) => g.id));
  const inGroup = new Set(nodes.filter((c) => c.parentGroupId && groupIds.has(c.parentGroupId)).map((c) => c.id));

  const nodeLine = (el: Element) => {
    const [open, close] = SHAPE_DELIMS[el.visual.shape] ?? SHAPE_DELIMS.rectangle;
    return `${ids.get(el.id)}${open}${quote(el.label || ' ')}${close}`;
  };

  for (const el of nodes) {
    if (groupIds.has(el.id) || inGroup.has(el.id)) continue;
    lines.push(`  ${nodeLine(el)}`);
  }
  for (const g of groups) {
    lines.push(`  subgraph ${ids.get(g.id)} [${quote(g.label || ' ')}]`);
    for (const c of nodes) {
      if (c.parentGroupId === g.id) lines.push(`    ${nodeLine(c)}`);
    }
    lines.push('  end');
  }

  for (const link of links) {
    let from = ids.get(link.fromId);
    let to = ids.get(link.toId);
    if (!from || !to || groupIds.has(link.fromId) || groupIds.has(link.toId)) continue;
    // Mermaid has no backward-only arrow: swap endpoints
    if (link.direction === 'backward') [from, to] = [to, from];
    const op = edgeOperator(link);
    const label = link.label?.trim() ? `|${quote(link.label.trim())}|` : '';
    lines.push(`  ${from} ${op}${label} ${to}`);
  }

  for (const el of nodes) {
    if (groupIds.has(el.id)) continue;
    const style = styleFor(el);
    if (style) lines.push(`  style ${ids.get(el.id)} ${style}`);
  }

  return lines.join('\n') + '\n';
}
