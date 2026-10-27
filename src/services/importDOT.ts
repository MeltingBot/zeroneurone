/**
 * DOT import (Graphviz).
 *
 * The text format of Graphviz, also written by NetworkX, Gephi, terraform
 * and many analysis tools:
 *
 *   digraph G {
 *     rankdir=LR
 *     node [shape=box style=filled fillcolor=lightblue]
 *     subgraph cluster_bank { label="Bank"; a; b }
 *     a -> b -> c [label="pays" color=red]
 *     a -> {d e}
 *   }
 *
 * Read: labels (also HTML and record labels, as text), shapes, fill and
 * outline colours, dashed or dotted outlines, edge label, colour, style,
 * width (penwidth) and arrows (dir, arrowhead, arrowtail). `node [...]` and
 * `edge [...]` defaults follow Graphviz scoping (a subgraph inherits them).
 * Nodes of a `cluster*` subgraph get its label as a tag. Positions (`pos`,
 * written by a Graphviz layout) are kept when every node has one; otherwise
 * the graph is laid out with dagre along `rankdir`. Other attributes become
 * properties. Ports are ignored; invisible edges (layout helpers) and edges
 * from an element to itself are skipped.
 */

import i18next from 'i18next';
import type { DossierId, Element, ElementId, ElementShape, Link, LinkDirection, LinkId, Property } from '../types';
import { DEFAULT_ELEMENT_VISUAL, DEFAULT_LINK_VISUAL } from '../types';
import { generateUUID } from '../utils';
import { computeElementDimensions } from '../utils/elementDimensions';
import type { ImportResult } from './importService';
import { darkenColor, inferPropertyType } from './importGephi';
import { layoutMermaid, type MermaidDirection } from './importMermaid';
import { parseDotColor } from './dotColors';

// ============================================================================
// Lexer
// ============================================================================

type TokenKind = 'id' | 'quoted' | 'html' | 'punct' | 'edgeop';

interface Token {
  kind: TokenKind;
  value: string;
  line: number;
}

export class DotParseError extends Error {
  readonly line: number;
  constructor(message: string, line: number) {
    super(`${message} (line ${line})`);
    this.name = 'DotParseError';
    this.line = line;
  }
}

const ID_START = /[A-Za-z_\u0080-￿]/;
const ID_CHAR = /[A-Za-z0-9_\u0080-￿]/;

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let lineStart = true;
  const n = src.length;

  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; lineStart = true; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === '\uFEFF') { i++; continue; }
    // C preprocessor output lines
    if (c === '#' && lineStart) {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    lineStart = false;
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      for (let k = i; k < stop; k++) if (src[k] === '\n') line++;
      i = stop;
      continue;
    }
    if (c === '"') {
      const startLine = line;
      let value = '';
      i++;
      while (i < n && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < n) {
          const next = src[i + 1];
          if (next === '"') value += '"';
          else if (next === '\n') line++; // line continuation
          else if (next === '\r' && src[i + 2] === '\n') { line++; i++; }
          else value += '\\' + next; // kept for the escString pass
          i += 2;
          continue;
        }
        if (src[i] === '\n') line++;
        value += src[i++];
      }
      if (i >= n) throw new DotParseError('Unterminated string', startLine);
      i++;
      tokens.push({ kind: 'quoted', value, line: startLine });
      continue;
    }
    if (c === '<') {
      const startLine = line;
      let depth = 0;
      let k = i;
      for (; k < n; k++) {
        if (src[k] === '<') depth++;
        else if (src[k] === '>') { depth--; if (depth === 0) break; }
        else if (src[k] === '\n') line++;
      }
      if (k >= n) throw new DotParseError('Unterminated HTML string', startLine);
      tokens.push({ kind: 'html', value: src.slice(i + 1, k), line: startLine });
      i = k + 1;
      continue;
    }
    if (c === '-' && (src[i + 1] === '>' || src[i + 1] === '-')) {
      tokens.push({ kind: 'edgeop', value: src.slice(i, i + 2), line });
      i += 2;
      continue;
    }
    if (c === '-' || c === '.' || (c >= '0' && c <= '9')) {
      const m = /^-?(\.\d+|\d+(\.\d*)?)/.exec(src.slice(i, i + 64));
      if (m) {
        tokens.push({ kind: 'id', value: m[0], line });
        i += m[0].length;
        continue;
      }
    }
    if (ID_START.test(c)) {
      let k = i + 1;
      while (k < n && ID_CHAR.test(src[k])) k++;
      tokens.push({ kind: 'id', value: src.slice(i, k), line });
      i = k;
      continue;
    }
    if ('{}[]=;,:+'.includes(c)) {
      tokens.push({ kind: 'punct', value: c, line });
      i++;
      continue;
    }
    throw new DotParseError(`Unexpected character "${c}"`, line);
  }
  return tokens;
}

