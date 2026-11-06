import { describe, it, expect } from 'vitest';
import {
  buildEvent, collectFields, findRecordSources, guessTarget, isKeyedRecordMap, isoInterval,
  pickDefaultSource, rawRecordsForSource, RECORD_KEY_FIELD,
} from '../jsonMapping';

// Shape of an xBRL-JSON report (OIM): facts keyed by id
const xbrl = {
  documentInfo: { documentType: 'https://xbrl.org/2021/xbrl-json', namespaces: { 'ifrs-full': 'https://xbrl.ifrs.org' }, taxonomy: ['a.xsd'] },
  facts: {
    f1: { value: '20827056.0', decimals: 0, dimensions: { concept: 'ifrs-full:Revenue', entity: 'scheme:LEI1', period: '2025-01-01T00:00:00/2026-01-01T00:00:00', unit: 'ISO4217:EUR' } },
    f2: { value: '1500.0', decimals: 0, dimensions: { concept: 'ifrs-full:Equity', entity: 'scheme:LEI1', period: '2026-01-01T00:00:00', unit: 'ISO4217:EUR' } },
    f3: { value: 'Malta', dimensions: { concept: 'ifrs-full:CountryOfIncorporation', entity: 'scheme:LEI1', period: '2025-01-01T00:00:00/2026-01-01T00:00:00', language: 'en' } },
  },
};

describe('isKeyedRecordMap', () => {
  it('takes an object of records sharing fields', () => {
    expect(isKeyedRecordMap(xbrl.facts)).toBe(true);
    expect(isKeyedRecordMap({ P1: { name: 'A' }, P2: { name: 'B', age: 3 } })).toBe(true);
  });

  it('leaves the sections of one record, single values and mixed objects', () => {
    expect(isKeyedRecordMap(xbrl)).toBe(false);
    expect(isKeyedRecordMap({ address: { city: 'Lyon' }, contact: { email: 'a@b' } })).toBe(false);
    expect(isKeyedRecordMap({ only: { name: 'A' } })).toBe(false);
    expect(isKeyedRecordMap({ a: { name: 'A' }, b: 'text' })).toBe(false);
    expect(isKeyedRecordMap([{ name: 'A' }, { name: 'B' }])).toBe(false);
  });
});

describe('records of an object keyed by id', () => {
  it('is a table, picked by default, its key kept as a field', () => {
    const sources = findRecordSources(xbrl);
    const facts = sources.find((s) => s.path === 'facts');
    expect(facts).toMatchObject({ kind: 'array', length: 3, depth: 1 });
    expect(pickDefaultSource(sources)?.path).toBe('facts');

    const records = rawRecordsForSource(xbrl, facts);
    expect(records).toHaveLength(3);
    expect(records[0][RECORD_KEY_FIELD]).toBe('f1');
    expect(guessTarget(RECORD_KEY_FIELD)).toBe('ignore');
  });

  it('stays a choice, not the default, inside a record with values of its own', () => {
    const dupont = { nom: 'Dupont', adresses: { domicile: { ville: 'Lyon' }, travail: { ville: 'Paris' } } };
    const sources = findRecordSources(dupont);
    expect(sources.some((s) => s.path === 'adresses' && s.keyed)).toBe(true);
    expect(pickDefaultSource(sources)?.kind).toBe('single');
  });

  it('gives way to an array of objects', () => {
    const data = { records: [{ a: 1 }, { a: 2 }], index: { x: { a: 1 }, y: { a: 2 }, z: { a: 3 } } };
    expect(pickDefaultSource(findRecordSources(data))?.path).toBe('records');
  });

  it('is the default for a root keyed by id', () => {
    const data = { P1: { nom: 'A' }, P2: { nom: 'B' } };
    expect(pickDefaultSource(findRecordSources(data))).toMatchObject({ path: '', kind: 'array', keyed: true });
  });

  it('keeps a field of the record named like the key', () => {
    const data = { rows: { a: { _key: 'own', n: 1 }, b: { n: 2 } } };
    const records = rawRecordsForSource(data, findRecordSources(data).find((s) => s.path === 'rows'));
    expect(records.map((r) => r[RECORD_KEY_FIELD])).toEqual(['own', 'b']);
  });

  it('caps the field samples', () => {
    const fields = collectFields([{ html: 'x'.repeat(10_000) }]);
    expect(fields[0].sample.length).toBeLessThanOrEqual(300);
  });
});

