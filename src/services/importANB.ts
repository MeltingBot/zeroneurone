import i18next from 'i18next';
import { db } from '../db/database';
import { generateUUID } from '../utils';
import type {
  DossierId,
  Element,
  ElementId,
  Link,
  LinkId,
  Property,
} from '../types';
import { DEFAULT_ELEMENT_VISUAL, DEFAULT_LINK_VISUAL } from '../types';
import type { ImportResult } from './importService';

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
// TYPE COLORS (ANACRIM palette defaults)
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
// ICON MAP (ANB icon names → Lucide icon names)
// ============================================================================

const ANB_ICON_MAP: Record<string, string> = {
  Person: 'user',
  Woman: 'user',
  MalePerson: 'user',
  Female: 'user',
  Male: 'user',
  Car: 'car',
  Mcycle: 'bike',
  Truck: 'truck',
  Van: 'truck',
  Cellfone: 'smartphone',
  Phone: 'phone',
  House: 'home',
  Building: 'building-2',
  Town: 'map-pin',
  Globe: 'globe',
  Account: 'credit-card',
  Money: 'banknote',
  Date: 'calendar',
  Event: 'calendar',
  Gun: 'crosshair',
  Drugs: 'pill',
  Document: 'file-text',
  Computer: 'monitor',
};

function mapANBIcon(iconName: string): string {
  return ANB_ICON_MAP[iconName] ?? DEFAULT_ELEMENT_VISUAL.icon ?? 'circle';
}

// ============================================================================
// BINARY HELPERS
// ============================================================================

function encodeUTF16LE(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length * 2);
  for (let i = 0; i < str.length; i++) {
    bytes[i * 2] = str.charCodeAt(i) & 0xff;
    bytes[i * 2 + 1] = (str.charCodeAt(i) >> 8) & 0xff;
  }
  return bytes;
}

function utf16leToStr(bytes: Uint8Array): string {
  return new TextDecoder('utf-16le').decode(bytes);
}

function readU16LE(bytes: Uint8Array, pos: number): number {
  return bytes[pos] | (bytes[pos + 1] << 8);
}

/** Find a USTR token with a specific string content, returns position of FF FE FF header */
function findUSTR(bytes: Uint8Array, str: string, start = 0): number {
  const n = str.length;
  if (n === 0 || n > 0xfe) return -1;
  const encoded = encodeUTF16LE(str);
  for (let i = start; i <= bytes.length - 4 - encoded.length; i++) {
    if (bytes[i] !== 0xff || bytes[i + 1] !== 0xfe || bytes[i + 2] !== 0xff || bytes[i + 3] !== n)
      continue;
    let match = true;
    for (let j = 0; j < encoded.length; j++) {
      if (bytes[i + 4 + j] !== encoded[j]) { match = false; break; }
    }
    if (match) return i;
  }
  return -1;
}

/** Returns true if bytes at pos is a 38-char GUID USTR: FF FE FF 26 7B 00 */
function isGUIDStart(bytes: Uint8Array, pos: number): boolean {
  return (
    pos + 6 <= bytes.length &&
    bytes[pos] === 0xff &&
    bytes[pos + 1] === 0xfe &&
    bytes[pos + 2] === 0xff &&
    bytes[pos + 3] === 0x26 &&
    bytes[pos + 4] === 0x7b &&
    bytes[pos + 5] === 0x00
  );
}

// ============================================================================
// ANB READER — browser-compatible DataView-based reader
// ============================================================================

class ANBReader {
  bytes: Uint8Array;
  view: DataView;
  pos = 0;

  constructor(data: Uint8Array) {
    this.bytes = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  get length(): number { return this.bytes.length; }

  u8(): number { return this.view.getUint8(this.pos++); }
  u16(): number { const v = this.view.getUint16(this.pos, true); this.pos += 2; return v; }
  u32(): number { const v = this.view.getUint32(this.pos, true); this.pos += 4; return v; }
  i32(): number { const v = this.view.getInt32(this.pos, true); this.pos += 4; return v; }

  isUSTR(offset = 0): boolean {
    const p = this.pos + offset;
    return (
      p + 3 < this.bytes.length &&
      this.bytes[p] === 0xff &&
      this.bytes[p + 1] === 0xfe &&
      this.bytes[p + 2] === 0xff
    );
  }

  readUSTR(): string {
    this.pos += 3; // skip FF FE FF
    let n = this.u8();
    if (n === 0) return '';
    // Extended encoding: if n === 0xFF, next 2 bytes are big-endian actual length
    if (n === 0xff) {
      const hi = this.u8();
      const lo = this.u8();
      n = (hi << 8) | lo;
    }
    if (this.pos + n * 2 > this.bytes.length) {
      this.pos = this.bytes.length;
      return '';
    }
    const strBytes = this.bytes.slice(this.pos, this.pos + n * 2);
    this.pos += n * 2;
    return utf16leToStr(strBytes);
  }

  isNULL(): boolean {
    return (
      this.pos + 4 <= this.bytes.length &&
      this.view.getUint32(this.pos, true) === 0xfffffffe
    );
  }

  readNULL(): null { this.pos += 4; return null; }

  isASTR(): boolean {
    return (
      this.pos + 2 <= this.bytes.length &&
      this.bytes[this.pos] === 0xff &&
      this.bytes[this.pos + 1] === 0xff
    );
  }

  readASTR(): string {
    this.pos += 2; // skip FF FF
    this.u16(); // flag (ignored)
    const len = this.u16();
    if (this.pos + len > this.bytes.length) { this.pos = this.bytes.length; return ''; }
    const strBytes = this.bytes.slice(this.pos, this.pos + len);
    this.pos += len;
    return new TextDecoder('ascii').decode(strBytes);
  }

  skip(n: number): void { this.pos += n; }
}

// ============================================================================
// INTERFACES
// ============================================================================

interface ANBEntityType { name: string; icon: string; color: string; isDefault: boolean; index: number; }
interface ANBLinkType { name: string; color: string; index: number; }
interface ANBPalette { entityTypes: ANBEntityType[]; linkTypes: ANBLinkType[]; }

interface ANBEntity {
  guid: string;
  x: number;
  y: number;
  identity: string;
  objRef: number;
  fields: { ref: number; value: string }[];
  znX?: number;
  znY?: number;
}

interface ANBJunction {
  guid: string;
  x: number;
  y: number;
  name: string;
  znX?: number;
  znY?: number;
}

/**
 * ANB Card record (marker 0x818D).
 * These are "Entité" objects attached to a parent entity, representing:
 * - Programme TV entries (channel names or show titles with broadcast datetime)
 * - Testimonies / witness statements (free text with datetime)
 * Structure: OLE date at +88, label USTR at ~+156, parent ref at +116.
 */
interface ANBCard {
  guid: string;
  label: string;
  date: Date | null;
  /** Raw X at +116 — used for parent entity matching AND for layout. */
  x: number;
  /** Raw Y at +120 — original i2 position, converted via convertCoordinates. */
  y: number;
  znX?: number;
  znY?: number;
}

/** Raw link record: person name extracted from description + attachment coords. */
interface ANBRawLink {
  personName: string;
  personType: string; // HOMME, FEMME, GARCON, etc.
  coordX: number;     // raw ANB coord at record+134 — near the target event
  coordY: number;
  date: string | null; // ISO date extracted from description end ("DD/MM/YY HH:MM:SS")
}

/**
 * Parse ANB date string "DD/MM/YY HH:MM:SS" or "DD/MM/YYYY HH:MM:SS" → ISO 8601.
 * 2-digit years are assumed to be 20xx.
 */
function parseLinkDate(str: string): string | null {
  const m = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*$/);
  if (!m) return null;
  const [, d, mo, y, h, min, s] = m;
  const year = y.length === 2 ? '20' + y : y;
  return `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${min}:${s}.000Z`;
}

