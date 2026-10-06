/**
 * Date conventions shared across the app.
 *
 * Dates are stored as absolute instants and shown in the viewer's local time.
 * A value entered without a time of day is stored at LOCAL midnight and means
 * "the whole day"; everything that reads, writes or exports a calendar day
 * must therefore use local getters, never `toISOString()` (UTC), which shifts
 * the day for users east or west of UTC.
 */

import type { DatePrecision } from '../types';

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse a date coming from text (imports, stored strings). A bare `YYYY-MM-DD`
 * is a calendar day: local midnight (`new Date()` would read it as UTC
 * midnight, i.e. 01:00/02:00 in Paris or the previous evening in America).
 * Anything else follows `new Date()`: zoned ISO strings stay exact instants,
 * zone-less date-times are local. Returns null when unparseable.
 */
export function parseDateValue(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const str = String(value).trim();
  const m = DATE_ONLY_RE.exec(str);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

/** Local calendar day as `YYYY-MM-DD` (for `<input type="date">`, CSV, keys). */
export function toLocalDateKey(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local `HH:mm`. */
export function toLocalTimeKey(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** True when the value carries no time of day (local midnight): a whole day. */
export function isDayOnly(date: Date): boolean {
  return date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0 && date.getMilliseconds() === 0;
}

/**
 * Last millisecond of the local day containing `date`. Uses the next local
 * midnight rather than +24h, so 23h/25h days (DST changes) stay exact.
 */
export function endOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() - 1;
}

/**
 * Text form of a date for exports (CSV, Markdown): `YYYY-MM-DD` for a whole
 * day, `YYYY-MM-DD HH:mm` otherwise, in local time.
 */
export function formatDateForExport(date: Date): string {
  return isDayOnly(date) ? toLocalDateKey(date) : `${toLocalDateKey(date)} ${toLocalTimeKey(date)}`;
}

/**
 * BCP 47 locale for date formatting from the UI language code. Every UI
 * language is a valid locale except `ua`, whose language subtag is `uk`.
 */
export function dateLocale(language: string | undefined): string {
  if (!language) return 'en';
  if (language === 'ua' || language.startsWith('ua-')) return 'uk';
  return language;
}

// ============================================================================
// PRECISION ("2019", "mars 2019", "~12 mars 2019")
// ============================================================================

/** Precision a date carries when none is recorded: midnight = a day, else a minute. */
export function inferPrecision(date: Date): DatePrecision {
  return isDayOnly(date) ? 'day' : 'minute';
}

export function effectivePrecision(date: Date, precision: DatePrecision | undefined): DatePrecision {
  return precision ?? inferPrecision(date);
}

/** Start of the period a date stands for (1 January, the 1st, midnight). */
export function startOfPrecision(date: Date, precision: DatePrecision): Date {
  switch (precision) {
    case 'year': return new Date(date.getFullYear(), 0, 1);
    case 'month': return new Date(date.getFullYear(), date.getMonth(), 1);
    case 'day': return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    case 'minute': return date;
  }
}

/** Last millisecond of the period a date stands for (local time, DST-safe). */
export function endOfPrecision(date: Date, precision: DatePrecision): number {
  switch (precision) {
    case 'year': return new Date(date.getFullYear() + 1, 0, 1).getTime() - 1;
    case 'month': return new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime() - 1;
    case 'day': return endOfLocalDay(date);
    case 'minute': return date.getTime();
  }
}

/**
 * Display a date at its precision: "2019", "mars 2019", "12 mars 2019",
 * "12 mars 2019, 14:30"; approximate dates get a "~" prefix.
 */
export function formatPreciseDate(
  date: Date,
  precision: DatePrecision | undefined,
  approximate: boolean | undefined,
  language: string,
): string {
  const locale = dateLocale(language);
  const p = effectivePrecision(date, precision);
  let text: string;
  if (p === 'year') {
    text = String(date.getFullYear());
  } else if (p === 'month') {
    text = date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  } else {
    text = date.toLocaleDateString(locale, {
      day: '2-digit', month: 'short', year: 'numeric',
      ...(p === 'minute' ? { hour: '2-digit', minute: '2-digit' } : {}),
    });
  }
  return approximate ? `~${text}` : text;
}

/**
 * Text form for exports, readable back by `parseDateWithPrecision`:
 * `2019`, `2019-03`, `2019-03-12`, `2019-03-12 14:30`, with a `~` prefix
 * when approximate.
 */
export function formatPreciseDateKey(
  date: Date,
  precision: DatePrecision | undefined,
  approximate?: boolean,
  timeZone?: string,
): string {
  // With a source zone, write that zone's wall clock (read back with the `fuseau` column)
  const keys = dateInputKeys(date, timeZone);
  const p = precision ?? (keys.time === '00:00' ? 'day' : 'minute');
  let text: string;
  if (p === 'year') text = keys.date.slice(0, 4);
  else if (p === 'month') text = keys.date.slice(0, 7);
  else if (p === 'day') text = keys.date;
  else text = `${keys.date} ${keys.time}`;
  return approximate ? `~${text}` : text;
}

/**
 * Parse a date that may carry its precision: `2019` (year), `2019-03`
 * (month), `2019-03-12` (day), anything else through `parseDateValue`
 * (precision inferred). A leading `~` marks it approximate.
 */
export function parseDateWithPrecision(
  value: unknown,
): { date: Date; precision: DatePrecision | undefined; approximate: boolean } | null {
  if (typeof value !== 'string') {
    const date = parseDateValue(value);
    return date ? { date, precision: undefined, approximate: false } : null;
  }
  let str = value.trim();
  const approximate = str.startsWith('~');
  if (approximate) str = str.slice(1).trim();
  const year = /^(\d{4})$/.exec(str);
  if (year) return { date: new Date(Number(year[1]), 0, 1), precision: 'year', approximate };
  const month = /^(\d{4})-(\d{2})$/.exec(str);
  if (month) return { date: new Date(Number(month[1]), Number(month[2]) - 1, 1), precision: 'month', approximate };
  const date = parseDateValue(str);
  if (!date) return null;
  return { date, precision: DATE_ONLY_RE.test(str) ? 'day' : undefined, approximate };
}

// ============================================================================
// ACTIVE TIME ZONE
// ============================================================================

/**
 * Time zone the app displays hours in (the system one), with its offset at
 * `at`: "Europe/Paris (UTC+2)".
 */
export function activeTimeZoneLabel(at: Date = new Date()): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const offsetMin = -at.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const offset = abs % 60 === 0 ? `${sign}${abs / 60}` : `${sign}${Math.floor(abs / 60)}:${pad(abs % 60)}`;
  return `${zone} (UTC${offsetMin === 0 ? '' : offset})`;
}

// ============================================================================
// SOURCE TIME ZONE (an event's hours read in another zone, e.g. Asia/Beirut)
// ============================================================================

interface WallClock { year: number; month: number; day: number; hour: number; minute: number }

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

/** Wall-clock date and time of an instant in a time zone. */
export function zonedWallClock(date: Date, timeZone: string): WallClock {
  let fmt = partsFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    partsFormatters.set(timeZone, fmt);
  }
  const get = (type: string) => Number(fmt!.formatToParts(date).find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

/** Instant whose wall clock in `timeZone` is the given date (`YYYY-MM-DD`) and time (`HH:mm`). */
export function fromZonedWallClock(dateKey: string, timeKey: string, timeZone: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [h, mi] = (timeKey || '00:00').split(':').map(Number);
  const target = Date.UTC(y, m - 1, d, h, mi);
  // Offset of the zone near that instant; a second pass settles DST edges
  let instant = target;
  for (let i = 0; i < 2; i++) {
    const wall = zonedWallClock(new Date(instant), timeZone);
    const wallMs = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
    instant += target - wallMs;
  }
  return new Date(instant);
}

/** `YYYY-MM-DD` / `HH:mm` of an instant in a zone (local time when no zone). */
export function dateInputKeys(date: Date, timeZone?: string): { date: string; time: string } {
  if (!timeZone) return { date: toLocalDateKey(date), time: toLocalTimeKey(date) };
  const w = zonedWallClock(date, timeZone);
  return { date: `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`, time: `${pad(w.hour)}:${pad(w.minute)}` };
}

/** Build the instant typed in date/time inputs, read in `timeZone` (local when none). */
export function dateFromInputKeys(dateKey: string, timeKey: string, timeZone?: string): Date {
  return timeZone ? fromZonedWallClock(dateKey, timeKey, timeZone) : new Date(`${dateKey}T${timeKey || '00:00'}`);
}

/** System time zone (IANA). */
export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** Short place name of a zone: "Asia/Beirut" → "Beirut", "America/New_York" → "New York". */
export function timeZoneCity(timeZone: string): string {
  return (timeZone.split('/').pop() || timeZone).replace(/_/g, ' ');
}

/** All IANA zones the browser knows (a short list on older engines). */
export function listTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  try {
    if (intl.supportedValuesOf) return intl.supportedValuesOf('timeZone');
  } catch { /* older engines */ }
  return ['UTC', 'Europe/Paris', 'Europe/London', 'America/New_York', 'Asia/Beirut', 'Asia/Shanghai', 'Asia/Tokyo'];
}

/**
 * Hour of an event in its source zone, shown next to the analyst's own:
 * "03:12 Beirut", or "13 mars 03:12 Beirut" when the source day differs.
 * Empty when the zone is unset or gives the same wall clock as the system.
 */
export function formatSourceTime(date: Date, timeZone: string | undefined, language: string): string {
  if (!timeZone) return '';
  const src = dateInputKeys(date, timeZone);
  const local = dateInputKeys(date);
  if (src.date === local.date && src.time === local.time) return '';
  const city = timeZoneCity(timeZone);
  if (src.date === local.date) return `${src.time} ${city}`;
  const [y, m, d] = src.date.split('-').map(Number);
  const day = new Date(y, m - 1, d).toLocaleDateString(dateLocale(language), { day: 'numeric', month: 'short' });
  return `${day} ${src.time} ${city}`;
}
