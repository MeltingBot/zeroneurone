import { parseFlexibleDate } from './index';

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
  | 'lng';

export interface FieldMapping {
  /** Whether this field is imported at all (unchecked = excluded). */
  enabled: boolean;
  target: MappingTarget;
  /** Display key used for property/source targets (defaults to the field path). */
  propKey: string;
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

/** Extract the flattened records for a chosen source. */
export function recordsForSource(data: unknown, source: RecordSource | undefined): Record<string, unknown>[] {
  if (!source) return [];
  if (source.kind === 'single') {
    const obj = getAtPath(data, source.path);
    return isPlainObject(obj) ? [flattenRecord(obj)] : [];
  }
  const arr = getAtPath(data, source.path);
  if (!Array.isArray(arr)) return [];
  return arr.filter((it) => it != null && typeof it === 'object').map((it) => flattenRecord(it));
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

/**
 * Collect the union of field paths across all records, with a representative
 * (first non-blank) sample value for each.
 */
export function collectFields(records: Record<string, unknown>[]): { key: string; sample: string }[] {
  const order: string[] = [];
  const samples = new Map<string, string>();
  for (const rec of records) {
    for (const [k, v] of Object.entries(rec)) {
      if (!samples.has(k)) { order.push(k); samples.set(k, ''); }
      if (samples.get(k) === '' && !isBlank(v)) samples.set(k, valueToString(v));
    }
  }
  return order.map((k) => ({ key: k, sample: samples.get(k) ?? '' }));
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
