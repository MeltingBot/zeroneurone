/**
 * Mermaid import — flowchart / graph diagrams only.
 *
 * Hand-written, error-tolerant parser (the `mermaid` library is several MB,
 * needs a DOM and exposes no stable parser API). Unrecognized lines are
 * skipped and counted instead of failing the whole import: LLM output is
 * often slightly off-spec.
 *
 * Produces fully-formed Element/Link objects laid out with dagre, meant to be
 * handed to import placement mode (`prebuilt`), which gives undo, Y.js sync,
 * tab membership and selection for free.
 */

import dagre from '@dagrejs/dagre';
import i18next from 'i18next';
import { DEFAULT_ELEMENT_VISUAL, DEFAULT_LINK_VISUAL } from '../types';
import type { DossierId, Element, ElementShape, Link, LinkDirection, LinkStyle } from '../types';
import { computeElementDimensions } from '../utils/elementDimensions';
import type { ImportResult } from './importService';

// ============================================================================
// Types
// ============================================================================

export type MermaidDirection = 'TB' | 'BT' | 'LR' | 'RL';

export interface MermaidStyle {
  fill?: string;
  stroke?: string;
  dashed?: boolean;
}

export interface MermaidNode {
  id: string;
  label: string;
  shape: ElementShape;
  classes: string[];
  style: MermaidStyle;
  /** Title of the innermost subgraph where the node first appeared */
  subgraph: string | null;
}

export interface MermaidEdge {
  from: string;
  to: string;
  label: string;
  direction: LinkDirection;
  style: LinkStyle;
  thick: boolean;
}

export interface ParsedMermaid {
  direction: MermaidDirection;
  nodes: MermaidNode[];
  edges: MermaidEdge[];
  /** Lines that could not be understood (skipped) */
  ignoredLines: number;
  /** Edges dropped because an endpoint is a subgraph, not a node */
  droppedEdges: number;
}

export type MermaidErrorCode = 'empty' | 'unsupportedDiagram';

export class MermaidParseError extends Error {
  code: MermaidErrorCode;
  /** Diagram keyword found, for 'unsupportedDiagram' */
  diagramType?: string;
  constructor(code: MermaidErrorCode, diagramType?: string) {
    super(code === 'empty' ? 'Empty Mermaid diagram' : `Unsupported Mermaid diagram: ${diagramType}`);
    this.name = 'MermaidParseError';
    this.code = code;
    this.diagramType = diagramType;
  }
}

// ============================================================================
// Preamble handling (code fence, frontmatter, init directives)
// ============================================================================

const HEADER_RE = /^(graph|flowchart)(?:\s+(TB|TD|BT|LR|RL))?\s*;?\s*$/i;
const OTHER_DIAGRAM_RE = /^(sequenceDiagram|classDiagram(?:-v2)?|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|quadrantChart|requirementDiagram|gitGraph|C4Context|mindmap|timeline|sankey(?:-beta)?|xychart(?:-beta)?|block(?:-beta)?|packet(?:-beta)?|kanban|architecture(?:-beta)?|radar(?:-beta)?)\b/;

const FLOWCHART_START_RE = /^(graph|flowchart)\b/i;

/** Drop YAML frontmatter, `%%{init}%%` directives and `%%` comment lines. */
function stripPreamble(src: string): string {
  return src
    .replace(/^\s*---\n[\s\S]*?\n---\s*\n/, '')
    .replace(/%%\{[\s\S]*?\}%%/g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('%%'))
    .join('\n')
    .trim();
}