// ============================================================================
// PALETTE PARSING
// ============================================================================

function parsePalette(bytes: Uint8Array): ANBPalette {
  const entityTypes: ANBEntityType[] = [];
  const linkTypes: ANBLinkType[] = [];

  try {
    const palPos = findUSTR(bytes, 'PAL_BasePalette');
    if (palPos < 0) return { entityTypes, linkTypes };

    const r = new ANBReader(bytes);
    r.pos = palPos;
    r.readUSTR(); // "PAL_BasePalette"
    r.u32(); // version = 2
    const entityCount = r.u16();
    r.u16(); // alternate count

    // Skip separator header blocks
    if (r.isASTR()) r.readASTR(); // "TY_EndType"
    if (r.isUSTR()) r.readUSTR(); // "TY_EndType"
    if (r.pos + 4 <= r.length) r.u32(); // 3
    if (r.isUSTR()) r.readUSTR(); // "TY_GenerateName"
    if (r.pos + 4 <= r.length) r.u32(); // 1
    if (r.isUSTR()) r.readUSTR(); // "TY_Type"
    if (r.pos + 4 <= r.length) r.u32(); // 1

    // Parse entity types
    for (let i = 0; i < Math.min(entityCount, 500) && r.pos < r.length; i++) {
      try {
        if (!r.isUSTR()) break;
        const name = r.readUSTR();
        if (!name) break;

        // NULL or sub-type USTR
        if (r.isNULL()) r.readNULL();
        else if (r.isUSTR()) r.readUSTR();

        r.u32(); r.u32(); // two reserved u32

        const icon = r.isUSTR() ? r.readUSTR() : '';
        r.u32(); // reserved

        const R = r.u8(), G = r.u8(), B = r.u8();
        const flag = r.u8(); // 255 = default color (black)
        r.u32(); // unk
        const index = r.u32();
        r.u16(); // separator

        const color = flag === 255
          ? '#000000'
          : `#${R.toString(16).padStart(2, '0')}${G.toString(16).padStart(2, '0')}${B.toString(16).padStart(2, '0')}`;

        entityTypes.push({ name, icon, color, isDefault: flag === 255, index });
      } catch { break; }
    }

    // Find and parse link types
    const ltPos = findUSTR(bytes, 'TY_LinkType', r.pos);
    if (ltPos < 0) return { entityTypes, linkTypes };

    r.pos = ltPos;
    r.readUSTR(); // "TY_LinkType"
    r.u32(); // 1

    for (let i = 0; i < 200 && r.pos < r.length; i++) {
      try {
        if (!r.isUSTR()) break;
        const name = r.readUSTR();
        if (!name) break;

        if (r.isNULL()) r.readNULL();
        r.u32(); // reserved

        const R = r.u8(), G = r.u8(), B = r.u8();
        r.u8(); // flag
        const index = r.u32();
        const sep = r.u16(); // separator

        const color = `#${R.toString(16).padStart(2, '0')}${G.toString(16).padStart(2, '0')}${B.toString(16).padStart(2, '0')}`;
        linkTypes.push({ name, color, index });

        if (sep !== 0x808b) break; // 0x808B = more types follow; other = last one
      } catch { break; }
    }
  } catch {
    // Palette parsing failed — return partial results
  }

  return { entityTypes, linkTypes };
}

// ============================================================================
// MARKER DETECTION
// ============================================================================

/**
 * Detect the entity class marker for this file.
 * Strategy: find USTR "LCI_ChartItem" → skip template GUID → collect all GUIDs
 * with 22 zeros → among markers with count >= 2, return the one with the earliest
 * first occurrence in the file. Entity records always appear before link records in
 * the binary layout (entity class section precedes link class section).
 */
function detectEntityMarker(bytes: Uint8Array): number | null {
  let idx = findUSTR(bytes, 'LCI_ChartItem');
  if (idx < 0) idx = findUSTR(bytes, 'LCI_Icon');
  if (idx < 0) return null;

  const freq = new Map<number, { count: number; firstPos: number }>();
  let foundTemplate = false;
  for (let pos = idx; pos < bytes.length - 84; pos++) {
    if (!isGUIDStart(bytes, pos)) continue;

    if (!foundTemplate) {
      // Skip the template GUID
      foundTemplate = true;
      pos += 79;
      continue;
    }

    // Check if 22 bytes after marker(2)+u32(4) = 6 bytes are all zeros
    const afterMk = pos + 80 + 2 + 4;
    if (afterMk + 22 >= bytes.length) break;

    let allZeros = true;
    for (let z = 0; z < 22; z++) {
      if (bytes[afterMk + z] !== 0) { allZeros = false; break; }
    }
    if (allZeros) {
      const mk = readU16LE(bytes, pos + 80);
      const existing = freq.get(mk);
      if (!existing) {
        freq.set(mk, { count: 1, firstPos: pos });
      } else {
        existing.count++;
      }
    }
    pos += 79;
  }

  if (freq.size === 0) return null;

  // Among markers with count >= 2, return the one with the earliest first occurrence.
  // This disambiguates entity markers from link markers: in all known ANB files,
  // entity records appear earlier in the binary stream than link records.
  let bestMarker = 0;
  let bestPos = Infinity;
  for (const [mk, info] of freq) {
    if (info.count >= 2 && info.firstPos < bestPos) {
      bestPos = info.firstPos;
      bestMarker = mk;
    }
  }
  // Fallback: if no marker with count >= 2, return most frequent
  if (bestMarker === 0) {
    let maxCount = 0;
    for (const [mk, info] of freq) {
      if (info.count > maxCount) { maxCount = info.count; bestMarker = mk; }
    }
  }
  return bestMarker || null;
}

