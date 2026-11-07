/*
 * This project is not affiliated with IBM, i2 Group, N. Harris Computer
 * Corporation, or any other vendor. "i2", "i2 Analyst's Notebook", and "ANB"
 * are trademarks of their respective owners (nominative use).
 *
 * Ce projet n'est affilié ni à IBM, ni à i2 Group, ni à N. Harris Computer
 * Corporation, ni à aucun autre éditeur. « i2 », « i2 Analyst's Notebook » et
 * « ANB » sont des marques de leurs propriétaires respectifs (usage nominatif).
 */
import i18next from 'i18next';
import { db } from '../db/database';
import { generateUUID } from '../utils';
import type {
  DossierId,
  Element,
  ElementEvent,
  ElementId,
  Link,
  LinkDirection,
  LinkId,
  Property,
} from '../types';
import { DEFAULT_ELEMENT_VISUAL, DEFAULT_LINK_VISUAL } from '../types';
import type { ImportResult } from './importService';
import { ImportedRows } from './importedRows';
import {
  findEventEnd,
  parseANBContents,
  parseAttributeDate,
  type ANBAttribute,
  type ANBChart,
  type ANBIssue,
  type ANBItem,
  type ANBLink,
} from './anbParser';
import { normalizeChartPositions } from '../utils/chartScale';

// ============================================================================
// i18n
// ============================================================================

const t = (key: string, options?: Record<string, unknown>) =>
  i18next.t(`importData:anb.${key}`, options) as string;

// ============================================================================
// FORMAT DETECTION
// ============================================================================

/** Detect i2 Analyst's Notebook binary format (OLE2/CFB magic D0 CF 11 E0) */
export function isANBFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const v = new DataView(buffer);
  return (
    v.getUint8(0) === 0xd0 &&
    v.getUint8(1) === 0xcf &&
    v.getUint8(2) === 0x11 &&
    v.getUint8(3) === 0xe0
  );
}

// ============================================================================
// TYPE COLORS (defaults for common French palette types)
// ============================================================================

const TYPE_COLORS: Record<string, string> = {
  HOMME: '#93c5fd',
  FEMME: '#93c5fd',
  FILLE: '#93c5fd',
  GARCON: '#93c5fd',
  INCONNU: '#93c5fd',
  PERSONNE: '#93c5fd',
  'INCONNU(E)': '#93c5fd',
  MAISON: '#fdba74',
  VILLE: '#fdba74',
  APPARTEMENT: '#fdba74',
  ADRESSE: '#fdba74',
  LOCALISATION: '#fdba74',
  VOITURE: '#d4d4d8',
  MOTO: '#d4d4d8',
  VEHICULE: '#d4d4d8',
  'COMPTE BANCAIRE': '#f9a8d4',
  BANQUE: '#f9a8d4',
  EVENEMENT: '#c4b5fd',
  CANNABIS: '#fca5a5',
  COCAINE: '#fca5a5',
  DROGUE: '#fca5a5',
  ENTREPRISE: '#86efac',
  ORGANISATION: '#86efac',
};

// ============================================================================
// ICON MAP (i2 palette icon names, lowercase → Lucide icon names)
// ============================================================================

const ANB_ICON_MAP: Record<string, string> = {
  person: 'user',
  woman: 'user',
  maleperson: 'user',
  female: 'user',
  male: 'user',
  anon: 'user',
  profmale: 'user',
  proffem: 'user',
  car: 'car',
  mcycle: 'bike',
  truck: 'truck',
  van: 'truck',
  cellfone: 'smartphone',
  phone: 'phone',
  house: 'home',
  building: 'building-2',
  town: 'map-pin',
  globe: 'globe',
  account: 'credit-card',
  money: 'banknote',
  date: 'calendar',
  event: 'calendar',
  gun: 'crosshair',
  drugs: 'pill',
  document: 'file-text',
  computer: 'monitor',
};

function mapANBIcon(iconName: string | null): string | null {
  return (iconName && ANB_ICON_MAP[iconName.toLowerCase()]) ?? DEFAULT_ELEMENT_VISUAL.icon;
}

// ============================================================================
// MAPPING HELPERS
// ============================================================================

/** i2's default entity type (no specific type chosen) reads better as a generic tag. */
const DEFAULT_TYPE_TAGS: Record<string, string> = {
  anonyme: 'Générique',
  anonymous: 'Generic',
};

/** "BOITIER TPH PORTABLE" → "Boitier tph portable"; mixed-case names are kept as is. */
function formatTypeName(name: string): string {
  const generic = DEFAULT_TYPE_TAGS[name.toLowerCase()];
  if (generic) return generic;
  if (name !== name.toUpperCase()) return name;
  return name.charAt(0) + name.slice(1).toLowerCase();
}

