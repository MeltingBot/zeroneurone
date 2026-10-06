// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Element, Link } from '../types';
import { exportService } from './exportService';

const element = (extra: Partial<Element>) => ({
  id: 'e1', label: 'Alice', notes: '', tags: [], properties: [], confidence: null, source: '',
  date: null, dateRange: null, position: { x: 0, y: 0 }, geo: null, events: [],
  visual: { color: '#fff', shape: 'circle' }, isGroup: false, parentGroupId: null, ...extra,
}) as unknown as Element;

describe('CSV export — source time zone', () => {
  let previous: string | undefined;
  beforeAll(() => { previous = process.env.TZ; process.env.TZ = 'Europe/Paris'; });
  afterAll(() => { process.env.TZ = previous; });

  it('writes the source wall clock and its zone', () => {
    const csv = exportService.exportToCSV([element({
      events: [{ id: 'ev', label: 'Appel', date: new Date('2024-06-12T00:12:00Z'), timeZone: 'Asia/Beirut' }],
    })], [] as Link[]);
    const [header, , eventRow] = csv.split('\n');
    const cols = header.split(',');
    const cells = eventRow.split(',');
    expect(cells[cols.indexOf('date')]).toBe('2024-06-12 03:12');
    expect(cells[cols.indexOf('fuseau')]).toBe('Asia/Beirut');
  });

  it('leaves the zone empty and the hour local otherwise', () => {
    const csv = exportService.exportToCSV([element({
      events: [{ id: 'ev', label: 'Appel', date: new Date(2024, 5, 12, 14, 30) }],
    })], []);
    const [header, , eventRow] = csv.split('\n');
    const cols = header.split(',');
    const cells = eventRow.split(',');
    expect(cells[cols.indexOf('date')]).toBe('2024-06-12 14:30');
    expect(cells[cols.indexOf('fuseau')]).toBe('');
  });
});