// ============================================================================
// Parser
// ============================================================================

export type DotAttrs = Record<string, string>;

/** A `cluster*` subgraph: its nodes get its label as a tag. */
interface DotCluster {
  name: string;
  attrs: DotAttrs;
}

export interface DotNode {
  id: string;
  attrs: DotAttrs;
  /** Values that came as HTML strings (`label=<...>`) */
  html: Set<string>;
  clusters: Set<DotCluster>;
}

export interface DotEdge {
  from: string;
  to: string;
  attrs: DotAttrs;
  html: Set<string>;
}

export interface ParsedDot {
  strict: boolean;
  directed: boolean;
  name: string;
  attrs: DotAttrs;
  nodes: Map<string, DotNode>;
  edges: DotEdge[];
}

interface Scope {
  parent: Scope | null;
  nodeDefaults: DotAttrs;
  edgeDefaults: DotAttrs;
  /** Graph attributes of this (sub)graph */
  attrs: DotAttrs;
  cluster: DotCluster | null;
  /** Nodes mentioned in this subgraph (edges to a subgraph reach them all) */
  members: Set<string>;
}

interface AttrList {
  attrs: DotAttrs;
  html: Set<string>;
}

class Parser {
  private pos = 0;
  readonly nodes = new Map<string, DotNode>();
  readonly edges: DotEdge[] = [];
  directed = false;

