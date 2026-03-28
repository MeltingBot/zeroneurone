import { describe, it, expect } from 'vitest';
import { parseQuery } from '../parser';
import { evaluateQuery } from '../evaluator';
import type { Element, Link } from '../../../types';

// ── Test data factories ──

let idCounter = 0;
function makeElement(overrides: Partial<Element> = {}): Element {
  idCounter++;
  return {
    id: `el-${idCounter}`,
    dossierId: 'dossier-1',
    label: '',
    notes: '',
    tags: [],
    properties: [],
    confidence: null,
    source: '',
    date: null,
    dateRange: null,
    position: { x: 0, y: 0 },
    isPositionLocked: false,
    geo: null,
    events: [],
    visual: { color: '#f5f5f4', shape: 'rectangle', size: 'medium', icon: null, borderColor: '#a8a29e', image: null },
    assetIds: [],
    parentGroupId: null,
    isGroup: false,
    isAnnotation: false,
    childIds: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-06-01'),
    ...overrides,
  } as Element;
}

function makeLink(overrides: Partial<Link> = {}): Link {
  idCounter++;
  return {
    id: `lk-${idCounter}`,
    dossierId: 'dossier-1',
    fromId: 'el-1',
    toId: 'el-2',
    sourceHandle: null,
    targetHandle: null,
    label: '',
    notes: '',
    tags: [],
    properties: [],
    directed: false,
    direction: 'none',
    confidence: null,
    source: '',
    date: null,
    dateRange: null,
    visual: { color: '#6b7280', style: 'solid', thickness: 1 },
    curveOffset: { x: 0, y: 0 },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-06-01'),
    ...overrides,
  } as Link;
}

// Helper: run a query and return results
function query(input: string, elements: Element[], links: Link[] = []) {
  const { ast, error } = parseQuery(input);
  expect(error).toBeNull();
  return evaluateQuery(ast!, elements, links);
}

// ── Basic field matching ──

describe('evaluator — label', () => {
  it('eq matches case-insensitively', () => {
    const els = [
      makeElement({ label: 'Alice' }),
      makeElement({ label: 'Bob' }),
    ];
    const r = query('label = "alice"', els);
    expect(r.elementIds.size).toBe(1);
    expect(r.elementIds.has(els[0].id)).toBe(true);
  });

  it('neq excludes matching elements', () => {
    const els = [
      makeElement({ label: 'Alice' }),
      makeElement({ label: 'Bob' }),
    ];
    const r = query('label != "alice"', els);
    expect(r.elementIds.size).toBe(1);
    expect(r.elementIds.has(els[1].id)).toBe(true);
  });

  it('CONTAINS', () => {
    const els = [
      makeElement({ label: 'Jean-Pierre' }),
      makeElement({ label: 'Marie' }),
    ];
    const r = query('label CONTAINS "pierre"', els);
    expect(r.elementIds.size).toBe(1);
  });

  it('STARTS', () => {
    const els = [
      makeElement({ label: 'Jean-Pierre' }),
      makeElement({ label: 'Marie' }),
    ];
    const r = query('label STARTS "jean"', els);
    expect(r.elementIds.size).toBe(1);
  });

  it('ENDS', () => {
    const els = [
      makeElement({ label: 'Dupont SA' }),
      makeElement({ label: 'Marie' }),
    ];
    const r = query('label ENDS "sa"', els);
    expect(r.elementIds.size).toBe(1);
  });
});

describe('evaluator — tags', () => {
  it('eq matches any tag', () => {
    const els = [
      makeElement({ tags: ['personne', 'suspect'] }),
      makeElement({ tags: ['entreprise'] }),
    ];
    const r = query('tag = "personne"', els);
    expect(r.elementIds.size).toBe(1);
    expect(r.elementIds.has(els[0].id)).toBe(true);
  });

  it('EXISTS checks non-empty tags', () => {
    const els = [
      makeElement({ tags: ['personne'] }),
      makeElement({ tags: [] }),
    ];
    const r = query('tag EXISTS', els);
    expect(r.elementIds.size).toBe(1);
  });

  it('NOT EXISTS checks empty tags', () => {
    const els = [
      makeElement({ tags: ['personne'] }),
      makeElement({ tags: [] }),
    ];
    const r = query('tag NOT EXISTS', els);
    expect(r.elementIds.size).toBe(1);
    expect(r.elementIds.has(els[1].id)).toBe(true);
  });
});

