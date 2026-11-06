import { parseFlexibleDate } from './index';
import { parseLatLngPair } from './geo';
import { fromZonedWallClock, parseDateWithPrecision, toLocalDateKey, toLocalTimeKey } from './dates';
import type { DatePrecision, DateRange, ElementEvent, GeoData, Property } from '../types';
import { isNumericColumn, parseNumericText } from './numericText';

/**
 * Pure helpers for the "Import JSON (mapping)" feature: turn an arbitrary JSON
 * payload into a flat list of records, expose their fields, and coerce values
 * to the ZN targets the user picks. No React / store dependencies.
 */

export type MappingTarget =
  | 'ignore'
  | 'property'
  /** Number → property of type 'number' (decimal comma accepted). */
  | 'number'
  | 'date'
  | 'country'
  | 'source'
  /** Text → element description (notes); several fields are joined as paragraphs. */
  | 'notes'
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
  /** 'ref' targets: key of the record source (table) the ids point into; absent = the same table. */
  refSource?: string;
  /** 'pivot' targets: field whose element the pivot links to (the link ends,
   *  the event's element or another pivot); absent = the record's element. */
  pivotOwner?: string;
  /** Records as links: what takes the field, the link (absent) or one of its ends */
  holder?: 'link' | 'from' | 'to';
}

/** Config for turning an array-of-objects field into linked child elements. */
export interface ChildMapping {
  enabled: boolean;
  tag: string;
  labelTemplate: string;
  linkLabel: string;
  /** Each item becomes an event of the record's element instead of a linked element */
  asEvents?: boolean;
}

/**
 * A table whose records are events: each record is dated and lands on the
 * element named by `hostField` (one element per distinct value, or the
 * element of another table when the field is a reference to it).
 */
export interface EventMapping {
  hostField: string;
  dateField: string;
  /** Time of the date, when the file writes it in a column of its own */
  timeField?: string;
  endField?: string;
  endTimeField?: string;
  /** Time zone (IANA) the file writes its hours in; absent = the system one */
  timeZone?: string;
  /** The event also goes on the record's pivot elements (absent = yes) */
  alsoOnPivots?: boolean;
  /** A date written at midnight sharp marks the end of the day before (xBRL
   *  instants: a balance sheet at `2026-01-01T00:00:00` is that of 31/12/2025) */
  midnightIsDayBefore?: boolean;
}

/**
 * A table whose records are links: each record links the element named by
 * `fromField` to the one named by `toField` (one element per distinct value),
 * dated by `dateField` (and `endField`), with the other fields on the link.
 */
export interface LinkMapping {
  fromField: string;
  toField: string;
  dateField?: string;
  timeField?: string;
  endField?: string;
  endTimeField?: string;
  /** Time zone (IANA) the file writes its hours in; absent = the system one */
  timeZone?: string;
}

export type FilterOp = 'contains' | 'equals' | 'nonempty';
export interface FilterCond { field: string; op: FilterOp; value: string }

/** Settings of one table (record source) of a payload. */
export interface TableConfig {
  labelTemplate: string;
  tagName: string;
  mapping: Record<string, FieldMapping>;
  childMappings: Record<string, ChildMapping>;
  filters?: FilterCond[];
  filterMode?: 'all' | 'any';
  maxImport?: number;
  /** Reference field whose target element receives each record (its fields,
   *  sub-elements and links) instead of an element of its own. */
  mergeField?: string;
  /** Records are events of an element rather than elements; absent = elements */
  events?: EventMapping;
  /** Records are links between two elements; absent = elements */
  links?: LinkMapping;
}

/** Reusable mapping config (everything except the JSON data itself). The
 *  top-level table settings are those of the table open at save time. */
