import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import CFB from 'cfb';
import { findEventEnd, parseANBContents, readUStr, type ANBLink } from './anbParser';

// Real charts live in doc_perso/ (git-ignored: they contain real case data). Skipped when absent.
const DIR = resolve(__dirname, '../../doc_perso');
const TEST = resolve(DIR, 'Test ANB pour import ZN.anb');
const RELATIONAL = resolve(DIR, 'RELATIONNEL ST MAIXENT.anb');
const EVENTS = resolve(DIR, 'EVENEMENTIEL SIMPLIFIE.anb');

function contents(path: string): Uint8Array {
  const cfb = CFB.read(readFileSync(path), { type: 'buffer' });
  const entry = CFB.find(cfb, '/Contents');
  return new Uint8Array(entry!.content as ArrayLike<number>);
}

describe('readUStr', () => {
  it('reads short, empty and u16-length CStrings', () => {
    expect(readUStr(new Uint8Array([0xff, 0xfe, 0xff, 0x02, 0x41, 0, 0x42, 0]), 0)).toEqual({ value: 'AB', end: 8 });
    expect(readUStr(new Uint8Array([0xff, 0xfe, 0xff, 0x00]), 0)).toEqual({ value: '', end: 4 });
    const long = new Uint8Array(6 + 300 * 2);
    long.set([0xff, 0xfe, 0xff, 0xff, 300 & 0xff, 300 >> 8]);
    for (let k = 0; k < 300; k++) long[6 + k * 2] = 0x61;
    expect(readUStr(long, 0)?.value).toBe('a'.repeat(300));
  });

  it('rejects truncated or missing strings', () => {
    expect(readUStr(new Uint8Array([0xff, 0xfe, 0xff, 0x05, 0x41, 0]), 0)).toBeNull();
    expect(readUStr(new Uint8Array([0x00, 0xfe, 0xff, 0x00]), 0)).toBeNull();
  });
});

describe('findEventEnd', () => {
  const attr = (value: string) => ({ name: 'x', value });
  const start = new Date(2026, 9, 18, 7, 25, 45);

  it('ends the event at the later date-time attribute', () => {
    expect(findEventEnd(start, [attr('2026 10 18 7 25 45'), attr('2026 10 18 7 52 55')]))
      .toEqual(new Date(2026, 9, 18, 7, 52, 55));
  });

  it('keeps the duration when attributes hold another time zone than the start', () => {
    const utcStart = new Date(start.getTime() - 2 * 3_600_000);
    expect(findEventEnd(utcStart, [attr('2026 10 18 7 25 45'), attr('2026 10 18 7 52 55')]))
      .toEqual(new Date(utcStart.getTime() + (27 * 60 + 10) * 1000));
  });

  it('gives up when no attribute matches the start or several could be the end', () => {
    expect(findEventEnd(start, [attr('2026 10 18 9 1 7'), attr('2026 10 18 9 30 0')])).toBeNull();
    expect(findEventEnd(start, [attr('2026 10 18 7 25 45'), attr('2026 10 18 8 0 0'), attr('2026 10 18 9 0 0')])).toBeNull();
    expect(findEventEnd(start, [attr('2026 10 18 7 25 45')])).toBeNull();
    expect(findEventEnd(start, [attr('12/07/1990'), attr('rouge')])).toBeNull();
  });
});