describe('isoInterval', () => {
  it('reads an end at midnight as the day before (whole days)', () => {
    const iv = isoInterval('2025-01-01T00:00:00/2026-01-01T00:00:00');
    expect(iv).not.toBeNull();
    const s = iv!.start.date, e = iv!.end.date;
    expect([s.getFullYear(), s.getMonth(), s.getDate()]).toEqual([2025, 0, 1]);
    expect([e.getFullYear(), e.getMonth(), e.getDate()]).toEqual([2025, 11, 31]);
  });

  it('keeps a date-only end and an end with a time', () => {
    expect(isoInterval('2025-01-01/2025-12-31')!.end.date.getDate()).toBe(31);
    const e = isoInterval('2025-03-01T08:00/2025-03-01T17:30')!.end.date;
    expect([e.getHours(), e.getMinutes()]).toEqual([17, 30]);
  });

  it('is null for single dates and other slashes', () => {
    expect(isoInterval('2026-01-01T00:00:00')).toBeNull();
    expect(isoInterval('12/03/2025')).toBeNull();
    expect(isoInterval('a/b')).toBeNull();
    expect(isoInterval(42)).toBeNull();
  });
});

describe('buildEvent with an interval in the date field', () => {
  const extra = { properties: [], source: '', notes: '', geo: null };

  it('takes start and end from the one field', () => {
    const ev = buildEvent({ period: '2025-01-01T00:00:00/2026-01-01T00:00:00' }, 'Revenue', { dateField: 'period' }, extra);
    expect(ev?.date.getFullYear()).toBe(2025);
    expect(ev?.dateEnd?.getMonth()).toBe(11);
    expect(ev?.dateEnd?.getDate()).toBe(31);
  });

  it('keeps an instant as a single date', () => {
    const ev = buildEvent({ period: '2026-01-01T00:00:00' }, 'Equity', { dateField: 'period' }, extra);
    expect(ev?.date.getFullYear()).toBe(2026);
    expect(ev?.dateEnd).toBeUndefined();
  });

  it('dates an instant at midnight the day before when asked (xBRL balance sheet)', () => {
    const fields = { dateField: 'period', midnightIsDayBefore: true };
    const ev = buildEvent({ period: '2026-01-01T00:00:00' }, 'Equity', fields, extra);
    expect([ev?.date.getFullYear(), ev?.date.getMonth(), ev?.date.getDate()]).toEqual([2025, 11, 31]);
    // A date without a time, or with another time, stays
    expect(buildEvent({ period: '2026-01-01' }, 'X', fields, extra)?.date.getDate()).toBe(1);
    expect(buildEvent({ period: '2026-01-01T08:00:00' }, 'X', fields, extra)?.date.getDate()).toBe(1);
    // An interval is read once: its end goes back one day, its start stays
    const iv = buildEvent({ period: '2025-01-01T00:00:00/2026-01-01T00:00:00' }, 'Revenue', fields, extra);
    expect([iv?.date.getFullYear(), iv?.date.getDate()]).toEqual([2025, 1]);
    expect([iv?.dateEnd?.getMonth(), iv?.dateEnd?.getDate()]).toEqual([11, 31]);
  });

  it('lets an end field win over an interval', () => {
    const ev = buildEvent({ period: '2025-01-01/2025-06-30', fin: '2025-03-31' }, 'X', { dateField: 'period', endField: 'fin' }, extra);
    expect(ev?.dateEnd?.getMonth()).toBe(2);
  });
});
