import { describe, it, expect } from 'vitest';
import {
  autoFieldMappings, coerceForTarget, collectFields, compactDate, guessEventFields, guessLinkFields,
  guessTarget, guessTimeField, linkDates, rowDate,
} from '../jsonMapping';

// A bank statement: one transfer per row, the date and the time apart
const ROWS = [
  { ref: 'T1', nom_donneur: 'Jean Martin', nom_beneficiaire: 'Paul Durand', montant: '120', devise: 'EUR', date_operation: '2024-02-10', heure_operation: '09:15:30', date_valeur: '2024-02-12', commentaire: '' },
  { ref: 'T2', nom_donneur: 'Jean Martin', nom_beneficiaire: 'Anne Petit', montant: '80', devise: 'EUR', date_operation: '2024-02-11', heure_operation: '18:02:00', date_valeur: '2024-02-13', commentaire: '' },
  { ref: 'T3', nom_donneur: 'Anne Petit', nom_beneficiaire: 'Paul Durand', montant: '35', devise: 'EUR', date_operation: '2024-02-15', heure_operation: '07:45:10', date_valeur: '2024-02-15', commentaire: '' },
];
const fields = collectFields(ROWS);
const isDate = (k: string) => guessTarget(k) === 'date';

describe('compactDate', () => {
  it('reads 8 digits year first or day first', () => {
    const ymd = compactDate('19790329')?.date;
    expect([ymd?.getFullYear(), ymd?.getMonth(), ymd?.getDate()]).toEqual([1979, 2, 29]);
    const dmy = compactDate('29031979')?.date;
    expect([dmy?.getFullYear(), dmy?.getMonth(), dmy?.getDate()]).toEqual([1979, 2, 29]);
  });

  it('refuses what no reading makes a date', () => {
    expect(compactDate('39546977')).toBeNull();
    expect(compactDate('31022001')).toBeNull(); // 31 February
    expect(compactDate('2024-02-10')).toBeNull();
    expect(compactDate('123456789')).toBeNull();
  });

  it('is read in a column chosen as a date', () => {
    expect(coerceForTarget('29031979', 'date')).toBeInstanceOf(Date);
  });
});

describe('rowDate', () => {
  it('puts the time of its own column on the date', () => {
    const d = rowDate(ROWS[0], 'date_operation', 'heure_operation');
    expect([d?.date.getDate(), d?.date.getHours(), d?.date.getMinutes(), d?.date.getSeconds()]).toEqual([10, 9, 15, 30]);
    expect(d?.precision).toBeUndefined();
  });

  it('keeps the day when the time cannot be read', () => {
    const d = rowDate({ d: '2024-02-10', h: 'matin' }, 'd', 'h');
    expect(d?.date.getHours()).toBe(0);
    expect(d?.precision).toBe('day');
  });
});

describe('guessTimeField', () => {
  it('finds the time column named like the date one', () => {
    expect(guessTimeField(ROWS, fields, 'date_operation')).toBe('heure_operation');
  });

  it('takes the column right after the date when it holds times', () => {
    const rows = [{ jour: '2024-02-10', h: '09:15' }, { jour: '2024-02-11', h: '10:00' }];
    expect(guessTimeField(rows, collectFields(rows), 'jour')).toBe('h');
  });

  it('finds none for a date without its time', () => {
    expect(guessTimeField(ROWS, fields, 'date_valeur')).toBeUndefined();
  });
});

describe('guessLinkFields', () => {
  it('takes the two name columns as ends, and the date with its time', () => {
    const g = guessLinkFields(ROWS, fields, isDate);
    expect(g.fromField).toBe('nom_donneur');
    expect(g.toField).toBe('nom_beneficiaire');
    expect(g.dateField).toBe('date_operation');
    expect(g.timeField).toBe('heure_operation');
  });
});