describe('evaluator — confidence', () => {
  it('> number', () => {
    const els = [
      makeElement({ confidence: 80 }),
      makeElement({ confidence: 40 }),
      makeElement({ confidence: null }),
    ];
    const r = query('confidence > 60', els);
    expect(r.elementIds.size).toBe(1);
    expect(r.elementIds.has(els[0].id)).toBe(true);
  });

  it('>= number', () => {
    const els = [
      makeElement({ confidence: 60 }),
      makeElement({ confidence: 40 }),
    ];
    const r = query('confidence >= 60', els);
    expect(r.elementIds.size).toBe(1);
  });
});

describe('evaluator — dates', () => {
  it('date = specific date', () => {
    const els = [
      makeElement({ date: new Date('2024-03-15') }),
      makeElement({ date: new Date('2024-06-01') }),
    ];
    const r = query('date = 2024-03-15', els);
    expect(r.elementIds.size).toBe(1);
    expect(r.elementIds.has(els[0].id)).toBe(true);
  });

  it('date >= range start', () => {
    const els = [
      makeElement({ date: new Date('2024-06-01') }),
      makeElement({ date: new Date('2023-12-01') }),
    ];
    const r = query('date >= 2024-01-01', els);
    expect(r.elementIds.size).toBe(1);
  });

  it('date.start and date.end', () => {
    const els = [
      makeElement({ dateRange: { start: new Date('2024-01-01'), end: new Date('2024-06-30') } }),
      makeElement({ dateRange: { start: new Date('2023-01-01'), end: new Date('2023-06-30') } }),
    ];
    const r = query('date.start >= 2024-01-01', els);
    expect(r.elementIds.size).toBe(1);
  });

  it('created date', () => {
    const els = [
      makeElement({ createdAt: new Date('2024-01-01') }),
      makeElement({ createdAt: new Date('2023-01-01') }),
    ];
    const r = query('created >= 2024-01-01', els);
    expect(r.elementIds.size).toBe(1);
  });
});

describe('evaluator — notes', () => {
  it('CONTAINS in notes', () => {
    const els = [
      makeElement({ notes: 'Soupçon de blanchiment de capitaux' }),
      makeElement({ notes: 'Rien de suspect' }),
    ];
    const r = query('notes CONTAINS "blanchiment"', els);
    expect(r.elementIds.size).toBe(1);
  });
});

describe('evaluator — type', () => {
  it('type = "element"', () => {
    const els = [makeElement()];
    const links = [makeLink()];
    const r = query('type = "element"', els, links);
    expect(r.elementIds.size).toBe(1);
    expect(r.linkIds.size).toBe(0);
  });

  it('type = "link"', () => {
    const els = [makeElement()];
    const links = [makeLink()];
    const r = query('type = "link"', els, links);
    expect(r.elementIds.size).toBe(0);
    expect(r.linkIds.size).toBe(1);
  });
});

describe('evaluator — boolean fields', () => {
  it('has_geo = true', () => {
    const els = [
      makeElement({ geo: { type: 'point', lat: 48.8, lng: 2.3 } as any }),
      makeElement({ geo: null }),
    ];
    const r = query('has_geo = true', els);
    expect(r.elementIds.size).toBe(1);
  });

  it('group = true', () => {
    const els = [
      makeElement({ isGroup: true }),
      makeElement({ isGroup: false }),
    ];
    const r = query('group = true', els);
    expect(r.elementIds.size).toBe(1);
  });
});

// ── Free properties ──

