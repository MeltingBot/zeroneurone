import { describe, it, expect } from 'vitest';
import { autoFieldMappings, buildEvent, collectFields, guessEventFields, recordDate } from '../jsonMapping';

describe('recordDate', () => {
  it('keeps the precision of partial dates', () => {
    expect(recordDate('2020')?.precision).toBe('year');
    expect(recordDate('2020-03')?.precision).toBe('month');
    expect(recordDate('2020-03-14')?.precision).toBe('day');
  });

  it('reads French dates with a time, as a CSV holds them', () => {
    const d = recordDate('14/03/2020 08:30')?.date;
    expect(d?.getFullYear()).toBe(2020);
    expect(d?.getMonth()).toBe(2);
    expect(d?.getHours()).toBe(8);
  });

  it('is null for no date', () => {
    expect(recordDate('')).toBeNull();
    expect(recordDate('pas une date')).toBeNull();
  });
});

describe('buildEvent', () => {
  const extra = { properties: [{ key: 'durée', value: '42' }], source: 'opérateur', notes: '', geo: null };

  it('builds a dated event with its end, source and properties', () => {
    const ev = buildEvent({ debut: '2020-03-14 08:30', fin: '2020-03-14 08:31' }, 'Appel', { dateField: 'debut', endField: 'fin' }, extra);
    expect(ev?.label).toBe('Appel');
    expect(ev?.dateEnd && ev.dateEnd > ev.date).toBe(true);
    expect(ev?.source).toBe('opérateur');
    expect(ev?.properties).toEqual(extra.properties);
  });

  it('drops an end before the start, and needs a start', () => {
    expect(buildEvent({ d: '2020-03-14', f: '2019-01-01' }, 'x', { dateField: 'd', endField: 'f' }, extra)?.dateEnd).toBeUndefined();
    expect(buildEvent({ d: '' }, 'x', { dateField: 'd' }, extra)).toBeNull();
  });
});

describe('coordinate detection', () => {
  const recs = [
    { msisdn: '06 39 98 33 17', borne_lat: '46.3075', borne_lng: '-0.4636', long_description: 'texte', pos: '48.85, 2.35', cellLat: 45.1 },
    { msisdn: '06 39 98 50 99', borne_lat: '46.31', borne_lng: '-0.47', long_description: 'autre', pos: '48.86 2.34', cellLat: 45.2 },
  ];
  const fields = collectFields(recs);
  const { mapping } = autoFieldMappings(recs, fields, []);

  it('takes compound names for latitude and longitude', () => {
    expect(mapping.borne_lat.target).toBe('lat');
    expect(mapping.borne_lng.target).toBe('lng');
    expect(mapping.cellLat.target).toBe('lat');
  });

  it('keeps a "long" word that holds no number, and phone numbers, as properties', () => {
    expect(mapping.long_description.target).toBe('property');
    expect(mapping.msisdn.target).toBe('property');
  });

  it('still finds a single "lat, lng" field', () => {
    expect(mapping.pos.target).toBe('latlng');
  });
});

describe('guessEventFields', () => {
  const kinds = ['Appel entrant', 'Appel sortant', 'SMS entrant'];
  const recs = Array.from({ length: 60 }, (_, i) => ({
    id_enreg: `R${i}`,
    origine: i % 2 ? 'BORNAGE' : 'FADETTE',
    date_heure_debut: `2026-09-01 06:${String(i).padStart(2, '0')}:00`,
    type_evenement: kinds[i % 3],
    ligne: `06399833${String(i % 25).padStart(2, '0')}`,
    duree_s: String(i * 7),
  }));
  const isDate = (k: string) => k.startsWith('date');

  it('labels events by their kind and puts them on the element column', () => {
    expect(guessEventFields(recs, collectFields(recs), isDate)).toEqual({
      hostField: 'ligne', dateField: 'date_heure_debut', labelTemplate: '{type_evenement}',
    });
  });

  it('has an empty label without a category column', () => {
    const plain = recs.map(({ ligne, date_heure_debut }) => ({ ligne, date_heure_debut }));
    expect(guessEventFields(plain, collectFields(plain), isDate).labelTemplate).toBe('');
  });
});
