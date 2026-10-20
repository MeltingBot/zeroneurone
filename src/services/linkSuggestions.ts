/**
 * Link suggestions: links the analyst has not drawn yet but the data points to.
 *
 * Pure functions over the dossier (elements, links, assets): nothing is created
 * here, the panel shows the suggestions and the analyst accepts or dismisses
 * them. Three rules, each structural (no entity type assumed):
 *   - sharedValue  : the same value under the same property key (phone, IBAN…)
 *   - sharedSource : the same attached file or web source
 *   - inZone       : an element's position falls inside another element's zone
 *   - nearby       : two points closer than a radius the analyst picks
 *   - meeting      : two elements at the same place at the same time — dated,
 *                    located events (or the element's own date and position),
 *                    within the radius and a time window the analyst picks
 *
 * A value shared by two elements gives a link between them. Shared by three or
 * more, it gives a pivot: one element for the value, linked to all of them —
 * or the existing element already carrying that value as its label.
 *
 * Ids are deterministic so a dismissal still matches when the analysis runs
 * again. A link suggestion is dismissed reason by reason (pair + rule, + key
 * for a shared value): setting aside "80 m apart" must not hide the same pair
 * when it later shares a phone number. Dismissals are stored in the dossier
 * (synced, exported): a pivot id carries a digest of the value, never the value
 * itself (a phone number, an IBAN…).
 */
import type { Asset, Element, Link } from '../types';
import { closestPointOnPolygon, computePolygonAreaKm2, getGeoCenter, isGeoPolygon, pointInPolygon } from '../utils/geo';
import { assetHashOf, findAssetByHash, isWebScheme, parseSourceLinks } from '../utils/sourceLinks';

export type SuggestionRule = 'sharedValue' | 'sharedSource' | 'inZone' | 'nearby' | 'meeting';

export interface SuggestionReason {
  rule: SuggestionRule;
  /** Property key (sharedValue) */
  key?: string;
  /** Value as written in the data (sharedValue, sharedSource: file name or URL) */
  value?: string;
  /** nearby, meeting: distance between the two points, in metres */
  distance?: number;
  /** meeting: the first co-presence — when both were there (ISO; date and
   *  dateOther equal), or the two times when the window bridged a gap — and
   *  how many co-presences were found */
  date?: string;
  dateOther?: string;
  count?: number;
  /** sharedSource: the shared file, or the shared web page */
  assetId?: string;
  url?: string;
}

export interface LinkSuggestion {
  kind: 'link';
  id: string;
  /** From → to. For inZone: the contained element → the zone */
  fromId: string;
  toId: string;
  reasons: SuggestionReason[];
}

export interface PivotSuggestion {
  kind: 'pivot';
  id: string;
  reason: SuggestionReason & { rule: 'sharedValue' | 'sharedSource' };
  /** Elements to link to the pivot (never includes the pivot itself) */
  memberIds: string[];
  /** Existing element carrying the value as label: link to it instead of creating one */
  existingId: string | null;
}

export type Suggestion = LinkSuggestion | PivotSuggestion;

export interface SuggestionOptions {
  /** Suggestion ids the analyst dismissed */
  dismissed?: ReadonlySet<string>;
  /** Only suggestions involving at least one of these elements */
  scope?: ReadonlySet<string> | null;
  /** nearby rule radius in metres; absent or null turns the rule off */
  nearbyRadius?: number | null;
  /** meeting rule radius (metres) and time window (ms); absent or null turns it off */
  meeting?: {
    radius: number;
    window: number;
    /** Longest presence counted, in ms (default a week); null for no limit */
    maxPresence?: number | null;
  } | null;
  /**
   * Elements the analysis works on (those the views show: filters, query,
   * tab, hidden elements applied), null for all. Links and existing pivots are
   * still read from the whole dossier: a pair linked to a filtered-out element
   * is linked, and a filtered-out element carrying the value is still the pivot.
   */
  candidateIds?: ReadonlySet<string> | null;
  /** Rules without settings, each on unless set to false */
  rules?: { sharedValue?: boolean; sharedSource?: boolean; inZone?: boolean };
  /**
   * Only suggestions joining an element tagged `a` to one tagged `b` (the same
   * tag twice: within it). The places rule then compares every `a` with every
   * `b`, crowds included — the analyst drew both sets — and measures up to the
   * edge of a zone.
   */
  between?: { a: string; b: string } | null;
}

/**
 * Free text shared by more than this share of the elements having the key is
 * noise (a status, a bank name). Identifiers are exempt: four victims out of
 * six paying the same IBAN is the finding, not noise.
 */
const MAX_SHARE_RATIO = 0.5;
/** …checked only from this many elements having the key (two of two is a real match) */
const RATIO_MIN_ELEMENTS = 5;
/** Values shared by more elements than this are ignored (a city, a country…) */
const MAX_GROUP_SIZE = 50;
const MIN_VALUE_LENGTH = 3;
const BOOLEAN_TOKENS = new Set([
  'oui', 'non', 'yes', 'no', 'true', 'false', 'vrai', 'faux', 'n/a', 'na', 'null', 'none', 'aucun', 'inconnu', 'unknown',
]);