describe('evaluator — free properties', () => {
  it('string property eq', () => {
    const els = [
      makeElement({ properties: [{ key: 'ville', value: 'Paris' }] }),
      makeElement({ properties: [{ key: 'ville', value: 'Lyon' }] }),
    ];
    const r = query('ville = "Paris"', els);
    expect(r.elementIds.size).toBe(1);
  });

  it('number property comparison', () => {
    const els = [
      makeElement({ properties: [{ key: 'age', value: 35, type: 'number' }] }),
      makeElement({ properties: [{ key: 'age', value: 20, type: 'number' }] }),
    ];
    const r = query('age > 30', els);
    expect(r.elementIds.size).toBe(1);
  });

  it('property EXISTS', () => {
    const els = [
      makeElement({ properties: [{ key: 'email', value: 'test@mail.com' }] }),
      makeElement({ properties: [] }),
    ];
    const r = query('email EXISTS', els);
    expect(r.elementIds.size).toBe(1);
  });

  it('property NOT EXISTS', () => {
    const els = [
      makeElement({ properties: [{ key: 'email', value: 'test@mail.com' }] }),
      makeElement({ properties: [] }),
    ];
    const r = query('email NOT EXISTS', els);
    expect(r.elementIds.size).toBe(1);
    expect(r.elementIds.has(els[1].id)).toBe(true);
  });

  it('MATCHES regex on property', () => {
    const els = [
      makeElement({ properties: [{ key: 'siren', value: '123456789' }] }),
      makeElement({ properties: [{ key: 'siren', value: 'invalid' }] }),
    ];
    const r = query('siren MATCHES /^[0-9]{9}$/', els);
    expect(r.elementIds.size).toBe(1);
  });

  it('case-insensitive property key match', () => {
    const els = [
      makeElement({ properties: [{ key: 'Ville', value: 'Paris' }] }),
    ];
    const r = query('ville = "Paris"', els);
    expect(r.elementIds.size).toBe(1);
  });
});

// ── Link-specific fields ──

describe('evaluator — link fields', () => {
  it('from.label', () => {
    const alice = makeElement({ label: 'Alice' });
    const bob = makeElement({ label: 'Bob' });
    const link = makeLink({ fromId: alice.id, toId: bob.id });
    const r = query('from.label = "Alice"', [alice, bob], [link]);
    expect(r.linkIds.size).toBe(1);
  });

  it('from.tag', () => {
    const alice = makeElement({ tags: ['personne'] });
    const bob = makeElement({ tags: ['entreprise'] });
    const link = makeLink({ fromId: alice.id, toId: bob.id });
    const r = query('from.tag = "personne"', [alice, bob], [link]);
    expect(r.linkIds.size).toBe(1);
  });

  it('to.tag', () => {
    const alice = makeElement({ tags: ['personne'] });
    const bob = makeElement({ tags: ['entreprise'] });
    const link = makeLink({ fromId: alice.id, toId: bob.id });
    const r = query('to.tag = "entreprise"', [alice, bob], [link]);
    expect(r.linkIds.size).toBe(1);
  });

  it('directed = true', () => {
    const link1 = makeLink({ directed: true });
    const link2 = makeLink({ directed: false });
    const r = query('directed = true', [], [link1, link2]);
    expect(r.linkIds.size).toBe(1);
    expect(r.linkIds.has(link1.id)).toBe(true);
  });
});

// ── Logical operators ──

describe('evaluator — AND', () => {
  it('both conditions must match', () => {
    const els = [
      makeElement({ tags: ['personne'], properties: [{ key: 'ville', value: 'Paris' }] }),
      makeElement({ tags: ['personne'], properties: [{ key: 'ville', value: 'Lyon' }] }),
      makeElement({ tags: ['entreprise'], properties: [{ key: 'ville', value: 'Paris' }] }),
    ];
    const r = query('tag = "personne" AND ville = "Paris"', els);
    expect(r.elementIds.size).toBe(1);
    expect(r.elementIds.has(els[0].id)).toBe(true);
  });
});

