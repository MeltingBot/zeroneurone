import type { Element, ElementEvent, Link } from '../types';
import type { DatePrecision } from '../types';
import { effectivePrecision, endOfLocalDay, endOfPrecision, formatPreciseDate, formatSourceTime, isDayOnly, parsePropertyDate } from './dates';

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

/**
 * Whether a date property dates the elements, per the filters panel: the
 * selected keys when there is a selection, otherwise every key but the ones
 * left out in the former form of the choice.
 */
export function datePropertyKeeper(
  filters: { includedDateProperties?: string[]; excludedDateProperties?: string[] },
): (key: string) => boolean {
  const included = filters.includedDateProperties ?? [];
  if (included.length > 0) {
    const set = new Set(included);
    return (key) => set.has(key);
  }
  const excluded = new Set(filters.excludedDateProperties ?? []);
  return (key) => !excluded.has(key);
}

/** Two date properties read as one period (e.g. "Début des faits" → "Fin des faits") */
export interface DatePropertyRange {
  start: string;
  end: string;
}

/** How date properties date the elements: which keys count, which pairs are periods */
export interface DatePropertyRules {
  keep: (key: string) => boolean;
  ranges: DatePropertyRange[];
}

/** The date property rules of the filters panel */
export function datePropertyRules(filters: {
  includedDateProperties?: string[];
  excludedDateProperties?: string[];
  dateRangeProperties?: DatePropertyRange[];
}): DatePropertyRules {
  return { keep: datePropertyKeeper(filters), ranges: filters.dateRangeProperties ?? [] };
}

/** A bare key filter reads as rules without periods */
export type DatePropertyRulesLike = DatePropertyRules | ((key: string) => boolean);
function toRules(rules: DatePropertyRulesLike): DatePropertyRules {
  return typeof rules === 'function' ? { keep: rules, ranges: [] } : rules;
}

/** One date of an element taken from its properties: a point, or a declared period */
export interface PropertyDateSpan extends TimeInterval {
  /** Key of the date, or of the start of the period */
  key: string;
  /** Key of the end, for a period */
  endKey?: string;
  start: Date;
  end?: Date;
  /** Whether the start carries a time */
  datetime: boolean;
  timeZone?: string;
  /** Index of the (start) property in the element's properties */
  index: number;
}

/**
 * Dates an element takes from its date and date-time properties, per the
 * rules: a pair declared as a period gives one span from its start to its end
 * when the element fills both (start not after end); every other kept date is
 * a point, covering its day (date) or its minute (date-time).
 */
export function propertyDateSpans(element: Element, rulesLike: DatePropertyRulesLike): PropertyDateSpan[] {
  const rules = toRules(rulesLike);
  const dated: { key: string; index: number; date: Date; datetime: boolean; timeZone?: string }[] = [];
  (element.properties ?? []).forEach((prop, index) => {
    if ((prop.type !== 'date' && prop.type !== 'datetime') || !prop.value) return;
    if (!rules.keep(prop.key)) return;
    const date = parsePropertyDate(prop.value);
    if (!date) return;
    dated.push({ key: prop.key, index, date, datetime: prop.type === 'datetime', timeZone: prop.timeZone });
  });

  const spans: PropertyDateSpan[] = [];
  const used = new Set<number>();
  for (const range of rules.ranges) {
    const start = dated.find((p) => p.key === range.start && !used.has(p.index));
    const end = dated.find((p) => p.key === range.end && !used.has(p.index));
    if (!start || !end || start === end || end.date.getTime() < start.date.getTime()) continue;
    used.add(start.index);
    used.add(end.index);
    const from = toMinuteStart(start.date);
    spans.push({
      key: start.key, endKey: end.key, start: start.date, end: end.date,
      from: from.getTime(), until: dateEndInclusive(toMinuteStart(end.date)),
      datetime: start.datetime, timeZone: start.timeZone, index: start.index,
    });
  }
  for (const p of dated) {
    if (used.has(p.index)) continue;
    const from = toMinuteStart(p.date);
    spans.push({
      key: p.key, start: p.date, from: from.getTime(), until: dateEndInclusive(from),
      datetime: p.datetime, timeZone: p.timeZone, index: p.index,
    });
  }
  return spans;
}

/**
 * Intervals of an element's date and date-time properties, per the rules
 * (see propertyDateSpans).
 */
export function propertyDateIntervals(element: Element, rules: DatePropertyRulesLike): TimeInterval[] {
  return propertyDateSpans(element, rules).map(({ from, until }) => ({ from, until }));
}

/**
 * Every interval that dates an element as a fact: its period, its dated
 * events and its date properties that `keep` accepts (`Element.date`, the
 * collection date, is left out as everywhere else). The filters (no date,
 * period) read the same dates as the timeline and the canvas.
 */
export function elementDateIntervals(element: Element, keep: DatePropertyRulesLike): TimeInterval[] {
  const intervals: TimeInterval[] = [];
  const range = elementRangeInterval(element);
  if (range) intervals.push(range);
  for (const event of element.events ?? []) {
    const interval = eventInterval(event);
    if (interval) intervals.push(interval);
  }
  intervals.push(...propertyDateIntervals(element, keep));
  return intervals;
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
export function collectTemporalDates(
  elements: Element[],
  links: Link[],
  /** Date properties that date the elements (none when absent) */
  keepDateProperty?: DatePropertyRulesLike,
): Date[] {
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
    if (keepDateProperty) {
      for (const interval of propertyDateIntervals(el, keepDateProperty)) add(new Date(interval.from));
    }
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
  /** Date properties that date the elements (none when absent) */
  keepDateProperty?: DatePropertyRulesLike,
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

    if (keepDateProperty) {
      for (const interval of propertyDateIntervals(el, keepDateProperty)) {
        hasTemporalData = true;
        if (overlaps(interval, window)) isActive = true;
      }
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
  return {
    label: events[events.length - 1].label,
    moreCount: events.length - 1,
    events: events.map((ev) => ({ id: ev.id, dateLabel: formatEventWhen(ev, language), label: ev.label })),
  };
}

/**
 * When an event happened, as shown everywhere (lists, reports): at its
 * precision, with its end, and the source hour when typed in another zone —
 * "12 mars 2024, 02:12 (03:12 Beirut) → 14 mars 2024".
 */
export function formatEventWhen(
  ev: Pick<ElementEvent, 'date' | 'dateEnd' | 'precision' | 'approximate' | 'timeZone'>,
  language: string,
): string {
  const format = (d: Date) => {
    const text = formatPreciseDate(new Date(d), ev.precision, ev.approximate, language);
    const source = formatSourceTime(new Date(d), ev.timeZone, language);
    return source ? `${text} (${source})` : text;
  };
  return ev.dateEnd ? `${format(ev.date)} → ${format(ev.dateEnd)}` : format(ev.date);
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
