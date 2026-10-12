import { generateUUID } from '../utils';
import { DEFAULT_ELEMENT_VISUAL, DEFAULT_LINK_VISUAL } from '../types';
import type {
  DossierId,
  Element,
  ElementEvent,
  ElementId,
  GeoPoint,
  Link,
  Property,
  PropertyType,
} from '../types';
import { db } from '../db/database';
import { fileService } from './fileService';
import { dataUrlToFile } from './importOsintracker';
import type { ImportResult } from './importService';

// ============================================================================
// Graph Palette v2 (OSINT Industries) Format Types
// ============================================================================
//
// { schemaVersion: 2, nodes: [{ id, x, y, entity, source, parentId? }], edges }
// Every value is wrapped as { type, data } and nests recursively
// (object -> fields, list -> items). An entity adds an envelope around it:
// { schemaVersion, id, name, iconName, data: { type, data }, header, metadata }.

interface V2Value {
  type: string;
  data: unknown;
}

interface V2Entity {
  schemaVersion: number;
  id: string;
  name?: string | null;
  iconName?: string | null;
  data: V2Value;
  metadata?: Record<string, unknown> | null;
}

interface V2Node {
  id: string;
  x?: number;
  y?: number;
  entity: V2Entity;
  /** 'user-entity' (searched selector), 'search-result', 'system' (free text) */
  source?: string;
  /** For the face selector: the searched picture as a data URL */
  sourceId?: string;
  parentId?: string;
}

interface V2Edge {
  id: string;
  source: string;
  target: string;
}

export interface PaletteV2Graph {
  schemaVersion: number;
  nodes: V2Node[];
  edges?: V2Edge[];
}

// ============================================================================
// Constants
// ============================================================================

/** Tags for the searched selectors (same wording as the v1 importer) */
const SELECTOR_TAGS: Record<string, string> = {
  email: 'Email',
  phone_number: 'Téléphone',
  username: 'Pseudo',
  face: 'Visage',
};

/** Fields not turned into properties (used as tag, or meaningless) */
const SKIP_KEYS = new Set(['module_category', 'index']);

/** Envelope fields whose content is flattened without adding a path segment */
const TRANSPARENT_KEYS = new Set(['platform_variables']);

const SOURCE = 'OSINT Industries';

// ============================================================================
// Value flattening
// ============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isTypedValue(value: unknown): value is V2Value {
  return isRecord(value) && typeof value.type === 'string' && 'data' in value;
}

function isEntity(value: unknown): value is V2Entity {
  return isRecord(value) && 'schemaVersion' in value && isTypedValue(value.data);
}

/** Unwraps a typed scalar ({ type, data }) */
function scalar(value: unknown): unknown {
  return isTypedValue(value) ? value.data : undefined;
}