describe('evaluator — OR', () => {
  it('either condition matches', () => {
    const els = [
      makeElement({ tags: ['personne'] }),
      makeElement({ tags: ['entreprise'] }),
      makeElement({ tags: ['lieu'] }),
    ];
    const r = query('tag = "personne" OR tag = "entreprise"', els);
    expect(r.elementIds.size).toBe(2);
  });
});

describe('evaluator — NOT', () => {
  it('negates condition', () => {
    const els = [
      makeElement({ tags: ['personne'] }),
      makeElement({ tags: ['entreprise'] }),
    ];
    const r = query('NOT tag = "personne"', els);
    expect(r.elementIds.size).toBe(1);
    expect(r.elementIds.has(els[1].id)).toBe(true);
  });
});

// ── Complex queries from spec ──

describe('evaluator — spec examples', () => {
  it('personnes à Paris', () => {
    const els = [
      makeElement({ tags: ['personne'], properties: [{ key: 'ville', value: 'Paris' }] }),
      makeElement({ tags: ['personne'], properties: [{ key: 'ville', value: 'Lyon' }] }),
      makeElement({ tags: ['entreprise'], properties: [{ key: 'ville', value: 'Paris' }] }),
    ];
    const r = query('tag = "personne" AND ville = "Paris"', els);
    expect(r.elementIds.size).toBe(1);
  });

  it('liens personne → entreprise', () => {
    const alice = makeElement({ tags: ['personne'] });
    const acme = makeElement({ tags: ['entreprise'] });
    const paris = makeElement({ tags: ['lieu'] });
    const link1 = makeLink({ fromId: alice.id, toId: acme.id });
    const link2 = makeLink({ fromId: alice.id, toId: paris.id });

    const r = query(
      'type = "link" AND from.tag = "personne" AND to.tag = "entreprise"',
      [alice, acme, paris],
      [link1, link2],
    );
    expect(r.linkIds.size).toBe(1);
    expect(r.linkIds.has(link1.id)).toBe(true);
    expect(r.elementIds.size).toBe(0); // type = "link" excludes elements
  });

  it('combined with parentheses: (personne OR entreprise) AND Paris AND confidence >= 50', () => {
    const els = [
      makeElement({ tags: ['personne'], confidence: 80, properties: [{ key: 'ville', value: 'Paris' }] }),
      makeElement({ tags: ['entreprise'], confidence: 60, properties: [{ key: 'ville', value: 'Paris' }] }),
      makeElement({ tags: ['personne'], confidence: 30, properties: [{ key: 'ville', value: 'Paris' }] }),
      makeElement({ tags: ['lieu'], confidence: 90, properties: [{ key: 'ville', value: 'Paris' }] }),
    ];
    const r = query(
      '(tag = "personne" OR tag = "entreprise") AND ville = "Paris" AND confidence >= 50',
      els,
    );
    expect(r.elementIds.size).toBe(2);
    expect(r.elementIds.has(els[0].id)).toBe(true);
    expect(r.elementIds.has(els[1].id)).toBe(true);
  });
});

// ── Event fields ──