/**
 * A date or date-time written as text (2020-11-27, 27/11/2020, 2020-11-27 15:47:12,
 * ISO). Imports store every property as text: a date shared by many elements is
 * noise, not an identifier — and it must not be read as a phone number.
 */
const DATE_LIKE = [
  /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}([ T]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?(z|[+-]\d{2}:?\d{2})?)?$/i,
  /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}([ T]\d{1,2}:\d{2}(:\d{2})?)?$/,
];
export function isDateLike(text: string): boolean {
  const t = text.trim();
  return DATE_LIKE.some(re => re.test(t));
}

/**
 * Comparison form of a property value, or null when it cannot identify anything.
 * Phone numbers keep their digits (French +33 / 0033 folded to 0), emails are
 * lowercased, identifiers (IBAN, SIREN, plates…) lose their separators, any
 * other text is lowercased with spaces collapsed.
 */
export function normalizeValue(raw: unknown): string | null {
  if (raw === null || raw === undefined || typeof raw === 'boolean') return null;
  const text = String(raw).trim();
  if (!text) return null;

  let value: string;
  if (isDateLike(text)) {
    value = text.toLowerCase().replace(/\s+/g, ' ');
  } else if (/^\+?[\d\s.\-()/]+$/.test(text) && text.replace(/\D/g, '').length >= 8) {
    value = text.replace(/\D/g, '');
    if (value.startsWith('0033')) value = `0${value.slice(4)}`;
    else if (value.startsWith('33') && value.length === 11) value = `0${value.slice(2)}`;
  } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    value = text.toLowerCase();
  } else if (/^[A-Za-z0-9][A-Za-z0-9 .-]*$/.test(text) && (text.match(/\d/g)?.length ?? 0) >= 3) {
    value = text.replace(/[\s.-]/g, '').toLowerCase();
  } else {
    value = text.toLowerCase().replace(/\s+/g, ' ');
  }

  if (value.length < MIN_VALUE_LENGTH || BOOLEAN_TOKENS.has(value)) return null;
  return value;
}

/**
 * Short non-reversible-at-a-glance digest (cyrb53) of a pivot's rule, key and
 * value. Not a security measure — a phone number space can be enumerated —
 * but the dossier no longer reads out the values the analyst set aside.
 */
