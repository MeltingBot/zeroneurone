import { parseFlexibleDate } from './index';
import { parseLatLngPair } from './geo';

/**
 * Pure helpers for the "Import JSON (mapping)" feature: turn an arbitrary JSON
 * payload into a flat list of records, expose their fields, and coerce values
 * to the ZN targets the user picks. No React / store dependencies.
 */

export type MappingTarget =
  | 'ignore'
  | 'property'
  | 'date'
  | 'country'
  | 'source'
  | 'lat'
  | 'lng'
  /** Record identifier — used as the key that {@link MappingTarget} 'ref' fields point to. */
  | 'id'
  /** Reference(s) to other records' id → creates links between the created elements. */
  | 'ref'
  /** Array of coordinate pairs → element geo zone (GeoPolygon). */
  | 'polygon'
  /** URL → property of type 'link'. */
  | 'link'
  /** Single field holding "lat, lng" → element geo point. */
  | 'latlng'
  /** URL(s) to media → downloaded and attached as element assets. */
  | 'asset'
  /** Shared value → a dedup'd "pivot" node that links every record sharing it. */
  | 'pivot';

export type CoordOrder = 'latlng' | 'lnglat';

export interface FieldMapping {
  /** Whether this field is imported at all (unchecked = excluded). */
  enabled: boolean;
  target: MappingTarget;
  /** Display key used for property/source targets (defaults to the field path). */
  propKey: string;
  /** Coordinate order for 'polygon' targets. */
  coordOrder?: CoordOrder;
}

/** Config for turning an array-of-objects field into linked child elements. */
export interface ChildMapping {
  enabled: boolean;
  tag: string;
  labelTemplate: string;
  linkLabel: string;
}

/** Reusable mapping config (everything except the JSON data itself). */
export interface MappingConfig {
  labelTemplate: string;
  tagName: string;
  ignoreEmpty: boolean;
  layout: string;
  mapping: Record<string, FieldMapping>;
  childMappings: Record<string, ChildMapping>;
}

/** A saved, named mapping template, matched to incoming JSON by field signature. */
export interface JsonMappingTemplate {
  id: string;
  name: string;
  /** Sorted field keys captured at save time — used to match similar JSON shapes. */
  signature: string[];
  config: MappingConfig;
  createdAt: Date;
  updatedAt: Date;
}

/** Field-key signature of a record set (sorted), used to match saved templates. */
export function computeSignature(fields: FieldInfo[]): string[] {
  return fields.map((f) => f.key).sort();
}

