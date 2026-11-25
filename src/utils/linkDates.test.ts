import { describe, expect, it } from 'vitest';
import { linkDatesLabel } from './linkDates';

describe('linkDatesLabel', () => {
  it('writes a period with both bounds', () => {
    const label = linkDatesLabel({ date: null, dateRange: { start: new Date(2019, 2, 12), end: new Date(2020, 0, 5) } }, 'fr');
    expect(label).toBe('12 mars 2019 → 05 janv. 2020');
  });

  it('marks an open bound', () => {
    expect(linkDatesLabel({ date: null, dateRange: { start: new Date(2019, 2, 12), end: null } }, 'fr')).toBe('12 mars 2019 → …');
    expect(linkDatesLabel({ date: null, dateRange: { start: null, end: new Date(2019, 2, 12) } }, 'fr')).toBe('… → 12 mars 2019');
  });

  it('keeps the precision and the approximate mark of the period', () => {
    const label = linkDatesLabel({ date: null, dateRange: { start: new Date(2019, 0, 1), end: new Date(2021, 0, 1), precision: 'year', approximate: true } }, 'fr');
    expect(label).toBe('~2019 → ~2021');
  });

  it('writes a single date once', () => {
    expect(linkDatesLabel({ date: new Date(2019, 2, 12), dateRange: null }, 'fr')).toBe('12 mars 2019');
    const same = new Date(2019, 2, 12);
    expect(linkDatesLabel({ date: null, dateRange: { start: same, end: new Date(same) } }, 'fr')).toBe('12 mars 2019');
  });

  it('reads dates stored as text', () => {
    expect(linkDatesLabel({ date: null, dateRange: { start: '2019-03-12' as unknown as Date, end: null } }, 'fr')).toBe('12 mars 2019 → …');
  });

  it('returns null for an undated link', () => {
    expect(linkDatesLabel({ date: null, dateRange: null }, 'fr')).toBeNull();
    expect(linkDatesLabel({ date: null, dateRange: { start: null, end: null } }, 'fr')).toBeNull();
  });
});