  private readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.pos + offset];
  }

  private line(): number {
    return this.peek()?.line ?? this.tokens[this.tokens.length - 1]?.line ?? 1;
  }

  private isPunct(value: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t?.kind === 'punct' && t.value === value;
  }

  private isKeyword(word: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t?.kind === 'id' && t.value.toLowerCase() === word;
  }

  private expectPunct(value: string): void {
    if (!this.isPunct(value)) {
      const t = this.peek();
      throw new DotParseError(`Expected "${value}"${t ? `, found "${t.value}"` : ''}`, this.line());
    }
    this.pos++;
  }

  /** An ID: identifier, number, quoted string (with `+` concatenation) or HTML string. */
  private isId(offset = 0): boolean {
    const t = this.peek(offset);
    return t !== undefined && (t.kind === 'id' || t.kind === 'quoted' || t.kind === 'html');
  }

  private readId(): { value: string; html: boolean } {
    const t = this.peek();
    if (!t || (t.kind !== 'id' && t.kind !== 'quoted' && t.kind !== 'html')) {
      throw new DotParseError(`Expected an identifier${t ? `, found "${t.value}"` : ''}`, this.line());
    }
    this.pos++;
    if (t.kind !== 'quoted') return { value: t.value, html: t.kind === 'html' };
    let value = t.value;
    while (this.isPunct('+') && this.peek(1)?.kind === 'quoted') {
      value += this.peek(1)!.value;
      this.pos += 2;
    }
    return { value, html: false };
  }

  parseGraph(): ParsedDot {
    let strict = false;
    if (this.isKeyword('strict')) { strict = true; this.pos++; }
    if (this.isKeyword('digraph')) this.directed = true;
    else if (!this.isKeyword('graph')) throw new DotParseError('Expected "graph" or "digraph"', this.line());
    this.pos++;
    let name = '';
    if (this.isId() && !this.isPunct('{')) name = this.readId().value;
    const root: Scope = {
      parent: null, nodeDefaults: {}, edgeDefaults: {}, attrs: {}, cluster: null, members: new Set(),
    };
    this.expectPunct('{');
    this.parseStmtList(root);
    this.expectPunct('}');
    return { strict, directed: this.directed, name, attrs: root.attrs, nodes: this.nodes, edges: this.edges };
  }

  private parseStmtList(scope: Scope): void {
    while (this.peek() && !this.isPunct('}')) {
      this.parseStmt(scope);
      if (this.isPunct(';') || this.isPunct(',')) this.pos++;
    }
  }

  private parseAttrList(): AttrList {
    const result: AttrList = { attrs: {}, html: new Set() };
    while (this.isPunct('[')) {
      this.pos++;
      while (!this.isPunct(']')) {
        if (!this.peek()) throw new DotParseError('Unterminated attribute list', this.line());
        const key = this.readId().value;
        let value = 'true';
        let html = false;
        if (this.isPunct('=')) {
          this.pos++;
          const v = this.readId();
          value = v.value;
          html = v.html;
        }
        result.attrs[key] = value;
        if (html) result.html.add(key);
        else result.html.delete(key);
        if (this.isPunct(',') || this.isPunct(';')) this.pos++;
      }
      this.pos++;
    }
    return result;
  }

  private touchNode(id: string, scope: Scope): DotNode {
    let node = this.nodes.get(id);
    if (!node) {
      node = { id, attrs: { ...scope.nodeDefaults }, html: new Set(), clusters: new Set() };
      this.nodes.set(id, node);
    }
    for (let s: Scope | null = scope; s; s = s.parent) {
      s.members.add(id);
      if (s.cluster) node.clusters.add(s.cluster);
    }
    return node;
  }

  /** A node id, with its port dropped. */
  private readNodeId(): string {
    const id = this.readId().value;
    // :port[:compass] or :compass
    while (this.isPunct(':') && this.isId(1)) this.pos += 2;
    return id;
  }

  private parseSubgraph(scope: Scope): Set<string> {
    let name = '';
    if (this.isKeyword('subgraph')) {
      this.pos++;
      if (this.isId() && !this.isPunct('{')) name = this.readId().value;
    }
    const child: Scope = {
      parent: scope,
      nodeDefaults: { ...scope.nodeDefaults },
      edgeDefaults: { ...scope.edgeDefaults },
      attrs: {},
      cluster: /^cluster/i.test(name) ? { name, attrs: {} } : null,
      members: new Set(),
    };
    if (child.cluster) child.attrs = child.cluster.attrs;
    // A subgraph without a body only names an earlier one
    if (!this.isPunct('{')) return child.members;
    this.pos++;
    this.parseStmtList(child);
    this.expectPunct('}');
    return child.members;
  }

  private isSubgraphStart(): boolean {
    return this.isKeyword('subgraph') || this.isPunct('{');
  }

  /** One operand of an edge statement: the nodes it stands for. */
  private parseEdgeOperand(scope: Scope): string[] {
    if (this.isSubgraphStart()) return [...this.parseSubgraph(scope)];
    const id = this.readNodeId();
    this.touchNode(id, scope);
    return [id];
  }

  private parseStmt(scope: Scope): void {
    // Attribute statements: graph / node / edge [ ... ]
    for (const kind of ['graph', 'node', 'edge'] as const) {
      if (this.isKeyword(kind) && this.isPunct('[', 1)) {
        this.pos++;
        const { attrs } = this.parseAttrList();
        if (kind === 'graph') Object.assign(scope.attrs, attrs);
        else if (kind === 'node') Object.assign(scope.nodeDefaults, attrs);
        else Object.assign(scope.edgeDefaults, attrs);
        return;
      }
    }
    // ID = ID: a graph attribute
    if (this.isId() && this.isPunct('=', 1)) {
      const key = this.readId().value;
      this.pos++;
      scope.attrs[key] = this.readId().value;
      return;
    }

    const first = this.parseEdgeOperand(scope);
    if (this.peek()?.kind === 'edgeop') {
      const operands = [first];
      while (this.peek()?.kind === 'edgeop') {
        this.pos++;
        operands.push(this.parseEdgeOperand(scope));
      }
      const { attrs, html } = this.parseAttrList();
      for (let k = 0; k + 1 < operands.length; k++) {
        for (const from of operands[k]) {
          for (const to of operands[k + 1]) {
            const edgeHtml = new Set(html);
            this.edges.push({ from, to, attrs: { ...scope.edgeDefaults, ...attrs }, html: edgeHtml });
          }
        }
      }
      return;
    }

    // Node statement (a lone subgraph has been handled as an operand)
    if (first.length === 1 && this.isPunct('[')) {
      const node = this.nodes.get(first[0])!;
      const { attrs, html } = this.parseAttrList();
      Object.assign(node.attrs, attrs);
      for (const key of Object.keys(attrs)) {
        if (html.has(key)) node.html.add(key);
        else node.html.delete(key);
      }
    }
  }
}

