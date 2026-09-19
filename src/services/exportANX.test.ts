// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import type { Dossier, Element, Link } from '../types';
import { buildANXExport } from './exportANX';
import { importANX } from './importANX';
import { db } from '../db/database';

const DOSSIER = { id: 'd1', name: 'Enquête', description: '' } as unknown as Dossier;

function makeElement(over: Partial<Element> = {}): Element {
  return {
    id: 'e1',
    dossierId: 'd1',
    label: 'Camille Laurent',
    notes: '',
    tags: [],
    properties: [],
    confidence: null,
    source: '',
    date: null,
    dateRange: null,
    position: { x: 10, y: 20 },
    isPositionLocked: false,
    geo: null,
    events: [],
    visual: { color: '#ff8800', borderColor: '#333333', shape: 'circle', size: 'medium', icon: null, image: null },
    assetIds: [],
    parentGroupId: null,
    isGroup: false,
    isAnnotation: false,
    childIds: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...over,
  } as unknown as Element;
}

function makeLink(over: Partial<Link> = {}): Link {
  return {
    id: 'l1',
    dossierId: 'd1',
    fromId: 'e1',
    toId: 'e2',
    sourceHandle: null,
    targetHandle: null,
    label: 'travaille chez',
    notes: '',
    tags: [],
    properties: [],
    directed: false,
    direction: 'forward',
    confidence: null,
    source: '',
    date: null,
    dateRange: null,
    visual: { color: '#6b6560', style: 'solid', thickness: 2 },
    curveOffset: { x: 0, y: 0 },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...over,
  } as unknown as Link;
}