/**
 * Detect the link class marker for this file.
 * Same approach via "LCI_Link", looking for a marker different from entityMarker.
 */
function detectLinkMarker(bytes: Uint8Array, entityMarker: number | null): number | null {
  const idx = findUSTR(bytes, 'LCI_Link');
  if (idx < 0) return null;

  for (let pos = idx; pos < bytes.length - 84; pos++) {
    if (!isGUIDStart(bytes, pos)) continue;

    const mk = readU16LE(bytes, pos + 80);
    if (entityMarker !== null && mk === entityMarker) { pos += 79; continue; }

    // Verify 22 zeros after marker+u32
    const afterMk = pos + 80 + 2 + 4;
    if (afterMk + 22 >= bytes.length) break;

    let allZeros = true;
    for (let z = 0; z < 22; z++) {
      if (bytes[afterMk + z] !== 0) { allZeros = false; break; }
    }
    if (allZeros) return mk;
    pos += 79;
  }
  return null;
}

// ============================================================================
// ENTITY PARSING
// ============================================================================

/**
 * Collect every marker value found in GUID+22-zero records, excluding the
 * link marker and the junction marker. ANB files may have one entity type
 * (RELATIONNEL) or several (EVENEMENTIEL: Événement, Programme TV, créneau…).
 */
function collectAllEntityMarkers(
  bytes: Uint8Array,
  linkMarker: number | null,
): Set<number> {
  const markers = new Set<number>();
  for (let pos = 0; pos < bytes.length - 84; pos++) {
    if (!isGUIDStart(bytes, pos)) continue;
    const mk = readU16LE(bytes, pos + 80);
    if (mk === JUNCTION_MARKER) { pos += 79; continue; }
    if (linkMarker !== null && mk === linkMarker) { pos += 79; continue; }
    const afterMk = pos + 80 + 2 + 4;
    if (afterMk + 22 >= bytes.length) { pos += 79; continue; }
    let allZeros = true;
    for (let z = 0; z < 22; z++) {
      if (bytes[afterMk + z] !== 0) { allZeros = false; break; }
    }
    if (allZeros) markers.add(mk);
    pos += 79;
  }
  return markers;
}

function parseEntities(bytes: Uint8Array, entityMarkers: number | Set<number>): ANBEntity[] {
  const markerSet: Set<number> = typeof entityMarkers === 'number'
    ? new Set([entityMarkers])
    : entityMarkers;
  const entities: ANBEntity[] = [];
  const seen = new Set<number>();

  for (let pos = 0; pos < bytes.length - 84; pos++) {
    if (!isGUIDStart(bytes, pos)) continue;
    if (!markerSet.has(readU16LE(bytes, pos + 80))) { pos += 79; continue; }
    if (seen.has(pos)) { pos += 79; continue; }

    // Verify 22 zeros
    const afterMk = pos + 80 + 2 + 4;
    if (afterMk + 22 >= bytes.length) { pos += 79; continue; }
    let allZeros = true;
    for (let z = 0; z < 22; z++) {
      if (bytes[afterMk + z] !== 0) { allZeros = false; break; }
    }
    if (!allZeros) { pos += 79; continue; }

    seen.add(pos);

    try {
      const r = new ANBReader(bytes);
      r.pos = pos;

      const guid = r.readUSTR(); // 38 chars ({XXXXXXXX-...})
      if (!guid.startsWith('{')) { pos += 79; continue; }

      r.skip(2);  // marker
      r.skip(4);  // u32(1)
      r.skip(22); // zeros

      // Empty USTR: FF FE FF 00
      if (r.isUSTR()) r.readUSTR(); else r.skip(4);
      r.u32(); // padding u32(0)

      const x = r.i32();
      const y = r.i32();

      // Skip secondary position data: 2 + i32(X2) + i32(Y2) + u32(size) + 2 + i32(X3) + i32(Y3)
      r.skip(2 + 4 + 4 + 4 + 2 + 4 + 4);

      // Relational-type files (e.g. person-centric charts) store the label USTR
      // directly at pos+148 without an objRef before it. Event-centric files have
      // a u32 objRef here. Distinguish by checking for USTR header.
      let objRef = 0;
      if (!r.isUSTR()) {
        objRef = r.u32();
        r.skip(4); // skip unknown i32
      }
      const identity = r.isUSTR() ? r.readUSTR() : '';

      const fieldCount = Math.min(r.u32(), 50);
      const fields: { ref: number; value: string }[] = [];
      let ref0Value = ''; // ref=0 fields contain the entity name (sentinel), not real attributes
      for (let f = 0; f < fieldCount; f++) {
        if (r.pos + 4 > r.length) break;
        const ref = r.u32();
        const value = r.isUSTR() ? r.readUSTR() : '';
        if (ref === 0) {
          if (!ref0Value && value) ref0Value = value; // keep first occurrence as identity fallback
        } else if (value) {
          fields.push({ ref, value });
        }
      }

      entities.push({ guid, x, y, identity: identity || ref0Value, objRef, fields });
    } catch {
      // Malformed record — skip
    }

    pos += 79;
  }

  return entities;
}

// ============================================================================
// JUNCTION PARSING (0x811D — persons/objects anchored to events)
// ============================================================================

const JUNCTION_MARKER = 0x811d;
const ANB_CARD_MARKER = 0x818d; // Programme TV + testimonies attached to entities