/** Parses a DOT document. Throws DotParseError on malformed input. */
export function parseDOT(content: string): ParsedDot {
  const tokens = tokenize(content);
  return new Parser(tokens).parseGraph();
}

/**
 * True when the text is a DOT graph. Strict on the header so that prose and
 * Mermaid (`graph TD` then nodes) are not taken for one.
 */
export function isDotGraph(text: string): boolean {
  if (!text || text.length > 5_000_000) return false;
  const head = text
    .replace(/^\uFEFF/, '')
    .replace(/^(\s*(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*))*/, '')
    .trimStart();
  return /^(strict\s+)?(di)?graph(\s+("[^"]*"|[A-Za-z_\u0080-￿][\w\u0080-￿]*|-?[\d.]+))?\s*\{/i.test(head);
}

// ============================================================================
// Text helpers
// ============================================================================

/** Graphviz escString: \n \l \r line breaks, \N \G \E \T \H names, \\ a backslash. */
function decodeEscString(s: string, names: Record<string, string> = {}): string {
  return s.replace(/\\(.)/g, (_whole, ch: string) => {
    if (ch === 'n' || ch === 'l' || ch === 'r') return '\n';
    if (ch in names) return names[ch];
    return ch;
  }).replace(/\n+$/, '');
}

const HTML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Text of an HTML-like label: line breaks kept, tags dropped. */
function htmlLabelText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(tr|p|div)>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
      if (code[0] === '#') {
        const cp = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : whole;
      }
      return HTML_ENTITIES[code.toLowerCase()] ?? whole;
    })
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** Text of a record label: `{a|<p>b}` → `a | b`. */
function recordLabelText(label: string): string {
  return label
    .replace(/<[^>]*>/g, '')
    .replace(/[{}]/g, '|')
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' | ');
}

function mapShape(shape: string | undefined): ElementShape {
  const s = (shape ?? '').toLowerCase();
  if (!s) return DEFAULT_ELEMENT_VISUAL.shape;
  if (['ellipse', 'oval', 'circle', 'doublecircle', 'point', 'egg'].includes(s)) return 'circle';
  if (s === 'square') return 'square';
  if (['diamond', 'mdiamond', 'triangle', 'invtriangle'].includes(s)) return 'diamond';
  if (['hexagon', 'octagon', 'doubleoctagon', 'tripleoctagon', 'pentagon', 'septagon', 'polygon'].includes(s)) return 'hexagon';
  return 'rectangle';
}

function styleWords(style: string | undefined): Set<string> {
  return new Set((style ?? '').toLowerCase().split(/[,\s]+/).filter(Boolean));
}

