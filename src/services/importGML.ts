/**
 * GML import (Graph Modelling Language).
 *
 * Plain-text graph format written by Gephi, yEd, Cytoscape, NetworkX and
 * igraph: nested `key value` lists in square brackets.
 *
 *   graph [ directed 1
 *     node [ id 1 label "A" graphics [ x 10 y 20 w 30 h 30 type "ellipse" fill "#FF0000" ] ]
 *     edge [ source 1 target 2 label "knows" ]
 *   ]
 *
 * Read: label (or yEd's LabelGraphics text), position (GML gives the node
 * center), size, fill and outline colors, shape, edge color, width and arrows.
 * Other scalar keys become properties.
 */

import i18next from 'i18next';
import { db } from '../db/database';
import { generateUUID } from '../utils';
import type { DossierId, Element, ElementId, ElementShape, Link, LinkDirection, LinkId, Property } from '../types';
import { DEFAULT_ELEMENT_VISUAL, DEFAULT_LINK_VISUAL } from '../types';
import type { ImportResult } from './importService';
import { darkenColor, inferPropertyType, scaleGephiSizes } from './importGephi';

// ============================================================================
// Parser
// ============================================================================

export type GmlValue = number | string | GmlList;
/** A GML list: ordered key/value pairs, keys may repeat (node, edge). */
export type GmlList = Array<[string, GmlValue]>;

export class GmlParseError extends Error {
  readonly line: number;
  constructor(message: string, line: number) {
    super(`${message} (line ${line})`);
    this.name = 'GmlParseError';
    this.line = line;
  }
}

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

const NAMED_ENTITIES: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: '\u00a0' };

/** Decodes the `&...;` entities GML uses to escape quotes and non-ASCII characters. */
export function decodeGmlString(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[A-Za-z]+);/g, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return NAMED_ENTITIES[code] ?? whole;
  });
}

/** Parses a GML document into nested lists. Throws GmlParseError on malformed input. */
export function parseGML(content: string): GmlList {
  const src = content.replace(/^\uFEFF/, '');
  let pos = 0;
  let line = 1;

  const skipBlank = () => {
    while (pos < src.length) {
      const c = src[pos];
      if (c === '\n') { line++; pos++; }
      else if (c === ' ' || c === '\t' || c === '\r') pos++;
      else if (c === '#') { while (pos < src.length && src[pos] !== '\n') pos++; }
      else break;
    }
  };

  /** Next bare token (key or number), stopping at whitespace, brackets or quotes. */
  const readWord = (): string => {
    const start = pos;
    while (pos < src.length && !/[\s[\]"]/.test(src[pos])) pos++;
    return src.slice(start, pos);
  };

  const readString = (): string => {
    const startLine = line;
    pos++; // opening quote
    const start = pos;
    while (pos < src.length && src[pos] !== '"') {
      if (src[pos] === '\n') line++;
      pos++;
    }
    if (pos >= src.length) throw new GmlParseError('Unterminated string', startLine);
    const raw = src.slice(start, pos);
    pos++; // closing quote
    return decodeGmlString(raw);
  };

  const readList = (nested: boolean): GmlList => {
    const list: GmlList = [];
    for (;;) {
      skipBlank();
      if (pos >= src.length) {
        if (nested) throw new GmlParseError('Missing "]"', line);
        return list;
      }
      if (src[pos] === ']') {
        if (!nested) throw new GmlParseError('Unexpected "]"', line);
        pos++;
        return list;
      }
      const key = readWord();
      if (!KEY_RE.test(key)) throw new GmlParseError(`Invalid key "${key || src[pos]}"`, line);
      skipBlank();
      if (pos >= src.length) throw new GmlParseError(`Missing value for "${key}"`, line);
      const c = src[pos];
      if (c === '[') {
        pos++;
        list.push([key, readList(true)]);
      } else if (c === '"') {
        list.push([key, readString()]);
      } else {
        const word = readWord();
        if (!NUMBER_RE.test(word)) throw new GmlParseError(`Invalid value for "${key}"`, line);
        list.push([key, Number(word)]);
      }
    }
  };

  return readList(false);
}

// ============================================================================
// Mapping helpers
// ============================================================================

function get(list: GmlList, key: string): GmlValue | undefined {
  for (const [k, v] of list) if (k === key) return v;
  return undefined;
}

function getList(list: GmlList, key: string): GmlList | undefined {
  const v = get(list, key);
  return Array.isArray(v) ? v : undefined;
}

function getNumber(list: GmlList | undefined, key: string): number | undefined {
  if (!list) return undefined;
  const v = get(list, key);
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function getString(list: GmlList | undefined, key: string): string | undefined {
  if (!list) return undefined;
  const v = get(list, key);
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return undefined;
}

/** #RGB / #RRGGBB / #RRGGBBAA → #rrggbb, anything else → undefined. */
function normalizeColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v)) return v.slice(0, 7).toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toLowerCase();
  return undefined;
}