function parse(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

function expectWellFormed(xml: string): Document {
  const doc = parse(xml);
  const err = doc.querySelector('parsererror');
  expect(err?.textContent ?? null).toBeNull();
  return doc;
}

describe('buildANXExport — document', () => {
  it('produces well-formed XML', () => {
    const xml = buildANXExport(DOSSIER, [makeElement(), makeElement({ id: 'e2', label: 'Vortex' })], [makeLink()]);
    expectWellFormed(xml);
  });

  it('emits a well-formed chart for an empty dossier', () => {
    const doc = expectWellFormed(buildANXExport(DOSSIER, [], []));
    expect(doc.querySelectorAll('ChartItem')).toHaveLength(0);
  });

  it('declares UTF-8, which is what the reference chart i2 accepts uses', () => {
    expect(buildANXExport(DOSSIER, [], [])).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  });
});

describe('buildANXExport — colour', () => {
  // COLORREF is BGR. If these two are swapped every colour in the chart is
  // wrong and nothing else fails, so they are asserted directly.
  it('encodes red as 255 and blue as 16711680 (BGR, not RGB)', () => {
    const red = buildANXExport(DOSSIER, [makeElement({ tags: ['P'], visual: { color: '#ff0000' } as never })], []);
    expect(red).toContain('Colour="255"');

    const blue = buildANXExport(DOSSIER, [makeElement({ tags: ['P'], visual: { color: '#0000ff' } as never })], []);
    expect(blue).toContain('Colour="16711680"');
  });

  it('never emits Colour="0" for an explicit black, which importANX reads as unset', () => {
    const xml = buildANXExport(DOSSIER, [makeElement({ tags: ['P'], visual: { color: '#000000' } as never })], []);
    const type = expectWellFormed(xml).querySelector('EntityType[Name="P"]');
    expect(type?.getAttribute('Colour')).not.toBe('0');
  });

  it('falls back to grey when the colour is a CSS variable, as link defaults are', () => {
    const xml = buildANXExport(DOSSIER, [makeElement(), makeElement({ id: 'e2' })], [
      makeLink({ visual: { color: 'var(--color-text-tertiary)', style: 'solid', thickness: 2 } as never }),
    ]);
    const style = expectWellFormed(xml).querySelector('LinkStyle');
    // 153,153,153 in BGR
    expect(style?.getAttribute('LineColour')).toBe(String((153 << 16) | (153 << 8) | 153));
  });
});

describe('buildANXExport — escaping', () => {
  it('keeps a quote-breakout label inside its attribute', () => {
    const xml = buildANXExport(DOSSIER, [makeElement({ label: 'Cible" Foo="bar' })], []);
    const doc = expectWellFormed(xml);
    expect(doc.querySelectorAll('ChartItem')).toHaveLength(1);
    expect(doc.querySelector('ChartItem')?.getAttribute('Label')).toBe('Cible" Foo="bar');
  });

  it('survives a payload that tries to close the item and inject a link', () => {
    const xml = buildANXExport(DOSSIER, [makeElement({ notes: '"/><Link End1Reference="x' })], []);
    const doc = expectWellFormed(xml);
    expect(doc.querySelectorAll('Link')).toHaveLength(0);
  });

  it('escapes property keys, which become both a value and a definition name', () => {
    const xml = buildANXExport(DOSSIER, [
      makeElement({ properties: [{ key: 'Clé" Type="AttFlag', value: 'x', type: 'text' }] as never }),
    ], []);
    const doc = expectWellFormed(xml);
    expect(doc.querySelectorAll('AttributeClass')).toHaveLength(1);
    expect(doc.querySelector('AttributeClass')?.getAttribute('Type')).toBe('AttText');
  });

  it('preserves newlines in notes rather than letting XML fold them to a space', () => {
    const xml = buildANXExport(DOSSIER, [makeElement({ notes: 'ligne1\nligne2' })], []);
    expect(xml).toContain('&#xA;');
    const doc = expectWellFormed(xml);
    expect(doc.querySelector('ChartItem')?.getAttribute('Description')).toBe('ligne1\nligne2');
  });

  it('stays parsable when a note carries a control character', () => {
    const xml = buildANXExport(DOSSIER, [makeElement({ notes: 'a\u0000b\u0001c' })], []);
    expect(expectWellFormed(xml).querySelector('ChartItem')?.getAttribute('Description')).toBe('abc');
  });
});

describe('buildANXExport — referential integrity', () => {
  it('resolves every type and endpoint reference, with unique ids', () => {
    const xml = buildANXExport(DOSSIER, [
      makeElement({ tags: ['Personne'] }),
      makeElement({ id: 'e2', label: 'Vortex', tags: ['Société'] }),
    ], [makeLink({ tags: ['emploi'] })]);
    const doc = expectWellFormed(xml);

    const ids = [...doc.querySelectorAll('[Id]')].map((n) => n.getAttribute('Id')!);
    expect(new Set(ids).size).toBe(ids.length);

    const has = (id: string | null) => !!id && ids.includes(id);
    for (const n of doc.querySelectorAll('IconStyle')) expect(has(n.getAttribute('EntityTypeReference'))).toBe(true);
    for (const n of doc.querySelectorAll('LinkStyle')) {
      expect(has(n.getAttribute('LinkTypeReference'))).toBe(true);
      expect(has(n.getAttribute('StrengthReference'))).toBe(true);
    }
    const chartIds = [...doc.querySelectorAll('ChartItem')].map((n) => n.getAttribute('Id'));
    for (const n of doc.querySelectorAll('Link')) {
      expect(chartIds).toContain(n.getAttribute('End1Reference'));
      expect(chartIds).toContain(n.getAttribute('End2Reference'));
    }
  });

  it('keeps entity type names unique when one tag carries several colours', () => {
    const xml = buildANXExport(DOSSIER, [
      makeElement({ tags: ['Personne'], visual: { color: '#ff0000' } as never }),
      makeElement({ id: 'e2', tags: ['Personne'], visual: { color: '#00ff00' } as never }),
    ], []);
    const names = [...expectWellFormed(xml).querySelectorAll('EntityType')].map((n) => n.getAttribute('Name'));
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('buildANXExport — groups', () => {
  const group = makeElement({ id: 'g1', label: 'Cellule', isGroup: true, position: { x: 100, y: 100 } });
  const child = makeElement({ id: 'c1', label: 'Membre', parentGroupId: 'g1', position: { x: 10, y: 10 } });

  it('emits children at absolute positions and drops the group itself', () => {
    const doc = expectWellFormed(buildANXExport(DOSSIER, [group, child], []));
    const items = [...doc.querySelectorAll('ChartItem')];
    expect(items).toHaveLength(1);
    const end = doc.querySelector('End');
    expect(end?.getAttribute('X')).toBe('110');
    expect(end?.getAttribute('Y')).toBe('110');
  });

  it('records the group membership as an attribute rather than losing it', () => {
    const xml = buildANXExport(DOSSIER, [group, child], []);
    expect(xml).toContain('AttributeClass="Group"');
    expect(xml).toContain('Value="Cellule"');
  });

  it('drops links pointing at a skipped element instead of dangling', () => {
    const doc = expectWellFormed(buildANXExport(DOSSIER, [group, child], [makeLink({ fromId: 'c1', toId: 'g1' })]));
    expect(doc.querySelectorAll('Link')).toHaveLength(0);
  });
});

describe('buildANXExport — formatting', () => {
  it('maps direction to the i2 arrow style', () => {
    const cases: Array<[string, string]> = [
      ['forward', 'ArrowOnHead'], ['backward', 'ArrowOnTail'],
      ['both', 'ArrowOnBoth'], ['none', 'ArrowNone'],
    ];
    for (const [direction, arrow] of cases) {
      const xml = buildANXExport(DOSSIER, [makeElement(), makeElement({ id: 'e2' })], [makeLink({ direction } as never)]);
      expect(expectWellFormed(xml).querySelector('LinkStyle')?.getAttribute('ArrowStyle')).toBe(arrow);
    }
  });

  it('maps confidence onto the 1-5 grade i2 uses', () => {
    const xml = buildANXExport(DOSSIER, [makeElement({ confidence: 80 as never })], []);
    expect(expectWellFormed(xml).querySelector('ChartItem')?.getAttribute('GradeOneIndex')).toBe('4');
  });

  it('carries events as cards', () => {
    const xml = buildANXExport(DOSSIER, [makeElement({
      events: [{ id: 'ev1', date: new Date('2026-03-09'), label: 'Séjour à Genève' }] as never,
    })], []);
    const card = expectWellFormed(xml).querySelector('Card');
    expect(card?.getAttribute('Summary')).toBe('Séjour à Genève');
    expect(card?.getAttribute('DateTime')).toMatch(/^2026-03-09T/);
  });
});

// The strongest check available without a copy of Analyst's Notebook: feed our
// own output back through the reader that models the format.
describe('buildANXExport — round trip through importANX', () => {
  beforeEach(async () => {
    await db.open();
    await db.elements.clear();
    await db.links.clear();
  });

  it('restores elements, links and their formatting', async () => {
    const source = [
      makeElement({
        id: 'e1', label: 'Camille Laurent', tags: ['Personne'], notes: 'note\nsur deux lignes',
        position: { x: 120, y: 80 }, confidence: 80 as never,
        visual: { color: '#ff8800', borderColor: '#333333', shape: 'circle', size: 'large', icon: 'user', image: null } as never,
        properties: [{ key: 'Nationalité', value: 'Française', type: 'text' }] as never,
      }),
      makeElement({ id: 'e2', label: 'Société Vortex', tags: ['Organisation'], position: { x: 300, y: 200 } }),
    ];
    const sourceLinks = [makeLink({ id: 'l1', fromId: 'e1', toId: 'e2', label: 'travaille chez', direction: 'forward' as never })];

    const result = await importANX(buildANXExport(DOSSIER, source, sourceLinks), 'd-target' as never);
    expect(result.errors).toEqual([]);
    expect(result.elementsImported).toBe(2);
    expect(result.linksImported).toBe(1);

    const elements = await db.elements.where({ dossierId: 'd-target' }).toArray();
    const camille = elements.find((e) => e.label === 'Camille Laurent');
    expect(camille).toBeDefined();
    expect(camille!.position).toEqual({ x: 120, y: 80 });
    expect(camille!.tags).toContain('Personne');
    expect(camille!.notes).toContain('note');
    expect(camille!.confidence).toBe(80);
    expect(camille!.visual.color.toLowerCase()).toBe('#ff8800');
    expect(camille!.properties.find((p) => p.key === 'Nationalité')?.value).toBe('Française');

    const links = await db.links.where({ dossierId: 'd-target' }).toArray();
    expect(links[0].label).toBe('travaille chez');
    expect(links[0].direction).toBe('forward');
  });
});