/** Attributes read into the element or link itself, not kept as properties. */
export const NODE_READ = new Set([
  'label', 'shape', 'style', 'color', 'fillcolor', 'fontcolor', 'fontname', 'fontsize', 'width', 'height',
  'fixedsize', 'pos', 'penwidth', 'tooltip', 'peripheries', 'margin', 'group', 'sides', 'skew', 'distortion',
  'orientation', 'regular', 'image', 'imagescale', 'imagepos', 'labelloc', 'xlp', 'lp', 'gradientangle',
  'colorscheme', 'nojustify', 'z', 'area', 'class', 'id', 'layer', 'ordering', 'rects', 'samplepoints',
  'showboxes', 'sortv', 'vertices', 'root', 'pin', 'notes', 'tags', 'confidence', 'source', 'comment',
]);
export const EDGE_READ = new Set([
  'label', 'color', 'fillcolor', 'fontcolor', 'fontname', 'fontsize', 'style', 'penwidth', 'dir', 'arrowhead',
  'arrowtail', 'arrowsize', 'pos', 'lp', 'xlp', 'head_lp', 'tail_lp', 'headport', 'tailport', 'constraint',
  'minlen', 'labelfloat', 'labelangle', 'labeldistance', 'labelfontcolor', 'labelfontname', 'labelfontsize',
  'decorate', 'samehead', 'sametail', 'layer', 'colorscheme', 'id', 'class', 'tooltip', 'ltail', 'lhead',
  'headclip', 'tailclip', 'notes', 'tags', 'confidence', 'source', 'comment',
]);

/**
 * Other attributes as properties, taken as written: only labels and notes
 * read Graphviz escapes, so a Windows path (`C:\Users\nadia`) keeps its
 * backslashes.
 */
function toProperties(attrs: DotAttrs, read: Set<string>): Property[] {
  const props: Property[] = [];
  for (const [key, value] of Object.entries(attrs)) {
    if (read.has(key.toLowerCase())) continue;
    if (value === '') continue;
    const type = inferPropertyType(value);
    props.push({ key, value: type === 'number' ? Number(value) : value, type });
  }
  return props;
}

function toTags(attrs: DotAttrs): string[] {
  const raw = attrs.tags;
  return raw ? raw.split(';').map((s) => s.trim()).filter(Boolean) : [];
}

/** ZN confidence is 0-100 in steps of 10. */
function toConfidence(attrs: DotAttrs): Element['confidence'] {
  const n = Number(attrs.confidence);
  if (attrs.confidence === undefined || !Number.isFinite(n) || n < 0 || n > 100) return null;
  return (Math.round(n / 10) * 10) as Element['confidence'];
}

function notesOf(attrs: DotAttrs): string {
  const raw = attrs.notes ?? attrs.tooltip ?? attrs.comment;
  return raw ? decodeEscString(raw) : '';
}

/** Tag of a cluster: its label, else its name without the "cluster" prefix. */
function clusterTag(cluster: DotCluster): string {
  const label = cluster.attrs.label ? decodeEscString(cluster.attrs.label).trim() : '';
  if (label) return label;
  const bare = cluster.name.replace(/^cluster[\s_-]*/i, '');
  return bare && !/^\d+$/.test(bare) ? bare : cluster.name;
}

const t = (key: string, options?: Record<string, unknown>) =>
  i18next.t(`importData:dot.${key}`, options) as string;

// ============================================================================
// DOT → ZN objects (pure, no DB)
// ============================================================================

export interface DOTGraph {
  elements: Element[];
  links: Link[];
  warnings: string[];
}

/** Points per inch, Graphviz's unit for `pos` and node sizes. */
const POINTS_PER_INCH = 72;
/** Pixels per point when nodes carry no size to compare with. */
const DEFAULT_POINT_SCALE = 2;

function rankdirOf(attrs: DotAttrs): MermaidDirection {
  const r = (attrs.rankdir ?? 'TB').toUpperCase();
  return r === 'LR' || r === 'RL' || r === 'BT' ? r : 'TB';
}

/**
 * Build ZN elements and links from DOT text. Positions are absolute top-left
 * corners starting at (0, 0): from `pos` when every node has one, else laid
 * out with dagre.
 */