/** Strip code fence, YAML frontmatter, `%%{init}%%` directives and comments. */
function extractBody(text: string): string[] {
  let src = text.replace(/\r\n?/g, '\n').trim();

  // ```mermaid … ``` fences (Markdown file, LLM answer with prose): prefer the
  // first flowchart block, a Markdown document may hold other diagram types
  const fences = [...src.matchAll(/```\s*mermaid[^\n]*\n([\s\S]*?)```/gi)].map((m) => m[1]);
  if (fences.length > 0) {
    src = fences.find((f) => FLOWCHART_START_RE.test(stripPreamble(f))) ?? fences[0];
  } else {
    src = src.replace(/^```[^\n]*\n/, '').replace(/\n```\s*$/, '');
  }

  return stripPreamble(src)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * True when the text is a Mermaid flowchart. Strict on the header line so that
 * ordinary pasted prose ("graph theory is…") is not mistaken for a diagram.
 */
export function isMermaidFlowchart(text: string): boolean {
  if (!text || text.length > 2_000_000) return false;
  const statements = extractBody(text).flatMap(splitStatements);
  return statements.length >= 2 && HEADER_RE.test(statements[0]);
}

// ============================================================================
// Text helpers
// ============================================================================

const NAMED_ENTITIES: Record<string, string> = {
  quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: ' ',
};

/** Decode Mermaid entity codes (`#quot;`, `#35;`) and HTML entities. */
function decodeEntities(s: string): string {
  return s
    .replace(/#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/#([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

/** Clean a node/edge label: quotes, markdown backticks, <br>, HTML tags, entities. */
function cleanLabel(raw: string): string {
  let s = raw.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  if (s.length >= 2 && s.startsWith('`') && s.endsWith('`')) s = s.slice(1, -1);
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/\\n/g, '\n');
  s = s.replace(/<\/?[a-z][^>]*>/gi, '');
  s = s.replace(/\*\*(.+?)\*\*/g, '$1');
  s = decodeEntities(s);
  return s
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim();
}

/** Split a line on `;` outside quotes and brackets. */
function splitStatements(line: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inQuote = false;
  let cur = '';
  for (const ch of line) {
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote && '[({'.includes(ch)) depth++;
    else if (!inQuote && '])}'.includes(ch)) depth = Math.max(0, depth - 1);
    if (ch === ';' && !inQuote && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const CSS_COLOR_RE = /^(#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([^)]*\))$/i;

function normalizeColor(value: string): string | undefined {
  const v = value.trim();
  if (!CSS_COLOR_RE.test(v)) return undefined;
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toLowerCase();
  }
  return v.toLowerCase();
}

/** Parse `fill:#f9f,stroke:#333,stroke-dasharray: 5 5` */
function parseStyleDecl(decl: string): MermaidStyle {
  const style: MermaidStyle = {};
  for (const part of decl.split(',')) {
    const idx = part.indexOf(':');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (key === 'fill') style.fill = normalizeColor(value) ?? style.fill;
    else if (key === 'stroke') style.stroke = normalizeColor(value) ?? style.stroke;
    else if (key === 'stroke-dasharray') style.dashed = true;
  }
  return style;
}

// ============================================================================
// Statement scanner
// ============================================================================

/**
 * Node id: letters, digits, `_`, plus `-` and `.` between them (`node-1`,
 * `a.b`). A `-` or `.` must be followed by an id character, so `A-->B` and
 * `A-.->B` still split into id + edge operator.
 */
const ID_RE = /^[\p{L}\p{N}_]+(?:[-.][\p{L}\p{N}_]+)*/u;

/** Node shape delimiters, longest opener first. */
const SHAPES: { open: string; close: string[]; shape: ElementShape }[] = [
  { open: '(((', close: [')))'], shape: 'circle' },
  { open: '((', close: ['))'], shape: 'circle' },
  { open: '([', close: ['])'], shape: 'rectangle' },
  // ZN squares are fixed-size and wrap labels mid-word: keep these as rectangles
  { open: '[[', close: [']]'], shape: 'rectangle' },
  { open: '[(', close: [')]'], shape: 'rectangle' },
  { open: '[/', close: ['/]', '\\]'], shape: 'rectangle' },
  { open: '[\\', close: ['\\]', '/]'], shape: 'rectangle' },
  { open: '{{', close: ['}}'], shape: 'hexagon' },
  { open: '(', close: [')'], shape: 'rectangle' },
  { open: '[', close: [']'], shape: 'rectangle' },
  { open: '{', close: ['}'], shape: 'diamond' },
  { open: '>', close: [']'], shape: 'rectangle' },
];

/** `@{ shape: circle, label: "x" }` (Mermaid ≥ 11.3) shape names → ZN shapes */
const EXTENDED_SHAPES: Record<string, ElementShape> = {
  circle: 'circle', circ: 'circle', 'sm-circ': 'circle', 'dbl-circ': 'circle', 'fr-circ': 'circle',
  'double-circle': 'circle', 'small-circle': 'circle', 'filled-circle': 'circle', 'framed-circle': 'circle',
  diam: 'diamond', diamond: 'diamond', decision: 'diamond', question: 'diamond',
  hex: 'hexagon', hexagon: 'hexagon', prepare: 'hexagon',
  cyl: 'rectangle', cylinder: 'rectangle', database: 'rectangle', db: 'rectangle', subproc: 'rectangle', subroutine: 'rectangle',
};

interface NodeRef {
  id: string;
  label?: string;
  shape?: ElementShape;
  classes: string[];
}

interface EdgeToken {
  label: string;
  direction: LinkDirection;
  style: LinkStyle;
  thick: boolean;
  invisible: boolean;
}

class Scanner {
  pos = 0;
  readonly s: string;
  constructor(s: string) {
    this.s = s;
  }

  get rest(): string {
    return this.s.slice(this.pos);
  }

  skipWs(): void {
    while (this.pos < this.s.length && /\s/.test(this.s[this.pos])) this.pos++;
  }

  done(): boolean {
    this.skipWs();
    return this.pos >= this.s.length;
  }

  /** Read content up to one of the closers, honoring a leading quoted string. */
  readUntil(closers: string[]): string | null {
    const start = this.pos;
    let i = this.pos;
    // Leading quoted string: the closer must follow the closing quote
    const lead = this.s.slice(i).match(/^\s*"/);
    if (lead) {
      const qStart = i + lead[0].length;
      const qEnd = this.s.indexOf('"', qStart);
      if (qEnd >= 0) i = qEnd + 1;
    }
    let best = -1;
    let bestLen = 0;
    for (const c of closers) {
      const idx = this.s.indexOf(c, i);
      if (idx >= 0 && (best < 0 || idx < best)) {
        best = idx;
        bestLen = c.length;
      }
    }
    if (best < 0) return null;
    this.pos = best + bestLen;
    return this.s.slice(start, best);
  }

  readNode(): NodeRef | null {
    this.skipWs();
    const m = this.rest.match(ID_RE);
    if (!m) return null;
    this.pos += m[0].length;
    const node: NodeRef = { id: m[0], classes: [] };

    // Extended syntax: A@{ shape: rect, label: "x" }
    if (this.rest.startsWith('@{')) {
      this.pos += 2;
      const body = this.readUntil(['}']);
      if (body == null) return null;
      const shapeM = body.match(/shape\s*:\s*([\w-]+)/i);
      const labelM = body.match(/label\s*:\s*("(?:[^"\\]|\\.)*"|[^,}]+)/i);
      if (shapeM) node.shape = EXTENDED_SHAPES[shapeM[1].toLowerCase()] ?? 'rectangle';
      if (labelM) node.label = cleanLabel(labelM[1]);
    } else {
      for (const sh of SHAPES) {
        if (!this.rest.startsWith(sh.open)) continue;
        this.pos += sh.open.length;
        const body = this.readUntil(sh.close);
        if (body == null) return null;
        node.label = cleanLabel(body);
        node.shape = sh.shape;
        break;
      }
    }

    // :::className (can be chained)
    let cls: RegExpMatchArray | null;
    while ((cls = this.rest.match(/^:::([\w-]+)/))) {
      node.classes.push(cls[1]);
      this.pos += cls[0].length;
    }
    return node;
  }

  readNodeGroup(): NodeRef[] | null {
    const first = this.readNode();
    if (!first) return null;
    const group = [first];
    for (;;) {
      const save = this.pos;
      this.skipWs();
      if (this.s[this.pos] !== '&') {
        this.pos = save;
        break;
      }
      this.pos++;
      const next = this.readNode();
      if (!next) return null;
      group.push(next);
    }
    return group;
  }

  readEdge(): EdgeToken | null {
    this.skipWs();
    const r = this.rest;
    let m: RegExpMatchArray | null;

    // Inline-text forms: A -- text --> B, A == text ==> B, A -. text .-> B
    if ((m = r.match(/^(<?)--\s+(?![->])(.+?)\s+(-{2,})(>|[xo](?![\p{L}\p{N}_]))?/u))) {
      this.pos += m[0].length;
      return edgeFrom(m[1], m[4], 'solid', false, m[2]);
    }
    if ((m = r.match(/^(<?)==\s+(?![=>])(.+?)\s+(={2,})(>|[xo](?![\p{L}\p{N}_]))?/u))) {
      this.pos += m[0].length;
      return edgeFrom(m[1], m[4], 'solid', true, m[2]);
    }
    if ((m = r.match(/^(<?)-\.\s+(.+?)\s+(\.+-)(>|[xo](?![\p{L}\p{N}_]))?/u))) {
      this.pos += m[0].length;
      return edgeFrom(m[1], m[4], 'dashed', false, m[2]);
    }

    // Plain operators: --> --- -.-> -.- ==> === <--> --x --o ~~~ (with long variants)
    if ((m = r.match(/^(<|[xo](?=[-=.]))?(~{3,}|-\.+-|={2,}|-{2,})(>|[xo](?![\p{L}\p{N}_]))?/u))) {
      const body = m[2];
      // A bare "--" / "==" with no head is only valid as the start of an inline-text edge
      if ((body === '--' || body === '==') && !m[3] && !m[1]) return null;
      this.pos += m[0].length;
      const invisible = body.startsWith('~');
      const style: LinkStyle = body.includes('.') ? 'dashed' : 'solid';
      const edge = edgeFrom(m[1] === '<' ? '<' : '', m[3], style, body.startsWith('='), '');
      edge.invisible = invisible;

      // |label| after the operator
      const pipe = this.rest.match(/^\s*\|([^|]*)\|/);
      if (pipe) {
        this.pos += pipe[0].length;
        edge.label = cleanLabel(pipe[1]);
      }
      return edge;
    }
    return null;
  }
}

function edgeFrom(start: string, head: string | undefined, style: LinkStyle, thick: boolean, label: string): EdgeToken {
  const back = start === '<';
  const fwd = !!head;
  const direction: LinkDirection = back && fwd ? 'both' : fwd ? 'forward' : back ? 'backward' : 'none';
  return { label: cleanLabel(label), direction, style, thick, invisible: false };
}

// ============================================================================
// Parser
// ============================================================================

/**
 * Parse a Mermaid flowchart. Throws MermaidParseError for empty input or a
 * non-flowchart diagram; everything else is best-effort.
 */
export function parseMermaid(text: string): ParsedMermaid {
  // "graph TD; A-->B; B-->C" on a single line is common: split before reading the header
  const all = extractBody(text).flatMap(splitStatements);
  if (all.length === 0) throw new MermaidParseError('empty');

  const header = all[0].match(HEADER_RE);
  if (!header) {
    const other = all[0].match(OTHER_DIAGRAM_RE);
    throw new MermaidParseError(other ? 'unsupportedDiagram' : 'empty', other?.[1] ?? all[0].split(/\s/)[0]);
  }
  const dirRaw = (header[2] ?? 'TB').toUpperCase();
  const direction: MermaidDirection = dirRaw === 'TD' ? 'TB' : (dirRaw as MermaidDirection);

  const nodes = new Map<string, MermaidNode>();
  const edges: MermaidEdge[] = [];
  const classDefs = new Map<string, MermaidStyle>();
  const nodeStyles = new Map<string, MermaidStyle>();
  const subgraphIds = new Set<string>();
  const subgraphStack: string[] = [];
  let ignoredLines = 0;

  const touchNode = (ref: NodeRef): void => {
    let node = nodes.get(ref.id);
    if (!node) {
      node = {
        id: ref.id,
        label: ref.id,
        shape: 'rectangle',
        classes: [],
        style: {},
        subgraph: subgraphStack.length > 0 ? subgraphStack[subgraphStack.length - 1] : null,
      };
      nodes.set(ref.id, node);
    }
    // A later declaration with a shape/label updates the node
    if (ref.label !== undefined) node.label = ref.label || ref.id;
    if (ref.shape) node.shape = ref.shape;
    for (const c of ref.classes) if (!node.classes.includes(c)) node.classes.push(c);
  };

  const statements = all.slice(1);

  for (const stmt of statements) {
    // ── Directives ──
    if (/^end$/i.test(stmt)) {
      if (subgraphStack.length > 0) subgraphStack.pop();
      continue;
    }
    const sub = stmt.match(/^subgraph\s+(.+)$/i);
    if (sub) {
      const def = sub[1].trim();
      // subgraph id [title] | subgraph id["title"] | subgraph "title" | subgraph title words
      const withTitle = def.match(/^([\p{L}\p{N}_.-]+)\s*\[(.*)\]$/u);
      let id: string;
      let title: string;
      if (withTitle) {
        id = withTitle[1];
        title = cleanLabel(withTitle[2]);
      } else {
        title = cleanLabel(def);
        id = def.replace(/^"|"$/g, '');
      }
      subgraphIds.add(id);
      subgraphStack.push(title || id);
      continue;
    }
    if (/^(direction\s+(TB|TD|BT|LR|RL)|linkStyle\b|click\b|accTitle\b|accDescr\b|%%)/i.test(stmt)) continue;

    const classDef = stmt.match(/^classDef\s+([\w,-]+)\s+(.+)$/i);
    if (classDef) {
      const style = parseStyleDecl(classDef[2]);
      for (const name of classDef[1].split(',')) classDefs.set(name.trim(), style);
      continue;
    }
    const classStmt = stmt.match(/^class\s+([\p{L}\p{N}_.,\s-]+?)\s+([\w-]+)$/iu);
    if (classStmt) {
      for (const id of classStmt[1].split(',').map((s) => s.trim()).filter(Boolean)) {
        touchNode({ id, classes: [classStmt[2]] });
      }
      continue;
    }
    const styleStmt = stmt.match(/^style\s+([\p{L}\p{N}_.-]+)\s+(.+)$/iu);
    if (styleStmt) {
      nodeStyles.set(styleStmt[1], { ...nodeStyles.get(styleStmt[1]), ...parseStyleDecl(styleStmt[2]) });
      continue;
    }

    // ── Node / edge chain: group (edge group)* ──
    const sc = new Scanner(stmt);
    const first = sc.readNodeGroup();
    if (!first) {
      ignoredLines++;
      continue;
    }
    const chain: { edge: EdgeToken; group: NodeRef[] }[] = [];
    let ok = true;
    while (!sc.done()) {
      const edge = sc.readEdge();
      const group = edge ? sc.readNodeGroup() : null;
      if (!edge || !group) {
        ok = false;
        break;
      }
      chain.push({ edge, group });
    }
    if (!ok) {
      ignoredLines++;
      continue;
    }

    // Subgraph ids used as edge endpoints are not nodes: don't create them
    const isSubgraphRef = (r: NodeRef) => subgraphIds.has(r.id) && !nodes.has(r.id) && r.label === undefined;
    for (const r of first) if (!isSubgraphRef(r)) touchNode(r);
    let prev = first;
    for (const { edge, group } of chain) {
      for (const r of group) if (!isSubgraphRef(r)) touchNode(r);
      if (!edge.invisible) {
        for (const a of prev) {
          for (const b of group) {
            edges.push({
              from: a.id,
              to: b.id,
              label: edge.label,
              direction: edge.direction,
              style: edge.style,
              thick: edge.thick,
            });
          }
        }
      }
      prev = group;
    }
  }

  // Resolve styles: classDef default → classes → style statement
  const defaultStyle = classDefs.get('default') ?? {};
  for (const node of nodes.values()) {
    let style: MermaidStyle = { ...defaultStyle };
    for (const c of node.classes) style = { ...style, ...classDefs.get(c) };
    node.style = { ...style, ...nodeStyles.get(node.id) };
  }

  const validEdges = edges.filter((e) => nodes.has(e.from) && nodes.has(e.to));

  return {
    direction,
    nodes: [...nodes.values()],
    edges: validEdges,
    ignoredLines,
    droppedEdges: edges.length - validEdges.length,
  };
}

// ============================================================================
// Build ZN elements / links
// ============================================================================

export interface MermaidGraph {
  elements: Element[];
  links: Link[];
}

/**
 * Turn a parsed diagram into ZN elements and links, laid out with dagre in
 * the diagram's direction. Positions are absolute top-left corners starting
 * near (0, 0); placement mode shifts them to the click point.
 */
export function buildMermaidGraph(parsed: ParsedMermaid, dossierId: DossierId): MermaidGraph {
  const now = new Date();
  const idMap = new Map<string, string>();

  const elements: Element[] = parsed.nodes.map((node) => {
    const id = crypto.randomUUID();
    idMap.set(node.id, id);
    return {
      id,
      dossierId,
      label: node.label,
      notes: '',
      tags: node.subgraph ? [node.subgraph] : [],
      properties: [],
      confidence: null,
      source: '',
      date: null,
      dateRange: null,
      position: { x: 0, y: 0 },
      isPositionLocked: false,
      geo: null,
      events: [],
      visual: {
        ...DEFAULT_ELEMENT_VISUAL,
        shape: node.shape,
        ...(node.style.fill ? { color: node.style.fill } : {}),
        ...(node.style.stroke ? { borderColor: node.style.stroke } : {}),
        ...(node.style.dashed ? { borderStyle: 'dashed' as const } : {}),
      },
      assetIds: [],
      parentGroupId: null,
      isGroup: false,
      isAnnotation: false,
      childIds: [],
      createdAt: now,
      updatedAt: now,
    };
  });

  const links: Link[] = parsed.edges
    .filter((e) => e.from !== e.to)
    .map((e) => ({
      id: crypto.randomUUID(),
      dossierId,
      fromId: idMap.get(e.from)!,
      toId: idMap.get(e.to)!,
      sourceHandle: null,
      targetHandle: null,
      label: e.label,
      notes: '',
      tags: [],
      properties: [],
      directed: e.direction !== 'none',
      direction: e.direction,
      confidence: null,
      source: '',
      date: null,
      dateRange: null,
      visual: { ...DEFAULT_LINK_VISUAL, style: e.style, thickness: e.thick ? 4 : DEFAULT_LINK_VISUAL.thickness },
      curveOffset: { x: 0, y: 0 },
      createdAt: now,
      updatedAt: now,
    }));

  layoutMermaid(elements, links, parsed.direction);
  return { elements, links };
}

function layoutMermaid(elements: Element[], links: Link[], direction: MermaidDirection): void {
  if (elements.length === 0) return;

  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: direction, nodesep: 50, ranksep: 90, edgesep: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  const dims = new Map<string, { width: number; height: number }>();
  for (const el of elements) {
    const d = computeElementDimensions(el.visual, el.label, false);
    dims.set(el.id, d);
    g.setNode(el.id, { width: d.width, height: d.height });
  }
  // Layout follows the source order of each edge (as Mermaid does), whatever its arrowheads
  links.forEach((l, i) => g.setEdge(l.fromId, l.toId, {}, `e${i}`));

  dagre.layout(g);

  let minX = Infinity;
  let minY = Infinity;
  for (const el of elements) {
    const n = g.node(el.id);
    const d = dims.get(el.id)!;
    el.position = { x: Math.round(n.x - d.width / 2), y: Math.round(n.y - d.height / 2) };
    minX = Math.min(minX, el.position.x);
    minY = Math.min(minY, el.position.y);
  }
  for (const el of elements) {
    el.position = { x: el.position.x - minX, y: el.position.y - minY };
  }
}

/** Bounding box of built elements, in the shape expected by placement mode. */
export function mermaidBoundingBox(elements: Element[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    const d = computeElementDimensions(el.visual, el.label, false);
    minX = Math.min(minX, el.position.x);
    minY = Math.min(minY, el.position.y);
    maxX = Math.max(maxX, el.position.x + d.width);
    maxY = Math.max(maxY, el.position.y + d.height);
  }
  if (elements.length === 0) { minX = minY = maxX = maxY = 0; }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY, elementCount: elements.length };
}

/** Localized message for a Mermaid parse failure. */
export function mermaidErrorMessage(error: unknown): string {
  if (error instanceof MermaidParseError) {
    return error.code === 'unsupportedDiagram'
      ? (i18next.t('importData:mermaid.unsupportedDiagram', { type: error.diagramType }) as string)
      : (i18next.t('importData:mermaid.empty') as string);
  }
  return i18next.t('importData:mermaid.parseError', {
    message: error instanceof Error ? error.message : String(error),
  }) as string;
}

/**
 * Import a Mermaid file straight into a dossier (new-dossier import, no
 * placement step). Same result shape as the other file importers.
 */
export async function importMermaid(content: string, dossierId: DossierId): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    elementsImported: 0,
    linksImported: 0,
    assetsImported: 0,
    reportImported: false,
    errors: [],
    warnings: [],
  };
  try {
    const parsed = parseMermaid(content);
    if (parsed.nodes.length === 0) throw new MermaidParseError('empty');
    const { elements, links } = buildMermaidGraph(parsed, dossierId);
    const { db } = await import('../db/database');
    await db.elements.bulkAdd(elements);
    if (links.length > 0) await db.links.bulkAdd(links);
    result.elementsImported = elements.length;
    result.linksImported = links.length;
    const skipped = parsed.ignoredLines + parsed.droppedEdges;
    if (skipped > 0) result.warnings.push(i18next.t('importData:mermaid.skippedLines', { count: skipped }) as string);
    result.success = true;
  } catch (error) {
    result.errors.push(mermaidErrorMessage(error));
  }
  return result;
}
