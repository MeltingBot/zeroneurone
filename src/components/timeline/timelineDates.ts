import type { DatePrecision } from '../../types';
import { formatPreciseDate, formatSourceTime } from '../../utils/dates';

/** Date fields of a timeline item needed to label it. */
interface DatedItem {
  start: Date;
  end?: Date;
  /** End as entered (the bar's `end` may extend to the end of its period, or to now) */
  displayEnd?: Date;
  precision?: DatePrecision;
  approximate?: boolean;
  /** Source zone of the hours; its wall clock is shown in parentheses */
  timeZone?: string;
}

/** "12 mars 2019", "2019 → 2021", "~mars 2019 → 14 juin 2019, 10:00"… */
export function formatItemDates(item: DatedItem, language: string): string {
  const fmt = (d: Date) => {
    const text = formatPreciseDate(d, item.precision, item.approximate, language);
    const source = formatSourceTime(d, item.timeZone, language);
    return source ? `${text} (${source})` : text;
  };
  const startStr = fmt(item.start);
  const end = item.displayEnd ?? item.end;
  if (!end || end.getTime() === item.start.getTime()) return startStr;
  const endStr = fmt(end);
  return endStr === startStr ? startStr : `${startStr} → ${endStr}`;
}