/**
 * Parse person/object junction records (marker 0x811D).
 * These do NOT have 22 zeros after marker+u32, unlike entity records.
 * Layout (fixed offsets from record start):
 *   +0   : GUID USTR (80 bytes)
 *   +80  : marker u16 (0x811D)
 *   +82  : u32
 *   +86  : 22 non-zero bytes (flags/timestamps)
 *   +108 : empty USTR (FF FE FF 00) — 4 bytes
 *   +112 : padding u32 — 4 bytes
 *   +116 : X (i32)
 *   +120 : Y (i32)
 *   +148 : name USTR (person/object name)
 */
function parseJunctions(bytes: Uint8Array): ANBJunction[] {
  const junctions: ANBJunction[] = [];
  const seen = new Set<number>();

  for (let pos = 0; pos < bytes.length - 200; pos++) {
    if (!isGUIDStart(bytes, pos)) continue;
    if (readU16LE(bytes, pos + 80) !== JUNCTION_MARKER) { pos += 79; continue; }
    if (seen.has(pos)) { pos += 79; continue; }
    seen.add(pos);

    try {
      const guid = new ANBReader(bytes);
      guid.pos = pos;
      const guidStr = guid.readUSTR();
      if (!guidStr.startsWith('{')) { pos += 79; continue; }

      // X at fixed offset +116, Y at +120
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const x = view.getInt32(pos + 116, true);
      const y = view.getInt32(pos + 120, true);

      // Name USTR at fixed offset +148
      const nameR = new ANBReader(bytes);
      nameR.pos = pos + 148;
      if (!nameR.isUSTR()) { pos += 79; continue; }
      const name = nameR.readUSTR();

      // Filter out style property names and empty/GUID strings
      if (!name || name.startsWith('{') || name.includes('Colour') || name.includes('Style') || name.length > 80) {
        pos += 79;
        continue;
      }

      junctions.push({ guid: guidStr, x, y, name });
    } catch {
      // Malformed record — skip
    }

    pos += 79;
  }

  return junctions;
}

// ============================================================================
// CARD PARSING (0x818D — Programme TV + testimonies attached to entities)
// ============================================================================

/**
 * Parse ANB card records (marker 0x818D).
 *
 * Binary layout (offsets from record start = GUID start):
 *   +0   : GUID USTR (80 bytes)
 *   +80  : marker u16 (0x818D)
 *   +82  : u16 = 0x0001
 *   +84  : u16 = 0x0000
 *   +86  : u16 = 0x0000  ← NOT 22 zeros (differs from entity records)
 *   +88  : float64 LE — OLE Automation date (days since 1899-12-30)
 *   +108 : empty USTR (FF FE FF 00)
 *   +116 : u32 — parent entity reference (equals parent entity's raw X coordinate)
 *   +154/156 : USTR — label (programme name or testimony text)
 *
 * OLE date conversion: unixMs = (oleDate - 25569) × 86400000
 */
function parseANBCards(bytes: Uint8Array): ANBCard[] {
  const cards: ANBCard[] = [];
  const seen = new Set<number>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const SKIP_STRS = new Set(['Lien', 'Junction2StyleColour', 'Junction1StyleColour', 'Entité']);

  for (let pos = 0; pos < bytes.length - 200; pos++) {
    if (!isGUIDStart(bytes, pos)) continue;
    if (readU16LE(bytes, pos + 80) !== ANB_CARD_MARKER) { pos += 79; continue; }
    if (seen.has(pos)) { pos += 79; continue; }
    seen.add(pos);

    try {
      const r = new ANBReader(bytes);
      r.pos = pos;
      const guid = r.readUSTR(); // 80 bytes
      if (!guid.startsWith('{')) { pos += 79; continue; }

      // OLE Automation date at +88 (float64 little-endian)
      let date: Date | null = null;
      if (pos + 96 <= bytes.length) {
        const oleDate = view.getFloat64(pos + 88, true);
        // Valid OLE range: ~1 (Dec 31 1899) to ~73413 (Dec 31 2100)
        if (oleDate > 1 && oleDate < 73413) {
          const unixMs = (oleDate - 25569) * 86400000;
          const d = new Date(unixMs);
          if (!isNaN(d.getTime())) date = d;
        }
      }

      // Own X/Y coordinates at +116/+120 (i32) — same layout as junction records
      const x = pos + 120 <= bytes.length ? view.getInt32(pos + 116, true) : 0;
      const y = pos + 124 <= bytes.length ? view.getInt32(pos + 120, true) : 0;

      // Scan for first substantive USTR after +108 (skip empty / style strings)
      let label = '';
      const scanR = new ANBReader(bytes);
      scanR.pos = pos + 108;
      const scanEnd = Math.min(scanR.length, pos + 600);
      while (scanR.pos < scanEnd && !label) {
        if (!scanR.isUSTR()) { scanR.skip(1); continue; }
        const s = scanR.readUSTR();
        if (s && s.length >= 2 && !s.startsWith('{') &&
            !SKIP_STRS.has(s) && !s.includes('Colour') && !s.includes('Style')) {
          label = s;
        }
      }

      if (!label) { pos += 79; continue; }

      cards.push({ guid, label, date, x, y });
    } catch {
      // skip malformed record
    }

    pos += 79;
  }

  return cards;
}

// ============================================================================
// LINK PARSING
// ============================================================================

/**
 * Parse ANB link records (marker = linkMarker, non-22-zeros variant).
 *
 * Each record encodes:
 *   +134  int32 LE  coordX — attachment point on the target entity
 *   +138  int32 LE  coordY
 *   desc USTR (3rd non-style USTR after +200): "PERSON_NAME GENRE  CATEGORY TEXT"
 *
 * We extract (personName, personType, coordX, coordY).
 * The caller resolves the target event by nearest-entity spatial lookup.
 */
