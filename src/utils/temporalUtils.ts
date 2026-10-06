import type { Element, ElementEvent, Link } from '../types';
import type { DatePrecision } from '../types';
import { effectivePrecision, endOfLocalDay, endOfPrecision, formatPreciseDate, formatSourceTime, isDayOnly } from './dates';

/**
 * Temporal helpers shared by the map navigator and the canvas time cursor.
 *
 * Only *factual* dates are considered: element events, element dateRange
 * (set by imports) and link date/dateRange. `Element.date` is the collection
 * date of the information, not the date of a fact, and is deliberately ignored.
 */

export interface TimeInterval {
  from: number;
  /** Inclusive end (epoch ms). Infinity for open-ended ranges. */
  until: number;
}

/** Normalize to start of minute (minute-level precision). */
export function toMinuteStart(d: Date | string | number): Date {
  const date = new Date(d);
  date.setSeconds(0, 0);
  return date;
}

/**
 * Inclusive end timestamp for a date used as a bound.
 * Dates without time-of-day (00:00:00.000) cover the whole day, for dossiers
 * that only recorded days. Dates with a time are exact instants.
 */
export function dateEndInclusive(d: Date | string | number): number {
  const date = new Date(d);
  return isDayOnly(date) ? endOfLocalDay(date) : date.getTime();
}

/** Inclusive end of a bound at its precision (inferred when absent). */
function boundEnd(d: Date | string, precision: DatePrecision | undefined): number {
  const date = toMinuteStart(d);
  return endOfPrecision(date, effectivePrecision(date, precision));
}

function rangeInterval(
  start: Date | string,
  end: Date | string | null | undefined,
  precision: DatePrecision | undefined,
): TimeInterval {
  return {
    from: toMinuteStart(start).getTime(),
    until: end ? boundEnd(end, precision) : Infinity,
  };
}

function mergeIntervals(a: TimeInterval | null, b: TimeInterval | null): TimeInterval | null {
  if (!a) return b;
  if (!b) return a;
  return { from: Math.min(a.from, b.from), until: Math.max(a.until, b.until) };
}

/**
 * Interval of an element event. An event without end covers the period of
 * its date at its precision: an instant, a day, a month ("mars 2019") or a
 * year ("2019").
 */
export function eventInterval(event: ElementEvent): TimeInterval | null {
  if (!event.date) return null;
  return {
    from: toMinuteStart(event.date).getTime(),
    until: boundEnd(event.dateEnd ?? event.date, event.precision),
  };
}

/** Interval of a link, covering both `date` and `dateRange` when present. */
export function linkInterval(link: Link): TimeInterval | null {
  let interval: TimeInterval | null = null;
  if (link.date) {
    const d = toMinuteStart(link.date);
    interval = { from: d.getTime(), until: dateEndInclusive(d) };
  }
  if (link.dateRange?.start) {
    interval = mergeIntervals(interval, rangeInterval(link.dateRange.start, link.dateRange.end, link.dateRange.precision));
  }
  return interval;
}

/** Interval of an element's own dateRange (imports: lifespans, periods…). */
export function elementRangeInterval(element: Element): TimeInterval | null {
  if (!element.dateRange?.start) return null;
  return rangeInterval(element.dateRange.start, element.dateRange.end, element.dateRange.precision);
}

export function overlaps(interval: TimeInterval, window: TimeInterval): boolean {
  return interval.from <= window.until && interval.until >= window.from;
}

/**
 * Distinct factual dates of the dossier (minute precision), sorted ascending:
 * the steps of the temporal navigator.
 */
export function collectTemporalDates(elements: Element[], links: Link[]): Date[] {
  const times = new Set<number>();
  const add = (d: Date | string | null | undefined) => {
    if (!d) return;
    const t = toMinuteStart(d).getTime();
    if (!Number.isNaN(t)) times.add(t);
  };
  for (const el of elements) {
    for (const ev of el.events ?? []) {
      add(ev.date);
      add(ev.dateEnd);
    }
    add(el.dateRange?.start);
    add(el.dateRange?.end);
  }
  for (const link of links) {
    add(link.date);
    add(link.dateRange?.start);
    add(link.dateRange?.end);
  }
  return [...times].sort((a, b) => a - b).map((t) => new Date(t));
}

/** Index of the date closest to `time` (0 for an empty list) */
export function closestDateIndex(dates: Date[], time: number): number {
  let closestIdx = 0;
  let closestDiff = Infinity;
  for (let i = 0; i < dates.length; i++) {
    const diff = Math.abs(dates[i].getTime() - time);
    if (diff < closestDiff) { closestDiff = diff; closestIdx = i; }
  }
  return closestIdx;
}

/** Window covered by the navigator: an instant, or a period when `periodEnd` is set. */
export function navigatorWindow(start: Date, periodEnd: Date | null): TimeInterval {
  return {
    from: toMinuteStart(start).getTime(),
    until: dateEndInclusive(toMinuteStart(periodEnd ?? start)),
  };
}

/**
 * Move the navigator one date forward/backward. A period keeps its width
 * (in steps). Returns null at the boundary.
 */
export function shiftNavigator(
  dates: Date[],
  start: Date,
  periodEnd: Date | null,
  direction: 1 | -1,
): { start: Date; periodEnd: Date | null } | null {
  if (dates.length === 0) return null;
  const startIdx = closestDateIndex(dates, start.getTime());
  const endIdx = periodEnd ? closestDateIndex(dates, periodEnd.getTime()) : startIdx;
  const nextStart = startIdx + direction;
  const nextEnd = endIdx + direction;
  if (nextStart < 0 || nextEnd > dates.length - 1) return null;
  return { start: dates[nextStart], periodEnd: periodEnd ? dates[nextEnd] : null };
}

