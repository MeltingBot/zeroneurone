import { generateUUID } from '../utils';
import { DEFAULT_ELEMENT_VISUAL, DEFAULT_LINK_VISUAL } from '../types';
import type {
  AssetId,
  DossierId,
  Element as ZnElement,
  ElementId,
  ElementShape,
  Link,
  LinkDirection,
  LinkId,
  LinkStyle,
  Property,
} from '../types';
import { db } from '../db/database';
import { fileService } from './fileService';
import type { ImportResult } from './importService';
import { stripBom } from '../utils/csv';
import { dataUrlMimeType, dataUrlToFile } from '../utils/dataUrl';

// ============================================================================
// draw.io (diagrams.net) format
//
// <mxfile><diagram name="Page-1">…</diagram></mxfile>
// Each <diagram> holds an <mxGraphModel> either as a child element or as
// compressed text (base64 → raw deflate → URI-encoded XML). Cells live under
// <root>: cell "0" is the root, its children are layers, and vertices/edges
// hang below. Geometry of a cell is relative to its parent vertex (groups,
// containers). Custom data wraps the cell: <object label="…" attr="…"><mxCell/></object>.
// ============================================================================

export interface DrawioNode {
  id: string;
  label: string;
  /** Absolute top-left corner (pages stacked vertically) */
  x: number;
  y: number;
  width: number;
  height: number;
  shape: ElementShape;
  fillColor?: string;
  strokeColor?: string;
  dashed: boolean;
  /** Free text (style "text;"), rendered without fill or border */
  isText: boolean;
  /** Embedded image (data URL) */
  imageData?: string;
  properties: Property[];
}

export interface DrawioEdge {
  source: string;
  target: string;
  label: string;
  direction: LinkDirection;
  style: LinkStyle;
  color?: string;
  width?: number;
  properties: Property[];
}

export interface ParsedDrawio {
  nodes: DrawioNode[];
  edges: DrawioEdge[];
  pageCount: number;
  warnings: string[];
}

interface RawCell {
  id: string;
  parent: string | null;
  vertex: boolean;
  edge: boolean;
  source: string | null;
  target: string | null;
  style: Record<string, string>;
  /** Style tokens without "=" (base style names: "ellipse", "text", "group"…) */
  flags: Set<string>;
  value: string;
  geometry: { x: number; y: number; width: number; height: number; relative: boolean } | null;
  /** Attributes of the <object>/<UserObject> wrapper, label excluded */
  attrs: Record<string, string>;
}

const PAGE_GAP = 200;
const IGNORED_OBJECT_ATTRS = new Set(['id', 'label', 'placeholders', 'tooltip']);

// ============================================================================
// Format detection
// ============================================================================

export function isDrawioFormat(content: string): boolean {
  const head = stripBom(content.slice(0, 2000)).trimStart();
  return /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<(mxfile|mxGraphModel)[\s>]/.test(head);
}

// ============================================================================
// Parsing (pure, no database)
// ============================================================================

function parseStyle(raw: string | null): { style: Record<string, string>; flags: Set<string> } {
  const style: Record<string, string> = {};
  const flags = new Set<string>();
  for (const token of (raw ?? '').split(';')) {
    const t = token.trim();
    if (!t) continue;
    const eq = t.indexOf('=');
    if (eq === -1) flags.add(t);
    else style[t.slice(0, eq)] = t.slice(eq + 1);
  }
  return { style, flags };
}

