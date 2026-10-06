import type { Element, ElementEvent, Link, Property } from '../types';
import { isDayOnly } from './dates';

/**
 * Dates saved at UTC midnight by older imports (CSV `YYYY-MM-DD`, ANB…).
 * They meant a calendar day, but read in local time they show 01:00/02:00
 * east of UTC, or the previous evening west of it. Detection is offered to
 * the analyst, never applied silently: a genuine 00:00 UTC timestamp (a server
 * log) looks the same.
 */

const ISO_UTC_MIDNIGHT_RE = /^(\d{4})-(\d{2})-(\d{2})T00:00(?::00(?:\.0+)?)?(?:Z|\+00:00)$/;

/** True for an instant at exactly 00:00 UTC that is not local midnight. */
export function isUtcMidnightDay(date: Date): boolean {
  return !Number.isNaN(date.getTime())
    && date.getUTCHours() === 0 && date.getUTCMinutes() === 0
    && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0
    && !isDayOnly(date);
}

/** The same calendar day, at local midnight. */
export function toLocalDay(date: Date): Date {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Fix a date if it is a UTC-midnight day; `fixed` counts the changes. */
function fixDate<T extends Date | null | undefined>(value: T, counter: { fixed: number }): T {
  if (!value) return value;
  const d = new Date(value);
  if (!isUtcMidnightDay(d)) return value;
  counter.fixed++;
  return toLocalDay(d) as T;
}

/** Date / datetime property values, as Date or as an ISO UTC-midnight string. */
function fixProperties(properties: Property[] | undefined, counter: { fixed: number }): Property[] | undefined {
  if (!properties) return properties;
  let changed = false;
  const next = properties.map((p) => {
    if (p.type !== 'date' && p.type !== 'datetime') return p;
    if (p.value instanceof Date) {
      const value = fixDate(p.value, counter);
      if (value === p.value) return p;
      changed = true;
      return { ...p, value };
    }
    if (typeof p.value === 'string') {
      const m = ISO_UTC_MIDNIGHT_RE.exec(p.value);
      if (!m) return p;
      const d = new Date(p.value);
      if (!isUtcMidnightDay(d)) return p;
      counter.fixed++;
      changed = true;
      return { ...p, value: toLocalDay(d) };
    }
    return p;
  });
  return changed ? next : properties;
}

function fixEvents(events: ElementEvent[], counter: { fixed: number }): ElementEvent[] {
  let changed = false;
  const next = events.map((ev) => {
    const before = counter.fixed;
    const date = fixDate(new Date(ev.date), counter);
    const dateEnd = ev.dateEnd ? fixDate(new Date(ev.dateEnd), counter) : ev.dateEnd;
    const properties = fixProperties(ev.properties, counter);
    if (counter.fixed === before) return ev;
    changed = true;
    return { ...ev, date, ...(dateEnd ? { dateEnd } : {}), ...(properties ? { properties } : {}) };
  });
  return changed ? next : events;
}

export interface LegacyDateFixes {
  elements: { id: string; changes: Partial<Element> }[];
  links: { id: string; changes: Partial<Link> }[];
  /** Number of dates that would be moved back to their day */
  dateCount: number;
}

/** Changes that bring every UTC-midnight day of the dossier back to local midnight. */
export function findLegacyUtcMidnightDates(elements: Element[], links: Link[]): LegacyDateFixes {
  const result: LegacyDateFixes = { elements: [], links: [], dateCount: 0 };

  for (const el of elements) {
    const counter = { fixed: 0 };
    const changes: Partial<Element> = {};
    const date = fixDate(el.date ? new Date(el.date) : null, counter);
    if (counter.fixed) changes.date = date;
    const beforeRange = counter.fixed;
    if (el.dateRange) {
      const start = fixDate(el.dateRange.start ? new Date(el.dateRange.start) : null, counter);
      const end = fixDate(el.dateRange.end ? new Date(el.dateRange.end) : null, counter);
      if (counter.fixed > beforeRange) changes.dateRange = { ...el.dateRange, start, end };
    }
    const events = fixEvents(el.events ?? [], counter);
    if (events !== (el.events ?? [])) changes.events = events;
    const properties = fixProperties(el.properties, counter);
    if (properties !== el.properties) changes.properties = properties;
    if (counter.fixed) {
      result.elements.push({ id: el.id, changes });
      result.dateCount += counter.fixed;
    }
  }

  for (const link of links) {
    const counter = { fixed: 0 };
    const changes: Partial<Link> = {};
    const date = fixDate(link.date ? new Date(link.date) : null, counter);
    if (counter.fixed) changes.date = date;
    const beforeRange = counter.fixed;
    if (link.dateRange) {
      const start = fixDate(link.dateRange.start ? new Date(link.dateRange.start) : null, counter);
      const end = fixDate(link.dateRange.end ? new Date(link.dateRange.end) : null, counter);
      if (counter.fixed > beforeRange) changes.dateRange = { ...link.dateRange, start, end };
    }
    const properties = fixProperties(link.properties, counter);
    if (properties !== link.properties) changes.properties = properties;
    if (counter.fixed) {
      result.links.push({ id: link.id, changes });
      result.dateCount += counter.fixed;
    }
  }

  return result;
}