export interface CanvasTemporalClassification {
  /** Elements with an event (or own dateRange) covering the instant. */
  activeElementIds: Set<string>;
  /** Events covering the instant/period, per active element, oldest first. */
  activeEventsByElement: Map<string, ElementEvent[]>;
  /** Elements with temporal data, none of it at the instant (and no active link). */
  inactiveElementIds: Set<string>;
  /** Elements with no temporal data at all. */
  undatedElementIds: Set<string>;
  activeLinkIds: Set<string>;
  inactiveLinkIds: Set<string>;
  undatedLinkIds: Set<string>;
}

/**
 * Classify elements and links at an instant, or over the period
 * [instant, periodEnd] when `periodEnd` is given. Day-only bounds (00:00)
 * cover the whole day, like the map navigator.
 * An element touched by an active link but without its own active fact is
 * "related": it belongs to none of the element sets and renders normally.
 * Groups and annotations are never classified either.
 */
export function computeCanvasTemporalClassification(
  elements: Element[],
  links: Link[],
  instant: Date,
  periodEnd: Date | null = null,
): CanvasTemporalClassification {
  const window = navigatorWindow(instant, periodEnd);

  const activeLinkIds = new Set<string>();
  const inactiveLinkIds = new Set<string>();
  const undatedLinkIds = new Set<string>();
  const datedViaLink = new Set<string>();
  const relatedViaActiveLink = new Set<string>();

  for (const link of links) {
    const interval = linkInterval(link);
    if (!interval) {
      undatedLinkIds.add(link.id);
      continue;
    }
    datedViaLink.add(link.fromId);
    datedViaLink.add(link.toId);
    if (overlaps(interval, window)) {
      activeLinkIds.add(link.id);
      relatedViaActiveLink.add(link.fromId);
      relatedViaActiveLink.add(link.toId);
    } else {
      inactiveLinkIds.add(link.id);
    }
  }

  const activeElementIds = new Set<string>();
  const activeEventsByElement = new Map<string, ElementEvent[]>();
  const inactiveElementIds = new Set<string>();
  const undatedElementIds = new Set<string>();

  for (const el of elements) {
    // Groups and annotations are layout containers/notes, not facts: never classified.
    if (el.isGroup || el.isAnnotation) continue;
    let hasTemporalData = datedViaLink.has(el.id);
    let isActive = false;
    const activeEvents: { ev: ElementEvent; from: number }[] = [];

    for (const ev of el.events ?? []) {
      const interval = eventInterval(ev);
      if (!interval) continue;
      hasTemporalData = true;
      if (overlaps(interval, window)) {
        isActive = true;
        activeEvents.push({ ev, from: interval.from });
      }
    }

    const ownRange = elementRangeInterval(el);
    if (ownRange) {
      hasTemporalData = true;
      if (overlaps(ownRange, window)) isActive = true;
    }

    if (isActive) {
      activeElementIds.add(el.id);
      if (activeEvents.length > 0) {
        activeEvents.sort((a, b) => a.from - b.from);
        activeEventsByElement.set(el.id, activeEvents.map((e) => e.ev));
      }
    } else if (!hasTemporalData) {
      undatedElementIds.add(el.id);
    } else if (!relatedViaActiveLink.has(el.id)) {
      inactiveElementIds.add(el.id);
    }
  }

  return {
    activeElementIds,
    activeEventsByElement,
    inactiveElementIds,
    undatedElementIds,
    activeLinkIds,
    inactiveLinkIds,
    undatedLinkIds,
  };
}

/** Events of an element at the instant/period, as shown by the canvas and the map */
export interface TemporalEventSummary {
  /** Most recent event */
  label: string;
  /** Number of other events in the period */
  moreCount: number;
  /** All events, oldest first */
  events: { id: string; dateLabel: string; label: string }[];
}

/**
 * Summary of an element's active events (non-empty list, oldest first).
 * Dates are shown at their precision ("2019", "~mars 2019"); events with an
 * end date show their span, so an event still ongoing at the selected instant
 * reads as such ("28 janv. 2025 → 30 juin 2025").
 */
export function summarizeActiveEvents(events: ElementEvent[], language: string): TemporalEventSummary {
  // "12 mars 2024, 02:12 (03:12 Beirut)" when the event's hours come from another zone
  const format = (ev: ElementEvent, d: Date) => {
    const text = formatPreciseDate(new Date(d), ev.precision, ev.approximate, language);
    const source = formatSourceTime(new Date(d), ev.timeZone, language);
    return source ? `${text} (${source})` : text;
  };
  return {
    label: events[events.length - 1].label,
    moreCount: events.length - 1,
    events: events.map((ev) => ({
      id: ev.id,
      dateLabel: ev.dateEnd ? `${format(ev, ev.date)} → ${format(ev, ev.dateEnd)}` : format(ev, ev.date),
      label: ev.label,
    })),
  };
}

export function sameEventSummary(a: TemporalEventSummary, b: TemporalEventSummary): boolean {
  if (a.label !== b.label || a.moreCount !== b.moreCount || a.events.length !== b.events.length) return false;
  for (let i = 0; i < a.events.length; i++) {
    const x = a.events[i];
    const y = b.events[i];
    if (x.id !== y.id || x.dateLabel !== y.dateLabel || x.label !== y.label) return false;
  }
  return true;
}
