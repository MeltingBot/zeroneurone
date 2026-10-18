import type { DatePrecision } from '../../types';
import { effectivePrecision } from '../../utils/dates';

export type HistogramMode = 'hour' | 'weekday' | 'month';

export interface HistogramInput {
  start: Date;
  precision?: DatePrecision;
}

export interface ActivityHistogram {
  counts: number[];
  maxCount: number;
  /** Items whose date is too coarse for the mode (a day-only date in hour mode) */
  skipped: number;
}

export const HISTOGRAM_SIZES: Record<HistogramMode, number> = { hour: 24, weekday: 7, month: 12 };

/** Precisions fine enough to place a date in a bucket of each mode. */
const ACCEPTED: Record<HistogramMode, ReadonlySet<DatePrecision>> = {
  hour: new Set(['minute']),
  weekday: new Set(['day', 'minute']),
  month: new Set(['month', 'day', 'minute']),
};

/**
 * Bucket of a date in local time (weekdays start on Monday), or null when its
 * precision is too coarse for the mode.
 */
export function histogramBucket(item: HistogramInput, mode: HistogramMode): number | null {
  if (!ACCEPTED[mode].has(effectivePrecision(item.start, item.precision))) return null;
  switch (mode) {
    case 'hour': return item.start.getHours();
    case 'weekday': return (item.start.getDay() + 6) % 7;
    case 'month': return item.start.getMonth();
  }
}

export function buildActivityHistogram(items: readonly HistogramInput[], mode: HistogramMode): ActivityHistogram {
  const counts = new Array<number>(HISTOGRAM_SIZES[mode]).fill(0);
  let skipped = 0;
  for (const item of items) {
    const bucket = histogramBucket(item, mode);
    if (bucket === null) skipped++;
    else counts[bucket]++;
  }
  const maxCount = counts.reduce((max, v) => (v > max ? v : max), 0);
  return { counts, maxCount, skipped };
}
