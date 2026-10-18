import { describe, it, expect } from 'vitest';
import { buildActivityHistogram, histogramBucket } from './activityHistogram';

describe('buildActivityHistogram', () => {
  it('counts hours in local time and skips day-only dates', () => {
    const items = [
      { start: new Date(2024, 2, 12, 14, 30) },
      { start: new Date(2024, 2, 13, 14, 5) },
      { start: new Date(2024, 2, 14, 2, 0) },
      { start: new Date(2024, 2, 15) }, // midnight = whole day
      { start: new Date(2024, 2, 1), precision: 'month' as const },
    ];
    const h = buildActivityHistogram(items, 'hour');
    expect(h.counts).toHaveLength(24);
    expect(h.counts[14]).toBe(2);
    expect(h.counts[2]).toBe(1);
    expect(h.counts[0]).toBe(0);
    expect(h.skipped).toBe(2);
    expect(h.maxCount).toBe(2);
  });

  it('keeps an explicit minute precision at midnight in hour mode', () => {
    expect(histogramBucket({ start: new Date(2024, 0, 1), precision: 'minute' }, 'hour')).toBe(0);
  });

  it('starts weeks on Monday', () => {
    expect(histogramBucket({ start: new Date(2024, 0, 1) }, 'weekday')).toBe(0); // Monday
    expect(histogramBucket({ start: new Date(2024, 0, 7) }, 'weekday')).toBe(6); // Sunday
    expect(histogramBucket({ start: new Date(2024, 0, 1), precision: 'month' }, 'weekday')).toBeNull();
  });

  it('accepts month precision in month mode but not year', () => {
    expect(histogramBucket({ start: new Date(2024, 4, 1), precision: 'month' }, 'month')).toBe(4);
    expect(histogramBucket({ start: new Date(2024, 0, 1), precision: 'year' }, 'month')).toBeNull();
  });

  it('returns zero max for an empty list', () => {
    const h = buildActivityHistogram([], 'month');
    expect(h.counts).toEqual(new Array(12).fill(0));
    expect(h.maxCount).toBe(0);
  });
});
