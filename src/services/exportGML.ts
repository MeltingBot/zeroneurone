/**
 * GML export (Graph Modelling Language), readable by Gephi, yEd, Cytoscape,
 * NetworkX and igraph.
 *
 * Nodes get integer ids (several readers require them). Positions are written
 * as node centers, Y down, like yEd. Each edge states its arrows
 * (targetArrow / sourceArrow), so undirected links stay undirected in a
 * directed graph. Non-ASCII characters are written as `&#N;` entities: the
 * format is ASCII, and NetworkX rejects anything else.
 */

import type { Dossier, Element, ElementShape, Link, Property } from '../types';
import { computeElementDimensions } from '../utils/elementDimensions';
import { formatEvaluation } from '../utils/evaluation';

const GML_SHAPES: Record<ElementShape, string> = {
  circle: 'ellipse',
  square: 'rectangle',
  rectangle: 'rectangle',
  diamond: 'diamond',
  hexagon: 'hexagon',
};

/** Keys set by the exporter: a property with the same key would shadow them on reimport. */
const RESERVED_KEYS = new Set(['id', 'label', 'graphics', 'LabelGraphics', 'notes', 'tags', 'confidence', 'source', 'target', 'directed', 'evaluation', 'gml_id']);

/** Quotes a GML string: `&` and `"` as entities, non-ASCII and control characters as `&#N;`. */
export function gmlString(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if (ch === '&') out += '&amp;';
    else if (ch === '"') out += '&quot;';
    else if (code > 126 || code < 32) out += `&#${code};`;
    else out += ch;
  }
  return `"${out}"`;
}

/** GML keys are identifiers: other characters become `_`, a leading digit gets a `_` prefix. */
export function gmlKey(key: string): string {
  const k = key.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_]/g, '_');
  return /^[A-Za-z_]/.test(k) ? k : `_${k}`;
}

function gmlNumber(n: number): string {
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : '0';
}

const HEX_RE = /^#[0-9a-f]{6}$/i;
const SHORT_HEX_RE = /^#[0-9a-f]{3}$/i;

/** #RRGGBB, or undefined for theme variables and other CSS colors. */
function hexColor(color: string | undefined): string | undefined {
  if (!color) return undefined;
  if (HEX_RE.test(color)) return color.toUpperCase();
  if (SHORT_HEX_RE.test(color)) return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`.toUpperCase();
  return undefined;
}

function propertyLines(properties: Property[] | undefined, indent: string): string[] {
  const lines: string[] = [];
  const used = new Set<string>();
  for (const prop of properties ?? []) {
    if (prop.value === null || prop.value === undefined || prop.value === '') continue;
    let key = gmlKey(prop.key);
    if (RESERVED_KEYS.has(key)) key = `prop_${key}`;
    if (used.has(key)) continue;
    used.add(key);
    const value = prop.value instanceof Date ? prop.value.toISOString() : prop.value;
    lines.push(typeof value === 'number' && Number.isFinite(value)
      ? `${indent}${key} ${gmlNumber(value)}`
      : `${indent}${key} ${gmlString(String(value))}`);
  }
  return lines;
}

function commonLines(item: Element | Link, indent: string): string[] {
  const lines: string[] = [];
  if (item.notes) lines.push(`${indent}notes ${gmlString(item.notes)}`);
  if (item.tags?.length) lines.push(`${indent}tags ${gmlString(item.tags.join(';'))}`);
  if (typeof item.confidence === 'number') lines.push(`${indent}confidence ${item.confidence}`);
  const evaluation = formatEvaluation(item.evaluation);
  if (evaluation) lines.push(`${indent}evaluation ${gmlString(evaluation)}`);
  return lines;
}

export function buildGMLExport(dossier: Dossier, elements: Element[], links: Link[]): string {
  const index = new Map<string, number>();
  elements.forEach((el, i) => index.set(el.id, i));

  const out: string[] = [
    'Creator "ZeroNeurone"',
    'graph [',
    `  label ${gmlString(dossier.name ?? '')}`,
    `  directed ${links.some((l) => (l.direction ?? (l.directed ? 'forward' : 'none')) !== 'none') ? 1 : 0}`,
  ];

  elements.forEach((el, i) => {
    const { width, height } = computeElementDimensions(el.visual, el.label, false);
    const fill = hexColor(el.visual.color);
    const outline = hexColor(el.visual.borderColor);
    out.push('  node [');
    out.push(`    id ${i}`);
    out.push(`    label ${gmlString(el.label)}`);
    out.push(...commonLines(el, '    '));
    out.push(...propertyLines(el.properties, '    '));
    out.push('    graphics [');
    out.push(`      x ${gmlNumber(el.position.x + width / 2)}`);
    out.push(`      y ${gmlNumber(el.position.y + height / 2)}`);
    out.push(`      w ${gmlNumber(width)}`);
    out.push(`      h ${gmlNumber(height)}`);
    out.push(`      type ${gmlString(GML_SHAPES[el.visual.shape] ?? 'ellipse')}`);
    if (fill) out.push(`      fill ${gmlString(fill)}`);
    if (outline) out.push(`      outline ${gmlString(outline)}`);
    out.push('    ]');
    out.push('  ]');
  });

  for (const link of links) {
    const from = index.get(link.fromId);
    const to = index.get(link.toId);
    if (from === undefined || to === undefined) continue;
    const dir = link.direction ?? (link.directed ? 'forward' : 'none');
    const color = hexColor(link.visual.color);
    out.push('  edge [');
    out.push(`    source ${from}`);
    out.push(`    target ${to}`);
    if (link.label) out.push(`    label ${gmlString(link.label)}`);
    out.push(...commonLines(link, '    '));
    out.push(...propertyLines(link.properties, '    '));
    out.push('    graphics [');
    if (color) out.push(`      fill ${gmlString(color)}`);
    out.push(`      width ${gmlNumber(link.visual.thickness ?? 2)}`);
    out.push(`      targetArrow ${gmlString(dir === 'forward' || dir === 'both' ? 'standard' : 'none')}`);
    if (dir === 'backward' || dir === 'both') out.push('      sourceArrow "standard"');
    out.push('    ]');
    out.push('  ]');
  }

  out.push(']');
  return out.join('\n') + '\n';
}