describe('linkDates', () => {
  it('dates a link from its start to its end', () => {
    const { range } = linkDates(ROWS[0], { fromField: 'nom_donneur', toField: 'nom_beneficiaire', dateField: 'date_operation', timeField: 'heure_operation', endField: 'date_valeur' });
    expect(range?.start?.getHours()).toBe(9);
    expect(range?.end?.getDate()).toBe(12);
  });

  it('ends at its start without an end column (an open end would last until today)', () => {
    const { range } = linkDates(ROWS[0], { fromField: 'a', toField: 'b', dateField: 'date_operation' });
    expect(range?.end?.getTime()).toBe(range?.start?.getTime());
  });

  it('tells a date that cannot be read from no date', () => {
    expect(linkDates({ d: 'hier' }, { fromField: 'a', toField: 'b', dateField: 'd' })).toEqual({ range: null, unread: true });
    expect(linkDates({ d: '' }, { fromField: 'a', toField: 'b', dateField: 'd' })).toEqual({ range: null, unread: false });
  });
});

describe('guessEventFields', () => {
  it('takes a name column as the element, even with few values', () => {
    expect(guessEventFields(ROWS, fields, isDate).hostField).toBe('nom_donneur');
  });

  it('prefers a column with several values to a constant one', () => {
    const rows = [
      { devise: 'EUR', compte: 'A1', type: 'virement', date: '2024-01-01' },
      { devise: 'EUR', compte: 'B2', type: 'retrait', date: '2024-01-02' },
      { devise: 'EUR', compte: 'A1', type: 'virement', date: '2024-01-03' },
    ];
    expect(guessEventFields(rows, collectFields(rows), isDate).hostField).toBe('compte');
  });
});

describe('autoFieldMappings', () => {
  it('unchecks a column empty in every record', () => {
    const { mapping } = autoFieldMappings(ROWS, fields, []);
    expect(mapping.commentaire.enabled).toBe(false);
    expect(mapping.devise.enabled).toBe(true);
  });
});

describe('guessLinkFields on one record', () => {
  it('takes its first two text columns', () => {
    const rows = [{ donneur: 'Jean Martin', beneficiaire: 'Paul Durand' }];
    const g = guessLinkFields(rows, collectFields(rows), isDate);
    expect([g.fromField, g.toField]).toEqual(['donneur', 'beneficiaire']);
  });
});

describe('guessLinkFields on few records', () => {
  it('falls back on the first text columns when each looks constant or per-row', () => {
    const rows = [
      { donneur: 'Jean Martin', beneficiaire: 'Paul Durand', montant: '120' },
      { donneur: 'Anne Petit', beneficiaire: 'Paul Durand', montant: '80' },
    ];
    const g = guessLinkFields(rows, collectFields(rows), isDate);
    expect([g.fromField, g.toField]).toEqual(['donneur', 'beneficiaire']);
  });
});

describe('time zone of the file', () => {
  it('reads the hour written in that zone', () => {
    const d = rowDate({ d: '2024-02-10', h: '09:15:30' }, 'd', 'h', 'UTC');
    expect(d?.date.toISOString()).toBe('2024-02-10T09:15:30.000Z');
    expect(d?.zoned).toBe(true);
    const ny = rowDate({ d: '2024-07-01 22:00' }, 'd', undefined, 'America/New_York');
    expect(ny?.date.toISOString()).toBe('2024-07-02T02:00:00.000Z');
  });

  it('leaves a day without hour, and an instant with its own offset', () => {
    const day = rowDate({ d: '2024-02-10' }, 'd', undefined, 'Asia/Tokyo');
    expect([day?.date.getDate(), day?.date.getHours(), day?.zoned]).toEqual([10, 0, undefined]);
    const exact = rowDate({ d: '2024-02-10T09:00:00Z' }, 'd', undefined, 'Asia/Tokyo');
    expect(exact?.date.toISOString()).toBe('2024-02-10T09:00:00.000Z');
  });

  it('keeps the zone on the link period', () => {
    const { range } = linkDates({ d: '2024-02-10', h: '09:15' }, { fromField: 'a', toField: 'b', dateField: 'd', timeField: 'h', timeZone: 'UTC' });
    expect(range?.timeZone).toBe('UTC');
    expect(range?.start?.toISOString()).toBe('2024-02-10T09:15:00.000Z');
  });
});