function parseRawLinks(bytes: Uint8Array, linkMarker: number): ANBRawLink[] {
  const results: ANBRawLink[] = [];
  const seen = new Set<number>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const SKIP_STRS = new Set(['Lien', 'Junction2StyleColour', 'Junction1StyleColour']);

  for (let pos = 0; pos < bytes.length - 200; pos++) {
    if (!isGUIDStart(bytes, pos)) continue;
    if (readU16LE(bytes, pos + 80) !== linkMarker) { pos += 79; continue; }
    if (seen.has(pos)) { pos += 79; continue; }

    // Non-22-zeros only (22-zeros records are visual header/group records)
    const afterMk = pos + 80 + 2 + 4;
    if (afterMk + 22 >= bytes.length) { pos += 79; continue; }
    let allZeros = true;
    for (let z = 0; z < 22; z++) {
      if (bytes[afterMk + z] !== 0) { allZeros = false; break; }
    }
    if (allZeros) { pos += 79; continue; }

    seen.add(pos);

    try {
      if (pos + 142 > bytes.length) { pos += 79; continue; }
      const cx = view.getInt32(pos + 134, true);
      const cy = view.getInt32(pos + 138, true);
      if (Math.abs(cx) > 200_000 || Math.abs(cy) > 200_000) { pos += 79; continue; }
      if (cx === 0 && cy === 0) { pos += 79; continue; }

      // Scan for the description USTR (first non-style USTR starting after +200)
      const r = new ANBReader(bytes);
      r.pos = pos + 200;
      const scanEnd = Math.min(r.length, pos + 700);
      let description = '';

      while (r.pos < scanEnd && !description) {
        if (!r.isUSTR()) { r.skip(1); continue; }
        const str = r.readUSTR();
        if (!str || str.length < 3) continue;
        if (str.startsWith('{')) continue;
        if (SKIP_STRS.has(str)) continue;
        if (str.includes('Colour') || str.includes('Style') || str.includes('Arrow') ||
            str.includes('Line') || str.includes('WWG_') || str.includes('LWG_')) continue;
        description = str.trim();
      }

      if (!description) { pos += 79; continue; }

      // Description format: "NAME GENRE  CATEGORY TEXT"
      // GENRE is a French gender/type keyword immediately after the name.
      const typeMatch = description.match(
        /^(.+?)\s+(HOMME|FEMME|FILLE|GAR[CÇ]ON|INCONNU\(E\)|INCONNU|PERSONNE|INDIVIDU)\b/i
      );
      const personName = typeMatch ? typeMatch[1].trim() : '';
      const personType = typeMatch ? typeMatch[2].toUpperCase() : '';

      if (personName && personName.length > 1) {
        results.push({ personName, personType, coordX: cx, coordY: cy, date: parseLinkDate(description) });
      }
    } catch {
      // Malformed record — skip
    }

    pos += 79;
  }

  return results;
}

// ============================================================================
// PERSON TYPE MAP (from link descriptions)
// ============================================================================

/**
 * Build a map: personName → personType (HOMME/FEMME/…) from raw link records.
 * Used to tag junction elements with their gender/type.
 */
function buildPersonTypeMap(rawLinks: ANBRawLink[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const rl of rawLinks) {
    if (rl.personName && rl.personType && !m.has(rl.personName)) {
      m.set(rl.personName, rl.personType);
    }
  }
  return m;
}

// ============================================================================
// RELATIONAL LINK PARSING (person-centric ANB charts)
// ============================================================================

/**
 * Signature found in 0x82E6 relational link records, at gap+4 (4 bytes after
 * a 4-zero prefix). FROM_ID is at sig+24, TO_ID at sig+28 (both u32 LE).
 */
const RELATIONAL_LINK_SIG = new Uint8Array([
  0x01, 0x00, 0x81, 0xff,
  0xc4, 0x29, 0xd6, 0x28, 0x95, 0x4c, 0x8d, 0xef, 0xa6, 0x66, 0x76, 0x3f, 0x5b, 0x70,
]);

interface RelationalLink {
  fromGuid: string;
  toGuid: string;
  typeName: string;
}

/**
 * Parse relational (person-centric) links from link records that contain the
 * RELATIONAL_LINK_SIG pattern. FROM_ID and TO_ID are sequential file-order
 * indices offset by a per-file base (= min referenced entity ID).
 */
function parseRelationalLinks(
  bytes: Uint8Array,
  entityMarkers: Set<number>,
  linkMarker: number,
): RelationalLink[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const SIG = RELATIONAL_LINK_SIG;

  // Step 1: collect ALL GUID records sorted by file offset (not just entities).
  // Link endpoint IDs are file-order indices across ALL record types,
  // so we must include entities + junctions + cards to get correct alignment.
  const allRecords: Array<{ pos: number; guid: string; marker: number }> = [];
  for (let pos = 0; pos < bytes.length - 84; pos++) {
    if (!isGUIDStart(bytes, pos)) continue;
    const mk = readU16LE(bytes, pos + 80);
    if (mk === linkMarker) { pos += 79; continue; } // skip link records themselves
    const afterMk = pos + 80 + 2 + 4;
    if (afterMk + 22 >= bytes.length) { pos += 79; continue; }
    let allZeros = true;
    for (let z = 0; z < 22; z++) {
      if (bytes[afterMk + z] !== 0) { allZeros = false; break; }
    }
    if (!allZeros) { pos += 79; continue; }
    const r = new ANBReader(bytes);
    r.pos = pos;
    const guid = r.readUSTR();
    if (guid.startsWith('{')) allRecords.push({ pos, guid, marker: mk });
    pos += 79;
  }
  allRecords.sort((a, b) => a.pos - b.pos);
  if (allRecords.length === 0) return [];

  // Build entity GUID set for endpoint filtering
  const entityGuids = new Set<string>();
  for (const rec of allRecords) {
    if (entityMarkers.has(rec.marker) || rec.marker === JUNCTION_MARKER) {
      entityGuids.add(rec.guid);
    }
  }

  // Step 2: collect raw link endpoint IDs from link records
  const SKIP_STRS_REL = new Set(['Junction2StyleColour', 'Junction1StyleColour']);
  const rawLinks: Array<{ fromId: number; toId: number; typeName: string }> = [];
  const allIds: number[] = [];

  for (let pos = 0; pos < bytes.length - 84; pos++) {
    if (!isGUIDStart(bytes, pos)) continue;
    if (readU16LE(bytes, pos + 80) !== linkMarker) { pos += 79; continue; }
    const afterMk = pos + 80 + 2 + 4;
    if (afterMk + 22 >= bytes.length) { pos += 79; continue; }
    let allZeros = true;
    for (let z = 0; z < 22; z++) {
      if (bytes[afterMk + z] !== 0) { allZeros = false; break; }
    }
    if (!allZeros) { pos += 79; continue; }

    // Find RELATIONAL_LINK_SIG
    let fromId = 0, toId = 0, sigPos = 0, found = false;
    const end = Math.min(pos + 900, bytes.length - 40);
    outer: for (let p = pos + 80; p < end; p++) {
      for (let i = 0; i < SIG.length; i++) {
        if (bytes[p + i] !== SIG[i]) continue outer;
      }
      fromId = view.getUint32(p + 24, true);
      toId   = view.getUint32(p + 28, true);
      sigPos = p;
      found = true;
      break;
    }
    if (!found) { pos += 79; continue; }

    // Find type name USTR: scan from pos+200 (typeName appears BEFORE the SIG
    // in link records, at offsets ~+192 to +224; SIG is at ~+244 to +272)
    let typeName = '';
    const r = new ANBReader(bytes);
    r.pos = pos + 200;
    const scanEnd = Math.min(r.length, sigPos);
    while (r.pos < scanEnd && !typeName) {
      if (!r.isUSTR()) { r.skip(1); continue; }
      const s = r.readUSTR();
      if (s && s.length >= 2 && !s.startsWith('{') &&
          !SKIP_STRS_REL.has(s) && !s.includes('Colour') && !s.includes('Style')) {
        typeName = s;
      }
    }

    rawLinks.push({ fromId, toId, typeName });
    if (fromId > 1) allIds.push(fromId);
    if (toId > 1) allIds.push(toId);
    pos += 79;
  }

  if (rawLinks.length === 0 || allIds.length === 0) return [];

  // Step 3: compute base ID (ID of first record = min referenced ID)
  const BASE_ID = Math.min(...allIds);
  const N = allRecords.length;

  // Step 4: build results — resolve indices against ALL records, filter to entity endpoints
  const results: RelationalLink[] = [];
  const seen = new Set<string>();
  for (const { fromId, toId, typeName } of rawLinks) {
    if (fromId <= 1 || toId <= 1) continue;
    const fromIdx = fromId - BASE_ID;
    const toIdx   = toId   - BASE_ID;
    if (fromIdx < 0 || fromIdx >= N || toIdx < 0 || toIdx >= N) continue;
    const fromGuid = allRecords[fromIdx].guid;
    const toGuid   = allRecords[toIdx].guid;
    if (!entityGuids.has(fromGuid) || !entityGuids.has(toGuid)) continue;
    // Include typeName in dedup key: same entity pair can have multiple relationship types
    const pairKey = `${fromGuid}|${toGuid}|${typeName}`;
    if (seen.has(pairKey)) continue;
    seen.add(pairKey);
    results.push({ fromGuid, toGuid, typeName });
  }
  return results;
}

