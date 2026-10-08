import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  activeTimeZoneLabel, dateLocale, endOfLocalDay, endOfPrecision, formatDateForExport, formatPreciseDate,
  formatPreciseDateKey, isDayOnly, parseDateValue, parseDateWithPrecision, startOfPrecision, toLocalDateKey,
  fromZonedWallClock, dateInputKeys, formatSourceTime, dateFromInputKeys, toLocalTimeKey, formatPropertyValue,
  parsePropertyDate,
} from './dates';

// Date bugs only show up away from UTC: run the suite in zones on both sides,
// including one with a DST change (Node re-reads process.env.TZ at runtime).
const ZONES = ['Europe/Paris', 'America/Toronto', 'Asia/Beirut', 'Pacific/Auckland'];

for (const zone of ZONES) {
  describe(`dates in ${zone}`, () => {
    let previous: string | undefined;
    beforeAll(() => {
      previous = process.env.TZ;
      process.env.TZ = zone;
    });
    afterAll(() => {
      process.env.TZ = previous;
    });

    it('runs in the requested zone', () => {
      expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
    });

    it('reads a property date text by its zone, UTC midnight as a local day', () => {
      for (const text of ['2024-03-12T00:00:00.000Z', '2024-03-12T00:00:00+00:00', '2024-03-12T00:00']) {
        const d = parsePropertyDate(text)!;
        expect(toLocalDateKey(d)).toBe('2024-03-12');
        expect(toLocalTimeKey(d)).toBe('00:00');
      }
      expect(parsePropertyDate('2026-02-03T14:30:00.000Z')!.toISOString()).toBe('2026-02-03T14:30:00.000Z');
      expect(parsePropertyDate('2024-03-12T00:00:00+02:00')!.toISOString()).toBe('2024-03-11T22:00:00.000Z');
      const local = parsePropertyDate('2024-03-12T14:30')!;
      expect(`${toLocalDateKey(local)} ${toLocalTimeKey(local)}`).toBe('2024-03-12 14:30');
      expect(toLocalDateKey(parsePropertyDate('1982-05-15')!)).toBe('1982-05-15');
      const instant = new Date('2024-03-12T10:00:00Z');
      expect(parsePropertyDate(instant)).toBe(instant);
      expect(parsePropertyDate('n/a')).toBeNull();
    });

    it('shows the time of a datetime property, even at midnight', () => {
      expect(formatPropertyValue('2024-03-12T00:00:00.000Z', 'datetime', 'fr')).toContain('00:00');
      expect(formatPropertyValue('2024-03-12T00:00:00.000Z', 'date', 'fr')).not.toContain(':');
    });

    it('reads a bare calendar day as local midnight', () => {
      const d = parseDateValue('2024-03-12')!;
      expect(toLocalDateKey(d)).toBe('2024-03-12');
      expect(isDayOnly(d)).toBe(true);
    });

    it('keeps zoned instants exact', () => {
      expect(parseDateValue('2024-03-12T10:00:00Z')!.getTime()).toBe(Date.UTC(2024, 2, 12, 10));
    });

    it('rejects garbage', () => {
      expect(parseDateValue('not a date')).toBeNull();
      expect(parseDateValue('')).toBeNull();
    });

    it('formats a local day without shifting it', () => {
      expect(toLocalDateKey(new Date(2024, 0, 1))).toBe('2024-01-01');
      expect(formatDateForExport(new Date(2024, 0, 1))).toBe('2024-01-01');
      expect(formatDateForExport(new Date(2024, 0, 1, 23, 30))).toBe('2024-01-01 23:30');
    });

    it('covers the whole period of a precision', () => {
      const d = new Date(2019, 2, 12, 14, 30);
      expect(startOfPrecision(d, 'year')).toEqual(new Date(2019, 0, 1));
      expect(startOfPrecision(d, 'month')).toEqual(new Date(2019, 2, 1));
      expect(new Date(endOfPrecision(d, 'year') + 1)).toEqual(new Date(2020, 0, 1));
      expect(new Date(endOfPrecision(d, 'month') + 1)).toEqual(new Date(2019, 3, 1));
      expect(endOfPrecision(d, 'minute')).toBe(d.getTime());
    });

    it('round-trips precise keys', () => {
      for (const [key, precision] of [['2019', 'year'], ['2019-03', 'month'], ['2019-03-12', 'day']] as const) {
        const parsed = parseDateWithPrecision(key)!;
        expect(parsed.precision).toBe(precision);
        expect(formatPreciseDateKey(parsed.date, parsed.precision)).toBe(key);
      }
      const approx = parseDateWithPrecision('~2019')!;
      expect(approx.approximate).toBe(true);
      expect(formatPreciseDateKey(approx.date, approx.precision, true)).toBe('~2019');
    });

    it('labels the active zone', () => {
      expect(activeTimeZoneLabel(new Date(2024, 0, 15))).toContain(zone);
    });

    it('ends the local day at the next local midnight, DST included', () => {
      for (const day of [new Date(2024, 2, 31), new Date(2024, 9, 27), new Date(2024, 3, 7), new Date(2024, 8, 29)]) {
        const end = endOfLocalDay(day);
        expect(toLocalDateKey(new Date(end))).toBe(toLocalDateKey(day));
        expect(toLocalDateKey(new Date(end + 1))).not.toBe(toLocalDateKey(day));
      }
    });
  });
}

