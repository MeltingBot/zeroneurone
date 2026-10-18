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
import { parseANBContents, type ANBAttribute, type ANBIssue, type ANBItem, type ANBLink } from './anbParser';

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

/**
 * i2 date attributes, local wall clock: "2026 10 18 7 25 45" (Y M D h m s) or "12/07/1990".
 * Returns whether a time of day is set (00:00:00 counts as a plain date).
 */
function parseAttributeDate(value: string): { date: Date; hasTime: boolean } | null {
  let m = value.match(/^(\d{4}) (\d{1,2}) (\d{1,2})(?: (\d{1,2}) (\d{1,2}) (\d{1,2}))?$/);
  if (m) {
    const [h, min, sec] = [m[4], m[5], m[6]].map(v => Number(v ?? 0));
    return {
      date: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, min, sec),
      hasTime: h + min + sec > 0,
    };
  }
  m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return { date: new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])), hasTime: false };
  return null;
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

/**
 * i2 coordinates → canvas positions with one uniform scale (no distortion): the median
 * nearest-neighbour distance becomes ~180 px. Items without a position go on a row below.
 */
function computePositions(items: ANBItem[]): Array<{ x: number; y: number }> {
  const placed = items.filter(i => i.x !== null && i.y !== null);
  let scale = 1;
  if (placed.length > 1) {
    const nearest = placed.map(a => {
      let best = Infinity;
      for (const b of placed) {
        if (a === b) continue;
        const d = Math.hypot(a.x! - b.x!, a.y! - b.y!);
        if (d > 0 && d < best) best = d;
      }
      return best;
    }).filter(Number.isFinite).sort((p, q) => p - q);
    const median = nearest[Math.floor(nearest.length / 2)];
    if (median) scale = Math.min(4, Math.max(0.2, 180 / median));
  }
  const minX = Math.min(...placed.map(i => i.x!));
  const minY = Math.min(...placed.map(i => i.y!));
  const maxY = Math.max(...placed.map(i => i.y!));

  let orphan = 0;
  return items.map(i => {
    if (i.x !== null && i.y !== null) {
      return { x: 200 + (i.x - minX) * scale, y: 200 + (i.y - minY) * scale };
    }
    const base = placed.length > 0 ? 200 + (maxY - minY) * scale + 300 : 200;
    return { x: 200 + (orphan++) * 220, y: base };
  });
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

  return {
    ...base,
    label: item.label,
    notes: item.description,
    tags: item.typeName ? [formatTypeName(item.typeName)] : [],
    properties,
    date,
    // The timeline reads events, not `date`. An i2 date is an instant: end = start, since an
    // empty end means "ongoing" in ZN
    events: date ? [{
      id: generateUUID(),
      date,
      dateEnd: date,
      label: '',
      precision: item.dateHasTime ? 'minute' : 'day',
      ...(item.source ? { source: item.source } : {}),
    }] : [],
    isAnnotation: false,
    visual: { ...DEFAULT_ELEMENT_VISUAL, color, borderColor, shape, icon: mapANBIcon(item.typeIcon) },
  };
}

// ============================================================================
// MAIN IMPORT
// ============================================================================

export async function importANB(
  buffer: ArrayBuffer,
  targetDossierId: DossierId
): Promise<ImportResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  let elementsImported = 0;
  let linksImported = 0;

  try {
    // Dynamic import of cfb (OLE2/CFB parser)
    const cfbModule = await import('cfb');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const CFB = (cfbModule as any).default ?? cfbModule;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfbData = CFB.read(new Uint8Array(buffer), { type: 'buffer' }) as any;
    const contentsEntry = CFB.find(cfbData, '/Contents') ?? CFB.find(cfbData, 'Contents');
    if (!contentsEntry?.content) {
      return {
        success: false, elementsImported: 0, linksImported: 0,
        assetsImported: 0, reportImported: false,
        errors: [t('errors.invalidChart')], warnings,
      };
    }
    const raw = contentsEntry.content;
    const chart = parseANBContents(raw instanceof Uint8Array ? raw : new Uint8Array(raw));

    if (chart.items.length === 0) {
      return {
        success: false, elementsImported: 0, linksImported: 0,
        assetsImported: 0, reportImported: false,
        errors: [t('errors.noItems')], warnings,
      };
    }
    warnings.push(...chart.issues.map(issueToWarning));

    // ── Elements ──
    const positions = computePositions(chart.items);
    const elementIds: ElementId[] = [];
    for (let i = 0; i < chart.items.length; i++) {
      const element = buildElement(chart.items[i], targetDossierId, positions[i]);
      await db.elements.add(element);
      elementIds.push(element.id);
      elementsImported++;
    }

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
      await db.links.add(link);
      linksImported++;
    }

    await db.dossiers.update(targetDossierId, { updatedAt: new Date() });

    return {
      success: elementsImported > 0,
      elementsImported,
      linksImported,
      assetsImported: 0,
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