function humanize(key: string): string {
  const text = key.replace(/_/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function toPoint(lat: unknown, lng: unknown): GeoPoint | null {
  const la = typeof lat === 'number' ? lat : parseFloat(String(lat));
  const ln = typeof lng === 'number' ? lng : parseFloat(String(lng));
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return null;
  return { type: 'point', lat: la, lng: ln };
}

function toDate(ms: unknown): Date | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null;
  const date = new Date(ms);
  return isNaN(date.getTime()) ? null : date;
}

/** Accumulates what a node's nested values give: properties, events, place, picture */
class Collector {
  properties: Property[] = [];
  events: ElementEvent[] = [];
  geo: GeoPoint | null = null;
  imageDataUrl: string | null = null;

  add(key: string, value: Property['value'], type: PropertyType): void {
    if (value === null || value === undefined || value === '') return;
    const same = (p: Property) =>
      value instanceof Date && p.value instanceof Date
        ? p.value.getTime() === value.getTime()
        : p.value === value;

    // Same key and value already present (duplicated items of a merged list)
    let candidate = key;
    for (let n = 2; ; n++) {
      const existing = this.properties.find(p => p.key === candidate);
      if (!existing) break;
      if (same(existing)) return;
      candidate = `${key} (${n})`;
    }
    this.properties.push({ key: candidate, value, type });
  }

  addEvent(event: Omit<ElementEvent, 'id' | 'source'>): void {
    const duplicate = this.events.some(
      e => e.date.getTime() === event.date.getTime() && e.label === event.label
    );
    if (duplicate) return;
    this.events.push({ id: generateUUID(), source: SOURCE, ...event });
  }

  setGeo(point: GeoPoint | null): void {
    if (point && !this.geo) this.geo = point;
  }

  /**
   * Merge a list hit collected apart. A dated hit (review, photo) is kept as
   * its events only, its text going into their description, so a list of
   * many hits does not pile up numbered properties.
   */
  absorb(hit: Collector): void {
    if (hit.events.length > 0) {
      const content = hit.properties.find(p => /(^| › )Content$/.test(p.key));
      for (const event of hit.events) {
        const description = [event.description, content ? String(content.value) : '']
          .filter(Boolean)
          .join('\n\n');
        this.addEvent({ ...event, ...(description ? { description } : {}) });
      }
    } else {
      for (const p of hit.properties) this.add(p.key, p.value, p.type ?? 'text');
    }
    this.setGeo(hit.geo);
    if (!this.imageDataUrl) this.imageDataUrl = hit.imageDataUrl;
  }
}

function keyOf(path: string[]): string {
  return path.length > 0 ? path.map(humanize).join(' › ') : 'Valeur';
}

function walkValue(value: unknown, path: string[], c: Collector): void {
  if (isEntity(value)) {
    walkValue(value.data, path, c);
    return;
  }
  if (!isTypedValue(value)) return;
  const { type, data } = value;

  switch (type) {
    case 'string':
    case 'phone':
      if (typeof data === 'string' && data.trim()) c.add(keyOf(path), data.trim(), 'text');
      else if (typeof data === 'number') c.add(keyOf(path), String(data), 'text');
      return;
    case 'url':
      if (typeof data === 'string' && data.trim()) c.add(keyOf(path), data.trim(), 'link');
      return;
    case 'number':
      if (typeof data === 'number' && Number.isFinite(data)) c.add(keyOf(path), data, 'number');
      return;
    case 'boolean':
      if (typeof data === 'boolean') c.add(keyOf(path), data, 'boolean');
      return;
    case 'timestamp': {
      const date = toDate(data);
      if (date) c.add(keyOf(path), date, 'datetime');
      return;
    }
    case 'image':
      if (typeof data !== 'string') return;
      if (data.startsWith('data:image/')) {
        if (!c.imageDataUrl) c.imageDataUrl = data;
      } else if (/^https?:\/\//.test(data)) {
        c.add(keyOf(path), data, 'link');
      }
      return;
    case 'location':
      if (isRecord(data) && isRecord(data.point)) {
        c.setGeo(toPoint(data.point.lat, data.point.lng));
      }
      return;
    case 'platform':
      if (isRecord(data) && typeof data.name === 'string' && data.name) {
        const category = typeof data.category === 'string' ? data.category : '';
        c.add(data.name, category || data.name, 'text');
      }
      return;
    case 'list':
    case 'platform_list':
      walkList(data, path, c);
      return;
    case 'object':
      if (isRecord(data)) walkObject(data, path, c);
      return;
    default:
      if (typeof data === 'string' || typeof data === 'number') {
        c.add(keyOf(path), String(data), 'text');
      }
  }
}

function walkList(items: unknown, path: string[], c: Collector): void {
  if (!Array.isArray(items) || items.length === 0) return;

  // List of plain strings: a single comma-separated property
  if (items.every(item => isTypedValue(item) && item.type === 'string')) {
    const values = items
      .map(item => scalar(item))
      .filter((v): v is string => typeof v === 'string' && v.trim() !== '');
    if (values.length > 0) c.add(keyOf(path), values.join(', '), 'text');
    return;
  }

  items.forEach((item, i) => {
    // Entities (several hits of one module) merge into the same properties;
    // plain objects are numbered so their fields stay together
    if (isEntity(item)) {
      const hit = new Collector();
      walkValue(item, path, hit);
      c.absorb(hit);
    } else if (items.length === 1 || path.length === 0) {
      walkValue(item, path, c);
    } else {
      const last = path[path.length - 1];
      walkValue(item, [...path.slice(0, -1), `${last} ${i + 1}`], c);
    }
  });
}

function walkObject(fields: Record<string, unknown>, path: string[], c: Collector): void {
  const kind = scalar(fields.kind);

  if (kind === 'event') {
    const date = toDate(scalar(fields.start_date));
    if (date) {
      const description = scalar(fields.description);
      const location = fields.location;
      let geo: GeoPoint | null = null;
      let address = '';
      let place = '';
      if (isTypedValue(location) && isRecord(location.data)) {
        geo = toPoint(scalar(location.data.latitude), scalar(location.data.longitude));
        address = str(scalar(location.data.address));
        const popup = location.data.popup;
        if (isTypedValue(popup) && isRecord(popup.data)) place = str(scalar(popup.data.subtitle));
      }
      c.setGeo(geo);
      const dateEnd = toDate(scalar(fields.end_date));
      const label = str(description) || humanize(path[path.length - 1] ?? 'Événement');
      c.addEvent({
        date,
        ...(dateEnd ? { dateEnd } : {}),
        label: place ? `${label} — ${place}` : label,
        ...(address ? { description: address } : {}),
        ...(geo ? { geo } : {}),
      });
    }
    return;
  }

  const isLocation = kind === 'location';
  if (isLocation) c.setGeo(toPoint(scalar(fields.latitude), scalar(fields.longitude)));

  const entries = Object.entries(fields).filter(([k]) => {
    if (k === 'kind' || SKIP_KEYS.has(k)) return false;
    if (isLocation && (k === 'latitude' || k === 'longitude' || k === 'popup')) return false;
    return true;
  });

  // { kind, value } wrappers (e.g. name: { kind: 'name', value: 'Heather' })
  if (entries.length === 1 && entries[0][0] === 'value') {
    walkValue(entries[0][1], path, c);
    return;
  }

  for (const [k, v] of entries) {
    walkValue(v, TRANSPARENT_KEYS.has(k) ? path : [...path, k], c);
  }
}

// ============================================================================
// Node conversion
// ============================================================================

/** Module slug from the icon URL (https://cdn.osint.industries/modules/poshmark.png) */
function moduleSlug(iconName: string | null | undefined): string | null {
  if (!iconName) return null;
  const match = iconName.match(/\/modules\/([^/?#]+)\.\w+$/);
  return match ? match[1] : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** `module_category` of an object result, or of the first hit of a list result */
function moduleCategory(value: V2Value): string {
  if (value.type === 'object' && isRecord(value.data)) {
    return str(scalar(value.data.module_category));
  }
  if (value.type === 'list' && Array.isArray(value.data)) {
    for (const item of value.data) {
      const category = isEntity(item) ? moduleCategory(item.data) : '';
      if (category) return category;
    }
  }
  return '';
}

export interface PaletteV2Conversion {
  elements: Element[];
  links: Link[];
  /** Picture to store as asset and display on the element */
  images: Map<ElementId, string>;
  warnings: string[];
}

function convertNode(
  node: V2Node,
  dossierId: DossierId
): { element: Element; imageDataUrl: string | null } {
  const entity = node.entity;
  const metadata = isRecord(entity.metadata) ? entity.metadata : {};
  const c = new Collector();
  let label = '';
  let tags: string[] = [];
  const notes: string[] = [];

  if (node.source === 'user-entity') {
    const value = entity.data.data;
    if (entity.data.type === 'image') {
      label = str(entity.name) || 'Image';
      if (node.sourceId?.startsWith('data:image/')) c.imageDataUrl = node.sourceId;
    } else {
      label = str(value) || str(entity.name) || entity.id;
    }
    tags = [SELECTOR_TAGS[entity.id] ?? (str(entity.name) || 'Recherche')];
    c.add('query_type', entity.id, 'text');
  } else if (node.source === 'system') {
    label = str(entity.data.data) || str(entity.name) || 'Texte';
    tags = ['Données'];
  } else {
    walkValue(entity.data, [], c);

    const database = str(metadata.database);
    const prettyName = str(metadata.prettyName);
    // Breach databases (kiel) carry the module in `name` and the hit in
    // `prettyName`; other modules the reverse. Platform lists are named by OI.
    label = entity.data.type === 'platform_list' || database
      ? str(entity.name) || prettyName
      : prettyName || str(entity.name);
    label ||= entity.id;

    const category = moduleCategory(entity.data);
    tags = [
      category ||
      (database ? 'Fuite de données' : '') ||
      (entity.data.type === 'platform_list' ? 'Plateformes' : '') ||
      str(metadata.kindLabel) ||
      'Autre',
    ];

    const slug = database || moduleSlug(entity.iconName);
    if (slug) c.add('module_id', slug, 'text');

    const annotation = str(metadata.annotation);
    if (annotation) notes.push(annotation);
    const devNotes = str(metadata.devNotes);
    if (devNotes) notes.push(devNotes);
  }

  const element: Element = {
    id: generateUUID(),
    dossierId,
    label,
    notes: notes.join('\n\n'),
    tags,
    properties: c.properties,
    confidence: null,
    source: SOURCE,
    date: null,
    dateRange: null,
    position: { x: node.x ?? 0, y: node.y ?? 0 },
    isPositionLocked: false,
    geo: c.geo,
    visual: { ...DEFAULT_ELEMENT_VISUAL },
    assetIds: [],
    parentGroupId: null,
    isGroup: false,
    isAnnotation: false,
    childIds: [],
    events: c.events.sort((a, b) => a.date.getTime() - b.date.getTime()),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return { element, imageDataUrl: c.imageDataUrl };
}

/**
 * Convert a Graph Palette v2 graph into ZeroNeurone elements and links
 * (pure: nothing is written)
 */
export function convertPaletteV2(data: PaletteV2Graph, dossierId: DossierId): PaletteV2Conversion {
  const elements: Element[] = [];
  const links: Link[] = [];
  const images = new Map<ElementId, string>();
  const warnings: string[] = [];
  const nodeIdMap = new Map<string, ElementId>();

  for (const node of data.nodes) {
    if (!node || typeof node.id !== 'string' || !isEntity(node.entity)) {
      warnings.push(`Noeud ignoré: format inattendu (${node?.id ?? '?'})`);
      continue;
    }
    const { element, imageDataUrl } = convertNode(node, dossierId);
    nodeIdMap.set(node.id, element.id);
    elements.push(element);
    if (imageDataUrl) images.set(element.id, imageDataUrl);
  }

  for (const edge of data.edges ?? []) {
    const fromId = nodeIdMap.get(edge?.source);
    const toId = nodeIdMap.get(edge?.target);
    if (!fromId || !toId || fromId === toId) continue;

    links.push({
      id: generateUUID(),
      dossierId,
      fromId,
      toId,
      sourceHandle: null,
      targetHandle: null,
      label: '',
      notes: '',
      tags: [],
      properties: [],
      confidence: null,
      source: '',
      date: null,
      dateRange: null,
      directed: true,
      direction: 'forward',
      visual: { ...DEFAULT_LINK_VISUAL },
      curveOffset: { x: 0, y: 0 },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return { elements, links, images, warnings };
}

// ============================================================================
// Import
// ============================================================================

function imageExtension(dataUrl: string): string {
  const mime = dataUrl.slice(5, dataUrl.indexOf(';'));
  const sub = mime.split('/')[1] || 'png';
  return sub === 'jpeg' ? 'jpg' : sub.replace(/\+.*$/, '');
}

/**
 * Import a Graph Palette v2 export (OSINT Industries) into a dossier
 */
export async function importOIPaletteV2(
  data: PaletteV2Graph,
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
    const { elements, links, images, warnings } = convertPaletteV2(data, targetDossierId);
    result.warnings.push(...warnings);

    for (const element of elements) {
      const dataUrl = images.get(element.id);
      if (!dataUrl) continue;
      try {
        const name = `${element.label.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)}.${imageExtension(dataUrl)}`;
        const asset = await fileService.saveAsset(targetDossierId, dataUrlToFile(dataUrl, name));
        element.assetIds = [asset.id];
        element.visual = { ...element.visual, image: asset.id };
        result.assetsImported++;
      } catch {
        result.warnings.push(`Image ignorée pour "${element.label}": erreur de conversion`);
      }
    }

    await db.elements.bulkAdd(elements);
    result.elementsImported = elements.length;
    await db.links.bulkAdd(links);
    result.linksImported = links.length;

    await db.dossiers.update(targetDossierId, { updatedAt: new Date() });
    result.success = result.elementsImported > 0;
  } catch (error) {
    result.errors.push(
      `Erreur d'import Graph Palette: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
    );
  }

  return result;
}

/**
 * Detect a Graph Palette v2 export: nodes carrying a typed `entity`
 */
export function isOIPaletteV2Format(data: unknown): data is PaletteV2Graph {
  if (!isRecord(data) || !Array.isArray(data.nodes) || data.nodes.length === 0) return false;
  return data.nodes.some(node => isRecord(node) && isEntity(node.entity));
}