function mapShape(type: string | undefined, w: number | undefined, h: number | undefined): ElementShape {
  const t = (type ?? '').toLowerCase().replace(/[\s_-]/g, '');
  if (!t) return DEFAULT_ELEMENT_VISUAL.shape;
  if (['ellipse', 'circle', 'oval', 'disc', 'dot'].includes(t)) return 'circle';
  if (['diamond', 'rhombus', 'triangle'].includes(t)) return 'diamond';
  if (['hexagon', 'octagon', 'parallelogram'].includes(t)) return 'hexagon';
  if (t === 'square') return 'square';
  if (['rectangle', 'rect', 'roundrectangle', 'roundrect', 'box'].includes(t)) {
    // A square box reads as a square; a wide one as ZN's label rectangle
    return w && h && Math.abs(w - h) <= Math.max(w, h) * 0.1 ? 'square' : 'rectangle';
  }
  return DEFAULT_ELEMENT_VISUAL.shape;
}

/** yEd/Cytoscape arrow names: anything but "none" draws an arrow. */
function hasArrow(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return value.trim().toLowerCase() !== 'none' && value.trim() !== '';
}

const NODE_RESERVED = new Set(['id', 'label', 'graphics', 'LabelGraphics', 'notes', 'tags', 'confidence', 'source']);
const EDGE_RESERVED = new Set(['id', 'source', 'target', 'label', 'graphics', 'LabelGraphics', 'notes', 'tags', 'confidence', 'directed']);

/** Scalar keys not otherwise mapped become properties; nested lists are skipped. */
function toProperties(list: GmlList, reserved: Set<string>): Property[] {
  const props: Property[] = [];
  for (const [key, value] of list) {
    if (reserved.has(key) || Array.isArray(value)) continue;
    props.push({ key, value, type: typeof value === 'number' ? 'number' : inferPropertyType(value) });
  }
  return props;
}

function toTags(list: GmlList): string[] {
  const raw = getString(list, 'tags');
  return raw ? raw.split(';').map((s) => s.trim()).filter(Boolean) : [];
}

/** ZN confidence is 0-100 in steps of 10. */
function toConfidence(list: GmlList): Element['confidence'] {
  const n = getNumber(list, 'confidence');
  if (n === undefined || n < 0 || n > 100) return null;
  return (Math.round(n / 10) * 10) as Element['confidence'];
}

const t = (key: string, options?: Record<string, unknown>) =>
  i18next.t(`importData:gml.${key}`, options) as string;

// ============================================================================
// GML → ZN objects (pure, no DB)
// ============================================================================

export interface GMLGraph {
  elements: Element[];
  links: Link[];
  warnings: string[];
}