describe.skipIf(!existsSync(TEST))('recent chart with full French palette', () => {
  const chart = parseANBContents(contents(TEST));
  const byLabel = (l: string) => chart.items.find(i => i.label === l)!;
  const describeLink = (l: ANBLink) =>
    `${chart.items[l.fromIndex].label} -${l.label}-> ${chart.items[l.toIndex].label}`;

  it('reads every item with its representation and palette type', () => {
    expect(chart.issues).toEqual([]);
    expect(chart.items).toHaveLength(16);
    expect(byLabel('Faits')).toMatchObject({ kind: 'Theme', typeName: 'Incident' });
    expect(byLabel('Toto')).toMatchObject({ kind: 'Icon', typeName: 'Anonyme' });
    expect(byLabel('070707')).toMatchObject({ typeName: 'Téléphone portable', typeIcon: 'cellfone' });
    expect(byLabel('Fait 1')).toMatchObject({ kind: 'Event', typeName: 'Date et heure' });
  });

  it('names attributes, including those of events', () => {
    expect(byLabel('XX-22').attributes).toEqual([
      { name: 'Couleur', value: 'rouge' },
      { name: 'Marque du véhicule', value: 'RENAULT' },
      { name: 'Attype', value: 'Clio' },
    ]);
    expect(byLabel('Toto').attributes).toEqual([{ name: 'Date de naissance', value: '1990 7 12 0 0 0' }]);
    expect(byLabel('Titre Evènement').attributes.map(a => a.value))
      .toEqual(['2026 10 18 7 25 45', '2026 10 18 7 52 55']);
    // Start 07:25:45 in Paris (stored UTC), end attribute 07:52:55: the event lasts 27 min 10 s
    const event = byLabel('Titre Evènement');
    expect(findEventEnd(event.date!, event.attributes)).toEqual(new Date(Date.UTC(2026, 9, 18, 5, 52, 55)));
  });

  it('reads source and description of chart items', () => {
    expect(byLabel('Titre Evènement')).toMatchObject({
      description: 'Description événement',
      source: 'Type de source — source',
    });
    expect(byLabel('Fait 1')).toMatchObject({ description: 'Description fait 1', source: 'Source' });
  });

  it('reads times stored in UTC as instants, plain dates as calendar days', () => {
    // 17/10/2026 15:00:00 in Paris (CEST) as shown by Analyst's Notebook
    expect(byLabel('Fait 1').date).toEqual(new Date(Date.UTC(2026, 9, 17, 13, 0, 0)));
    expect(byLabel('Fait 1').dateHasTime).toBe(true);
    expect(byLabel('Fait 4').date).toEqual(new Date(Date.UTC(2026, 9, 17, 13, 20, 45)));
    const transfer = chart.links.find(l => l.label === '15200')!;
    expect(transfer.date).toEqual(new Date(2026, 9, 14));
    expect(transfer.dateHasTime).toBe(false);
  });

  it('resolves link ends through the end-id table', () => {
    expect(chart.links).toHaveLength(20);
    const names = chart.links.map(describeLink);
    expect(names).toEqual(expect.arrayContaining([
      'Toto -Utilisateur-> 060606',
      'Lulu -Propriétaire-> XX-22',
      'Toto -Implication sur-> Titre Evènement',
      'Fait 4 -Rapprochement-> Titre Evènement',
      'Compte 2 -20000-> Compte 3',
    ]));
    const calls = chart.links.filter(l => l.label === 'Appel téléphonique');
    expect(calls).toHaveLength(2);
    expect(calls.map(l => l.date)).toEqual([
      new Date(Date.UTC(2026, 9, 18, 6, 37, 22)),
      new Date(Date.UTC(2026, 9, 18, 6, 30, 0)),
    ]);
  });

  it('reads one arrow tip per link, on the end it points to', () => {
    expect(chart.links.every(l => l.arrowHeads.length === 1)).toBe(true);
    const nearest = (l: ANBLink) => {
      const tip = l.arrowHeads[0];
      const d = (k: number) => Math.hypot(chart.items[k].x! - tip.x, chart.items[k].y! - tip.y);
      return chart.items[d(l.fromIndex) < d(l.toIndex) ? l.fromIndex : l.toIndex].label;
    };
    const [late, early] = chart.links.filter(l => l.label === 'Appel téléphonique');
    // 08:37:22 call goes back to 070707, 08:30 call goes to 060606
    expect([nearest(late), nearest(early)]).toEqual(['070707', '060606']);
    expect(nearest(chart.links.find(l => l.label === 'Propriétaire')!)).toBe('XX-22');
    expect(nearest(chart.links.find(l => l.label === 'Rapprochement')!)).toBe('Titre Evènement');
  });

  it('reads line colours from link styles', () => {
    const colour = (label: string) => chart.links.find(l => l.label === label)!.color;
    expect(colour('Propriétaire')).toBe('#0000ff');
    expect(colour('Adresse')).toBe('#00ff00');
    expect(colour('Implication sur')).toBe('#ff0000');
    expect(colour('Titulaire du compte')).toBe('#00ccff');
    expect(colour('Rapprochement')).toBe('#800000');
    expect(colour('Appel téléphonique')).toBe('#993366');
    expect(colour('15200')).toBe('#cc99ff');
    expect(colour('Utilisateur')).toBe('#000000');
  });
});