/** Labels may be HTML (style html=1): keep the text, line breaks become spaces */
function cleanLabel(value: string): string {
  if (!value) return '';
  if (!/[<&]/.test(value)) return value.replace(/\s+/g, ' ').trim();
  const withBreaks = value.replace(/<br\s*\/?>|<\/(div|p|li)>/gi, ' ');
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function mapShape(style: Record<string, string>, flags: Set<string>): ElementShape {
  const shape = style.shape ?? '';
  if (flags.has('ellipse') || shape === 'ellipse' || style.ellipse !== undefined) return 'circle';
  if (flags.has('rhombus') || shape === 'rhombus') return 'diamond';
  if (flags.has('hexagon') || shape === 'hexagon') return 'hexagon';
  return 'rectangle';
}

function mapColor(value: string | undefined): string | undefined {
  if (!value || value === 'default' || value === 'inherit') return undefined;
  if (value === 'none') return 'transparent';
  return value;
}

/** draw.io draws a classic arrow at the end unless endArrow=none */
function mapDirection(style: Record<string, string>): LinkDirection {
  const end = style.endArrow !== 'none';
  const start = style.startArrow !== undefined && style.startArrow !== 'none';
  if (start && end) return 'both';
  if (start) return 'backward';
  if (end) return 'forward';
  return 'none';
}

/** draw.io drops ";base64" from data URLs (";" separates style entries) */
function normalizeDataUrl(image: string | undefined): string | undefined {
  if (!image || !image.startsWith('data:')) return undefined;
  const comma = image.indexOf(',');
  if (comma === -1) return undefined;
  const mime = image.slice(5, comma).replace(/;base64$/, '') || 'image/png';
  return `data:${mime};base64,${image.slice(comma + 1)}`;
}

async function inflateDiagram(text: string): Promise<string> {
  const binary = atob(text.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const stream = new Response(bytes).body!.pipeThrough(new DecompressionStream('deflate-raw'));
  const inflated = await new Response(stream).text();
  return decodeURIComponent(inflated);
}

/** Resolve the <mxGraphModel> of each page, inflating compressed diagrams */
async function getPageModels(doc: Document, warnings: string[]): Promise<Element[]> {
  const root = doc.documentElement;
  if (root.nodeName === 'mxGraphModel') return [root];

  const models: Element[] = [];
  const diagrams = Array.from(root.getElementsByTagName('diagram'));
  for (const [index, diagram] of diagrams.entries()) {
    const child = diagram.getElementsByTagName('mxGraphModel')[0];
    if (child) {
      models.push(child);
      continue;
    }
    const text = diagram.textContent?.trim();
    if (!text) continue;
    try {
      const xml = await inflateDiagram(text);
      const pageDoc = new DOMParser().parseFromString(xml, 'text/xml');
      if (pageDoc.getElementsByTagName('parsererror').length > 0) throw new Error('XML');
      models.push(pageDoc.documentElement);
    } catch {
      warnings.push(`Page ${index + 1} illisible (contenu compressé invalide)`);
    }
  }
  return models;
}

function readCells(model: Element): RawCell[] {
  const cells: RawCell[] = [];
  const root = model.getElementsByTagName('root')[0];
  if (!root) return cells;

  for (const node of Array.from(root.children)) {
    let cellEl: Element | null = node;
    let id = node.getAttribute('id');
    let value = node.getAttribute('value') ?? '';
    const attrs: Record<string, string> = {};

    if (node.nodeName !== 'mxCell') {
      // <object>/<UserObject> wrapper: data on the wrapper, structure on the inner mxCell
      cellEl = node.getElementsByTagName('mxCell')[0] ?? null;
      if (!cellEl) continue;
      value = node.getAttribute('label') ?? '';
      for (const attr of Array.from(node.attributes)) {
        if (!IGNORED_OBJECT_ATTRS.has(attr.name)) attrs[attr.name] = attr.value;
      }
    }
    if (!id) id = cellEl.getAttribute('id');
    if (!id) continue;

    const geoEl = Array.from(cellEl.children).find((c) => c.nodeName === 'mxGeometry');
    const num = (name: string) => Number(geoEl?.getAttribute(name) ?? 0) || 0;
    const { style, flags } = parseStyle(cellEl.getAttribute('style'));

    cells.push({
      id,
      parent: cellEl.getAttribute('parent'),
      vertex: cellEl.getAttribute('vertex') === '1',
      edge: cellEl.getAttribute('edge') === '1',
      source: cellEl.getAttribute('source'),
      target: cellEl.getAttribute('target'),
      style,
      flags,
      value,
      geometry: geoEl
        ? { x: num('x'), y: num('y'), width: num('width'), height: num('height'), relative: geoEl.getAttribute('relative') === '1' }
        : null,
      attrs,
    });
  }
  return cells;
}

function attrsToProperties(attrs: Record<string, string>): Property[] {
  const properties: Property[] = [];
  for (const [key, value] of Object.entries(attrs)) {
    if (!value) continue;
    if (key === 'link') properties.push({ key: 'url', value, type: 'link' });
    else properties.push({ key, value });
  }
  return properties;
}

export async function parseDrawio(content: string): Promise<ParsedDrawio> {
  const warnings: string[] = [];
  const doc = new DOMParser().parseFromString(content, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('XML invalide');
  }

  const models = await getPageModels(doc, warnings);
  const nodes: DrawioNode[] = [];
  const edges: DrawioEdge[] = [];
  let unconnected = 0;
  let pageTop = 0;

  for (const [pageIndex, model] of models.entries()) {
    const cells = readCells(model);
    // Cell ids are only unique within a page
    const scoped = (id: string) => (models.length > 1 ? `${pageIndex}:${id}` : id);
    const byId = new Map(cells.map((c) => [c.id, c]));
    const pageNodes: DrawioNode[] = [];

    // Absolute offset of a cell: sum of the geometries of its vertex ancestors
    const originOf = (cell: RawCell): { x: number; y: number } => {
      let x = 0;
      let y = 0;
      let parent = cell.parent ? byId.get(cell.parent) : undefined;
      const seen = new Set<string>();
      while (parent && parent.vertex && !seen.has(parent.id)) {
        seen.add(parent.id);
        x += parent.geometry?.x ?? 0;
        y += parent.geometry?.y ?? 0;
        parent = parent.parent ? byId.get(parent.parent) : undefined;
      }
      return { x, y };
    };

    // Labels attached to an edge are child vertices of that edge
    const edgeLabels = new Map<string, string[]>();
    for (const cell of cells) {
      const parent = cell.parent ? byId.get(cell.parent) : undefined;
      if (cell.vertex && parent?.edge) {
        const text = cleanLabel(cell.value);
        if (text) edgeLabels.set(parent.id, [...(edgeLabels.get(parent.id) ?? []), text]);
      }
    }

    for (const cell of cells) {
      if (!cell.vertex || !cell.geometry) continue;
      const parent = cell.parent ? byId.get(cell.parent) : undefined;
      if (parent?.edge) continue;
      // Pure grouping cells carry no content, only an offset for their children
      if (cell.flags.has('group') && !cleanLabel(cell.value)) continue;

      const origin = originOf(cell);
      const fill = mapColor(cell.style.fillColor);
      const isText = cell.flags.has('text') && (fill === undefined || fill === 'transparent');
      const isImage = cell.flags.has('image') || cell.style.shape === 'image';
      const imageData = isImage ? normalizeDataUrl(cell.style.image) : undefined;
      const properties = attrsToProperties(cell.attrs);
      if (isImage && cell.style.image && !imageData) {
        properties.push({ key: 'url', value: cell.style.image, type: 'link' });
      }

      pageNodes.push({
        id: scoped(cell.id),
        label: cleanLabel(cell.value),
        x: origin.x + cell.geometry.x,
        y: origin.y + cell.geometry.y,
        width: cell.geometry.width,
        height: cell.geometry.height,
        shape: mapShape(cell.style, cell.flags),
        fillColor: mapColor(cell.style.fillColor),
        strokeColor: mapColor(cell.style.strokeColor),
        dashed: cell.style.dashed === '1',
        isText,
        imageData,
        properties,
      });
    }

    const nodeIds = new Set(pageNodes.map((n) => n.id));
    for (const cell of cells) {
      if (!cell.edge) continue;
      if (!cell.source || !cell.target || !nodeIds.has(scoped(cell.source)) || !nodeIds.has(scoped(cell.target))) {
        unconnected++;
        continue;
      }
      const label = [cleanLabel(cell.value), ...(edgeLabels.get(cell.id) ?? [])].filter(Boolean).join(' ');
      const width = Number(cell.style.strokeWidth);
      edges.push({
        source: scoped(cell.source),
        target: scoped(cell.target),
        label,
        direction: mapDirection(cell.style),
        style: cell.style.dashed === '1' ? 'dashed' : 'solid',
        color: mapColor(cell.style.strokeColor),
        width: width > 0 ? width : undefined,
        properties: attrsToProperties(cell.attrs),
      });
    }

    // Stack pages vertically so they do not overlap
    if (pageNodes.length > 0) {
      const minY = Math.min(...pageNodes.map((n) => n.y));
      const maxY = Math.max(...pageNodes.map((n) => n.y + n.height));
      const shift = pageTop - minY;
      for (const node of pageNodes) node.y += shift;
      pageTop += maxY - minY + PAGE_GAP;
      nodes.push(...pageNodes);
    }
  }

  if (models.length > 1) {
    warnings.push(`${models.length} pages importées, empilées verticalement`);
  }
  if (unconnected > 0) {
    warnings.push(`${unconnected} connecteur(s) ignoré(s) (non reliés à deux formes)`);
  }

  return { nodes, edges, pageCount: models.length, warnings };
}

// ============================================================================
// Import
// ============================================================================

async function saveImage(dataUrl: string, index: number, dossierId: DossierId): Promise<AssetId> {
  const mimeType = dataUrlMimeType(dataUrl, 'image/png');
  const ext = mimeType.split('/')[1]?.replace(/\+.*$/, '') || 'png';
  const file = dataUrlToFile(dataUrl, `drawio_image_${index}.${ext}`, 'image/png');
  const asset = await fileService.saveAsset(dossierId, file);
  return asset.id;
}

export async function importDrawio(
  content: string,
  targetDossierId: DossierId
): Promise<ImportResult> {
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
    const parsed = await parseDrawio(content);
    result.warnings.push(...parsed.warnings);

    if (parsed.nodes.length === 0) {
      result.errors.push('Diagramme draw.io vide ou non reconnu');
      return result;
    }

    const idMap = new Map<string, ElementId>();
    const elements: ZnElement[] = [];
    let imageCount = 0;

    for (const node of parsed.nodes) {
      const elementId = generateUUID() as ElementId;
      idMap.set(node.id, elementId);

      let image: AssetId | null = null;
      if (node.imageData) {
        try {
          image = await saveImage(node.imageData, imageCount + 1, targetDossierId);
          imageCount++;
          result.assetsImported++;
        } catch {
          result.warnings.push(`Image non importée (${node.label || node.id})`);
        }
      }

      const now = new Date();
      elements.push({
        id: elementId,
        dossierId: targetDossierId,
        label: node.label || (image ? `Image ${imageCount}` : node.isText ? '' : 'Sans titre'),
        notes: '',
        tags: [],
        properties: node.properties,
        confidence: null,
        source: '',
        date: null,
        dateRange: null,
        events: [],
        geo: null,
        visual: node.isText
          ? {
              ...DEFAULT_ELEMENT_VISUAL,
              shape: 'rectangle',
              size: 'small',
              color: 'transparent',
              borderColor: 'transparent',
              borderWidth: 0,
            }
          : {
              ...DEFAULT_ELEMENT_VISUAL,
              color: node.fillColor ?? DEFAULT_ELEMENT_VISUAL.color,
              borderColor: node.strokeColor ?? DEFAULT_ELEMENT_VISUAL.borderColor,
              borderStyle: node.dashed ? 'dashed' : 'solid',
              shape: node.shape,
              size: 'medium',
              customWidth: Math.round(node.width),
              customHeight: Math.round(node.height),
              image,
            },
        position: { x: Math.round(node.x), y: Math.round(node.y) },
        isPositionLocked: false,
        assetIds: image ? [image] : [],
        parentGroupId: null,
        isGroup: false,
        isAnnotation: false,
        childIds: [],
        createdAt: now,
        updatedAt: now,
      });
    }

    const links: Link[] = [];
    for (const edge of parsed.edges) {
      const fromId = idMap.get(edge.source);
      const toId = idMap.get(edge.target);
      if (!fromId || !toId) continue;
      const now = new Date();
      links.push({
        id: generateUUID() as LinkId,
        dossierId: targetDossierId,
        fromId,
        toId,
        sourceHandle: null,
        targetHandle: null,
        label: edge.label,
        notes: '',
        tags: [],
        properties: edge.properties,
        directed: edge.direction !== 'none',
        direction: edge.direction,
        confidence: null,
        source: '',
        date: null,
        dateRange: null,
        visual: {
          ...DEFAULT_LINK_VISUAL,
          style: edge.style,
          thickness: edge.width ?? DEFAULT_LINK_VISUAL.thickness,
          color: edge.color && edge.color !== 'transparent' ? edge.color : DEFAULT_LINK_VISUAL.color,
        },
        curveOffset: { x: 0, y: 0 },
        createdAt: now,
        updatedAt: now,
      });
    }

    await db.elements.bulkAdd(elements);
    result.elementsImported = elements.length;
    if (links.length > 0) {
      await db.links.bulkAdd(links);
      result.linksImported = links.length;
    }

    result.success = true;
  } catch (error) {
    result.errors.push(
      `Erreur d'import draw.io: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
    );
  }

  return result;
}