/**
 * Guess entity type from label string for relational ANB charts.
 */
function detectEntityType(name: string): { tags: string[]; icon: string; color: string } {
  const n = name.trim();
  if (/^\+\d/.test(n) || /^\d[\d\s\-.()]{6,}$/.test(n)) {
    return { tags: ['i2', 'Téléphone'], icon: 'smartphone', color: '#f9a8d4' };
  }
  if (/^https?:\/\//i.test(n) || /\b(facebook|twitter|instagram|linkedin|snapchat)\b/i.test(n)) {
    return { tags: ['i2', 'Réseau social'], icon: 'globe', color: '#93c5fd' };
  }
  if (/\b(rue|avenue|cité|boulevard|allée|chemin|impasse|place|route|lotissement)\b/i.test(n) ||
      /\d{5}\s+[A-ZÉÀÈÙ]/i.test(n)) {
    return { tags: ['i2', 'Adresse'], icon: 'map-pin', color: '#fdba74' };
  }
  return { tags: ['i2', 'Personne'], icon: 'user', color: '#93c5fd' };
}

// ============================================================================
// COORDINATE CONVERSION
// ============================================================================

type HasCoords = { x: number; y: number; znX?: number; znY?: number };

/** Normalize all item positions to a 4000×3000 canvas preserving relative layout. */
function convertCoordinates(items: HasCoords[]): void {
  if (items.length === 0) return;
  if (items.length === 1) {
    items[0].znX = 400;
    items[0].znY = 300;
    return;
  }

  const xs = items.map(e => e.x);
  const ys = items.map(e => e.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const CANVAS_W = 4000, CANVAS_H = 3000, MARGIN = 200;

  for (const e of items) {
    e.znX = MARGIN + ((e.x - minX) / rangeX) * (CANVAS_W - 2 * MARGIN);
    e.znY = MARGIN + ((e.y - minY) / rangeY) * (CANVAS_H - 2 * MARGIN);
  }
}

// ============================================================================
// FIELD → PROPERTY
// ============================================================================

const KNOWN_FIELD_REFS: Record<number, { key: string; type: 'text' | 'date' | 'number' }> = {
  194: { key: 'Date de naissance', type: 'date' },
  198: { key: 'Lieu de naissance', type: 'text' },
  199: { key: 'Surnom', type: 'text' },
};

function fieldToProperty(field: { ref: number; value: string }): Property {
  const known = KNOWN_FIELD_REFS[field.ref];
  if (known) {
    if (known.type === 'date' && /^\d{2}\/\d{2}\/\d{4}$/.test(field.value)) {
      const [d, m, y] = field.value.split('/');
      return { key: known.key, value: `${y}-${m}-${d}T00:00:00.000Z`, type: 'date' };
    }
    return { key: known.key, value: field.value, type: known.type };
  }
  return { key: `Attribut ${field.ref}`, value: field.value, type: 'text' };
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

    // Parse OLE2 container
    const data = new Uint8Array(buffer);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfbData = CFB.read(data, { type: 'buffer' }) as any;

    const contentsEntry = CFB.find(cfbData, '/Contents') ?? CFB.find(cfbData, 'Contents');
    if (!contentsEntry?.content) {
      return {
        success: false, elementsImported: 0, linksImported: 0,
        assetsImported: 0, reportImported: false,
        errors: [t('errors.invalidChart')], warnings,
      };
    }

    const rawContent = contentsEntry.content;
    const contents: Uint8Array = rawContent instanceof Uint8Array
      ? rawContent
      : new Uint8Array(rawContent);

    // ── 1. Parse palette ──
    const palette = parsePalette(contents);
    const entityTypeByName = new Map(palette.entityTypes.map(et => [et.name, et]));

    // ── 2. Detect class markers ──
    const entityMarker = detectEntityMarker(contents);
    if (entityMarker === null) {
      return {
        success: false, elementsImported: 0, linksImported: 0,
        assetsImported: 0, reportImported: false,
        errors: [t('errors.invalidChart')], warnings,
      };
    }
    const linkMarker = detectLinkMarker(contents, entityMarker);

    // ── 3. Parse entities (all entity types, not just the primary marker) ──
    const allEntityMarkers = collectAllEntityMarkers(contents, linkMarker);
    // Ensure the primary entity marker is always included
    allEntityMarkers.add(entityMarker);
    const anbEntities = parseEntities(contents, allEntityMarkers);

    // ── 3.5. Parse junctions (person/object anchors, marker 0x811D) ──
    const anbJunctions = parseJunctions(contents);

    // ── 3.7. Parse ANB card records (0x818D: Programme TV + testimonies) ──
    const anbCards = parseANBCards(contents);

    // ── 4. Parse raw link records (description + attachment coords) ──
    const rawLinks = linkMarker !== null ? parseRawLinks(contents, linkMarker) : [];

    // ── 4.5. Detect chart type: relational (person-centric) vs event-centric ──
    // Relational charts use direct entity-to-entity links via CLSID signature;
    // event-centric charts use junction nodes + spatial proximity.
    const relationalLinks = linkMarker !== null
      ? parseRelationalLinks(contents, allEntityMarkers, linkMarker)
      : [];
    const isRelational = relationalLinks.length > 0;

    // ── 5. Build person type map from link descriptions ──
    const personTypeMap = buildPersonTypeMap(rawLinks);

    // ── 6. Convert coordinates (entities + junctions + cards together for correct spatial layout) ──
    convertCoordinates([...anbEntities, ...anbJunctions, ...anbCards]);

    // ── 7. GUID → ZN ElementId map ──
    const guidToElementId = new Map<string, ElementId>();

    // ── 7.5. Pre-compute entity dates from link descriptions (proximity lookup) ──
    // Each link record carries the target event's date at the end of its description.
    // We resolve the nearest entity to each link's attachment coords, then store the date.
    const entityDateMap = new Map<string, Date>(); // guid → Date
    {
      const LINK_MAX_DIST = 700;
      for (const rl of rawLinks) {
        if (!rl.date) continue;
        let minDist = Infinity;
        let nearestEntity: ANBEntity | null = null;
        for (const entity of anbEntities) {
          const dx = entity.x - rl.coordX;
          const dy = entity.y - rl.coordY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) { minDist = dist; nearestEntity = entity; }
        }
        if (nearestEntity && minDist <= LINK_MAX_DIST && !entityDateMap.has(nearestEntity.guid)) {
          entityDateMap.set(nearestEntity.guid, new Date(rl.date));
        }
      }
    }

    // ── 8. Create ZN elements for entities ──
    for (const entity of anbEntities) {
      if (!entity.guid) {
        warnings.push(t('warnings.entityNoId'));
        continue;
      }

      const znId = generateUUID() as ElementId;
      guidToElementId.set(entity.guid, znId);

      const label = entity.identity || entity.guid;
      // Skip internal i2 connector/arrow objects (WWG_ = "Wing thing" visual connectors)
      if (label.includes('WWG_') || label.includes('LWG_')) continue;
      let tags: string[];
      let color: string;
      let icon: string;

      if (isRelational) {
        // Person-centric chart: guess type from label
        const typeInfo = detectEntityType(label);
        tags  = typeInfo.tags;
        color = typeInfo.color;
        icon  = typeInfo.icon;
      } else {
        // Event-centric chart: use palette type or default to 'Événement'
        const typeInfo = entityTypeByName.size > 0
          ? [...entityTypeByName.values()].find(et => !et.isDefault)
          : null;
        tags  = ['i2', 'Événement'];
        color = TYPE_COLORS['EVENEMENT'] ?? DEFAULT_ELEMENT_VISUAL.color;
        if (typeInfo && !typeInfo.isDefault && typeInfo.color !== '#000000') color = typeInfo.color;
        icon  = typeInfo ? mapANBIcon(typeInfo.icon) : 'calendar';
      }

      const properties: Property[] = entity.fields.map(fieldToProperty);
      properties.push({ key: 'i2_entity_id', value: entity.guid, type: 'text' });

      const element: Element = {
        id: znId,
        dossierId: targetDossierId,
        label,
        notes: '',
        tags,
        properties,
        confidence: null,
        source: 'i2 ANB',
        date: entityDateMap.get(entity.guid) ?? null,
        dateRange: null,
        position: { x: entity.znX ?? 0, y: entity.znY ?? 0 },
        isPositionLocked: false,
        geo: null,
        events: entityDateMap.has(entity.guid) ? [{
          id: generateUUID(),
          date: entityDateMap.get(entity.guid)!,
          dateEnd: entityDateMap.get(entity.guid)!,
          label: '',
          source: 'i2 ANB',
        }] : [],
        visual: { ...DEFAULT_ELEMENT_VISUAL, color, icon },
        assetIds: [],
        parentGroupId: null,
        isGroup: false,
        isAnnotation: false,
        childIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.elements.add(element);
      elementsImported++;
    }

    // ── 8.5. Create ZN elements for junctions (0x811D person/object anchors) ──
    for (const junction of anbJunctions) {
      const znId = generateUUID() as ElementId;
      guidToElementId.set(junction.guid, znId);

      // Use gender/type from link descriptions if available
      const jName = junction.name.replace(/\r?\n/g, ' ').trim();
      const personType = personTypeMap.get(jName) ?? 'PERSONNE';
      const personColor = TYPE_COLORS[personType] ?? TYPE_COLORS['PERSONNE'];
      const genderTag = personType.charAt(0).toUpperCase() + personType.slice(1).toLowerCase();

      const element: Element = {
        id: znId,
        dossierId: targetDossierId,
        label: junction.name,
        notes: '',
        tags: ['i2', genderTag],
        properties: [{ key: 'i2_entity_id', value: junction.guid, type: 'text' }],
        confidence: null,
        source: 'i2 ANB',
        date: null,
        dateRange: null,
        position: { x: junction.znX ?? 0, y: junction.znY ?? 0 },
        isPositionLocked: false,
        geo: null,
        events: [],
        visual: { ...DEFAULT_ELEMENT_VISUAL, color: personColor, icon: 'user' },
        assetIds: [],
        parentGroupId: null,
        isGroup: false,
        isAnnotation: false,
        childIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.elements.add(element);
      elementsImported++;
    }

    // ── 8.7. Create ZN elements for ANB cards (0x818D: Programme TV + testimonies) ──
    if (anbCards.length > 0) {
      // Build raw-X → entity lookup for parent matching
      const entityByRawX = new Map<number, ANBEntity>();
      for (const entity of anbEntities) {
        if (!entityByRawX.has(entity.x)) entityByRawX.set(entity.x, entity);
      }

      // Group cards by parent for link creation (parent matching by nearest raw X)
      const cardParents: Array<ANBEntity | null> = [];
      for (const card of anbCards) {
        let parentEntity: ANBEntity | null = entityByRawX.get(card.x) ?? null;
        if (!parentEntity) {
          let bestDist = 2001;
          for (const entity of anbEntities) {
            const dist = Math.abs(entity.x - card.x);
            if (dist < bestDist) { bestDist = dist; parentEntity = entity; }
          }
        }
        cardParents.push(parentEntity);
      }

      for (let ci = 0; ci < anbCards.length; ci++) {
        const card = anbCards[ci];
        const parentEntity = cardParents[ci];
        const znId = generateUUID() as ElementId;
        guidToElementId.set(card.guid, znId);

        // Use original i2 coordinates converted by convertCoordinates
        const cardX = card.znX ?? 2000;
        const cardY = card.znY ?? 1500;

        const cardElement: Element = {
          id: znId,
          dossierId: targetDossierId,
          label: card.label,
          notes: '',
          tags: ['i2', 'Card'],
          properties: [{ key: 'i2_entity_id', value: card.guid, type: 'text' }],
          confidence: null,
          source: 'i2 ANB',
          date: card.date,
          dateRange: null,
          position: { x: cardX, y: cardY },
          isPositionLocked: false,
          geo: null,
          events: card.date ? [{
            id: generateUUID(),
            date: card.date,
            dateEnd: card.date,
            label: card.label,
            source: 'i2 ANB',
          }] : [],
          visual: { ...DEFAULT_ELEMENT_VISUAL, color: '#c4b5fd', icon: 'file-text' },
          assetIds: [],
          parentGroupId: null,
          isGroup: false,
          isAnnotation: false,
          childIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.elements.add(cardElement);
        elementsImported++;

        // Create link from parent entity to this card
        if (parentEntity) {
          const parentZnId = guidToElementId.get(parentEntity.guid);
          if (parentZnId) {
            const cardLink: Link = {
              id: generateUUID() as LinkId,
              dossierId: targetDossierId,
              fromId: parentZnId,
              toId: znId,
              sourceHandle: null,
              targetHandle: null,
              label: '',
              notes: '',
              tags: ['i2'],
              properties: [],
              confidence: null,
              source: 'i2 ANB',
              date: null,
              dateRange: null,
              directed: false,
              direction: 'none',
              visual: { ...DEFAULT_LINK_VISUAL },
              curveOffset: { x: 0, y: 0 },
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            await db.links.add(cardLink);
            linksImported++;
          }
        }
      }
    }

    // ── 9. Create ZN links ──
    if (isRelational) {
      // ── 9a. Relational mode: direct entity-to-entity links ──
      for (const rl of relationalLinks) {
        const fromId = guidToElementId.get(rl.fromGuid);
        const toId   = guidToElementId.get(rl.toGuid);
        if (!fromId || !toId) continue;

        const link: Link = {
          id: generateUUID() as LinkId,
          dossierId: targetDossierId,
          fromId,
          toId,
          sourceHandle: null,
          targetHandle: null,
          label: rl.typeName,
          notes: '',
          tags: ['i2', rl.typeName].filter(Boolean),
          properties: [],
          confidence: null,
          source: 'i2 ANB',
          date: null,
          dateRange: null,
          directed: false,
          direction: 'none',
          visual: { ...DEFAULT_LINK_VISUAL },
          curveOffset: { x: 0, y: 0 },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.links.add(link);
        linksImported++;
      }
    } else {
    // ── 9b. Event-centric mode: coordinate-proximity matching ──
    // Each raw link record encodes (personName, coordX, coordY).
    // coordX/Y is the attachment point on the target entity (in raw ANB units).
    // We resolve: personName → junction GUID, (coordX,coordY) → nearest event GUID.
    const LINK_MAX_DIST = 700;

    // name → junction guid lookup (junction names may contain newlines)
    const nameToJunctionGuid = new Map<string, string>();
    for (const j of anbJunctions) {
      const normalized = j.name.replace(/\r?\n/g, ' ').trim();
      nameToJunctionGuid.set(normalized, j.guid);
    }

    const createdLinkPairs = new Set<string>();

    for (const rl of rawLinks) {
      // Resolve source junction by exact or prefix name match
      let sourceGuid: string | undefined;
      for (const [jName, jGuid] of nameToJunctionGuid) {
        if (jName === rl.personName || rl.personName.startsWith(jName) || jName.startsWith(rl.personName)) {
          sourceGuid = jGuid;
          break;
        }
      }
      if (!sourceGuid) continue;

      // Find nearest event to the attachment coords
      let minDist = Infinity;
      let nearestEvent: ANBEntity | null = null;
      for (const entity of anbEntities) {
        const dx = entity.x - rl.coordX;
        const dy = entity.y - rl.coordY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) { minDist = dist; nearestEvent = entity; }
      }

      if (!nearestEvent || minDist > LINK_MAX_DIST) continue;

      const fromId = guidToElementId.get(sourceGuid);
      const toId = guidToElementId.get(nearestEvent.guid);
      if (!fromId || !toId) continue;

      const pairKey = `${fromId}|${toId}`;
      if (createdLinkPairs.has(pairKey)) continue;
      createdLinkPairs.add(pairKey);

      const link: Link = {
        id: generateUUID() as LinkId,
        dossierId: targetDossierId,
        fromId,
        toId,
        sourceHandle: null,
        targetHandle: null,
        label: '',
        notes: '',
        tags: ['i2'],
        properties: [],
        confidence: null,
        source: 'i2 ANB',
        date: null,
        dateRange: null,
        directed: false,
        direction: 'none',
        visual: { ...DEFAULT_LINK_VISUAL },
        curveOffset: { x: 0, y: 0 },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.links.add(link);
      linksImported++;
    }
    } // end else (event-centric mode)

    // ── Update dossier timestamp ──
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
