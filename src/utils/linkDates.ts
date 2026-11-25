import type { Link } from '../types';
import { formatPreciseDate, parseDateValue } from './dates';

/**
 * Dates written on a link's line: "start → end" for a period (an open bound
 * shows "…"), the single date otherwise, null when the link is undated.
 */
export function linkDatesLabel(link: Pick<Link, 'date' | 'dateRange'>, language: string): string | null {
  const range = link.dateRange;
  const start = parseDateValue(range?.start);
  const end = parseDateValue(range?.end);
  if (range && (start || end)) {
    const fmt = (d: Date | null) => (d ? formatPreciseDate(d, range.precision, range.approximate, language) : '…');
    if (start && end && start.getTime() === end.getTime()) return fmt(start);
    return `${fmt(start)} → ${fmt(end)}`;
  }
  const date = parseDateValue(link.date);
  return date ? formatPreciseDate(date, undefined, false, language) : null;
}