function attributeToProperty(attr: ANBAttribute): Property {
  const parsed = parseAttributeDate(attr.value);
  if (!parsed) return { key: attr.name, value: attr.value, type: 'text' };
  return { key: attr.name, value: parsed.date, type: parsed.hasTime ? 'datetime' : 'date' };
}

/** One arrow tip points at the end it lies on; two tips mean both ends. */
function linkDirection(link: ANBLink, items: ANBItem[]): LinkDirection {
  if (link.arrowHeads.length === 0) return 'none';
  if (link.arrowHeads.length > 1) return 'both';
  const tip = link.arrowHeads[0];
  const distance = (item: ANBItem) =>
    item.x === null || item.y === null ? Infinity : Math.hypot(item.x - tip.x, item.y - tip.y);
  return distance(items[link.fromIndex]) < distance(items[link.toIndex]) ? 'backward' : 'forward';
}

function issueToWarning(issue: ANBIssue): string {
  const { code, ...options } = issue;
  return t(`warnings.${code}`, options);
}

function buildElement(
  item: ANBItem,
  dossierId: DossierId,
  position: { x: number; y: number }
): Element {
  const now = new Date();
  const base = {
    id: generateUUID() as ElementId,
    dossierId,
    confidence: null,
    source: item.source || 'i2 ANB',
    dateRange: null,
    position,
    isPositionLocked: false,
    geo: null,
    events: [] as ElementEvent[],
    assetIds: [],
    parentGroupId: null,
    isGroup: false,
    childIds: [],
    createdAt: now,
    updatedAt: now,
  };

  // Text blocks are free text without semantic type: ZN annotations
  if (item.kind === 'TextBlock') {
    return {
      ...base,
      label: '',
      notes: item.label,
      tags: [],
      properties: [{ key: 'i2_entity_id', value: item.guid, type: 'text' }],
      date: null,
      isAnnotation: true,
      visual: {
        ...DEFAULT_ELEMENT_VISUAL,
        color: '#ffffff',
        borderColor: '#e5e7eb',
        shape: 'rectangle',
        icon: null,
        customWidth: 200,
      },
    };
  }

  const typeKey = item.typeName?.toUpperCase() ?? '';
  const color = TYPE_COLORS[typeKey] ?? item.typeColor ?? DEFAULT_ELEMENT_VISUAL.color;
  const borderColor = item.color ?? DEFAULT_ELEMENT_VISUAL.borderColor;
  const shape = item.kind === 'Box' || item.kind === 'Event' ? 'rectangle' : DEFAULT_ELEMENT_VISUAL.shape;
  // A theme line's time anchors the line on the i2 time axis; it does not date the person
  const date = item.kind === 'Theme' ? null : item.date;
  const properties: Property[] = item.attributes.map(attributeToProperty);
  properties.push({ key: 'i2_entity_id', value: item.guid, type: 'text' });
  if (item.identity) properties.push({ key: 'i2_identity', value: item.identity, type: 'text' });

  return {
    ...base,
    label: item.label,
    notes: item.description,
    tags: item.typeName ? [formatTypeName(item.typeName)] : [],
    properties,
    date,
    // The timeline reads events, not `date`. An i2 date is an instant (end = start, since an empty
    // end means "ongoing" in ZN), unless start/end attributes give the event a duration
    events: date ? [{
      id: generateUUID(),
      date,
      dateEnd: findEventEnd(date, item.attributes) ?? date,
      label: '',
      precision: item.dateHasTime ? 'minute' : 'day',
      ...(item.source ? { source: item.source } : {}),
    }] : [],
    isAnnotation: false,
    visual: { ...DEFAULT_ELEMENT_VISUAL, color, borderColor, shape, icon: mapANBIcon(item.typeIcon) },
  };
}

/**
 * Pictures shown by items in i2 → media of their elements, as PNG; one file per
 * picture, however many items show it. Returns the number of media attached.
 */
async function attachPictures(chart: ANBChart, elements: Element[], dossierId: DossierId): Promise<number> {
  if (chart.pictures.size === 0) return 0;
  const { anbPictureToPng } = await import('./anxImages');
  const { fileService } = await import('./fileService');
  const saved = new Map<string, Promise<string | null>>();
  let attached = 0;
  for (let i = 0; i < chart.items.length; i++) {
    const key = chart.items[i].pictureKey;
    const picture = key ? chart.pictures.get(key) : undefined;
    if (!key || !picture) continue;
    const element = elements[i];
    let assetId = saved.get(key);
    if (!assetId) {
      const name = `${(element.label || 'image').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60)}.png`;
      assetId = anbPictureToPng(picture)
        .then((png) => (png ? fileService.saveAsset(dossierId, new File([png], name, { type: 'image/png' })) : null))
        .then((asset) => asset?.id ?? null)
        .catch(() => null);
      saved.set(key, assetId);
    }
    const id = await assetId;
    if (id && !element.assetIds.includes(id)) {
      element.assetIds.push(id);
      attached++;
    }
  }
  return attached;
}

