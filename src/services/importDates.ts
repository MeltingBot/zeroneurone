/** Dates read from imported files */

import type { DatePrecision } from '../types';
import { dateFromInputKeys, parseDateWithPrecision, toLocalDateKey, toLocalTimeKey } from '../utils/dates';

/**
 * Date read from an imported value. A bare `YYYY-MM-DD` is a calendar day (local
 * midnight, like a date entered in the app), not UTC midnight; `2019`,
 * `2019-03` and a `~` prefix (as written by the CSV export) are understood.
 * Unparseable values give an Invalid Date, as `new Date()` did, for the
 * existing checks.
 */
export function importedDate(value: string, timeZone?: string): Date {
  const date = parseDateWithPrecision(value)?.date;
  if (!date) return new Date(NaN);
  // With a source zone (`fuseau` column), the text is that zone's wall clock
  return timeZone ? dateFromInputKeys(toLocalDateKey(date), toLocalTimeKey(date), timeZone) : date;
}

/** IANA zone from a `fuseau` cell, or undefined when empty / unknown. */
export function importedTimeZone(value: string | undefined): string | undefined {
  const zone = value?.trim();
  if (!zone) return undefined;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return undefined;
  }
}

/** Precision / approximation carried by an imported date text (`2019`, `~2019-03`…). */
export function importedPrecision(value: string | undefined): { precision?: DatePrecision; approximate?: boolean } {
  const parsed = value ? parseDateWithPrecision(value) : null;
  if (!parsed) return {};
  return {
    ...(parsed.precision && parsed.precision !== 'day' ? { precision: parsed.precision } : {}),
    ...(parsed.approximate ? { approximate: true } : {}),
  };
}