export function buildDOTGraph(content: string, dossierId: DossierId): DOTGraph {
  const parsed = parseDOT(content);
  const warnings: string[] = [];
  const now = new Date();
  const graphName = parsed.name;

  const idMap = new Map<string, ElementId>();
  const elements: Element[] = [];
  const elementByDotId = new Map<string, Element>();
  const positions = new Map<string, { x: number; y: number } | null>();
  /** px per point, estimated from node sizes */
  const scaleSamples: number[] = [];

  for (const node of parsed.nodes.values()) {
    const a = node.attrs;
    const id = generateUUID() as ElementId;
    idMap.set(node.id, id);

    const shapeName = a.shape?.toLowerCase();
    let label: string;
    if (a.label !== undefined && node.html.has('label')) label = htmlLabelText(a.label);
    else if (a.label !== undefined) {
      label = decodeEscString(a.label, { N: node.id, G: graphName });
      if (shapeName === 'record' || shapeName === 'mrecord') label = recordLabelText(label);
    } else label = node.id;
    if (!label.trim()) label = node.id;

    const style = styleWords(a.style);
    const outline = parseDotColor(a.color);
    const fill = parseDotColor(a.fillcolor) ?? (style.has('filled') ? outline : undefined);
    const color = fill ?? DEFAULT_ELEMENT_VISUAL.color;
    const borderColor = outline ?? (fill ? darkenColor(fill) : DEFAULT_ELEMENT_VISUAL.borderColor);
    const borderStyle = style.has('dashed') ? 'dashed' as const : style.has('dotted') ? 'dotted' as const : undefined;

    const visual = {
      ...DEFAULT_ELEMENT_VISUAL,
      color,
      borderColor,
      shape: mapShape(a.shape),
      ...(borderStyle ? { borderStyle } : {}),
    };

    const tags = toTags(a);
    for (const cluster of node.clusters) {
      const tag = clusterTag(cluster);
      if (!tags.includes(tag)) tags.push(tag);
    }

    const properties = toProperties(a, NODE_READ);
    properties.push({ key: 'dot_id', value: node.id, type: 'text' });

    // pos="x,y" (points, Y up), "!" pins it
    const m = /^\s*(-?[\d.]+(?:e[+-]?\d+)?)\s*,\s*(-?[\d.]+(?:e[+-]?\d+)?)/i.exec(a.pos ?? '');
    positions.set(node.id, m ? { x: Number(m[1]), y: Number(m[2]) } : null);
    const widthIn = Number(a.width);
    if (m && Number.isFinite(widthIn) && widthIn > 0) {
      const { width } = computeElementDimensions(visual, label, false);
      scaleSamples.push(width / (widthIn * POINTS_PER_INCH));
    }

    const element: Element = {
      id,
      dossierId,
      label,
      notes: notesOf(a),
      tags,
      properties,
      confidence: toConfidence(a),
      source: a.source ?? '',
      date: null,
      dateRange: null,
      position: { x: 0, y: 0 },
      isPositionLocked: false,
      geo: null,
      visual,
      assetIds: [],
      parentGroupId: null,
      isGroup: false,
      isAnnotation: false,
      childIds: [],
      events: [],
      createdAt: now,
      updatedAt: now,
    };
    elements.push(element);
    elementByDotId.set(node.id, element);
  }

  // strict: one edge per pair (undirected: either way), attributes merged, the last win
  let edges = parsed.edges;
  if (parsed.strict) {
    const byPair = new Map<string, DotEdge>();
    for (const edge of parsed.edges) {
      const key = parsed.directed || edge.from < edge.to ? `${edge.from}\u0000${edge.to}` : `${edge.to}\u0000${edge.from}`;
      const prev = byPair.get(key);
      if (prev) {
        Object.assign(prev.attrs, edge.attrs);
        for (const k of Object.keys(edge.attrs)) {
          if (edge.html.has(k)) prev.html.add(k);
          else prev.html.delete(k);
        }
      } else {
        byPair.set(key, { ...edge, attrs: { ...edge.attrs }, html: new Set(edge.html) });
      }
    }
    edges = [...byPair.values()];
  }

  // Edges
  const links: Link[] = [];
  let skipped = 0;
  for (const edge of edges) {
    const a = edge.attrs;
    const style = styleWords(a.style);
    if (style.has('invis') || edge.from === edge.to) { skipped++; continue; }

    const dir = (a.dir ?? (parsed.directed ? 'forward' : 'none')).toLowerCase();
    const head = (dir === 'forward' || dir === 'both') && (a.arrowhead ?? '').toLowerCase() !== 'none';
    const tail = (dir === 'back' || dir === 'both') && (a.arrowtail ?? '').toLowerCase() !== 'none';
    const direction: LinkDirection = head && tail ? 'both' : head ? 'forward' : tail ? 'backward' : 'none';

    const label = a.label === undefined ? ''
      : edge.html.has('label') ? htmlLabelText(a.label)
      : decodeEscString(a.label, { T: edge.from, H: edge.to, E: `${edge.from}->${edge.to}`, G: graphName });
    const color = parseDotColor(a.color);
    const penwidth = Number(a.penwidth);
    const thickness = Number.isFinite(penwidth) && penwidth > 0
      ? Math.max(1, Math.min(10, Math.round(penwidth)))
      : style.has('bold') ? 4 : DEFAULT_LINK_VISUAL.thickness;

    links.push({
      id: generateUUID() as LinkId,
      dossierId,
      fromId: idMap.get(edge.from)!,
      toId: idMap.get(edge.to)!,
      sourceHandle: null,
      targetHandle: null,
      label,
      notes: notesOf(a),
      tags: toTags(a),
      properties: toProperties(a, EDGE_READ),
      confidence: toConfidence(a),
      source: a.source ?? '',
      date: null,
      dateRange: null,
      directed: direction !== 'none',
      direction,
      visual: {
        ...DEFAULT_LINK_VISUAL,
        ...(color ? { color } : {}),
        style: style.has('dashed') ? 'dashed' : style.has('dotted') ? 'dotted' : 'solid',
        thickness,
      },
      curveOffset: { x: 0, y: 0 },
      createdAt: now,
      updatedAt: now,
    });
  }
  if (skipped > 0) warnings.push(t('warnings.skippedEdges', { count: skipped }));

  // Positions: Graphviz's own when every node has one, else dagre
  const allPositioned = elements.length > 0 && [...positions.values()].every((p) => p !== null);
  if (allPositioned) {
    scaleSamples.sort((x, y) => x - y);
    const median = scaleSamples.length ? scaleSamples[Math.floor(scaleSamples.length / 2)] : DEFAULT_POINT_SCALE;
    const scale = Math.max(1, Math.min(4, median));
    let minX = Infinity, minY = Infinity;
    for (const [dotId, p] of positions) {
      const el = elementByDotId.get(dotId)!;
      const { width, height } = computeElementDimensions(el.visual, el.label, false);
      el.position = { x: Math.round(p!.x * scale - width / 2), y: Math.round(-p!.y * scale - height / 2) };
      minX = Math.min(minX, el.position.x);
      minY = Math.min(minY, el.position.y);
    }
    for (const el of elements) el.position = { x: el.position.x - minX, y: el.position.y - minY };
  } else {
    layoutMermaid(elements, links, rankdirOf(parsed.attrs));
  }

  return { elements, links, warnings };
}