// ============================================================================
// MAIN IMPORT
// ============================================================================

/** The chart held by an .anb file, null when it has no readable Contents stream */
async function readANBChart(buffer: ArrayBuffer): Promise<ANBChart | null> {
  // Dynamic import of cfb (OLE2/CFB parser)
  const cfbModule = await import('cfb');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CFB = (cfbModule as any).default ?? cfbModule;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfbData = CFB.read(new Uint8Array(buffer), { type: 'buffer' }) as any;
  const contentsEntry = CFB.find(cfbData, '/Contents') ?? CFB.find(cfbData, 'Contents');
  if (!contentsEntry?.content) return null;
  const raw = contentsEntry.content;
  return parseANBContents(raw instanceof Uint8Array ? raw : new Uint8Array(raw));
}

/**
 * Area the chart takes on the canvas once imported, for placement mode (the
 * frame that follows the cursor). Null when the file holds no item.
 */
export async function anbBoundingBox(buffer: ArrayBuffer): Promise<{
  minX: number; minY: number; maxX: number; maxY: number; width: number; height: number; elementCount: number;
} | null> {
  const chart = await readANBChart(buffer);
  if (!chart || chart.items.length === 0) return null;
  const positions = normalizeChartPositions(chart.items);
  const minX = Math.min(...positions.map((p) => p.x));
  const minY = Math.min(...positions.map((p) => p.y));
  // Positions are top-left corners: add a default element's size
  const maxX = Math.max(...positions.map((p) => p.x)) + 120;
  const maxY = Math.max(...positions.map((p) => p.y)) + 60;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY, elementCount: chart.items.length };
}

export async function importANB(
  buffer: ArrayBuffer,
  targetDossierId: DossierId
): Promise<ImportResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  let elementsImported = 0;
  let linksImported = 0;

  try {
    const rows = new ImportedRows();
    const chart = await readANBChart(buffer);
    if (!chart) {
      return {
        success: false, elementsImported: 0, linksImported: 0,
        assetsImported: 0, reportImported: false,
        errors: [t('errors.invalidChart')], warnings,
      };
    }
    if (chart.items.length === 0) {
      return {
        success: false, elementsImported: 0, linksImported: 0,
        assetsImported: 0, reportImported: false,
        errors: [t('errors.noItems')], warnings,
      };
    }
    warnings.push(...chart.issues.map(issueToWarning));

    // ── Elements ──
    const positions = normalizeChartPositions(chart.items);
    const elementIds: ElementId[] = [];
    const elements: Element[] = [];
    for (let i = 0; i < chart.items.length; i++) {
      const element = buildElement(chart.items[i], targetDossierId, positions[i]);
      rows.addElement(element);
      elementIds.push(element.id);
      elements.push(element);
      elementsImported++;
    }
    const assetsImported = await attachPictures(chart, elements, targetDossierId);

    // ── Links ──
    for (const l of chart.links) {
      // Attachments to a theme line carry i2's default type name ("Lien") and are drawn unlabelled
      const onThemeLine = chart.items[l.fromIndex].kind === 'Theme' || chart.items[l.toIndex].kind === 'Theme';
      const direction = onThemeLine ? 'none' : linkDirection(l, chart.items);
      const now = new Date();
      const link: Link = {
        id: generateUUID() as LinkId,
        dossierId: targetDossierId,
        fromId: elementIds[l.fromIndex],
        toId: elementIds[l.toIndex],
        sourceHandle: null,
        targetHandle: null,
        label: onThemeLine ? '' : l.label,
        notes: l.description,
        tags: [],
        properties: [{ key: 'i2_link_id', value: l.guid, type: 'text' }],
        confidence: null,
        source: l.source || 'i2 ANB',
        date: l.date,
        // The timeline reads dateRange, not `date`. An i2 date is an instant: end = start
        dateRange: l.date
          ? { start: l.date, end: l.date, precision: l.dateHasTime ? 'minute' : 'day' }
          : null,
        directed: direction !== 'none',
        direction,
        // i2's black is its default line colour: keep ZN's theme-aware default instead
        visual: { ...DEFAULT_LINK_VISUAL, ...(l.color && l.color !== '#000000' ? { color: l.color } : {}) },
        curveOffset: { x: 0, y: 0 },
        createdAt: now,
        updatedAt: now,
      };
      rows.addLink(link);
      linksImported++;
    }

    await rows.write();

    await db.dossiers.update(targetDossierId, { updatedAt: new Date() });

    return {
      success: elementsImported > 0,
      elementsImported,
      linksImported,
      assetsImported,
      reportImported: false,
      errors,
      warnings,
    };
  } catch (error) {
    errors.push(
      t('errors.importError', {
        message: error instanceof Error ? error.message : t('errors.unknownError'),
      })
    );
    return {
      success: false,
      elementsImported,
      linksImported,
      assetsImported: 0,
      reportImported: false,
      errors,
      warnings,
    };
  }
}
