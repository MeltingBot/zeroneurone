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

  // i2 rejects them ("Source reference must not contain newlines") and, in
  // Rigorous mode, then drops every link of the chart.
  it('flattens multi-line sources in every SourceReference', () => {
    const multi = 'https://a.example/1\r\nhttps://b.example/2\n\n  note  \r';
    const xml = buildANXExport(DOSSIER, [
      makeElement({
        id: 'e1',
        source: multi,
        date: new Date(2026, 2, 9) as never,
        events: [{ id: 'ev1', date: new Date(2026, 2, 10), label: 'Séjour', source: multi }] as never,
      }),
      makeElement({ id: 'e2', label: 'B' }),
    ], [makeLink({ source: multi, date: new Date(2026, 2, 11) as never })]);

    const refs = xml.match(/SourceReference="[^"]*"/g) ?? [];
    expect(refs.length).toBeGreaterThanOrEqual(5);
    for (const ref of refs) {
      expect(ref).not.toMatch(/&#xA;|&#xD;|[\r\n]/);
    }
    const doc = expectWellFormed(xml);
    expect(doc.querySelector('ChartItem')?.getAttribute('SourceReference'))
      .toBe('https://a.example/1 ; https://b.example/2 ; note');
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

  it('maps a grading onto GradeOne (source) and GradeTwo (information)', () => {
    const europol = { ...DOSSIER, evaluationModel: 'europol' } as Dossier;
    const xml = buildANXExport(europol, [
      makeElement({ confidence: 80 as never, evaluation: { scale: 'europol', source: 'B', info: '3' } }),
    ], []);
    const item = expectWellFormed(xml).querySelector('ChartItem');
    expect(item?.getAttribute('GradeOneIndex')).toBe('2');
    expect(item?.getAttribute('GradeTwoIndex')).toBe('3');
  });

  it('leaves the grades empty for a grading made in another scale', () => {
    const admiralty = { ...DOSSIER, evaluationModel: 'admiralty' } as Dossier;
    const xml = buildANXExport(admiralty, [
      makeElement({ evaluation: { scale: 'europol', source: 'A', info: '1' } }),
    ], []);
    const item = expectWellFormed(xml).querySelector('ChartItem');
    expect(item?.getAttribute('GradeOneIndex')).toBe('0');
    expect(item?.getAttribute('GradeTwoIndex')).toBe('0');
  });

  it('carries events as cards', () => {
    const xml = buildANXExport(DOSSIER, [makeElement({
      events: [{ id: 'ev1', date: new Date(2026, 2, 9), label: 'Séjour à Genève' }] as never,
    })], []);
    const card = expectWellFormed(xml).querySelector('Card');
    expect(card?.getAttribute('Summary')).toBe('Séjour à Genève');
    expect(card?.getAttribute('DateTime')).toBe('2026-03-09T00:00:00.000');
  });

  // The chart declares UseLocalTimeZone: DateTime is the local wall clock,
  // so a late-evening event keeps its day and hour whatever the user's zone.
  it('writes the local wall clock, not the UTC one', () => {
    const xml = buildANXExport(DOSSIER, [makeElement({
      events: [{ id: 'ev1', date: new Date(2026, 2, 9, 23, 30), label: 'Appel' }] as never,
    })], []);
    expect(expectWellFormed(xml).querySelector('Card')?.getAttribute('DateTime')).toBe('2026-03-09T23:30:00.000');
  });
});

// i2 validates child order against its schema and refuses the whole chart on a
// mismatch ("ChartItem a un élément enfant non valide 'AttributeCollection'").
// The expected order is copied from a chart exported by i2 itself.
describe('buildANXExport — schema child order', () => {
  const childNames = (n: globalThis.Element | null | undefined) => [...(n?.children ?? [])].map((c) => c.tagName);

  it('puts AttributeCollection after End, and cards inside Entity', () => {
    const xml = buildANXExport(DOSSIER, [makeElement({
      date: new Date(2026, 2, 9) as never,
      properties: [{ key: 'telephone', value: '0612345678', type: 'text' }] as never,
    })], []);
    const doc = expectWellFormed(xml);
    expect(childNames(doc.querySelector('ChartItem'))).toEqual(['End', 'AttributeCollection']);
    expect(childNames(doc.querySelector('Entity'))).toEqual(['Icon', 'CardCollection']);
  });

  it('puts AttributeCollection after Link, and cards before LinkStyle', () => {
    const xml = buildANXExport(DOSSIER, [makeElement({ id: 'e1' }), makeElement({ id: 'e2', label: 'B' })], [makeLink({
      date: new Date(2026, 2, 9) as never,
      properties: [{ key: 'montant', value: '100', type: 'text' }] as never,
    })]);
    const doc = expectWellFormed(xml);
    const linkItem = doc.querySelector('Link')?.parentElement;
    expect(childNames(linkItem)).toEqual(['Link', 'AttributeCollection']);
    expect(childNames(doc.querySelector('Link'))).toEqual(['CardCollection', 'LinkStyle']);
  });

  it('trims a trailing carriage return left in a property key by a CRLF import', () => {
    const xml = buildANXExport(DOSSIER, [makeElement({
      properties: [{ key: 'telephone\r', value: '0612345678', type: 'text' }] as never,
    })], []);
    expect(expectWellFormed(xml).querySelector('AttributeClass')?.getAttribute('Name')).toBe('telephone');
  });
});

describe('buildANXExport — icon enlargement', () => {
  const enlargementOf = (size: unknown) => {
    const xml = buildANXExport(DOSSIER, [makeElement({
      visual: { color: '#ff8800', borderColor: '#333333', shape: 'circle', size, icon: null, image: null } as never,
    })], []);
    return expectWellFormed(xml).querySelector('IconStyle')?.getAttribute('Enlargement');
  };

  it('keeps ZN default size at i2 default size, so the label stays below the icon', () => {
    expect(enlargementOf('small')).toBe('ICEnlargeSingle');
    expect(enlargementOf('medium')).toBe('ICEnlargeSingle');
    expect(enlargementOf('large')).toBe('ICEnlargeDouble');
  });

  it('reads numeric sizes as pixels', () => {
    expect(enlargementOf(56)).toBe('ICEnlargeSingle');
    expect(enlargementOf(72)).toBe('ICEnlargeDouble');
    expect(enlargementOf(120)).toBe('ICEnlargeTriple');
  });
});

// i2 merges the entities that share an Identity
describe('buildANXExport — namesakes', () => {
  const entities = (xml: string) => [...expectWellFormed(xml).querySelectorAll('ChartItem')]
    .filter((ci) => ci.querySelector('Entity'))
    .map((ci) => ({
      label: ci.getAttribute('Label'),
      identity: ci.querySelector('Entity')!.getAttribute('Identity'),
      labelIsIdentity: ci.querySelector('Entity')!.getAttribute('LabelIsIdentity'),
    }));

  it('gives namesakes distinct identities and keeps their label', () => {
    const xml = buildANXExport(DOSSIER, [
      makeElement({ id: 'e1', label: 'Jean Martin' }),
      makeElement({ id: 'e2', label: 'Jean Martin' }),
      makeElement({ id: 'e3', label: 'jean martin' }),
      makeElement({ id: 'e4', label: 'Paul' }),
    ], []);
    expect(entities(xml)).toEqual([
      { label: 'Jean Martin', identity: 'Jean Martin', labelIsIdentity: 'true' },
      { label: 'Jean Martin', identity: 'Jean Martin (2)', labelIsIdentity: 'false' },
      { label: 'jean martin', identity: 'jean martin (3)', labelIsIdentity: 'false' },
      { label: 'Paul', identity: 'Paul', labelIsIdentity: 'true' },
    ]);
  });

  it('never leaves an identity empty', () => {
    const xml = buildANXExport(DOSSIER, [makeElement({ id: 'e1', label: '' }), makeElement({ id: 'e2', label: '  ' })], []);
    expect(entities(xml).map((e) => e.identity)).toEqual(['(1)', '(2)']);
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
    expect(camille!.visual.size).toBe('large');
    expect(elements.find((e) => e.label === 'Société Vortex')!.visual.size).toBe('medium');
    expect(camille!.properties.find((p) => p.key === 'Nationalité')?.value).toBe('Française');

    const links = await db.links.where({ dossierId: 'd-target' }).toArray();
    expect(links[0].label).toBe('travaille chez');
    expect(links[0].direction).toBe('forward');
  });

  it('brings namesakes back as two elements with their own label', async () => {
    const source = [
      makeElement({ id: 'e1', label: 'Jean Martin', position: { x: 0, y: 0 } }),
      makeElement({ id: 'e2', label: 'Jean Martin', position: { x: 200, y: 0 } }),
    ];
    const result = await importANX(buildANXExport(DOSSIER, source, []), 'd-target' as never);
    expect(result.elementsImported).toBe(2);
    const labels = (await db.elements.where({ dossierId: 'd-target' }).toArray()).map((e) => e.label);
    expect(labels).toEqual(['Jean Martin', 'Jean Martin']);
  });

  it('carries a link date entered in ZN (dateRange) back onto the timeline', async () => {
    const when = new Date(2026, 9, 18, 8, 30);
    const source = [
      makeElement({ id: 'e1', label: 'A', position: { x: 0, y: 0 } }),
      makeElement({ id: 'e2', label: 'B', position: { x: 200, y: 0 } }),
    ];
    const sourceLinks = [makeLink({
      id: 'l1', fromId: 'e1', toId: 'e2', label: 'appel',
      dateRange: { start: when, end: null } as never,
    })];

    await importANX(buildANXExport(DOSSIER, source, sourceLinks), 'd-target' as never);
    const [link] = await db.links.where({ dossierId: 'd-target' }).toArray();
    expect(link.dateRange?.start).toEqual(when);
    // An instant, not an ongoing period
    expect(link.dateRange?.end).toEqual(when);
    expect(link.dateRange?.precision).toBe('minute');
  });
});

// ANB shows an item's Date & Time from ChartItem/@DateTime, not from its cards:
// a link dated only through a card arrives undated in ANB.
describe('buildANXExport — item dates', () => {
  const ends = [makeElement({ id: 'e1' }), makeElement({ id: 'e2', label: 'B' })];
  const linkItem = (doc: Document) => doc.querySelector('Link')?.parentElement;

  it('puts a link date on the ChartItem itself', () => {
    const xml = buildANXExport(DOSSIER, ends, [makeLink({
      dateRange: { start: new Date(2026, 9, 18, 8, 30), end: null, precision: 'minute' } as never,
    })]);
    const item = linkItem(expectWellFormed(xml));
    expect(item?.getAttribute('DateTime')).toBe('2026-10-18T08:30:00.000');
    expect(item?.getAttribute('DateSet')).toBe('true');
    expect(item?.getAttribute('TimeSet')).toBe('true');
  });

  it('leaves TimeSet false for a day-only link date', () => {
    const xml = buildANXExport(DOSSIER, ends, [makeLink({
      dateRange: { start: new Date(2026, 9, 18), end: null, precision: 'day' } as never,
    })]);
    const item = linkItem(expectWellFormed(xml));
    expect(item?.getAttribute('DateTime')).toBe('2026-10-18T00:00:00.000');
    expect(item?.getAttribute('TimeSet')).toBe('false');
  });

  it('carries the end of a link period as a Date end attribute', () => {
    const xml = buildANXExport(DOSSIER, ends, [makeLink({
      dateRange: { start: new Date(2026, 0, 1), end: new Date(2026, 5, 30), precision: 'day' } as never,
    })]);
    const attr = linkItem(expectWellFormed(xml))?.querySelector('Attribute[AttributeClass="Date end"]');
    expect(attr?.getAttribute('Value')).toBe('2026-06-30T00:00:00.000');
  });

  it('puts an element date on the ChartItem itself', () => {
    const xml = buildANXExport(DOSSIER, [makeElement({ date: new Date(2026, 2, 9, 14, 5) as never })], []);
    const item = expectWellFormed(xml).querySelector('ChartItem');
    expect(item?.getAttribute('DateTime')).toBe('2026-03-09T14:05:00.000');
    expect(item?.getAttribute('DateSet')).toBe('true');
  });

  it('leaves an undated link undated', () => {
    const item = linkItem(expectWellFormed(buildANXExport(DOSSIER, ends, [makeLink()])));
    expect(item?.hasAttribute('DateTime')).toBe(false);
    expect(item?.getAttribute('DateSet')).toBe('false');
  });
});

describe('importANX — ChartItem dates written by i2', () => {
  beforeEach(async () => {
    await db.elements.clear();
    await db.links.clear();
  });

  it('reads a link date set on the ChartItem without any card', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Chart>
  <ChartItemCollection>
    <ChartItem Id="ID1" Label="A" DateSet="false" TimeSet="false"><End X="0" Y="0"><Entity Identity="A"><Icon><IconStyle Type="Other" /></Icon></Entity></End></ChartItem>
    <ChartItem Id="ID2" Label="B" DateSet="false" TimeSet="false"><End X="200" Y="0"><Entity Identity="B"><Icon><IconStyle Type="Other" /></Icon></Entity></End></ChartItem>
    <ChartItem Id="ID3" Label="appel" DateTime="2026-10-18T08:30:00.000" DateSet="true" TimeSet="true">
      <Link End1Reference="ID1" End2Reference="ID2"><LinkStyle ArrowStyle="ArrowOnHead" /></Link>
    </ChartItem>
  </ChartItemCollection>
</Chart>`;
    await importANX(xml, 'd-target' as never);
    const [link] = await db.links.where({ dossierId: 'd-target' }).toArray();
    expect(link.dateRange?.start).toEqual(new Date(2026, 9, 18, 8, 30));
    expect(link.dateRange?.precision).toBe('minute');
  });
});

describe('buildANXExport — attributes shown on the chart', () => {
  const shownDossier = { ...DOSSIER, settings: { displayedProperties: ['Marque', 'montant'] } } as unknown as Dossier;
  const classOf = (doc: Document, name: string) => doc.querySelector(`AttributeClass[Name="${name}"]`)!;

  it('shows on the chart the properties shown on the canvas, value and class name', () => {
    const doc = expectWellFormed(buildANXExport(shownDossier, [
      makeElement({ properties: [{ key: 'Marque', value: 'Audi A6 break', type: 'text' }, { key: 'Couleur', value: 'noire', type: 'text' }] as never }),
    ], []));
    const marque = classOf(doc, 'Marque');
    expect(['Visible', 'ShowValue', 'ShowClassName'].map((a) => marque.getAttribute(a))).toEqual(['true', 'true', 'true']);
    expect(marque.getAttribute('MergeBehaviour')).toBe('AttMergeAddWithSpace');
    expect(classOf(doc, 'Couleur').getAttribute('Visible')).toBe('false');
  });

  it('keeps the decimals of numbers, and the time of dates that have one', () => {
    const doc = expectWellFormed(buildANXExport(shownDossier, [
      makeElement({ id: 'e1', properties: [{ key: 'montant', value: 70.941, type: 'number' }, { key: 'vu le', value: new Date(2024, 1, 10, 9, 15), type: 'datetime' }] as never }),
      makeElement({ id: 'e2', properties: [{ key: 'montant', value: 12, type: 'number' }] as never }),
    ], []));
    expect(classOf(doc, 'montant').getAttribute('DecimalPlaces')).toBe('3');
    // Not shown on the canvas: date and time not shown either
    expect(classOf(doc, 'vu le').getAttribute('ShowTime')).toBe('false');
  });
});

describe('importANX — attributes shown on the chart, and those of links', () => {
  beforeEach(async () => {
    await db.open();
    await db.elements.clear();
    await db.links.clear();
    await db.dossiers.clear();
  });

  const target = async (displayedProperties: string[] = []) => {
    await db.dossiers.put({ id: 'd-target', name: 'Cible', description: '', settings: { displayedProperties }, createdAt: new Date(), updatedAt: new Date() } as never);
  };

  it('brings back the properties of links, and shows those shown on the chart', async () => {
    await target();
    const shownDossier = { ...DOSSIER, settings: { displayedProperties: ['montant'] } } as unknown as Dossier;
    const source = [makeElement({ id: 'e1', label: 'A' }), makeElement({ id: 'e2', label: 'B', position: { x: 200, y: 0 } })];
    const sourceLinks = [makeLink({ properties: [{ key: 'montant', value: 120, type: 'number' }, { key: 'MTCN', value: '9669322940', type: 'text' }] as never })];

    await importANX(buildANXExport(shownDossier, source, sourceLinks), 'd-target' as never);

    const [link] = await db.links.where({ dossierId: 'd-target' }).toArray();
    expect(link.properties.map((p) => [p.key, p.value])).toEqual(expect.arrayContaining([['montant', '120'], ['MTCN', '9669322940']]));
    expect((await db.dossiers.get('d-target'))!.settings.displayedProperties).toEqual(['montant']);
  });

  it('adds them after those the dossier shows, up to three', async () => {
    await target(['ville', 'âge']);
    const shownDossier = { ...DOSSIER, settings: { displayedProperties: ['Marque', 'Modèle'] } } as unknown as Dossier;
    const source = [makeElement({ properties: [{ key: 'Marque', value: 'Audi', type: 'text' }, { key: 'Modèle', value: 'A6', type: 'text' }] as never })];

    await importANX(buildANXExport(shownDossier, source, []), 'd-target' as never);

    expect((await db.dossiers.get('d-target'))!.settings.displayedProperties).toEqual(['ville', 'âge', 'Marque']);
  });
});

describe('buildANXExport — embedded images', () => {
  const image = { data: 'eJwLcg==', length: 58, name: 'ZN_0123456789abcdef01234567' };

  it('embeds an element image before the strengths, and shows it as the entity icon', () => {
    const xml = buildANXExport(DOSSIER, [makeElement({ id: 'e1' })], [], new Map([['e1', image]]));
    const doc = expectWellFormed(xml);
    expect(doc.documentElement.firstElementChild?.tagName).toBe('CustomImageCollection');
    const custom = doc.querySelector('CustomImage')!;
    expect(custom.getAttribute('Id')).toBe(`${image.name},Screen,Icon`);
    expect(custom.getAttribute('DataLength')).toBe('58');
    const style = doc.querySelector('IconStyle')!;
    expect(style.getAttribute('OverrideTypeIcon')).toBe('true');
    expect(style.getAttribute('TypeIconName')).toBe(image.name);
  });

  it('writes an image shared by several elements once, and nothing without images', () => {
    const els = [makeElement({ id: 'e1' }), makeElement({ id: 'e2', label: 'Autre', position: { x: 300, y: 0 } })];
    const doc = expectWellFormed(buildANXExport(DOSSIER, els, [], new Map([['e1', image], ['e2', image]])));
    expect(doc.querySelectorAll('CustomImage')).toHaveLength(1);
    expect(doc.querySelectorAll('IconStyle[TypeIconName]')).toHaveLength(2);
    expect(buildANXExport(DOSSIER, els, [])).not.toContain('CustomImage');
  });
});

describe('buildANXExport — options', () => {
  it('shows no attribute on the chart when the shown properties are left out', () => {
    const shownDossier = { ...DOSSIER, settings: { displayedProperties: ['Marque'] } } as unknown as Dossier;
    const els = [makeElement({ properties: [{ key: 'Marque', value: 'Audi', type: 'text' }] as never })];
    expect(buildANXExport(shownDossier, els, [])).toContain('Visible="true"');
    expect(buildANXExport(shownDossier, els, [], undefined, { shownProperties: false })).not.toContain('Visible="true"');
  });
});