describe.skipIf(!existsSync(RELATIONAL))('legacy relational chart', () => {
  const chart = parseANBContents(contents(RELATIONAL));

  it('reads all items and links without structural issues', () => {
    expect(chart.issues).toEqual([]);
    expect(chart.items).toHaveLength(122);
    expect(chart.links).toHaveLength(123);
    expect(chart.items.filter(i => i.kind === 'Box').map(i => i.label)).toEqual(['ISOLES 1', 'ISOLES 2']);
    expect(chart.links.filter(l => l.arrowHeads.length === 2)).toHaveLength(2);
    expect(chart.links.filter(l => l.arrowHeads.length === 0)).toHaveLength(0);
    expect(chart.links.every(l => l.color !== null)).toBe(true);
  });

  it('keeps link labels attached to the right ends', () => {
    for (const link of chart.links.filter(l => l.label === 'DEMEURE')) {
      const types = [chart.items[link.fromIndex].typeName, chart.items[link.toIndex].typeName];
      expect(types).toContain('VILLE');
    }
    for (const link of chart.links.filter(l => l.label === 'UTILISE')) {
      const types = [chart.items[link.fromIndex].typeName, chart.items[link.toIndex].typeName];
      expect(types.some(t => t === 'HOMME' || t === 'FEMME')).toBe(true);
    }
  });

  it('names legacy palette attributes', () => {
    const names = new Set(chart.items.flatMap(i => i.attributes.map(a => a.name)));
    expect(names).toContain('DATE NAISSANCE');
    expect(names).toContain('LIEU NAISSANCE');
  });
});

describe.skipIf(!existsSync(EVENTS))('legacy event chart', () => {
  const chart = parseANBContents(contents(EVENTS));
  const count = (kind: string) => chart.items.filter(i => i.kind === kind).length;

  it('distinguishes item representations', () => {
    expect(chart.issues).toEqual([]);
    expect(chart.items).toHaveLength(106);
    expect([count('Event'), count('Theme'), count('Box'), count('Circle'), count('TextBlock')])
      .toEqual([74, 15, 8, 7, 2]);
  });

  it('reads event dates as local wall-clock time', () => {
    const events = chart.items.filter(i => i.kind === 'Event');
    expect(events.every(e => e.date !== null)).toBe(true);
    expect(events[0].date).toEqual(new Date(2016, 0, 13, 15, 0, 0));
  });

  it('links theme lines to events', () => {
    expect(chart.links).toHaveLength(156);
    const kinds = new Set(chart.links.map(l =>
      [chart.items[l.fromIndex].kind, chart.items[l.toIndex].kind].sort().join('-')));
    expect(kinds).toContain('Event-Theme');
    expect(chart.links.filter(l => l.date).length).toBeGreaterThan(0);
    expect(chart.links.filter(l => l.arrowHeads.length > 0)).toHaveLength(9);
    expect(chart.links.every(l => l.color !== null)).toBe(true);
  });
});