function digest(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function pivotId(rule: string, key: string | undefined, normValue: string): string {
  return `pivot:${digest(`${rule}\u0000${key ?? ''}\u0000${normValue}`)}`;
}

/** Property key as compared: "Téléphone", "telephone" and " TELEPHONE " are one key */
function foldKey(key: string | undefined): string {
  return (key ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

/** Normalized value that identifies something: digits (phone, IBAN, plate…) or an email */
function isIdentifierLike(norm: string): boolean {
  return norm.includes('@') || (norm.match(/\d/g)?.length ?? 0) >= 3;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Id of a link suggestion: the unordered pair, whatever the reasons */
export function linkSuggestionId(a: string, b: string): string {
  return `link:${pairKey(a, b)}`;
}

/** Dismissal id of one reason of a link suggestion (never the value nor the distance) */
function reasonDismissalId(fromId: string, toId: string, reason: SuggestionReason): string {
  return `${linkSuggestionId(fromId, toId)}:${reason.rule}${reason.rule === 'sharedValue' ? `:${foldKey(reason.key)}` : ''}`;
}

/** Ids to store when the analyst dismisses this suggestion */
export function dismissalIds(s: Suggestion): string[] {
  return s.kind === 'pivot' ? [s.id] : s.reasons.map(r => reasonDismissalId(s.fromId, s.toId, r));
}

/** Elements that can be linked: no groups, no annotations */
function isCandidate(el: Element): boolean {
  return !el.isGroup && !el.isAnnotation;
}

interface ValueGroup {
  rule: 'sharedValue' | 'sharedSource';
  /** Exempt from the share ratio (identifier values, files, pages) */
  identifier: boolean;
  key?: string;
  /** Display form (first occurrence) */
  value: string;
  assetId?: string;
  url?: string;
  memberIds: Set<string>;
}

/** sharedValue: groups of elements with the same normalized value under the same key */
function groupSharedValues(candidates: Element[]): ValueGroup[] {
  const groups = new Map<string, ValueGroup>();
  const elementsPerKey = new Map<string, number>();

  for (const el of candidates) {
    const keysSeen = new Set<string>();
    for (const prop of el.properties || []) {
      if (prop.type && prop.type !== 'text' && prop.type !== 'link') continue;
      const norm = normalizeValue(prop.value);
      if (!norm) continue;
      const key = foldKey(prop.key);
      if (!keysSeen.has(key)) {
        keysSeen.add(key);
        elementsPerKey.set(key, (elementsPerKey.get(key) ?? 0) + 1);
      }
      const id = `${key}\u0000${norm}`;
      let group = groups.get(id);
      if (!group) {
        group = { rule: 'sharedValue', identifier: isIdentifierLike(norm) && !isDateLike(String(prop.value)), key: prop.key, value: String(prop.value).trim(), memberIds: new Set() };
        groups.set(id, group);
      }
      group.memberIds.add(el.id);
    }
  }

  return [...groups.values()].filter(group => {
    const k = group.memberIds.size;
    const n = elementsPerKey.get(foldKey(group.key)) ?? k;
    // Identifiers are exempt from both the cap and the ratio: 90 victims paying
    // the same IBAN is the finding; only free text gets filtered as noise
    return k >= 2 && (group.identifier || (k <= MAX_GROUP_SIZE && !(n >= RATIO_MIN_ELEMENTS && k / n > MAX_SHARE_RATIO)));
  });
}

/**
 * sharedSource: groups of elements citing the same file (attached, or an
 * `asset:` link in the source — same SHA-256 = same file) or the same web page.
 */
function groupSharedSources(candidates: Element[], assets: readonly Asset[]): ValueGroup[] {
  const assetById = new Map(assets.map(a => [a.id, a]));
  const groups = new Map<string, ValueGroup>();
  let elementsWithSource = 0;

  const add = (key: string, display: string, elementId: string) => {
    let group = groups.get(key);
    if (!group) {
      group = key.startsWith('asset:')
        ? { rule: 'sharedSource', identifier: true, value: display, assetId: assets.find(a => `asset:${a.hash.toLowerCase()}` === key)?.id, memberIds: new Set() }
        : { rule: 'sharedSource', identifier: true, value: display, url: display, memberIds: new Set() };
      groups.set(key, group);
    }
    group.memberIds.add(elementId);
  };

  for (const el of candidates) {
    const keys = new Map<string, string>(); // source key → display
    for (const assetId of el.assetIds || []) {
      const asset = assetById.get(assetId);
      if (asset) keys.set(`asset:${asset.hash.toLowerCase()}`, asset.filename);
    }
    if (el.source) {
      for (const seg of parseSourceLinks(el.source)) {
        if (seg.kind !== 'link') continue;
        if (seg.scheme === 'asset') {
          const asset = findAssetByHash(assets, assetHashOf(seg.target));
          if (asset) keys.set(`asset:${asset.hash.toLowerCase()}`, asset.filename);
        } else if (isWebScheme(seg.scheme)) {
          const url = seg.target.trim().replace(/\/+$/, '');
          keys.set(`url:${url.toLowerCase()}`, url);
        }
      }
    }
    if (keys.size > 0) elementsWithSource++;
    for (const [key, display] of keys) add(key, display, el.id);
  }

  return [...groups.values()].filter(group => {
    const k = group.memberIds.size;
    const n = elementsWithSource;
    // A file or a page shared by most elements is the central piece, not noise
    return k >= 2 && (group.identifier || (k <= MAX_GROUP_SIZE && !(n >= RATIO_MIN_ELEMENTS && k / n > MAX_SHARE_RATIO)));
  });
}

/** inZone: [contained element, zone] pairs — the element's centre inside a larger zone */
function findZoneContainment(candidates: Element[]): Array<[string, string]> {
  const zones = candidates
    .filter(el => isGeoPolygon(el.geo) && el.geo.coordinates.length >= 3)
    .map(el => {
      const coords = (el.geo as { coordinates: [number, number][] }).coordinates;
      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
      for (const [lng, lat] of coords) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
      return { id: el.id, coords, area: computePolygonAreaKm2(coords), minLng, maxLng, minLat, maxLat };
    });
  if (zones.length === 0) return [];

  const pairs: Array<[string, string]> = [];
  for (const el of candidates) {
    if (!el.geo) continue;
    const { lat, lng } = getGeoCenter(el.geo);
    const ownArea = isGeoPolygon(el.geo) ? computePolygonAreaKm2(el.geo.coordinates) : 0;
    for (const zone of zones) {
      if (zone.id === el.id || zone.area <= ownArea) continue;
      if (lng < zone.minLng || lng > zone.maxLng || lat < zone.minLat || lat > zone.maxLat) continue;
      if (pointInPolygon(zone.coords, [lng, lat])) pairs.push([el.id, zone.id]);
    }
  }
  return pairs;
}

/** A point with more neighbours than this within the radius is in a crowd
 *  (same building, GPS trail), not at a meeting: it yields no nearby pair */
const MAX_NEARBY_NEIGHBOURS = 10;
const EARTH_RADIUS_M = 6371000;

/** Great-circle distance in metres */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * nearby: pairs of point elements closer than `radius` metres, with their
 * distance. Points are bucketed in a grid of radius-sized cells so only the
 * neighbouring cells are compared.
 */
function findNearbyPairs(candidates: Element[], radius: number): Array<[string, string, number]> {
  const points = candidates
    .filter(el => el.geo?.type === 'point')
    .map(el => ({ id: el.id, lat: (el.geo as { lat: number }).lat, lng: (el.geo as { lng: number }).lng }));
  if (points.length < 2) return [];

  const cellLat = radius / 111320;
  // Cells as wide as the radius at the highest latitude (where a degree of
  // longitude is shortest), so a neighbour is never beyond the adjacent cell
  const maxAbsLat = Math.max(...points.map(p => Math.abs(p.lat)));
  const cellLng = radius / (111320 * Math.max(Math.cos((maxAbsLat * Math.PI) / 180), 0.01));
  const cellOf = (p: { lat: number; lng: number }) => [Math.floor(p.lat / cellLat), Math.floor(p.lng / cellLng)];
  const grid = new Map<string, typeof points>();
  for (const p of points) {
    const [r, c] = cellOf(p);
    const key = `${r}:${c}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(p); else grid.set(key, [p]);
  }

  const neighbours = new Map<string, Array<{ id: string; d: number }>>();
  for (const p of points) {
    const [r, c] = cellOf(p);
    const found: Array<{ id: string; d: number }> = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        for (const q of grid.get(`${r + dr}:${c + dc}`) ?? []) {
          if (q.id === p.id) continue;
          const d = distanceMeters(p, q);
          if (d <= radius) found.push({ id: q.id, d });
          if (found.length > MAX_NEARBY_NEIGHBOURS) break; // a crowd: no need to count further
        }
      }
    }
    neighbours.set(p.id, found);
  }

  const pairs: Array<[string, string, number]> = [];
  for (const [id, found] of neighbours) {
    if (found.length > MAX_NEARBY_NEIGHBOURS) continue;
    for (const { id: other, d } of found) {
      if (id < other && (neighbours.get(other)?.length ?? 0) <= MAX_NEARBY_NEIGHBOURS) {
        pairs.push([id, other, Math.round(d)]);
      }
    }
  }
  return pairs;
}

/**
 * nearby between two sets: every element of `as` against every element of
 * `bs` within `radius` metres, crowds included. A zone (polygon) counts from
 * its edge; a point inside it is left to the zone rule when `insideToZones`.
 * Two zones are not compared.
 */
function findNearbyBetween(as: Element[], bs: Element[], radius: number, insideToZones: boolean): Array<[string, string, number]> {
  interface Shape { id: string; lat: number; lng: number; coords?: [number, number][]; minLat: number; maxLat: number; minLng: number; maxLng: number }
  const shapeOf = (el: Element): Shape | null => {
    if (!el.geo) return null;
    if (isGeoPolygon(el.geo)) {
      const coords = el.geo.coordinates;
      if (coords.length < 3) return null;
      const lngs = coords.map(c => c[0]), lats = coords.map(c => c[1]);
      const c = getGeoCenter(el.geo);
      return { id: el.id, lat: c.lat, lng: c.lng, coords, minLat: Math.min(...lats), maxLat: Math.max(...lats), minLng: Math.min(...lngs), maxLng: Math.max(...lngs) };
    }
    if (el.geo.type !== 'point') return null;
    const { lat, lng } = el.geo;
    return { id: el.id, lat, lng, minLat: lat, maxLat: lat, minLng: lng, maxLng: lng };
  };
  const left = as.map(shapeOf).filter((x): x is Shape => !!x);
  const right = bs.map(shapeOf).filter((x): x is Shape => !!x);
  const dLat = radius / 111320;
  const pairs = new Map<string, [string, string, number]>();
  for (const a of left) {
    for (const b of right) {
      if (a.id === b.id || (a.coords && b.coords)) continue;
      // Bounding boxes grown by the radius must meet
      const dLng = radius / (111320 * Math.max(Math.cos((Math.max(Math.abs(a.lat), Math.abs(b.lat)) * Math.PI) / 180), 0.01));
      if (a.minLat - dLat > b.maxLat || b.minLat - dLat > a.maxLat || a.minLng - dLng > b.maxLng || b.minLng - dLng > a.maxLng) continue;
      let d: number;
      const zone = a.coords ? a : b.coords ? b : null;
      if (zone) {
        const point = zone === a ? b : a;
        if (pointInPolygon(zone.coords!, [point.lng, point.lat])) {
          if (insideToZones) continue;
          d = 0;
        } else {
          const [lng, lat] = closestPointOnPolygon(zone.coords!, [point.lng, point.lat]);
          d = distanceMeters(point, { lat, lng });
        }
      } else {
        d = distanceMeters(a, b);
      }
      if (d > radius) continue;
      const key = pairKey(a.id, b.id);
      const prev = pairs.get(key);
      if (!prev || d < prev[2]) pairs.set(key, a.id < b.id ? [a.id, b.id, Math.round(d)] : [b.id, a.id, Math.round(d)]);
    }
  }
  return [...pairs.values()];
}

interface Presence {
  elementId: string;
  lat: number;
  lng: number;
  start: number;
  end: number;
  /** Collapsed presence: the real points it stands for, sorted by start */
  members?: Presence[];
}

function toTime(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const t = new Date(value as string | number | Date).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Longest presence the meeting rule takes into account by default. Beyond it,
 * a dated position is an existence (a home dated over two years, a head
 * office, a lease), not a presence: crossing it would turn any passer-by into
 * a contact. A stay (a hotel for three days) still counts.
 */
export const DEFAULT_MAX_PRESENCE_MS = 7 * 86400_000;

/** Where and when an element was: its dated, located events, and itself when it has both */
function presencesOf(el: Element, maxPresence: number | null): Presence[] {
  const out: Presence[] = [];
  const add = (geo: Element['geo'] | undefined, start: number | null, end: number | null) => {
    if (!geo || start === null) return;
    if (maxPresence !== null && end !== null && end - start > maxPresence) return;
    const { lat, lng } = getGeoCenter(geo);
    out.push({ elementId: el.id, lat, lng, start, end: Math.max(start, end ?? start) });
  };
  add(el.geo, toTime(el.date) ?? toTime(el.dateRange?.start), toTime(el.dateRange?.end));
  for (const ev of el.events || []) add(ev.geo, toTime(ev.date), toTime(ev.dateEnd));
  return out;
}

/** Comparisons the meeting rule may make before giving up (keeps the page responsive) */
const MAX_MEETING_COMPARISONS = 5_000_000;

/** First index in `sorted` (by start) whose start is >= t */
function lowerBound(sorted: Presence[], t: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].start < t) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/**
 * meeting: pairs of elements with presences closer than `radius` metres whose
 * times overlap within `window` ms. Returns, per pair, the first co-presence
 * (both times) and how many co-presences were found, plus `truncated` when
 * the comparison budget ran out.
 *
 * Scales to GPS trails: an element's points sharing a radius-sized cell and a
 * window-long time slot collapse into one presence; presences are indexed by
 * cell and sorted by time, so only nearby cells within the window are read;
 * a presence crossing more than MAX_NEARBY_NEIGHBOURS other elements is a
 * crowd — detected early, and it counts for nothing.
 *
 * Collapsed presences only find candidates: every co-presence is checked again
 * on the real points, so the reported time and distance are exact and the
 * radius and window are the ones shown. The count is the number of confirmed
 * occasions (slot pairs), not of point pairs.
 */
function findMeetings(candidates: Element[], radius: number, window: number, maxPresence: number | null) {
  const raw = candidates.flatMap(el => presencesOf(el, maxPresence));
  if (raw.length < 2) return { meetings: [], truncated: false };

  const cellLat = radius / 111320;
  const maxAbsLat = Math.max(...raw.map(p => Math.abs(p.lat)));
  const cellLng = radius / (111320 * Math.max(Math.cos((maxAbsLat * Math.PI) / 180), 0.01));
  const cellOf = (p: { lat: number; lng: number }) => [Math.floor(p.lat / cellLat), Math.floor(p.lng / cellLng)];

  // Collapse each element's presences per cell and time slot
  const slot = Math.max(window, 60_000);
  const collapsed = new Map<string, Presence>();
  for (const p of raw) {
    const [r, c] = cellOf(p);
    const key = `${p.elementId}|${r}:${c}|${Math.floor(p.start / slot)}`;
    const found = collapsed.get(key);
    if (!found) collapsed.set(key, { ...p, members: [p] });
    else {
      found.members!.push(p);
      if (p.start < found.start) Object.assign(found, { start: p.start, lat: p.lat, lng: p.lng });
      if (p.end > found.end) found.end = p.end;
    }
  }
  const presences = [...collapsed.values()];
  for (const p of presences) p.members!.sort((x, y) => x.start - y.start);

  // Cells, each sorted by start, with its longest presence for the lower bound
  const grid = new Map<string, { items: Presence[]; maxDuration: number }>();
  for (const p of presences) {
    const [r, c] = cellOf(p);
    const key = `${r}:${c}`;
    const cell = grid.get(key) ?? { items: [], maxDuration: 0 };
    cell.items.push(p);
    cell.maxDuration = Math.max(cell.maxDuration, p.end - p.start);
    grid.set(key, cell);
  }
  for (const cell of grid.values()) cell.items.sort((x, y) => x.start - y.start);

  let comparisons = 0;
  let truncated = false;
  /** Calls visit(q, d) for each presence of another element meeting p; stops when visit returns false */
  const forEachMatch = (p: Presence, visit: (q: Presence, d: number) => boolean) => {
    const [r, c] = cellOf(p);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const cell = grid.get(`${r + dr}:${c + dc}`);
        if (!cell) continue;
        const items = cell.items;
        for (let k = lowerBound(items, p.start - window - cell.maxDuration); k < items.length; k++) {
          const q = items[k];
          if (q.start > p.end + window) break;
          if (++comparisons > MAX_MEETING_COMPARISONS) {
            truncated = true;
            return;
          }
          if (q.elementId === p.elementId || q.end + window < p.start) continue;
          const d = distanceMeters(p, q);
          if (d <= radius && !visit(q, d)) return;
        }
      }
    }
  };

  // Pass 1: crowds, stopping as soon as a presence meets too many elements
  const crowded = new Set<Presence>();
  for (const p of presences) {
    const met = new Set<string>();
    forEachMatch(p, q => {
      met.add(q.elementId);
      return met.size <= MAX_NEARBY_NEIGHBOURS;
    });
    if (met.size > MAX_NEARBY_NEIGHBOURS) crowded.add(p);
    if (truncated) return { meetings: [], truncated };
  }

  /** First real co-presence behind two candidate presences, or null when none
   *  is within the radius and the window (the collapsing only approximates) */
  const confirm = (p: Presence, q: Presence) => {
    const qs = q.members!;
    const qMaxDuration = qs.reduce((m, x) => Math.max(m, x.end - x.start), 0);
    let best: { start: number; other: number; d: number } | null = null;
    for (const a of p.members!) {
      for (let k = lowerBound(qs, a.start - window - qMaxDuration); k < qs.length; k++) {
        const b = qs[k];
        if (b.start > a.end + window) break;
        if (++comparisons > MAX_MEETING_COMPARISONS) {
          truncated = true;
          return best;
        }
        if (b.end + window < a.start) continue;
        const d = distanceMeters(a, b);
        if (d > radius) continue;
        // Overlapping presences (a stay, a period): together from the later
        // start — one time. Apart but within the window: both times.
        const overlap = a.start <= b.end && b.start <= a.end;
        const start = overlap ? Math.max(a.start, b.start) : Math.min(a.start, b.start);
        const other = Math.max(a.start, b.start);
        if (!best || start < best.start) best = { start, other, d };
      }
    }
    return best;
  };

  // Pass 2: one entry per pair, keeping the first co-presence
  const order = new Map(presences.map((p, i) => [p, i]));
  const byPair = new Map<string, { a: string; b: string; distance: number; start: number; other: number; count: number }>();
  for (const p of presences) {
    if (crowded.has(p)) continue;
    const i = order.get(p)!;
    forEachMatch(p, (q) => {
      if (order.get(q)! < i || crowded.has(q)) return true; // each co-presence once
      const real = confirm(p, q);
      if (!real) return !truncated;
      const key = pairKey(p.elementId, q.elementId);
      const found = byPair.get(key);
      if (!found) {
        byPair.set(key, { a: p.elementId, b: q.elementId, distance: Math.round(real.d), start: real.start, other: real.other, count: 1 });
      } else {
        found.count++;
        if (real.start < found.start) Object.assign(found, { start: real.start, other: real.other, distance: Math.round(real.d) });
      }
      return !truncated;
    });
    if (truncated) return { meetings: [], truncated };
  }
  return { meetings: [...byPair.values()], truncated };
}

/** Order of the rules in a link suggestion's reasons, strongest first */
const RULE_RANK: Record<SuggestionRule, number> = { sharedValue: 0, sharedSource: 1, meeting: 2, inZone: 3, nearby: 4 };

/**
 * All suggestions for the dossier: pivots first (largest first), then links
 * (most reasons first). Pairs already linked, in either direction, are left out.
 */
export function computeLinkSuggestions(
  elements: readonly Element[],
  links: readonly Link[],
  assets: readonly Asset[],
  options: SuggestionOptions = {},
): Suggestion[] {
  return analyzeLinkSuggestions(elements, links, assets, options).suggestions;
}

/**
 * Same as computeLinkSuggestions, plus `liveIds`: every suggestion the data
 * still produces, dismissed or out of scope included. A dismissal outside it
 * is stale (element deleted, value gone) and can be dropped from the dossier.
 */
export function analyzeLinkSuggestions(
  elements: readonly Element[],
  links: readonly Link[],
  assets: readonly Asset[],
  options: SuggestionOptions = {},
): {
  suggestions: Suggestion[];
  dismissedSuggestions: Suggestion[];
  liveIds: Set<string>;
  /** Dismissals the dossier no longer needs (see below) */
  staleDismissalIds: Set<string>;
  meetingsTruncated: boolean;
} {
  const { dismissed, scope, nearbyRadius, meeting, candidateIds } = options;
  const valuesOn = options.rules?.sharedValue !== false;
  const sourcesOn = options.rules?.sharedSource !== false;
  const zonesOn = options.rules?.inZone !== false;
  const linkable = elements.filter(isCandidate);
  const between = options.between?.a && options.between?.b ? options.between : null;
  const tagsById = new Map(elements.map(el => [el.id, el.tags]));
  const hasTag = (id: string, tag: string) => tagsById.get(id)?.includes(tag) ?? false;
  const shown = candidateIds ? linkable.filter(el => candidateIds.has(el.id)) : linkable;
  // Between two tags: only their elements take part
  const candidates = between ? shown.filter(el => hasTag(el.id, between.a) || hasTag(el.id, between.b)) : shown;
  const linked = new Set(links.map(l => pairKey(l.fromId, l.toId)));
  const isLinked = (a: string, b: string) => linked.has(pairKey(a, b));
  const inScope = (ids: Iterable<string>) => {
    if (!scope) return true;
    for (const id of ids) if (scope.has(id)) return true;
    return false;
  };

  // Existing element per normalized label, to reuse as pivot
  const byLabel = new Map<string, string>();
  for (const el of linkable) {
    const norm = normalizeValue(el.label);
    if (norm && !byLabel.has(norm)) byLabel.set(norm, el.id);
  }

  const pivots: PivotSuggestion[] = [];
  let meetingsTruncated = false;
  const linkSuggestions = new Map<string, LinkSuggestion>();

  const addLinkReason = (fromId: string, toId: string, reason: SuggestionReason) => {
    const id = linkSuggestionId(fromId, toId);
    const existing = linkSuggestions.get(id);
    if (existing) existing.reasons.push(reason);
    else linkSuggestions.set(id, { kind: 'link', id, fromId, toId, reasons: [reason] });
  };

  const groups = [
    ...(valuesOn ? groupSharedValues(candidates) : []),
    ...(sourcesOn ? groupSharedSources(candidates, assets) : []),
  ];
  for (const group of groups) {
    const reason = group.rule === 'sharedValue'
      ? { rule: group.rule, key: group.key, value: group.value }
      : { rule: group.rule, value: group.value, ...(group.assetId ? { assetId: group.assetId } : {}), ...(group.url ? { url: group.url } : {}) };
    const norm = normalizeValue(group.value);
    const existingId = norm ? byLabel.get(norm) ?? null : null;
    const members = [...group.memberIds].filter(id => id !== existingId);

    if (existingId) {
      const unlinked = members.filter(id => !isLinked(id, existingId));
      if (unlinked.length === 0) continue;
      const id = pivotId(group.rule, foldKey(group.key), norm!);
      pivots.push({ kind: 'pivot', id, reason, memberIds: unlinked, existingId });
    } else if (members.length === 2) {
      const [a, b] = members;
      if (!isLinked(a, b)) addLinkReason(a, b, reason);
    } else {
      const id = pivotId(group.rule, foldKey(group.key), norm ?? group.value.toLowerCase());
      pivots.push({ kind: 'pivot', id, reason, memberIds: members, existingId: null });
    }
  }

  for (const [elementId, zoneId] of zonesOn ? findZoneContainment(candidates) : []) {
    if (!isLinked(elementId, zoneId)) addLinkReason(elementId, zoneId, { rule: 'inZone' });
  }

  if (nearbyRadius && nearbyRadius > 0) {
    const nearby = between
      ? findNearbyBetween(candidates.filter(el => hasTag(el.id, between.a)), candidates.filter(el => hasTag(el.id, between.b)), nearbyRadius, zonesOn)
      : findNearbyPairs(candidates, nearbyRadius);
    for (const [a, b, distance] of nearby) {
      if (!isLinked(a, b)) addLinkReason(a, b, { rule: 'nearby', distance });
    }
  }

  if (meeting && meeting.radius > 0 && meeting.window > 0) {
    const maxPresence = meeting.maxPresence === undefined ? DEFAULT_MAX_PRESENCE_MS : meeting.maxPresence;
    const found = findMeetings(candidates, meeting.radius, meeting.window, maxPresence);
    meetingsTruncated = found.truncated;
    for (const m of found.meetings) {
      if (!isLinked(m.a, m.b)) {
        addLinkReason(m.a, m.b, {
          rule: 'meeting', distance: m.distance, count: m.count,
          date: new Date(m.start).toISOString(), dateOther: new Date(m.other).toISOString(),
        });
      }
    }
  }

  // Between two tags: a link joins an `a` to a `b`, a pivot gathers both
  const joinsTags = (s: Suggestion) => {
    if (!between) return true;
    if (s.kind === 'link') {
      return (hasTag(s.fromId, between.a) && hasTag(s.toId, between.b)) || (hasTag(s.fromId, between.b) && hasTag(s.toId, between.a));
    }
    const ids = [...s.memberIds, ...(s.existingId ? [s.existingId] : [])];
    return ids.some(id => hasTag(id, between.a)) && ids.some(id => hasTag(id, between.b));
  };
  const inScopeOf = (s: Suggestion) =>
    joinsTags(s) && inScope(s.kind === 'link' ? [s.fromId, s.toId] : [...s.memberIds, ...(s.existingId ? [s.existingId] : [])]);

  const sortedLinks = [...linkSuggestions.values()]
    .map(s => ({ ...s, reasons: [...s.reasons].sort((a, b) => RULE_RANK[a.rule] - RULE_RANK[b.rule]) }))
    .sort((a, b) => b.reasons.length - a.reasons.length || RULE_RANK[a.reasons[0].rule] - RULE_RANK[b.reasons[0].rule]);
  const sortedPivots = pivots.sort((a, b) => b.memberIds.length - a.memberIds.length);

  const all: Suggestion[] = [...sortedPivots, ...sortedLinks];
  const liveIds = new Set(all.flatMap(dismissalIds));

  // Drop dismissed pivots, and dismissed reasons of links (a link stays while
  // one of its reasons has not been set aside)
  // Split each suggestion into its pending part and its dismissed part (a link
  // keeps the reasons still pending; the dismissed ones can be reviewed)
  const split = (keepDismissed: boolean) => all
    .map((s): Suggestion | null => {
      if (s.kind === 'pivot') return !!dismissed?.has(s.id) === keepDismissed ? s : null;
      const reasons = s.reasons.filter(r => !!dismissed?.has(reasonDismissalId(s.fromId, s.toId, r)) === keepDismissed);
      return reasons.length > 0 ? { ...s, reasons } : null;
    })
    .filter((s): s is Suggestion => s !== null && inScopeOf(s));
  // A dismissal is stale when nothing can produce it again. A rule that ran
  // tells: absent from liveIds means gone. A rule that did not run — turned off
  // by this viewer, or tied to settings each viewer picks (places, meetings) —
  // tells nothing: its link dismissals go only once an element of the pair is
  // deleted. Unticking a box must not erase what the team set aside.
  // Pivot ids are digests (their rule is not readable): judged only when both
  // the value and the source rules ran.
  const existing = new Set(elements.map(el => el.id));
  const ran: Record<string, boolean> = { sharedValue: valuesOn, sharedSource: sourcesOn, inZone: zonesOn, nearby: false, meeting: false };
  const staleDismissalIds = new Set<string>();
  for (const id of dismissed ?? []) {
    const link = /^link:([^:]+):([a-zA-Z]+)/.exec(id);
    if (link && !ran[link[2]]) {
      const [a, b] = link[1].split('|');
      if (!existing.has(a) || !existing.has(b)) staleDismissalIds.add(id);
    } else if (!link && !(valuesOn && sourcesOn)) {
      continue;
    } else if (!liveIds.has(id)) {
      staleDismissalIds.add(id);
    }
  }

  return { suggestions: split(false), dismissedSuggestions: split(true), liveIds, staleDismissalIds, meetingsTruncated };
}

/**
 * What an accepted link keeps of the reasons that justified it, so the graph
 * and the reports still say why, when and where: the full reasons in the
 * notes, the shared values as properties, the shared source as the link's
 * source, the meeting time as the link's date or period (it then shows on the
 * timeline).
 */
export function evidenceOf(
  reasons: SuggestionReason[],
  describe: (reason: SuggestionReason) => string,
  assets: readonly { id: string; hash: string; filename: string }[],
): Partial<Link> {
  const evidence: Partial<Link> = { notes: reasons.map(describe).join('\n') };
  const properties = reasons
    .filter(r => r.rule === 'sharedValue' && r.key)
    .map(r => ({ key: r.key!, value: r.value ?? '', type: 'text' as const }));
  if (properties.length > 0) evidence.properties = properties;
  const source = reasons.find(r => r.rule === 'sharedSource');
  if (source?.url) evidence.source = source.url;
  else if (source?.assetId) {
    const asset = assets.find(a => a.id === source.assetId);
    if (asset) evidence.source = `[${asset.filename}](asset:${asset.hash})`;
  }
  // Together at one moment: the link's date. Two times bridged by the window:
  // the link's period, from one to the other.
  const meeting = reasons.find(r => r.rule === 'meeting' && r.date);
  if (meeting && meeting.dateOther && meeting.dateOther !== meeting.date) {
    evidence.dateRange = { start: new Date(meeting.date!), end: new Date(meeting.dateOther) };
  } else if (meeting) {
    evidence.date = new Date(meeting.date!);
  }
  return evidence;
}

/**
 * Dismissed suggestion ids carried by an imported dossier, rewritten for the
 * new element ids. Link suggestions name their pair: dropped when an element
 * of the pair was not imported. Pivot suggestions name a value: kept as is.
 */
export function remapDismissedSuggestions(ids: readonly string[], elementIdMap: ReadonlyMap<string, string>): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (!id.startsWith('link:')) {
      out.push(id);
      continue;
    }
    // link:<a>|<b>:<rule>[:<key>]
    const rest = id.slice('link:'.length);
    const sep = rest.indexOf(':');
    const [a, b] = (sep === -1 ? rest : rest.slice(0, sep)).split('|');
    const newA = elementIdMap.get(a);
    const newB = elementIdMap.get(b);
    if (newA && newB) out.push(linkSuggestionId(newA, newB) + (sep === -1 ? '' : rest.slice(sep)));
  }
  return out;
}