export function buildGMLGraph(content: string, dossierId: DossierId): GMLGraph {
  const root = parseGML(content);
  const graph = getList(root, 'graph');
  if (!graph) throw new Error(t('errors.missingGraph'));

  const warnings: string[] = [];
  const directedGraph = getNumber(graph, 'directed') === 1;
  // Gephi writes Y pointing up, like in GEXF; yEd, Cytoscape and ZN point down
  const flipY = /gephi/i.test(getString(root, 'Creator') ?? '');
  const now = new Date();

  // Pass 1: nodes, with their raw size for proportional scaling
  const nodeIdMap = new Map<string, ElementId>();
  const parsed: { element: Element; rawSize: number | null }[] = [];
  const gridCols = 10;
  const gridSpacing = 200;
  let gridIndex = 0;

  for (const [key, value] of graph) {
    if (key !== 'node' || !Array.isArray(value)) continue;
    const node = value;
    const gmlId = getString(node, 'id');
    if (gmlId === undefined) { warnings.push(t('warnings.nodeNoId')); continue; }
    if (nodeIdMap.has(gmlId)) { warnings.push(t('warnings.duplicateNodeId', { id: gmlId })); continue; }

    const id = generateUUID() as ElementId;
    nodeIdMap.set(gmlId, id);

    const graphics = getList(node, 'graphics');
    const labelGraphics = getList(node, 'LabelGraphics');
    const label = getString(node, 'label') ?? getString(labelGraphics, 'text') ?? getString(node, 'name') ?? gmlId;

    const w = getNumber(graphics, 'w');
    const h = getNumber(graphics, 'h');
    const x = getNumber(graphics, 'x');
    const y = getNumber(graphics, 'y');
    let position: { x: number; y: number };
    if (x !== undefined && y !== undefined) {
      const cy = flipY ? -y : y;
      position = { x: x - (w ?? 0) / 2, y: cy - (h ?? 0) / 2 };
    } else {
      position = { x: (gridIndex % gridCols) * gridSpacing, y: Math.floor(gridIndex / gridCols) * gridSpacing };
      gridIndex++;
    }

    const color = normalizeColor(getString(graphics, 'fill')) ?? DEFAULT_ELEMENT_VISUAL.color;
    const outline = normalizeColor(getString(graphics, 'outline'));
    const shape = mapShape(getString(graphics, 'type'), w, h);
    const sizeSource = w !== undefined || h !== undefined ? Math.max(w ?? 0, h ?? 0) : null;

    const properties = toProperties(node, NODE_RESERVED);
    properties.push({ key: 'gml_id', value: gmlId, type: 'text' });

    parsed.push({
      rawSize: sizeSource && sizeSource > 0 ? sizeSource : null,
      element: {
        id,
        dossierId,
        label,
        notes: getString(node, 'notes') ?? '',
        tags: toTags(node),
        properties,
        confidence: toConfidence(node),
        source: getString(node, 'source') ?? 'GML',
        date: null,
        dateRange: null,
        position,
        isPositionLocked: false,
        geo: null,
        visual: {
          ...DEFAULT_ELEMENT_VISUAL,
          color,
          borderColor: outline ?? (color === DEFAULT_ELEMENT_VISUAL.color ? DEFAULT_ELEMENT_VISUAL.borderColor : darkenColor(color)),
          shape,
          size: 'medium',
        },
        assetIds: [],
        parentGroupId: null,
        isGroup: false,
        isAnnotation: false,
        childIds: [],
        events: [],
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  const sizes = scaleGephiSizes(parsed.map((p) => p.rawSize));
  const elements = parsed.map((p, i) => {
    p.element.visual.size = sizes[i];
    return p.element;
  });

  // Pass 2: edges
  const links: Link[] = [];
  for (const [key, value] of graph) {
    if (key !== 'edge' || !Array.isArray(value)) continue;
    const edge = value;
    const sourceId = getString(edge, 'source');
    const targetId = getString(edge, 'target');
    if (sourceId === undefined || targetId === undefined) { warnings.push(t('warnings.edgeNoSourceTarget')); continue; }
    const fromId = nodeIdMap.get(sourceId);
    const toId = nodeIdMap.get(targetId);
    if (!fromId || !toId) { warnings.push(t('warnings.edgeMissingNode')); continue; }

    const graphics = getList(edge, 'graphics');
    const labelGraphics = getList(edge, 'LabelGraphics');

    // Arrows drawn by the tool win over the graph's `directed` flag
    const targetArrow = hasArrow(getString(graphics, 'targetArrow'));
    const sourceArrow = hasArrow(getString(graphics, 'sourceArrow'));
    const arrowKey = getString(graphics, 'arrow')?.toLowerCase();
    let direction: LinkDirection;
    if (targetArrow !== undefined || sourceArrow !== undefined) {
      direction = targetArrow && sourceArrow ? 'both' : targetArrow ? 'forward' : sourceArrow ? 'backward' : 'none';
    } else if (arrowKey) {
      direction = arrowKey === 'last' ? 'forward' : arrowKey === 'first' ? 'backward' : arrowKey === 'both' ? 'both' : 'none';
    } else {
      const edgeDirected = getNumber(edge, 'directed');
      direction = (edgeDirected !== undefined ? edgeDirected === 1 : directedGraph) ? 'forward' : 'none';
    }

    const width = getNumber(graphics, 'width');
    const color = normalizeColor(getString(graphics, 'fill'));

    links.push({
      id: generateUUID() as LinkId,
      dossierId,
      fromId,
      toId,
      sourceHandle: null,
      targetHandle: null,
      label: getString(edge, 'label') ?? getString(labelGraphics, 'text') ?? '',
      notes: getString(edge, 'notes') ?? '',
      tags: toTags(edge),
      properties: toProperties(edge, EDGE_RESERVED),
      confidence: toConfidence(edge),
      source: 'GML',
      date: null,
      dateRange: null,
      directed: direction !== 'none',
      direction,
      visual: {
        ...DEFAULT_LINK_VISUAL,
        ...(color ? { color } : {}),
        thickness: width && width > 0 ? Math.max(1, Math.min(10, Math.round(width))) : DEFAULT_LINK_VISUAL.thickness,
      },
      curveOffset: { x: 0, y: 0 },
      createdAt: now,
      updatedAt: now,
    });
  }

  return { elements, links, warnings };
}

// ============================================================================
// Import into a dossier
// ============================================================================

export async function importGML(content: string, targetDossierId: DossierId): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    elementsImported: 0,
    linksImported: 0,
    assetsImported: 0,
    reportImported: false,
    errors: [],
    warnings: [],
  };

  let graph: GMLGraph;
  try {
    graph = buildGMLGraph(content, targetDossierId);
  } catch (error) {
    const message = error instanceof Error ? error.message : t('errors.unknownError');
    result.errors.push(error instanceof GmlParseError ? t('errors.parseError', { message }) : message);
    return result;
  }

  try {
    await db.transaction('rw', db.elements, db.links, db.dossiers, async () => {
      await db.elements.bulkAdd(graph.elements);
      await db.links.bulkAdd(graph.links);
      await db.dossiers.update(targetDossierId, { updatedAt: new Date() });
    });
    result.elementsImported = graph.elements.length;
    result.linksImported = graph.links.length;
    result.warnings = graph.warnings;
    result.success = graph.elements.length > 0;
    if (!result.success) result.errors.push(t('errors.noNodes'));
  } catch (error) {
    result.errors.push(t('errors.importError', {
      message: error instanceof Error ? error.message : t('errors.unknownError'),
    }));
  }
  return result;
}