export interface MappingConfig extends TableConfig {
  ignoreEmpty: boolean;
  layout: string;
  /** Every table set up at save time, by source key; absent in single-table templates. */
  tables?: Record<string, TableConfig>;
  /** Source keys of the tables imported together. */
  included?: string[];
  /** Data the template was made on: offered for that format only (absent = JSON) */
  format?: 'json' | 'csv';
  /** Elements named like one of the dossier take its events and links instead of a copy */
  attachExisting?: boolean;
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

/** Whether a field's values are mostly numbers within ±`max` (a latitude or longitude). */
function coordinatesIn(records: Record<string, unknown>[], key: string, max: number): boolean {
  return detectByValue(records, [{ key } as FieldInfo], (v) => {
    const n = typeof v === 'number' ? v : Number(valueToString(v).trim().replace(',', '.'));
    return Number.isFinite(n) && Math.abs(n) <= max;
  }).has(key);
}

/** Detect fields whose values are mostly URLs (→ link properties). */
export function detectLinkFields(records: Record<string, unknown>[], fields: FieldInfo[]): Set<string> {
  return detectByValue(records, fields, isUrl);
}

/**
 * A "lat, lng" pair as a field holds one: exactly two numbers, each with a
 * decimal point ("48.85, 2.35", "48.85 2.35"). Phone numbers ("06 39 98 33
 * 17") and other runs of integers are not.
 */
const LATLNG_PAIR = /^\s*[-+]?\d{1,3}\.\d+\s*(?:[,;]\s*|\s+)[-+]?\d{1,3}\.\d+\s*$/;

/** Detect fields whose values are a single "lat, lng" string (→ geo point). */
export function detectLatLngFields(records: Record<string, unknown>[], fields: FieldInfo[]): Set<string> {
  return detectByValue(records, fields, (v) => typeof v === 'string' && LATLNG_PAIR.test(v) && parseLatLngPair(v) !== null);
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
  /** 'array' → one record per item (of an array, or of an object keyed by id);
   *  'single' → the whole object is one record. */
  kind: 'array' | 'single';
  length: number;
  depth: number;
  /** 'array' taken from an object keyed by id rather than an array */
  keyed?: boolean;
  /** 'single': the object holds plain values of its own (a record, not a mere wrapper) */
  hasScalars?: boolean;
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

/** Field holding the key of a record taken from an object keyed by id. */
export const RECORD_KEY_FIELD = '_key';

/**
 * An object keyed by id whose values are the records of one table
 * (`{"P1": {...}, "P2": {...}}`, the `facts` of an xBRL-JSON report): at
 * least two values, all objects, sharing a field. The sections of a single
 * record (`{"address": {...}, "contact": {...}}`) share none.
 */
export function isKeyedRecordMap(v: unknown): v is Record<string, Record<string, unknown>> {
  if (!isPlainObject(v)) return false;
  const values = Object.values(v);
  if (values.length < 2 || !values.every(isPlainObject)) return false;
  const counts = new Map<string, number>();
  for (const it of values) for (const k of Object.keys(it)) counts.set(k, (counts.get(k) ?? 0) + 1);
  const quorum = values.length * 0.8;
  for (const n of counts.values()) if (n >= quorum) return true;
  return false;
}

/**
 * Enumerate the possible "record sources" in a payload:
 *  - every array of objects (depth-limited), one record per item;
 *  - every object keyed by id ({@link isKeyedRecordMap}), one record per value;
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
    if (isKeyedRecordMap(node)) {
      out.push({ path, kind: 'array', length: Object.keys(node).length, depth, keyed: true });
      return;
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      walk(v, path ? `${path}.${k}` : k, depth + 1);
    }
  };
  walk(data, '', 0);
  out.sort((a, b) => a.depth - b.depth || b.length - a.length);
  if (isPlainObject(data)) {
    const hasScalars = Object.values(data).some((v) => v === null || typeof v !== 'object');
    out.push({ path: '', kind: 'single', length: 1, depth: 0, hasScalars });
  }
  return out;
}

/**
 * Guess the most likely record source: a direct-child array of objects wins
 * (e.g. `records`), then a root array, otherwise the whole object as a single
 * record (so a nested `content.media` array doesn't wrongly split one object).
 * An object keyed by id comes before the whole object only when the root is a
 * mere wrapper (xBRL: `documentInfo` + `facts`): in a record holding values
 * of its own (`{nom, adresses: {domicile: {...}, travail: {...}}}`), it is
 * part of that record.
 */
export function pickDefaultSource(sources: RecordSource[]): RecordSource | undefined {
  const directArray = sources.filter((s) => s.kind === 'array' && !s.keyed && s.depth === 1).sort((a, b) => b.length - a.length)[0];
  if (directArray) return directArray;
  const rootArray = sources.find((s) => s.kind === 'array' && !s.keyed && s.path === '');
  if (rootArray) return rootArray;
  const single = sources.find((s) => s.kind === 'single');
  if (!single?.hasScalars) {
    const keyed = sources.filter((s) => s.keyed && s.depth <= 1).sort((a, b) => a.depth - b.depth || b.length - a.length)[0];
    if (keyed) return keyed;
  }
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
  // Keyed by id: the key becomes a field of the record (unless it has one so named)
  if (isKeyedRecordMap(arr)) {
    return Object.entries(arr).map(([k, rec]) => (RECORD_KEY_FIELD in rec ? rec : { [RECORD_KEY_FIELD]: k, ...rec }));
  }
  if (!Array.isArray(arr)) return [];
  return arr.filter((it): it is Record<string, unknown> => it != null && typeof it === 'object');
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

const SAMPLE_MAX = 300;

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
      // A sample is a glimpse: a value can be megabytes of text (xBRL text blocks)
      if (samples.get(k) === '' && !isBlank(v)) samples.set(k, valueToString(v).slice(0, SAMPLE_MAX));
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
/**
 * Comparison form of an id. A CSV converted to JSON writes the same number as
 * 12, "12", 12.0, "12.0" or "012": they are one id. Anything else (codes like
 * "P-12", "2024/0153") is compared as trimmed text.
 */
export function idKey(v: unknown): string {
  const s = valueToString(v).trim();
  if (/^[+-]?\d+(\.0+)?$/.test(s)) return String(parseInt(s, 10));
  return s;
}

/**
 * A field holding the record's own id again (a number copied under another
 * name, e.g. UNA = id): on ≥ 95 % of the records where both are set they are
 * equal. Such a field identifies the record; it does not point to another one.
 */
export function isIdAlias(records: Record<string, unknown>[], fieldKey: string, idFieldKey: string | undefined): boolean {
  if (!idFieldKey || fieldKey === idFieldKey) return false;
  let both = 0, equal = 0;
  for (const r of records) {
    const a = r[fieldKey], b = r[idFieldKey];
    if (isBlank(a) || isBlank(b) || Array.isArray(a)) continue;
    both++;
    if (idKey(a) === idKey(b)) equal++;
  }
  return both > 0 && equal / both >= 0.95;
}

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
    if (!isBlank(v)) idSet.add(idKey(v));
  }
  if (idSet.size === 0) return refs;
  for (const f of fields) {
    if (f.key === idFieldKey || f.kind !== 'scalar' || isIdAlias(records, f.key, idFieldKey)) continue;
    let total = 0, match = 0;
    for (const r of records) {
      const v = r[f.key];
      const vals = Array.isArray(v) ? v : (isBlank(v) ? [] : [v]);
      for (const x of vals) {
        const s = idKey(x);
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

/**
 * Default columns of an event table. The label: a category column (few
 * distinct values, like a type: "Appel entrant"), named like one (type,
 * nature, category, action…) first; none gives an empty template, and the
 * event takes the tag or the element's name. The element: the first column
 * that is no date, no number, no category and no per-row id.
 */
export function guessEventFields(
  records: Record<string, unknown>[],
  fields: FieldInfo[],
  isDate: (key: string) => boolean,
): { hostField: string; dateField: string; labelTemplate: string } {
  const scalar = fields.filter((f) => f.kind === 'scalar');
  const stats = new Map(scalar.map((f) => {
    const values = records.map((r) => r[f.key]).filter((v) => !isBlank(v)).map((v) => valueToString(v));
    return [f.key, { filled: values.length, distinct: new Set(values).size, numeric: isNumericColumn(values) }];
  }));
  const dateField = scalar.find((f) => isDate(f.key))?.key ?? scalar[0]?.key ?? '';
  const isCategory = (k: string) => { const st = stats.get(k)!; return !st.numeric && st.distinct >= 2 && st.distinct <= 20; };
  const perRow = (k: string) => { const st = stats.get(k)!; return st.filled > 1 && st.distinct === st.filled; };

  // A name is no kind of event: it names the element
  const categories = scalar.filter((f) => !isDate(f.key) && isCategory(f.key) && !isNameColumn(f.key));
  const named = categories.find((f) => /(^|[._\s-])(type|nature|cat[eé]gor|kind|event|[eé]v[eé]nement|action|statut|status)/i.test(lastSegment(f.key)));
  const fewest = [...categories].sort((a, b) => stats.get(a.key)!.distinct - stats.get(b.key)!.distinct)[0];
  const label = named ?? fewest;

  const plain = (f: FieldInfo) => f.key !== dateField && !isDate(f.key) && f.key !== label?.key;
  const constant = (k: string) => stats.get(k)!.distinct <= 1;
  // A name column first ("nom", "last_name"), then a column
  // that is no number, no category and no per-row id, one with several values
  // before a constant one
  const nameColumn = (f: FieldInfo) => plain(f) && isNameColumn(f.key) && !stats.get(f.key)!.numeric && !constant(f.key);
  const ordinary = (f: FieldInfo) => plain(f) && !stats.get(f.key)!.numeric && !isCategory(f.key) && !perRow(f.key);
  const varied = (f: FieldInfo) => plain(f) && !stats.get(f.key)!.numeric && !perRow(f.key) && !constant(f.key);
  const hostField = scalar.find(nameColumn)?.key
    ?? scalar.find((f) => ordinary(f) && !constant(f.key))?.key
    ?? scalar.find(varied)?.key
    ?? scalar.find(ordinary)?.key
    ?? scalar.find(plain)?.key ?? '';
  return { hostField, dateField, labelTemplate: label ? `{${label.key}}` : '' };
}

/** A column naming someone or something: "name", "nom_client", "last_name", "ownerName" */
function isNameColumn(key: string): boolean {
  return /name$/i.test(lastSegment(key)) || nameWords(key).some((w) => w === 'name' || w === 'nom');
}
/** A time of day alone: "08:30", "08:30:15" */
const TIME_RE = /^\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

/** Whether every filled value of a column is a time of day */
function isTimeColumn(records: Record<string, unknown>[], key: string): boolean {
  let seen = false;
  for (const r of records) {
    const v = r[key];
    if (isBlank(v)) continue;
    if (!TIME_RE.test(valueToString(v).trim())) return false;
    seen = true;
  }
  return seen;
}

/**
 * Column holding the time of a date column, when the file splits them: the
 * one named like it ("date_appel" → "heure_appel"),
 * else the column right after it. Only columns of times qualify.
 */
export function guessTimeField(records: Record<string, unknown>[], fields: FieldInfo[], dateKey: string | undefined): string | undefined {
  if (!dateKey) return undefined;
  const times = fields.filter((f) => f.kind === 'scalar' && f.key !== dateKey && isTimeColumn(records, f.key));
  if (times.length === 0) return undefined;
  const stem = (k: string) => k.toLowerCase().replace(/date|time|heure|hour/g, '');
  const sameName = times.find((f) => stem(f.key) === stem(dateKey));
  if (sameName) return sameName.key;
  const at = fields.findIndex((f) => f.key === dateKey);
  const next = fields[at + 1];
  return next && times.some((f) => f.key === next.key) ? next.key : undefined;
}

/**
 * Default columns of a link table: the two ends are the first two name
 * columns, else the first two text columns that are no
 * date, number or category; the date and its time as for events.
 */
export function guessLinkFields(
  records: Record<string, unknown>[],
  fields: FieldInfo[],
  isDate: (key: string) => boolean,
): LinkMapping {
  const scalar = fields.filter((f) => f.kind === 'scalar');
  const stats = new Map(scalar.map((f) => {
    const values = records.map((r) => r[f.key]).filter((v) => !isBlank(v)).map((v) => valueToString(v));
    return [f.key, { filled: values.length, distinct: new Set(values).size, numeric: isNumericColumn(values) }];
  }));
  const text = (f: FieldInfo) => !isDate(f.key) && !stats.get(f.key)!.numeric && !isTimeColumn(records, f.key);
  const named = scalar.filter((f) => text(f) && isNameColumn(f.key));
  // Not a per-row id (a reference number names no end)
  const others = scalar.filter((f) => {
    const st = stats.get(f.key)!;
    return text(f) && st.distinct > 1 && !(st.filled > 1 && st.distinct === st.filled);
  });
  // Then any text column: few records can make every column look constant or per-row
  const ends = [...new Set([...named, ...others, ...scalar.filter(text)].map((f) => f.key))];
  const dateField = scalar.find((f) => isDate(f.key) && records.some((r) => recordDate(r[f.key])))?.key;
  return {
    fromField: ends[0] ?? '',
    toField: ends[1] ?? '',
    dateField,
    timeField: guessTimeField(records, fields, dateField),
  };
}

/** Last segment of a dot-path, used as the default property key. */
export function lastSegment(path: string): string {
  const parts = path.split('.');
  return parts[parts.length - 1];
}

/**
 * Words of a field name: "borne_lat", "lat-borne", "cellLat" and "Latitude
 * site" all hold a latitude word.
 */
function nameWords(key: string): string[] {
  return lastSegment(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[\s_\-.]+/)
    .filter(Boolean);
}

const LAT_WORDS = new Set(['lat', 'latitude']);
const LNG_WORDS = new Set(['lng', 'lon', 'long', 'longitude']);

/** Heuristic default target for a freshly discovered field. */
export function guessTarget(key: string): MappingTarget {
  const k = key.toLowerCase();
  const words = nameWords(key);
  if (words.some((w) => LAT_WORDS.has(w))) return 'lat';
  if (words.some((w) => LNG_WORDS.has(w))) return 'lng';
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
      const s = valueToString(value);
      return parseFlexibleDate(s) ?? compactDate(s)?.date ?? null;
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
    case 'number':
      // A value that is no number stays as its text rather than being lost
      return typeof value === 'number' ? value : (parseNumericText(valueToString(value)) ?? valueToString(value));
    default:
      return valueToString(value);
  }
}

// ─── Several tables in one payload ─────────────────────────────────────────

/** Ids held by a record set under its id field (blank ones skipped). */
export function idValuesOf(records: Record<string, unknown>[], idFieldKey: string | undefined): Set<string> {
  const ids = new Set<string>();
  if (!idFieldKey) return ids;
  for (const r of records) {
    const v = r[idFieldKey];
    if (!isBlank(v)) ids.add(idKey(v));
  }
  return ids;
}

/** A table other records may point into: its source key, a display name and its ids. */
export interface SourceIds {
  key: string;
  name: string;
  ids: Set<string>;
}

/**
 * Comparable stem of a table or field name: "societes" / "societe_id" /
 * "SocieteId" / "id_societe" / "IdSociete" → "societe".
 */
export function nameStem(name: string): string {
  return lastSegment(name)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/(?<=[a-z])Ids?$/, '')
    .replace(/^id(?=[A-Z])|^id[_\-\s]+/i, '')
    .toLowerCase()
    .replace(/[_\-\s]?(ids?|ref|refs|key)$/, '')
    .replace(/ies$/, 'y')
    .replace(/s$/, '');
}

/**
 * Cross-table references: scalar fields whose values are mostly (≥ 50 %) ids
 * of another table, mapped to that table's key. When several tables match —
 * small numeric ids often exist in each of them — the one whose name matches
 * the field ("societe_id" → "societes") wins, else the best match. A field that
 * matches its own table's ids just as well is left to {@link detectReferenceFields}
 * unless its name points to another table.
 */
export function detectCrossReferences(
  records: Record<string, unknown>[],
  fields: FieldInfo[],
  ownIdKey: string | undefined,
  ownIds: Set<string>,
  others: SourceIds[],
): Map<string, string> {
  const result = new Map<string, string>();
  if (others.length === 0) return result;
  for (const f of fields) {
    if (f.kind !== 'scalar' || f.key === ownIdKey || isIdAlias(records, f.key, ownIdKey)) continue;
    const vals: string[] = [];
    for (const r of records) {
      const v = r[f.key];
      for (const x of Array.isArray(v) ? v : (isBlank(v) ? [] : [v])) {
        const s = idKey(x);
        if (s) vals.push(s);
      }
    }
    if (vals.length === 0) continue;
    const ratio = (ids: Set<string>) => vals.filter((v) => ids.has(v)).length / vals.length;
    const stem = nameStem(f.key);
    // "procedure_id" names "procedures", and "crpj_Procédure" too (prefix shared by the tables)
    const names = (table: string) => {
      const t = nameStem(table);
      return stem !== '' && (t === stem || /[_\-\s.]/.test(t.charAt(t.length - stem.length - 1)) && t.endsWith(stem));
    };
    const candidates = others
      .map((o) => ({ o, r: ratio(o.ids), named: names(o.name) }))
      .filter((c) => c.r >= 0.5)
      .sort((a, b) => Number(b.named) - Number(a.named) || b.r - a.r);
    const best = candidates[0];
    if (!best) continue;
    const ownRatio = ownIds.size > 0 ? ratio(ownIds) : 0;
    if (!best.named && ownRatio >= best.r) continue; // as good inside its own table
    result.set(f.key, best.o.key);
  }
  return result;
}

/** Default mapping of a record set's fields, as the import opens it. */
export function autoFieldMappings(
  records: Record<string, unknown>[],
  scalarFields: FieldInfo[],
  childArrayFields: FieldInfo[],
  crossRefs: Map<string, string> = new Map(),
): { mapping: Record<string, FieldMapping>; childMappings: Record<string, ChildMapping>; labelTemplate: string } {
  const idFieldKey = scalarFields.find((f) => guessTarget(f.key) === 'id')?.key;
  const refSet = detectReferenceFields(records, scalarFields, idFieldKey);
  const polySet = detectPolygonFields(records, scalarFields);
  const latlngSet = detectLatLngFields(records, scalarFields);
  const linkSet = detectLinkFields(records, scalarFields);
  const mapping: Record<string, FieldMapping> = {};
  for (const f of scalarFields) {
    const g = guessTarget(f.key);
    const crossTarget = crossRefs.get(f.key);
    if (polySet.has(f.key)) {
      mapping[f.key] = { enabled: true, target: 'polygon', propKey: lastSegment(f.key), coordOrder: guessCoordOrder(records, f.key) };
    } else if (latlngSet.has(f.key)) {
      // Single field holding "lat, lng" → geo point.
      mapping[f.key] = { enabled: true, target: 'latlng', propKey: lastSegment(f.key) };
    } else if (crossTarget) {
      // Ids of another table → links to its elements, labelled after the field.
      mapping[f.key] = { enabled: true, target: 'ref', propKey: '', refSource: crossTarget };
    } else if (refSet.has(f.key)) {
      // Reference field → create links; empty label by default (cleaner than the field name).
      mapping[f.key] = { enabled: true, target: 'ref', propKey: '' };
    } else if (linkSet.has(f.key)) {
      // URL → link-typed property.
      mapping[f.key] = { enabled: true, target: 'link', propKey: lastSegment(f.key) };
    } else if ((g === 'lat' || g === 'lng') && !coordinatesIn(records, f.key, g === 'lat' ? 90 : 180)) {
      // Named like a coordinate but holding something else ("long_description")
      mapping[f.key] = { enabled: true, target: 'property', propKey: lastSegment(f.key) };
    } else if (g === 'property' && isNumericColumn(records.map((r) => r[f.key]))) {
      // Every value a number (phone numbers, postcodes and long ids excluded)
      mapping[f.key] = { enabled: true, target: 'number', propKey: lastSegment(f.key) };
    } else {
      // Noise fields (id, hash, score…) and columns empty in every record
      // start disabled but keep a sane target if re-enabled.
      const empty = records.length > 0 && records.every((r) => isBlank(r[f.key]));
      mapping[f.key] = { enabled: g !== 'ignore' && !empty, target: g === 'ignore' ? 'property' : g, propKey: lastSegment(f.key) };
    }
  }
  // Child (linked sub-element) config per array-of-objects field — disabled by default.
  const childMappings: Record<string, ChildMapping> = {};
  for (const f of childArrayFields) {
    const sub = childFieldsOf(records, f.key);
    const tag = lastSegment(f.key);
    childMappings[f.key] = { enabled: false, tag, labelTemplate: guessLabelTemplate(sub), linkLabel: tag };
  }
  return { mapping, childMappings, labelTemplate: guessLabelTemplate(scalarFields) };
}


/**
 * Tables keyed by a shared id: in some exports (e.g. a CSV per entity, all
 * carrying the case number in "id") the id of the child tables is not their
 * own row number but the id of a hub record. The hub is the table whose ids
 * are unique and hold (≥ 90 %) the ids of the most other tables; those tables
 * ("members") then point their id at the hub. No hub when ids are only row
 * numbers of their own tables.
 */
export function findSharedIdHub(
  tables: { key: string; ids: Set<string>; unique: boolean }[],
): { hub: string | null; members: Set<string> } {
  const within = (inner: Set<string>, outer: Set<string>) => {
    if (inner.size === 0) return 0;
    let n = 0;
    for (const id of inner) if (outer.has(id)) n++;
    return n / inner.size;
  };
  let hub: string | null = null;
  let best = new Set<string>();
  for (const candidate of tables) {
    if (!candidate.unique || candidate.ids.size === 0) continue;
    const members = new Set(
      tables.filter((t) => t.key !== candidate.key && within(t.ids, candidate.ids) >= 0.9).map((t) => t.key),
    );
    // Most tables held wins; on a tie, the larger id set (the hub holds its members)
    const better = members.size > best.size
      || (members.size === best.size && members.size > 0 && hub !== null
        && candidate.ids.size > (tables.find((t) => t.key === hub)?.ids.size ?? 0));
    if (better) { hub = candidate.key; best = members; }
  }
  return best.size > 0 ? { hub, members: best } : { hub: null, members: new Set() };
}

/**
 * Date of a record value, with its precision ("2020" is a year, "2020-03" a
 * month): the precise parser first, then the flexible one (French dates,
 * timestamps with time). Null when the value is no date.
 */
export function recordDate(v: unknown): { date: Date; precision?: DatePrecision; approximate: boolean } | null {
  if (isBlank(v)) return null;
  const precise = parseDateWithPrecision(typeof v === 'string' ? v : valueToString(v));
  if (precise) return precise;
  const flexible = parseFlexibleDate(valueToString(v));
  return flexible ? { date: flexible, approximate: false } : null;
}

/** Two property values alike: the same instant for dates, the same text otherwise */
export function sameValue(a: unknown, b: unknown): boolean {
  const time = (v: unknown) => (v instanceof Date ? v.getTime() : typeof v === 'string' && !Number.isNaN(Date.parse(v)) && /^\d{4}-\d{2}-\d{2}T/.test(v) ? Date.parse(v) : null);
  const ta = time(a), tb = time(b);
  if (ta !== null && tb !== null) return ta === tb;
  return String(a) === String(b);
}

/**
 * A date written as 8 digits, without separators: `19790329` (year first) or
 * `29031979` (day first). Years 1900-2100 only, so the two readings never
 * both hold. Read only in a column chosen as a date: elsewhere 8 digits are
 * more often an id.
 */
export function compactDate(v: unknown): { date: Date; precision: DatePrecision; approximate: boolean } | null {
  const m = /^(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(valueToString(v).trim());
  if (!m) return null;
  const valid = (y: number, mo: number, d: number) => {
    if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1) return null;
    const date = new Date(y, mo - 1, d);
    return date.getMonth() === mo - 1 ? date : null;
  };
  const [a, b, c, d] = m.slice(1).map(Number);
  const date = valid(a * 100 + b, c, d) ?? valid(c * 100 + d, b, a);
  return date ? { date, precision: 'day', approximate: false } : null;
}

/** Date of a column chosen as a date: as {@link recordDate}, compact dates too */
export function mappedDate(v: unknown): RecordDate | null {
  return recordDate(v) ?? compactDate(v);
}

/** A record date; `zoned` when its hour was read in the file's time zone */
export type RowDate = RecordDate & { zoned?: boolean };

/**
 * Date of a record from its date column and, when the file writes it apart,
 * its time column ("2020-03-14" + "08:30"). A time that cannot be read
 * leaves the day. With `timeZone`, the hour written is that zone's (see
 * {@link inTimeZone}). Null when the record has no valid date.
 */
export function rowDate(flat: Record<string, unknown>, dateField: string, timeField?: string, timeZone?: string): RowDate | null {
  const text = valueToString(flat[dateField]);
  const d = mappedDate(flat[dateField]);
  if (!d) return null;
  const time = timeField ? TIME_PARTS_RE.exec(valueToString(flat[timeField]).trim()) : null;
  if (!time) return inTimeZone(d, text, timeZone);
  const [h, mi, s] = [Number(time[1]), Number(time[2]), Number(time[3] ?? 0)];
  if (h > 23 || mi > 59 || s > 59) return inTimeZone(d, text, timeZone);
  const date = new Date(d.date);
  date.setHours(h, mi, s, 0);
  return inTimeZone({ date, approximate: d.approximate }, text, timeZone, true);
}

const HAS_TIME_RE = /\d{1,2}:\d{2}/;
const ZONED_TEXT_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * A date whose hour was written in `timeZone`: the same wall clock, as that
 * zone's instant. Left as read: a date without an hour (a calendar day stays
 * that day), and a date written with its own offset (an exact instant).
 */
export function inTimeZone(d: RecordDate, text: string, timeZone: string | undefined, timeApart = false): RowDate {
  const t = text.trim();
  if (!timeZone || ZONED_TEXT_RE.test(t) || (!timeApart && !HAS_TIME_RE.test(t))) return d;
  const local = d.date;
  const instant = fromZonedWallClock(toLocalDateKey(local), toLocalTimeKey(local), timeZone);
  return { ...d, date: new Date(instant.getTime() + local.getSeconds() * 1000 + local.getMilliseconds()), zoned: true };
}

const TIME_PARTS_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/;

/**
 * Dates of a record that is a link: start (and end) from the mapped columns,
 * or an ISO interval in the date column. Without an end the link is dated
 * at its start (an open end would last until today on the timeline).
 * `unread`: the date column holds something that is no date.
 */
export function linkDates(flat: Record<string, unknown>, lk: LinkMapping): { range: DateRange | null; unread: boolean } {
  if (!lk.dateField || isBlank(flat[lk.dateField])) return { range: null, unread: false };
  const interval = lk.endField ? null : zonedInterval(flat[lk.dateField], lk.timeZone);
  const start = interval ? interval.start : rowDate(flat, lk.dateField, lk.timeField, lk.timeZone);
  if (!start) return { range: null, unread: true };
  const end = interval ? interval.end : lk.endField ? rowDate(flat, lk.endField, lk.endTimeField, lk.timeZone) : null;
  const range: DateRange = {
    start: start.date,
    end: end && end.date.getTime() >= start.date.getTime() ? end.date : start.date,
  };
  if (start.precision && start.precision !== 'day') range.precision = start.precision;
  if (start.approximate) range.approximate = true;
  if (start.zoned && lk.timeZone) range.timeZone = lk.timeZone;
  return { range, unread: false };
}

const ISO_BOUND_RE =/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?$/i;
const MIDNIGHT_RE = /[T ]00:00(?::00(?:\.0+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/i;

type RecordDate = NonNullable<ReturnType<typeof recordDate>>;

/**
 * ISO 8601 interval in one value, "start/end" (`2025-01-01/2025-12-31`,
 * `2025-01-01T00:00:00/2026-01-01T00:00:00`). An end written at midnight is
 * exclusive: the period stops the day before (xBRL periods are written so),
 * and so the interval reads as whole days. Null when the value is no interval.
 */
export function isoInterval(v: unknown): { start: RecordDate; end: RecordDate } | null {
  if (typeof v !== 'string') return null;
  const parts = v.trim().split('/');
  if (parts.length !== 2 || !parts.every((p) => ISO_BOUND_RE.test(p))) return null;
  const start = recordDate(parts[0]);
  const end = recordDate(parts[1]);
  if (!start || !end) return null;
  if (MIDNIGHT_RE.test(parts[1]) && end.date.getTime() > start.date.getTime()) {
    const last = new Date(end.date);
    last.setDate(last.getDate() - 1);
    if (last.getTime() >= start.date.getTime()) return { start, end: { ...end, date: last } };
  }
  return { start, end };
}

/** {@link isoInterval} with its hours read in the file's time zone */
function zonedInterval(v: unknown, timeZone: string | undefined): { start: RowDate; end: RowDate } | null {
  const interval = isoInterval(v);
  if (!interval || !timeZone) return interval;
  const [a, b] = valueToString(v).trim().split('/');
  // An end at midnight sharp is a day boundary (exclusive end), not an hour
  return { start: inTimeZone(interval.start, a, timeZone), end: MIDNIGHT_RE.test(b) ? interval.end : inTimeZone(interval.end, b, timeZone) };
}

/**
 * Event of a record: dated by `dateField` (and `endField`), with the other
 * mapped fields as its description, source, place and properties. Null when
 * the record has no valid date (an event needs one).
 */
export function buildEvent(
  flat: Record<string, unknown>,
  label: string,
  fields: { dateField: string; timeField?: string; endField?: string; endTimeField?: string; midnightIsDayBefore?: boolean; timeZone?: string },
  extra: { properties: Property[]; source: string; notes: string; geo: GeoData | null },
): ElementEvent | null {
  // A date at midnight sharp read as the end of the day before, when asked
  const read = (key: string, timeKey?: string): RowDate | null => {
    // Midnight sharp as the end of the day before: a day boundary, read without the zone
    const dayBefore = !timeKey && !!fields.midnightIsDayBefore && MIDNIGHT_RE.test(valueToString(flat[key]).trim());
    const d = rowDate(flat, key, timeKey, dayBefore ? undefined : fields.timeZone);
    if (!d || !dayBefore) return d;
    const prev = new Date(d.date);
    prev.setDate(prev.getDate() - 1);
    return { ...d, date: prev };
  };
  const interval = fields.endField ? null : zonedInterval(flat[fields.dateField], fields.timeZone);
  const start = interval ? interval.start : read(fields.dateField, fields.timeField);
  if (!start) return null;
  const end = interval ? interval.end : fields.endField ? read(fields.endField, fields.endTimeField) : null;
  const event: ElementEvent = { id: crypto.randomUUID(), date: start.date, label };
  if (end && end.date.getTime() >= start.date.getTime()) event.dateEnd = end.date;
  if (start.precision) event.precision = start.precision;
  if (start.approximate) event.approximate = true;
  if (start.zoned && fields.timeZone) event.timeZone = fields.timeZone;
  if (extra.notes) event.description = extra.notes;
  if (extra.source) event.source = extra.source;
  if (extra.geo) event.geo = extra.geo;
  if (extra.properties.length > 0) event.properties = extra.properties;
  return event;
}