describe('evaluator — event fields', () => {
  it('event.label matches if any event has matching label', () => {
    const els = [
      makeElement({
        events: [
          { id: 'ev1', date: new Date('2024-03-01'), label: 'Escale Marseille' },
          { id: 'ev2', date: new Date('2024-04-01'), label: 'Escale Toulon' },
        ],
      }),
      makeElement({
        events: [
          { id: 'ev3', date: new Date('2024-05-01'), label: 'Départ Paris' },
        ],
      }),
      makeElement({ events: [] }),
    ];
    const r = query('event.label CONTAINS "Marseille"', els);
    expect(r.elementIds.size).toBe(1);
    expect(r.elementIds.has(els[0].id)).toBe(true);
  });

  it('event.date with range query', () => {
    const els = [
      makeElement({
        events: [
          { id: 'ev1', date: new Date('2024-01-15'), label: 'Janvier' },
        ],
      }),
      makeElement({
        events: [
          { id: 'ev2', date: new Date('2024-06-15'), label: 'Juin' },
        ],
      }),
      makeElement({
        events: [
          { id: 'ev3', date: new Date('2023-12-01'), label: 'Décembre 2023' },
        ],
      }),
    ];
    const r = query('event.date >= 2024-01-01 AND event.date <= 2024-03-31', els);
    expect(r.elementIds.size).toBe(1);
    expect(r.elementIds.has(els[0].id)).toBe(true);
  });

  it('event.date.end checks end date of event', () => {
    const els = [
      makeElement({
        events: [
          { id: 'ev1', date: new Date('2024-01-01'), dateEnd: new Date('2024-03-01'), label: 'Long event' },
        ],
      }),
      makeElement({
        events: [
          { id: 'ev2', date: new Date('2024-01-01'), label: 'Ponctuel' },
        ],
      }),
    ];
    const r = query('event.date.end EXISTS', els);
    expect(r.elementIds.size).toBe(1);
    expect(r.elementIds.has(els[0].id)).toBe(true);
  });

  it('event.source filters by event source', () => {
    const els = [
      makeElement({
        events: [
          { id: 'ev1', date: new Date('2024-01-01'), label: 'A', source: 'douanes' },
        ],
      }),
      makeElement({
        events: [
          { id: 'ev2', date: new Date('2024-01-01'), label: 'B', source: 'police' },
        ],
      }),
    ];
    const r = query('event.source = "douanes"', els);
    expect(r.elementIds.size).toBe(1);
    expect(r.elementIds.has(els[0].id)).toBe(true);
  });

  it('event.geo checks if event has geo data', () => {
    const els = [
      makeElement({
        events: [
          { id: 'ev1', date: new Date('2024-01-01'), label: 'A', geo: { type: 'point', lat: 43.3, lng: 5.4 } },
        ],
      }),
      makeElement({
        events: [
          { id: 'ev2', date: new Date('2024-01-01'), label: 'B' },
        ],
      }),
    ];
    const r = query('event.geo = true', els);
    expect(r.elementIds.size).toBe(1);
    expect(r.elementIds.has(els[0].id)).toBe(true);
  });

  it('event.description CONTAINS', () => {
    const els = [
      makeElement({
        events: [
          { id: 'ev1', date: new Date('2024-01-01'), label: 'A', description: 'Suspect vu au port de Marseille' },
        ],
      }),
      makeElement({
        events: [
          { id: 'ev2', date: new Date('2024-01-01'), label: 'B', description: 'RAS' },
        ],
      }),
    ];
    const r = query('event.description CONTAINS "Marseille"', els);
    expect(r.elementIds.size).toBe(1);
    expect(r.elementIds.has(els[0].id)).toBe(true);
  });

  it('event.* NOT EXISTS on element without events', () => {
    const els = [
      makeElement({ events: [] }),
      makeElement({
        events: [
          { id: 'ev1', date: new Date('2024-01-01'), label: 'A' },
        ],
      }),
    ];
    const r = query('event.label NOT EXISTS', els);
    expect(r.elementIds.size).toBe(1);
    expect(r.elementIds.has(els[0].id)).toBe(true);
  });

  it('event.* never matches on links', () => {
    const el = makeElement({
      events: [{ id: 'ev1', date: new Date('2024-01-01'), label: 'Event' }],
    });
    const link = makeLink({ fromId: el.id, toId: el.id });
    const r = query('event.label = "Event"', [el], [link]);
    expect(r.elementIds.size).toBe(1);
    expect(r.linkIds.size).toBe(0);
  });

  it('combined: tag + event.date range', () => {
    const els = [
      makeElement({
        tags: ['navire'],
        events: [
          { id: 'ev1', date: new Date('2024-02-15'), label: 'Escale' },
        ],
      }),
      makeElement({
        tags: ['navire'],
        events: [
          { id: 'ev2', date: new Date('2024-08-15'), label: 'Escale' },
        ],
      }),
      makeElement({
        tags: ['personne'],
        events: [
          { id: 'ev3', date: new Date('2024-02-15'), label: 'Observation' },
        ],
      }),
    ];
    const r = query('tag = "navire" AND event.date >= 2024-01-01 AND event.date <= 2024-06-30', els);
    expect(r.elementIds.size).toBe(1);
    expect(r.elementIds.has(els[0].id)).toBe(true);
  });
});

