import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Element, Link } from '../types';
import { findLegacyUtcMidnightDates } from './legacyDates';

const el = (extra: Partial<Element>) =>
  ({ id: 'e1', date: null, dateRange: null, events: [], properties: [], ...extra }) as unknown as Element;
const link = (extra: Partial<Link>) =>
  ({ id: 'l1', date: null, dateRange: null, properties: [], ...extra }) as unknown as Link;

for (const zone of ['Europe/Paris', 'America/Toronto']) {
  describe(`legacy UTC-midnight dates in ${zone}`, () => {
    let previous: string | undefined;
    beforeAll(() => { previous = process.env.TZ; process.env.TZ = zone; });
    afterAll(() => { process.env.TZ = previous; });

    it('brings imported calendar days back to local midnight, keeping the day', () => {
      const fixes = findLegacyUtcMidnightDates([el({
        events: [{ id: 'ev', label: 'x', date: new Date('2024-03-12T00:00:00Z') }],
        properties: [{ key: 'naissance', type: 'date', value: '1990-05-12T00:00:00.000Z' }],
      })], [link({ dateRange: { start: new Date('2020-01-01T00:00:00Z'), end: null, precision: 'year' } })]);

      expect(fixes.dateCount).toBe(3);
      const ev = fixes.elements[0].changes.events![0];
      expect(ev.date).toEqual(new Date(2024, 2, 12));
      expect(fixes.elements[0].changes.properties![0].value).toEqual(new Date(1990, 4, 12));
      const range = fixes.links[0].changes.dateRange!;
      expect(range.start).toEqual(new Date(2020, 0, 1));
      expect(range.precision).toBe('year');
    });

    it('leaves local days and real times alone', () => {
      const fixes = findLegacyUtcMidnightDates([el({
        events: [
          { id: 'a', label: 'local day', date: new Date(2024, 2, 12) },
          { id: 'b', label: 'timed', date: new Date('2024-03-12T14:30:00Z') },
        ],
        properties: [{ key: 'texte', type: 'text', value: '2024-03-12T00:00:00Z' }],
      })], []);
      expect(fixes.dateCount).toBe(0);
      expect(fixes.elements).toHaveLength(0);
    });
  });
}

describe('legacy UTC-midnight dates in UTC', () => {
  let previous: string | undefined;
  beforeAll(() => { previous = process.env.TZ; process.env.TZ = 'UTC'; });
  afterAll(() => { process.env.TZ = previous; });

  it('finds nothing: UTC midnight is local midnight there', () => {
    const fixes = findLegacyUtcMidnightDates([el({ date: new Date('2024-03-12T00:00:00Z') })], []);
    expect(fixes.dateCount).toBe(0);
  });
});