/** Localized message for a DOT parse failure. */
export function dotErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : t('errors.unknownError');
  return error instanceof DotParseError ? t('errors.parseError', { message }) : message;
}

// ============================================================================
// Import into a dossier
// ============================================================================

export async function importDOT(content: string, targetDossierId: DossierId): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    elementsImported: 0,
    linksImported: 0,
    assetsImported: 0,
    reportImported: false,
    errors: [],
    warnings: [],
  };

  let graph: DOTGraph;
  try {
    graph = buildDOTGraph(content, targetDossierId);
  } catch (error) {
    result.errors.push(dotErrorMessage(error));
    return result;
  }
  if (graph.elements.length === 0) {
    result.errors.push(t('errors.empty'));
    return result;
  }

  try {
    const { db } = await import('../db/database');
    await db.transaction('rw', db.elements, db.links, db.dossiers, async () => {
      await db.elements.bulkAdd(graph.elements);
      if (graph.links.length > 0) await db.links.bulkAdd(graph.links);
      await db.dossiers.update(targetDossierId, { updatedAt: new Date() });
    });
    result.elementsImported = graph.elements.length;
    result.linksImported = graph.links.length;
    result.warnings = graph.warnings;
    result.success = true;
  } catch (error) {
    result.errors.push(t('errors.importError', {
      message: error instanceof Error ? error.message : t('errors.unknownError'),
    }));
  }
  return result;
}