// ── Geo fields and NEAR ──

describe('evaluator — geo fields', () => {
  it('geo.lat and geo.lng for bounding box', () => {
    const els = [
      makeElement({ geo: { type: 'point', lat: 43.3, lng: 5.4 } }),  // Marseille
      makeElement({ geo: { type: 'point', lat: 48.85, lng: 2.35 } }), // Paris
      makeElement({ geo: null }),
    ];
    const r = query('geo.lat >= 43.0 AND geo.lat <= 44.0 AND geo.lng >= 5.0 AND geo.lng <= 6.0', els);
    expect(r.elementIds.size).toBe(1);
    expect(r.elementIds.has(els[0].id)).toBe(true);
  });

  it('geo NEAR with radius', () => {
    const els = [
      makeElement({ geo: { type: 'point', lat: 43.3, lng: 5.4 } }),   // Marseille
      makeElement({ geo: { type: 'point', lat: 43.7, lng: 7.27 } }),  // Nice (~160km)
      makeElement({ geo: { type: 'point', lat: 48.85, lng: 2.35 } }), // Paris (~660km)
    ];
    const r = query('geo NEAR 43.3,5.4 200km', els);
    expect(r.elementIds.size).toBe(2); // Marseille + Nice
    expect(r.elementIds.has(els[0].id)).toBe(true);
    expect(r.elementIds.has(els[1].id)).toBe(true);
  });

  it('geo NEAR small radius in meters', () => {
    const els = [
      makeElement({ geo: { type: 'point', lat: 43.2965, lng: 5.3698 } }), // Vieux-Port
      makeElement({ geo: { type: 'point', lat: 43.3, lng: 5.4 } }),       // ~2.5km away
    ];
    const r = query('geo NEAR 43.2965,5.3698 500m', els);
    expect(r.elementIds.size).toBe(1);
    expect(r.elementIds.has(els[0].id)).toBe(true);
  });

  it('geo NEAR on element without geo returns no match', () => {
    const els = [makeElement({ geo: null })];
    const r = query('geo NEAR 43.3,5.4 100km', els);
    expect(r.elementIds.size).toBe(0);
  });

  it('geo NEAR ignores links', () => {
    const el = makeElement({ geo: { type: 'point', lat: 43.3, lng: 5.4 } });
    const link = makeLink({ fromId: el.id, toId: el.id });
    const r = query('geo NEAR 43.3,5.4 100km', [el], [link]);
    expect(r.elementIds.size).toBe(1);
    expect(r.linkIds.size).toBe(0);
  });

  it('event.geo NEAR matches events within radius', () => {
    const els = [
      makeElement({
        events: [
          { id: 'ev1', date: new Date('2024-01-01'), label: 'Escale Marseille', geo: { type: 'point', lat: 43.3, lng: 5.4 } },
        ],
      }),
      makeElement({
        events: [
          { id: 'ev2', date: new Date('2024-01-01'), label: 'Escale Paris', geo: { type: 'point', lat: 48.85, lng: 2.35 } },
        ],
      }),
      makeElement({ events: [] }),
    ];
    const r = query('event.geo NEAR 43.3,5.4 50km', els);
    expect(r.elementIds.size).toBe(1);
    expect(r.elementIds.has(els[0].id)).toBe(true);
  });

  it('combined: tag + geo NEAR', () => {
    const els = [
      makeElement({ tags: ['navire'], geo: { type: 'point', lat: 43.3, lng: 5.4 } }),
      makeElement({ tags: ['personne'], geo: { type: 'point', lat: 43.3, lng: 5.4 } }),
    ];
    const r = query('tag = "navire" AND geo NEAR 43.3,5.4 10km', els);
    expect(r.elementIds.size).toBe(1);
    expect(r.elementIds.has(els[0].id)).toBe(true);
  });

  it('geo.lat/geo.lng works with polygon center', () => {
    const els = [
      makeElement({
        geo: {
          type: 'polygon',
          coordinates: [[5.3, 43.2], [5.5, 43.2], [5.5, 43.4], [5.3, 43.4]],
          center: { lat: 43.3, lng: 5.4 },
        },
      }),
    ];
    const r = query('geo.lat >= 43.0 AND geo.lat <= 44.0', els);
    expect(r.elementIds.size).toBe(1);
  });
});

