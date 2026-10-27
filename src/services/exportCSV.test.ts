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

describe('CSV export — options', () => {
  const link = {
    id: 'l1', fromId: 'e1', toId: 'e2', label: 'connaît', notes: '', properties: [], confidence: null, source: '',
    dateRange: null, directed: true, visual: { color: '#000', style: 'solid' },
  } as unknown as Link;
  const els = [element({ tags: ['a', 'b'] }), element({ id: 'e2', label: 'Bob' })];

  it('separates with semicolons and quotes values that hold one', () => {
    const csv = exportService.exportToCSV(els, [link], { delimiter: ';' });
    const [header, alice] = csv.split('\n');
    expect(header.startsWith('type;label;de;vers')).toBe(true);
    // Tags are joined with ";": quoted so the row keeps its columns
    expect(alice).toContain('"a;b"');
  });

  it('keeps only the elements, or only the links', () => {
    const elementsOnly = exportService.exportToCSV(els, [link], { content: 'elements' }).split('\n');
    expect(elementsOnly.slice(1).map((r) => r.split(',')[0])).toEqual(['element', 'element']);
    const linksOnly = exportService.exportToCSV(els, [link], { content: 'links' }).split('\n');
    expect(linksOnly.slice(1).map((r) => r.split(',')[0])).toEqual(['lien']);
    // Links still name their ends
    expect(linksOnly[1]).toContain('Alice,Bob');
  });

  it('starts with a BOM for Excel only when asked', () => {
    expect(exportService.exportToCSV(els, [], { excel: true }).charCodeAt(0)).toBe(0xfeff);
    expect(exportService.exportToCSV(els, []).charCodeAt(0)).not.toBe(0xfeff);
  });
});