describe('dateLocale', () => {
  it('maps UI languages to valid locales', () => {
    expect(dateLocale('fr')).toBe('fr');
    expect(dateLocale('ua')).toBe('uk');
    for (const lang of ['ca', 'de', 'en', 'es', 'eu', 'fr', 'it', 'nl', 'pl', 'pt', 'ua']) {
      expect(() => new Date(2024, 0, 1).toLocaleDateString(dateLocale(lang))).not.toThrow();
    }
  });
});

describe('formatPreciseDate', () => {
  it('shows only what is known', () => {
    const d = new Date(2019, 2, 1);
    expect(formatPreciseDate(d, 'year', false, 'fr')).toBe('2019');
    expect(formatPreciseDate(d, 'year', true, 'fr')).toBe('~2019');
    expect(formatPreciseDate(d, 'month', false, 'fr')).toBe('mars 2019');
    expect(formatPreciseDate(d, undefined, false, 'fr')).toContain('2019');
  });
});

describe('source time zone', () => {
  let previous: string | undefined;
  beforeAll(() => { previous = process.env.TZ; process.env.TZ = 'Europe/Paris'; });
  afterAll(() => { process.env.TZ = previous; });

  it('reads typed hours in the source zone', () => {
    // 03:12 in Beirut (UTC+3 in summer) = 00:12 UTC
    expect(fromZonedWallClock('2024-06-12', '03:12', 'Asia/Beirut').toISOString()).toBe('2024-06-12T00:12:00.000Z');
    // Winter: Beirut UTC+2
    expect(fromZonedWallClock('2024-01-12', '03:12', 'Asia/Beirut').toISOString()).toBe('2024-01-12T01:12:00.000Z');
  });

  it('round-trips input keys through the zone', () => {
    const d = fromZonedWallClock('2024-03-31', '02:30', 'America/New_York');
    expect(dateInputKeys(d, 'America/New_York')).toEqual({ date: '2024-03-31', time: '02:30' });
  });

  it('shows the source hour next to the local one', () => {
    const d = fromZonedWallClock('2024-06-12', '03:12', 'Asia/Beirut');
    expect(formatSourceTime(d, 'Asia/Beirut', 'fr')).toBe('03:12 Beirut');
    expect(formatSourceTime(d, 'Europe/Paris', 'fr')).toBe('');
    expect(formatSourceTime(fromZonedWallClock('2024-06-12', '01:00', 'Asia/Tokyo'), 'Asia/Tokyo', 'fr')).toContain('12 juin');
  });
});

describe('CSV round trip with a source zone', () => {
  let previous: string | undefined;
  beforeAll(() => { previous = process.env.TZ; process.env.TZ = 'America/Toronto'; });
  afterAll(() => { process.env.TZ = previous; });

  it('reads back the exported wall clock in its zone', () => {
    const instant = new Date('2024-06-12T00:12:00Z');
    const text = formatPreciseDateKey(instant, undefined, false, 'Asia/Beirut');
    expect(text).toBe('2024-06-12 03:12');
    // as importService.importedDate does with the `fuseau` column
    const parsed = parseDateWithPrecision(text)!.date;
    const back = dateFromInputKeys(toLocalDateKey(parsed), toLocalTimeKey(parsed), 'Asia/Beirut');
    expect(back.getTime()).toBe(instant.getTime());
  });
});

describe('formatPropertyValue', () => {
  it('formats dates for people, not Date.toString()', () => {
    expect(formatPropertyValue(new Date(2024, 2, 12), 'date', 'fr')).toBe('12 mars 2024');
    expect(formatPropertyValue(new Date(2024, 2, 12, 14, 30), 'datetime', 'fr')).toContain('14:30');
    expect(formatPropertyValue('2024-03-12', 'date', 'fr')).toBe('12 mars 2024');
    expect(formatPropertyValue('ABC', 'text', 'fr')).toBe('ABC');
    expect(formatPropertyValue(null, 'date', 'fr')).toBe('');
  });
});