// ── Country field ──

describe('evaluator — country field', () => {
  it('country = "FR" matches element with country property', () => {
    const els = [
      makeElement({ properties: [{ key: 'Pays', value: 'FR', type: 'country' }] }),
      makeElement({ properties: [{ key: 'Pays', value: 'US', type: 'country' }] }),
      makeElement({ properties: [{ key: 'ville', value: 'Paris' }] }),
    ];
    const r = query('country = "FR"', els);
    expect(r.elementIds.size).toBe(1);
    expect(r.elementIds.has(els[0].id)).toBe(true);
  });

  it('country multi-value: matches if ANY country property matches', () => {
    const els = [
      makeElement({
        properties: [
          { key: 'Nationalité', value: 'FR', type: 'country' },
          { key: 'Résidence', value: 'CH', type: 'country' },
        ],
      }),
    ];
    const r1 = query('country = "FR"', els);
    expect(r1.elementIds.size).toBe(1);
    const r2 = query('country = "CH"', els);
    expect(r2.elementIds.size).toBe(1);
    const r3 = query('country = "US"', els);
    expect(r3.elementIds.size).toBe(0);
  });

  it('country EXISTS / NOT EXISTS', () => {
    const els = [
      makeElement({ properties: [{ key: 'Pays', value: 'FR', type: 'country' }] }),
      makeElement({ properties: [{ key: 'ville', value: 'Paris' }] }),
    ];
    const rExists = query('country EXISTS', els);
    expect(rExists.elementIds.size).toBe(1);
    expect(rExists.elementIds.has(els[0].id)).toBe(true);

    const rNotExists = query('country NOT EXISTS', els);
    expect(rNotExists.elementIds.size).toBe(1);
    expect(rNotExists.elementIds.has(els[1].id)).toBe(true);
  });

  it('country != excludes specific country', () => {
    const els = [
      makeElement({ properties: [{ key: 'Pays', value: 'FR', type: 'country' }] }),
      makeElement({ properties: [{ key: 'Pays', value: 'US', type: 'country' }] }),
    ];
    const r = query('country != "FR"', els);
    expect(r.elementIds.size).toBe(1);
    expect(r.elementIds.has(els[1].id)).toBe(true);
  });

  it('country works on links too', () => {
    const el = makeElement();
    const link = makeLink({
      fromId: el.id, toId: el.id,
      properties: [{ key: 'Juridiction', value: 'DE', type: 'country' }],
    });
    const r = query('country = "DE"', [el], [link]);
    expect(r.linkIds.size).toBe(1);
    expect(r.linkIds.has(link.id)).toBe(true);
    expect(r.elementIds.size).toBe(0);
  });
});

// ── Performance ──

describe('evaluator — performance', () => {
  it('handles 10000 elements within reasonable time', () => {
    const elements: Element[] = [];
    for (let i = 0; i < 10000; i++) {
      elements.push(makeElement({
        tags: [i % 3 === 0 ? 'personne' : 'entreprise'],
        confidence: (i % 10) * 10 as any,
        properties: [{ key: 'ville', value: i % 2 === 0 ? 'Paris' : 'Lyon' }],
      }));
    }
    const r = query('tag = "personne" AND ville = "Paris" AND confidence >= 50', elements);
    expect(r.executionTime).toBeLessThan(500); // Should be well under 500ms
    expect(r.elementIds.size).toBeGreaterThan(0);
  });
});