/** Overlap ratio between two signatures (intersection / union), 0..1. */
export function signatureOverlap(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const sa = new Set(a), sb = new Set(b);
  let inter = 0;
  for (const k of sa) if (sb.has(k)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** True when a value looks like a polygon: an array of ≥3 [number, number] pairs. */
export function isCoordPairArray(v: unknown): boolean {
  if (!Array.isArray(v) || v.length < 3) return false;
  return v.every((p) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number' && Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

/** Detect fields whose value is a polygon coordinate array. */
export function detectPolygonFields(records: Record<string, unknown>[], fields: FieldInfo[]): Set<string> {
  const out = new Set<string>();
  for (const f of fields) {
    if (records.some((r) => isCoordPairArray(r[f.key]))) out.add(f.key);
  }
  return out;
}

/** True when a string value looks like a URL. */
export function isUrl(v: unknown): boolean {
  return typeof v === 'string' && /^(https?:\/\/|www\.)\S+$/i.test(v.trim());
}

/** Generic value-ratio detector: fields where ≥50% of non-blank values satisfy `test`. */
function detectByValue(records: Record<string, unknown>[], fields: FieldInfo[], test: (v: unknown) => boolean): Set<string> {
  const out = new Set<string>();
  for (const f of fields) {
    let total = 0, match = 0;
    for (const r of records) {
      const v = r[f.key];
      if (isBlank(v)) continue;
      total++;
      if (test(v)) match++;
    }
    if (total > 0 && match / total >= 0.5) out.add(f.key);
  }
  return out;
}

/** Detect fields whose values are mostly URLs (→ link properties). */
export function detectLinkFields(records: Record<string, unknown>[], fields: FieldInfo[]): Set<string> {
  return detectByValue(records, fields, isUrl);
}

/** Detect fields whose values are a single "lat, lng" string (→ geo point). */
export function detectLatLngFields(records: Record<string, unknown>[], fields: FieldInfo[]): Set<string> {
  return detectByValue(records, fields, (v) => typeof v === 'string' && /[,;\s]/.test(v) && parseLatLngPair(v) !== null);
}

/** Guess coordinate order: a value out of latitude range (±90) on the 1st/2nd slot reveals lng position; default lat,lng. */
export function guessCoordOrder(records: Record<string, unknown>[], key: string): CoordOrder {
  for (const r of records) {
    const v = r[key];
    if (!isCoordPairArray(v)) continue;
    for (const [a, b] of v as [number, number][]) {
      if (Math.abs(a) > 90) return 'lnglat';
      if (Math.abs(b) > 90) return 'latlng';
    }
  }
  return 'latlng';
}

/** Convert a polygon coordinate array to GeoJSON [lng, lat][] given the source order. */
export function toLngLatCoords(v: unknown, order: CoordOrder): [number, number][] {
  if (!isCoordPairArray(v)) return [];
  return (v as [number, number][]).map(([a, b]) => (order === 'latlng' ? [b, a] : [a, b]) as [number, number]);
}

export interface RecordSource {
  /** Dot-path to the source ('' = the JSON root). */
  path: string;
  /** 'array' → one record per item; 'single' → the whole object is one record. */
  kind: 'array' | 'single';
  length: number;
  depth: number;
}

/** Get a value at a dot-path inside a nested object (returns undefined if absent). */
export function getAtPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  let cur: unknown = obj;
  for (const seg of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A unique key for a record source (used as a React select value). */
export function sourceKey(s: RecordSource): string {
  return `${s.kind}:${s.path}`;
}

/** True when the payload can yield at least one record (array of objects, or a single object). */
export function isMappableJson(data: unknown): boolean {
  if (isPlainObject(data)) return true;
  if (Array.isArray(data)) return data.some((it) => isPlainObject(it));
  return false;
}

/**
 * Enumerate the possible "record sources" in a payload:
 *  - every array of objects (depth-limited), one record per item;
 *  - the whole root object as a single record (when the root is an object).
 * The user picks which one holds the records; {@link pickDefaultSource} guesses.
 */
export function findRecordSources(data: unknown, maxDepth = 4): RecordSource[] {
  const out: RecordSource[] = [];
  const walk = (node: unknown, path: string, depth: number) => {
    if (depth > maxDepth || node == null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      if (node.some((it) => isPlainObject(it))) out.push({ path, kind: 'array', length: node.length, depth });
      return;
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      walk(v, path ? `${path}.${k}` : k, depth + 1);
    }
  };
  walk(data, '', 0);
  out.sort((a, b) => a.depth - b.depth || b.length - a.length);
  if (isPlainObject(data)) out.push({ path: '', kind: 'single', length: 1, depth: 0 });
  return out;
}

/**
 * Guess the most likely record source: a direct-child array of objects wins
 * (e.g. `records`), then a root array, otherwise the whole object as a single
 * record (so a nested `content.media` array doesn't wrongly split one object).
 */
export function pickDefaultSource(sources: RecordSource[]): RecordSource | undefined {
  const directArray = sources.filter((s) => s.kind === 'array' && s.depth === 1).sort((a, b) => b.length - a.length)[0];
  if (directArray) return directArray;
  const rootArray = sources.find((s) => s.kind === 'array' && s.path === '');
  if (rootArray) return rootArray;
  const single = sources.find((s) => s.kind === 'single');
  if (single) return single;
  return sources.find((s) => s.kind === 'array');
}

/** Raw (unflattened) record objects for a chosen source — cheap, no per-record flatten. */
export function rawRecordsForSource(data: unknown, source: RecordSource | undefined): Record<string, unknown>[] {
  if (!source) return [];
  if (source.kind === 'single') {
    const obj = getAtPath(data, source.path);
    return isPlainObject(obj) ? [obj] : [];
  }
  const arr = getAtPath(data, source.path);
  if (!Array.isArray(arr)) return [];
  return arr.filter((it): it is Record<string, unknown> => it != null && typeof it === 'object');
}

/** Extract the flattened records for a chosen source. */
export function recordsForSource(data: unknown, source: RecordSource | undefined): Record<string, unknown>[] {
  return rawRecordsForSource(data, source).map((it) => flattenRecord(it));
}

/**
 * Flatten one record to dot-path → value. Scalars and arrays (of scalars) are
 * kept as-is; nested plain objects are recursed. Arrays are NOT recursed into.
 */
export function flattenRecord(obj: unknown, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!isPlainObject(obj)) {
    if (prefix) out[prefix] = obj;
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v)) {
      Object.assign(out, flattenRecord(v, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

/** Whether a value is "empty" (skipped when "ignore empty values" is on). */
export function isBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** Render a value as a string (arrays joined). Objects are JSON-stringified. */
export function valueToString(v: unknown, join = ', '): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.filter((x) => x != null && x !== '').map((x) => valueToString(x, join)).join(join);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export interface FieldInfo {
  key: string;
  sample: string;
  /** 'objectArray' = array of objects (a candidate for linked sub-elements). */
  kind: 'scalar' | 'objectArray';
}

/** True when a value is an array containing at least one object. */
export function isObjectArray(v: unknown): boolean {
  return Array.isArray(v) && v.some((it) => isPlainObject(it));
}

/**
 * Collect the union of field paths across all records, with a representative
 * (first non-blank) sample value and a kind (scalar vs array-of-objects).
 */
export function collectFields(records: Record<string, unknown>[]): FieldInfo[] {
  const order: string[] = [];
  const samples = new Map<string, string>();
  const objArr = new Map<string, boolean>();
  for (const rec of records) {
    for (const [k, v] of Object.entries(rec)) {
      if (!samples.has(k)) { order.push(k); samples.set(k, ''); objArr.set(k, false); }
      if (isObjectArray(v)) objArr.set(k, true);
      if (samples.get(k) === '' && !isBlank(v)) samples.set(k, valueToString(v));
    }
  }
  return order.map((k) => ({ key: k, sample: samples.get(k) ?? '', kind: objArr.get(k) ? 'objectArray' as const : 'scalar' as const }));
}

/** Flattened sub-fields of the items inside an array-of-objects field, across all records. */
export function childFieldsOf(records: Record<string, unknown>[], fieldKey: string): FieldInfo[] {
  const items: Record<string, unknown>[] = [];
  for (const rec of records) {
    const v = rec[fieldKey];
    if (Array.isArray(v)) for (const it of v) if (isPlainObject(it)) items.push(flattenRecord(it));
  }
  return collectFields(items);
}

/**
 * Auto-detect reference fields: scalar fields whose values are (mostly) ids of
 * other records — i.e. they point into the set of values held by the id field.
 * Returns the set of such field keys, so links can be created without the user
 * manually designating them.
 */
export function detectReferenceFields(
  records: Record<string, unknown>[],
  fields: FieldInfo[],
  idFieldKey: string | undefined,
): Set<string> {
  const refs = new Set<string>();
  if (!idFieldKey) return refs;
  const idSet = new Set<string>();
  for (const r of records) {
    const v = r[idFieldKey];
    if (!isBlank(v)) idSet.add(valueToString(v).trim());
  }
  if (idSet.size === 0) return refs;
  for (const f of fields) {
    if (f.key === idFieldKey || f.kind !== 'scalar') continue;
    let total = 0, match = 0;
    for (const r of records) {
      const v = r[f.key];
      const vals = Array.isArray(v) ? v : (isBlank(v) ? [] : [v]);
      for (const x of vals) {
        const s = valueToString(x).trim();
        if (!s) continue;
        total++;
        if (idSet.has(s)) match++;
      }
    }
    if (total > 0 && match / total >= 0.5) refs.add(f.key);
  }
  return refs;
}

/** Guess a `{path}` label template from a field set (first/last name, name-like, else first text field). */
export function guessLabelTemplate(fields: FieldInfo[]): string {
  const find = (re: RegExp) => fields.find((f) => re.test(f.key))?.key;
  const fn = find(/(^|\.)first[_]?name$/i);
  const ln = find(/(^|\.)last[_]?name$/i);
  const nameKey = find(/(^|\.)(display_?name|full_?name|name|username|title|label|activity)$/i);
  if (fn && ln) return `{${fn}} {${ln}}`;
  if (fn) return `{${fn}}`;
  if (nameKey) return `{${nameKey}}`;
  const firstText = fields.find((f) => f.kind === 'scalar' && guessTarget(f.key) === 'property' && f.sample);
  return firstText ? `{${firstText.key}}` : fields[0] ? `{${fields[0].key}}` : '';
}

/** Last segment of a dot-path, used as the default property key. */
export function lastSegment(path: string): string {
  const parts = path.split('.');
  return parts[parts.length - 1];
}

/** Heuristic default target for a freshly discovered field. */
export function guessTarget(key: string): MappingTarget {
  const k = key.toLowerCase();
  if (/(^|\.)(lat|latitude)$/.test(k)) return 'lat';
  if (/(^|\.)(lng|lon|longitude)$/.test(k)) return 'lng';
  if (/(date|birth.?date|naissance|dob|timestamp|datetime|(^|\.)(created|updated)(_?at)?$)/.test(k)) return 'date';
  if (/(country|pays|nationalit)/.test(k)) return 'country';
  if (/^id$/i.test(key)) return 'id'; // top-level record id → key for reference links
  if (/(^_|(^|\.)(id|score|offset|file|salt|hash|hashed_password|uid|vin)$)/.test(k)) return 'ignore';
  return 'property';
}

/** Apply a `{path}` template against a flattened record. */
export function applyTemplate(template: string, flat: Record<string, unknown>): string {
  return template.replace(/\{([^}]+)\}/g, (_, p) => valueToString(flat[p.trim()])).trim();
}

/** Coerce a raw value to the typed value expected by a target; null when unusable. */
export function coerceForTarget(
  value: unknown,
  target: MappingTarget,
): string | number | Date | null {
  if (isBlank(value)) return null;
  switch (target) {
    case 'date': {
      const d = parseFlexibleDate(valueToString(value));
      return d ?? null;
    }
    case 'country': {
      const s = valueToString(value).trim();
      return s.length === 2 ? s.toUpperCase() : s;
    }
    case 'lat':
    case 'lng': {
      const n = parseFloat(valueToString(value).replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    }
    default:
      return valueToString(value);
  }
}
