/**
 * Entries of the companion's chronology (CompanionTimeline.tsx): element
 * periods and events, dated links. Element.date, the collection date, is left
 * out as on the desktop (temporalUtils.elementDateIntervals).
 */

import type { DatePrecision, Element, Link } from '../types';
import { effectivePrecision } from '../utils/dates';

export interface TimelineEntry {
  key: string;
  date: Date;
  end: Date | null;
  precision: DatePrecision;
  approximate: boolean;
  label: string;
  /** The element an event belongs to, or the two ends of a link */
  context: string | null;
  elementId: string;
  /** The event, for an element's event: its page opens on it */
  eventId?: string;
}

export function timelineEntries(elements: Element[], links: Link[], untitled: string): TimelineEntry[] {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const out: TimelineEntry[] = [];
  for (const e of elements) {
    const label = e.label || untitled;
    // Element.date is the collection date, not a fact: left out, as on the desktop
    if (e.dateRange?.start) {
      const r = e.dateRange;
      out.push({ key: `e-${e.id}`, date: r.start!, end: r.end, precision: effectivePrecision(r.start!, r.precision), approximate: !!r.approximate, label, context: null, elementId: e.id });
    }
    for (const ev of e.events ?? []) {
      if (!(ev.date instanceof Date) || Number.isNaN(ev.date.getTime())) continue;
      out.push({
        key: `v-${e.id}-${ev.id}`, date: ev.date, end: ev.dateEnd ?? null,
        precision: effectivePrecision(ev.date, ev.precision), approximate: !!ev.approximate,
        label: ev.label || label, context: label, elementId: e.id, eventId: ev.id,
      });
    }
  }
  for (const l of links) {
    const start = l.date ?? l.dateRange?.start ?? null;
    if (!start) continue;
    const from = byId.get(l.fromId);
    const to = byId.get(l.toId);
    if (!from) continue;
    const ends = `${from.label || untitled} — ${to?.label || untitled}`;
    out.push({
      key: `l-${l.id}`, date: start, end: l.date ? null : l.dateRange?.end ?? null,
      precision: effectivePrecision(start, l.date ? undefined : l.dateRange?.precision),
      approximate: !l.date && !!l.dateRange?.approximate,
      label: l.label || ends, context: l.label ? ends : null, elementId: from.id,
    });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ============================================================================
// JUMP STRIP
// ============================================================================

/** Years past two years of span, months below */
export type Scale = 'year' | 'month';

/** Most buckets drawn; past that only the years holding entries are kept */
const MAX_BUCKETS = 150;

export interface Bucket {
  key: string;
  start: Date;
  count: number;
}

export function scaleOf(entries: TimelineEntry[]): Scale {
  if (entries.length === 0) return 'month';
  const first = entries[0].date;
  const last = entries[entries.length - 1].date;
  const months = (last.getFullYear() - first.getFullYear()) * 12 + last.getMonth() - first.getMonth();
  return months >= 24 ? 'year' : 'month';
}

export function bucketKey(date: Date, scale: Scale): string {
  return scale === 'year' ? `${date.getFullYear()}` : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Every period from the first entry to the last, empty ones included so the
 * gaps show; `entries` sorted oldest first.
 */
export function buckets(entries: TimelineEntry[], scale: Scale): Bucket[] {
  if (entries.length === 0) return [];
  const counts = new Map<string, number>();
  for (const e of entries) {
    const key = bucketKey(e.date, scale);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const first = entries[0].date;
  const last = entries[entries.length - 1].date;
  const out: Bucket[] = [];
  const cursor = scale === 'year' ? new Date(first.getFullYear(), 0, 1) : new Date(first.getFullYear(), first.getMonth(), 1);
  while (cursor <= last) {
    const key = bucketKey(cursor, scale);
    out.push({ key, start: new Date(cursor), count: counts.get(key) ?? 0 });
    if (scale === 'year') cursor.setFullYear(cursor.getFullYear() + 1);
    else cursor.setMonth(cursor.getMonth() + 1);
  }
  return out.length > MAX_BUCKETS ? out.filter((b) => b.count > 0) : out;
}

/**
 * Index, in display order, of the entry to bring into view for `day`: the
 * first on or after it (oldest first), or on or before it (newest first);
 * the last one when none is.
 */
export function entryIndexFor(shown: TimelineEntry[], day: Date, newestFirst: boolean): number {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const end = start + 24 * 3600 * 1000;
  const i = shown.findIndex((e) => (newestFirst ? e.date.getTime() < end : e.date.getTime() >= start));
  return i === -1 ? shown.length - 1 : i;
}
