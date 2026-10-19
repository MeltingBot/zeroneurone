import { describe, it, expect } from 'vitest';
import type { Asset, Element, GeoData, Link, Property } from '../types';
import { analyzeLinkSuggestions, computeLinkSuggestions, dismissalIds, distanceMeters, evidenceOf, isDateLike, normalizeValue, linkSuggestionId, remapDismissedSuggestions, type LinkSuggestion, type PivotSuggestion } from './linkSuggestions';

function el(id: string, over: Partial<Element> = {}): Element {
  return {
    id, label: id, properties: [], assetIds: [], source: '', geo: null,
    isGroup: false, isAnnotation: false,
    ...over,
  } as unknown as Element;
}
const props = (entries: Record<string, string>): Property[] =>
  Object.entries(entries).map(([key, value]) => ({ key, value, type: 'text' }));
const link = (fromId: string, toId: string): Link => ({ id: `${fromId}-${toId}`, fromId, toId } as unknown as Link);
const square = (x: number, y: number, size: number): GeoData => ({
  type: 'polygon',
  coordinates: [[x, y], [x + size, y], [x + size, y + size], [x, y + size]],
  center: { lng: x + size / 2, lat: y + size / 2 },
});

describe('normalizeValue', () => {
  it('folds the usual spellings of a phone number', () => {
    expect(normalizeValue('06 12 34 56 78')).toBe('0612345678');
    expect(normalizeValue('+33 6 12 34 56 78')).toBe('0612345678');
    expect(normalizeValue('0033612345678')).toBe('0612345678');
    expect(normalizeValue('06.12.34.56.78')).toBe('0612345678');
  });

  it('lowercases emails and strips identifier separators', () => {
    expect(normalizeValue('Jean.Dupont@Mail.FR')).toBe('jean.dupont@mail.fr');
    expect(normalizeValue('FR76 3000 6000 0112 3456 7890 189')).toBe('fr7630006000011234567890189');
    expect(normalizeValue('AB-123-CD')).toBe(normalizeValue('ab 123 cd'));
  });

  it('rejects what cannot identify anything', () => {
    expect(normalizeValue('')).toBeNull();
    expect(normalizeValue('  ')).toBeNull();
    expect(normalizeValue('Non')).toBeNull();
    expect(normalizeValue('ab')).toBeNull();
    expect(normalizeValue(null)).toBeNull();
  });
});

describe('computeLinkSuggestions — shared value', () => {
  it('suggests a link between two elements sharing a phone number', () => {
    const elements = [
      el('a', { properties: props({ téléphone: '06 12 34 56 78' }) }),
      el('b', { properties: props({ téléphone: '+33612345678' }) }),
      el('c', { properties: props({ téléphone: '07 00 00 00 00' }) }),
    ];
    const [s] = computeLinkSuggestions(elements, [], []) as LinkSuggestion[];
    expect(s).toMatchObject({ kind: 'link', fromId: 'a', toId: 'b', id: linkSuggestionId('b', 'a') });
    expect(s.reasons).toEqual([{ rule: 'sharedValue', key: 'téléphone', value: '06 12 34 56 78' }]);
  });

  it('only compares values under the same key', () => {
    const elements = [
      el('a', { properties: props({ domicile: '12 rue des Lilas' }) }),
      el('b', { properties: props({ siège: '12 rue des Lilas' }) }),
    ];
    expect(computeLinkSuggestions(elements, [], [])).toEqual([]);
  });

  it('suggests a pivot when three or more elements share a value', () => {
    const elements = ['a', 'b', 'c', 'd'].map(id =>
      el(id, { properties: props({ iban: id === 'd' ? 'FR76 0000 0000 0000' : 'FR76 1111 2222 3333' }) }));
    const suggestions = computeLinkSuggestions(elements, [], []);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ kind: 'pivot', memberIds: ['a', 'b', 'c'], existingId: null });
  });

  it('ignores a value most elements share (status, country…)', () => {
    const elements = Array.from({ length: 8 }, (_, i) =>
      el(`p${i}`, { properties: props({ ETAT: 'En service', ID: `SURF-${i}` }) }));
    expect(computeLinkSuggestions(elements, [], [])).toEqual([]);
  });

  it('keeps an identifier most elements share: that is the finding', () => {
    const elements = Array.from({ length: 6 }, (_, i) =>
      el(`v${i}`, { properties: props({ iban: i < 4 ? 'FR76 3000 1000 0100' : `FR76 9999 000${i}` }) }));
    const [s] = computeLinkSuggestions(elements, [], []) as PivotSuggestion[];
    expect(s).toMatchObject({ kind: 'pivot', memberIds: ['v0', 'v1', 'v2', 'v3'] });
  });

  it('reuses an existing element carrying the value as pivot, linking only the missing ones', () => {
    const elements = [
      el('phone', { label: '06 12 34 56 78' }),
      el('a', { properties: props({ téléphone: '0612345678' }) }),
      el('b', { properties: props({ téléphone: '06.12.34.56.78' }) }),
      el('c', { properties: props({ téléphone: '+33 6 12 34 56 78' }) }),
    ];
    const [s] = computeLinkSuggestions(elements, [link('a', 'phone')], []) as PivotSuggestion[];
    expect(s).toMatchObject({ kind: 'pivot', existingId: 'phone', memberIds: ['b', 'c'] });
  });

  it('skips groups, annotations and pairs already linked', () => {
    const elements = [
      el('a', { properties: props({ email: 'x@y.fr' }) }),
      el('b', { properties: props({ email: 'X@Y.fr' }) }),
      el('g', { properties: props({ email: 'x@y.fr' }), isGroup: true }),
    ];
    expect(computeLinkSuggestions(elements, [link('b', 'a')], [])).toEqual([]);
  });
});

describe('computeLinkSuggestions — shared source', () => {
  const asset = (id: string, hash: string, filename: string) => ({ id, hash, filename } as Asset);

  it('matches the same file attached twice or cited by an asset link', () => {
    const assets = [asset('as1', 'abcdef0123456789', 'pv.pdf'), asset('as2', 'ABCDEF0123456789', 'pv-copie.pdf')];
    const elements = [
      el('a', { assetIds: ['as1'] }),
      el('b', { assetIds: ['as2'] }),
      el('c', { source: 'Audition [PV](asset:abcdef01)' }),
    ];
    const [s] = computeLinkSuggestions(elements, [], assets) as PivotSuggestion[];
    expect(s).toMatchObject({ kind: 'pivot', reason: { rule: 'sharedSource', value: 'pv.pdf', assetId: 'as1' }, memberIds: ['a', 'b', 'c'] });
  });

  it('matches the same web page, trailing slash and case aside', () => {
    const elements = [
      el('a', { source: 'https://example.org/Article/' }),
      el('b', { source: '[article](https://example.org/article)' }),
    ];
    const [s] = computeLinkSuggestions(elements, [], []) as LinkSuggestion[];
    expect(s.reasons[0]).toMatchObject({ rule: 'sharedSource' });
  });
});

describe('computeLinkSuggestions — in zone', () => {
  it('links a point or a small zone to the larger zone containing its centre', () => {
    const elements = [
      el('commune', { geo: square(0, 46, 1) }),
      el('parc', { geo: square(0.2, 46.2, 0.01) }),
      el('mairie', { geo: { type: 'point', lat: 46.5, lng: 0.5 } }),
      el('ailleurs', { geo: { type: 'point', lat: 48, lng: 2 } }),
    ];
    const suggestions = computeLinkSuggestions(elements, [], []) as LinkSuggestion[];
    expect(suggestions.map(s => [s.fromId, s.toId]).sort()).toEqual([['mairie', 'commune'], ['parc', 'commune']]);
    expect(suggestions[0].reasons).toEqual([{ rule: 'inZone' }]);
  });
});

describe('computeLinkSuggestions — several reasons', () => {
  it('merges the reasons of one pair, strongest rule first', () => {
    const elements = [
      el('zone', { geo: square(0, 46, 1), properties: props({ siren: '123 456 789' }) }),
      el('site', { geo: { type: 'point', lat: 46.5, lng: 0.5 }, properties: props({ siren: '123456789' }) }),
    ];
    const [s] = computeLinkSuggestions(elements, [], []) as LinkSuggestion[];
    expect(s.reasons.map(r => r.rule)).toEqual(['sharedValue', 'inZone']);
  });
});

describe('computeLinkSuggestions — options', () => {
  const elements = [
    el('a', { properties: props({ email: 'x@y.fr' }) }),
    el('b', { properties: props({ email: 'x@y.fr' }) }),
    el('c', { properties: props({ plaque: 'AB-123-CD' }) }),
    el('d', { properties: props({ plaque: 'AB 123 CD' }) }),
  ];

  it('drops dismissed suggestions', () => {
    const all = computeLinkSuggestions(elements, [], []);
    expect(all).toHaveLength(2);
    const rest = computeLinkSuggestions(elements, [], [], { dismissed: new Set(dismissalIds(all[0])) });
    expect(rest.map(s => s.id)).toEqual([all[1].id]);
  });

  it('keeps only suggestions touching the scope', () => {
    const scoped = computeLinkSuggestions(elements, [], [], { scope: new Set(['c']) }) as LinkSuggestion[];
    expect(scoped).toHaveLength(1);
    expect([scoped[0].fromId, scoped[0].toId].sort()).toEqual(['c', 'd']);
  });
});

describe('remapDismissedSuggestions', () => {
  it('rewrites link ids with the imported element ids and keeps pivot ids', () => {
    const map = new Map([['a', 'z'], ['b', 'y']]);
    expect(remapDismissedSuggestions([`${linkSuggestionId('a', 'b')}:sharedValue:iban`, `${linkSuggestionId('a', 'gone')}:nearby`, 'pivot:abc123'], map))
      .toEqual([`${linkSuggestionId('z', 'y')}:sharedValue:iban`, 'pivot:abc123']);
  });
});

describe('stored ids', () => {
  const elements = ['a', 'b', 'c'].map(id => el(id, { properties: props({ téléphone: '06 12 34 56 78' }) }));

  it('never carry the shared value in clear', () => {
    const [s] = computeLinkSuggestions(elements, [], []);
    expect(s.kind).toBe('pivot');
    expect(s.id).not.toMatch(/0612345678|téléphone/);
    expect(computeLinkSuggestions(elements, [], [])[0].id).toBe(s.id);
  });

  it('report dismissed suggestions as live while the data still produces them', () => {
    const [s] = computeLinkSuggestions(elements, [], []);
    const { suggestions, liveIds } = analyzeLinkSuggestions(elements, [], [], { dismissed: new Set([s.id, 'link:gone|x:nearby']) });
    expect(suggestions).toEqual([]);
    expect(liveIds.has(s.id)).toBe(true);
    expect(liveIds.has('link:gone|x:nearby')).toBe(false);
  });
});

describe('computeLinkSuggestions — nearby', () => {
  // ~0.0009° of latitude ≈ 100 m
  const pt = (id: string, lat: number, lng: number) => el(id, { geo: { type: 'point', lat, lng } });

  it('measures great-circle distances', () => {
    expect(Math.round(distanceMeters({ lat: 48.8584, lng: 2.2945 }, { lat: 48.8606, lng: 2.3376 }))).toBeGreaterThan(3100);
    expect(Math.round(distanceMeters({ lat: 48.8584, lng: 2.2945 }, { lat: 48.8606, lng: 2.3376 }))).toBeLessThan(3200);
  });

  it('is off unless a radius is given', () => {
    expect(computeLinkSuggestions([pt('a', 46, 0), pt('b', 46.0001, 0)], [], [])).toEqual([]);
  });

  it('pairs points within the radius, with their distance', () => {
    const elements = [pt('a', 46, 0), pt('b', 46.0005, 0), pt('c', 46.01, 0)];
    const [s, ...rest] = computeLinkSuggestions(elements, [], [], { nearbyRadius: 100 }) as LinkSuggestion[];
    expect(rest).toEqual([]);
    expect([s.fromId, s.toId].sort()).toEqual(['a', 'b']);
    expect(s.reasons[0].rule).toBe('nearby');
    expect(s.reasons[0].distance).toBeGreaterThan(50);
    expect(s.reasons[0].distance).toBeLessThan(60);
  });

  it('skips crowds: a point with more than 10 neighbours yields no pair', () => {
    const crowd = Array.from({ length: 12 }, (_, i) => pt(`p${i}`, 46 + i * 0.00001, 0));
    expect(computeLinkSuggestions(crowd, [], [], { nearbyRadius: 100 })).toEqual([]);
  });
});

describe('dismissing a link suggestion', () => {
  const pt = (id: string, lat: number, phone?: string) =>
    el(id, { geo: { type: 'point', lat, lng: 0 }, properties: phone ? props({ téléphone: phone }) : [] });

  it('sets aside the reason, not the pair: a later shared phone still shows', () => {
    const before = [pt('a', 46), pt('b', 46.0005)];
    const [near] = computeLinkSuggestions(before, [], [], { nearbyRadius: 100 });
    const dismissed = new Set(dismissalIds(near));

    const after = [pt('a', 46, '06 12 34 56 78'), pt('b', 46.0005, '0612345678')];
    const [s] = computeLinkSuggestions(after, [], [], { nearbyRadius: 100, dismissed }) as LinkSuggestion[];
    expect(s.reasons.map(r => r.rule)).toEqual(['sharedValue']);
  });

  it('keeps a key-specific dismissal from hiding another key', () => {
    const elements = [
      el('a', { properties: props({ téléphone: '0612345678', iban: 'FR76 1111 2222' }) }),
      el('b', { properties: props({ téléphone: '0612345678', iban: 'FR76 1111 2222' }) }),
    ];
    const [both] = computeLinkSuggestions(elements, [], []) as LinkSuggestion[];
    const phoneOnly = new Set(dismissalIds({ ...both, reasons: both.reasons.filter(r => r.key === 'téléphone') }));
    const [s] = computeLinkSuggestions(elements, [], [], { dismissed: phoneOnly }) as LinkSuggestion[];
    expect(s.reasons.map(r => r.key)).toEqual(['iban']);
  });
});

describe('candidateIds (what the views show)', () => {
  const elements = [
    el('a', { properties: props({ email: 'x@y.fr' }) }),
    el('b', { properties: props({ email: 'x@y.fr' }) }),
    el('c', { properties: props({ email: 'x@y.fr' }) }),
    el('hub', { label: 'x@y.fr' }),
  ];

  it('analyzes only the shown elements', () => {
    const [s] = computeLinkSuggestions(elements.slice(0, 3), [], [], { candidateIds: new Set(['a', 'b']) }) as LinkSuggestion[];
    expect([s.fromId, s.toId].sort()).toEqual(['a', 'b']);
  });

  it('still reuses a filtered-out element as pivot and sees links to it', () => {
    const [s] = computeLinkSuggestions(elements, [link('a', 'hub')], [], { candidateIds: new Set(['a', 'b', 'c']) }) as PivotSuggestion[];
    expect(s).toMatchObject({ kind: 'pivot', existingId: 'hub', memberIds: ['b', 'c'] });
  });
});

describe('computeLinkSuggestions — meeting', () => {
  const HOUR = 3600_000;
  const at = (lat: number, iso: string, isoEnd?: string) =>
    ({ id: iso, label: 'vu', date: new Date(iso), ...(isoEnd ? { dateEnd: new Date(isoEnd) } : {}), geo: { type: 'point', lat, lng: 0 } });
  const person = (id: string, events: unknown[]) => el(id, { events } as Partial<Element>);

  it('finds two elements at the same place at the same time, with the first time and a count', () => {
    const elements = [
      person('a', [at(46, '2026-03-12T14:00:00Z'), at(46, '2026-03-20T09:00:00Z')]),
      person('b', [at(46.0003, '2026-03-12T14:30:00Z'), at(46.0003, '2026-03-20T09:10:00Z')]),
    ];
    const [s] = computeLinkSuggestions(elements, [], [], { meeting: { radius: 100, window: HOUR } }) as LinkSuggestion[];
    expect(s.reasons).toEqual([{
      rule: 'meeting', distance: 33, count: 2, date: '2026-03-12T14:00:00.000Z', dateOther: '2026-03-12T14:30:00.000Z',
    }]);
  });

  it('ignores the same place at other times, and is off without a window', () => {
    const elements = [
      person('a', [at(46, '2026-03-12T14:00:00Z')]),
      person('b', [at(46.0003, '2026-03-12T18:00:00Z')]),
    ];
    expect(computeLinkSuggestions(elements, [], [], { meeting: { radius: 100, window: HOUR } })).toEqual([]);
    expect(computeLinkSuggestions(elements, [], [], { nearbyRadius: 100 })).toEqual([]);
  });

  it('works with the places rule off, and the places rule without it', () => {
    const elements = [
      el('a', { geo: { type: 'point', lat: 46, lng: 0 }, events: [at(46, '2026-03-12T14:00:00Z')] } as Partial<Element>),
      el('b', { geo: { type: 'point', lat: 46.0003, lng: 0 }, events: [at(46.0003, '2026-03-12T14:10:00Z')] } as Partial<Element>),
    ];
    const rules = (opts: object) => (computeLinkSuggestions(elements, [], [], opts) as LinkSuggestion[])[0].reasons.map(r => r.rule);
    expect(rules({ meeting: { radius: 100, window: HOUR } })).toEqual(['meeting']);
    expect(rules({ nearbyRadius: 100 })).toEqual(['nearby']);
  });

  it('confirms on the real points: no meeting when only the grouped points would match', () => {
    // a1 and a2 fall in one 100 m cell and one 1 h slot; b is 55 m from a1 but
    // 90 min after it, and within the hour of a2 but 145 m away
    const elements = [
      person('a', [at(46.0000, '2026-03-12T14:00:00Z'), at(46.0008, '2026-03-12T14:40:00Z')]),
      person('b', [at(45.9995, '2026-03-12T15:30:00Z')]),
    ];
    expect(computeLinkSuggestions(elements, [], [], { meeting: { radius: 100, window: HOUR } })).toEqual([]);
  });

  it('reports the exact time and distance of the first real co-presence', () => {
    const elements = [
      person('a', [at(46.0000, '2026-03-12T14:00:00Z'), at(46.0008, '2026-03-12T14:40:00Z')]),
      person('b', [at(46.0008, '2026-03-12T14:45:00Z')]),
    ];
    const [s] = computeLinkSuggestions(elements, [], [], { meeting: { radius: 100, window: HOUR } }) as LinkSuggestion[];
    expect(s.reasons[0]).toMatchObject({ distance: 89, date: '2026-03-12T14:00:00.000Z', dateOther: '2026-03-12T14:45:00.000Z' });
  });

  it('reports the moment both were there when a stay overlaps a visit', () => {
    const elements = [
      person('a', [at(46, '2024-11-05T12:00:00Z', '2024-11-08T10:00:00Z')]), // a 3-day hotel stay
      person('b', [at(46.0003, '2024-11-07T15:30:00Z')]),
    ];
    const [s] = computeLinkSuggestions(elements, [], [], { meeting: { radius: 100, window: HOUR } }) as LinkSuggestion[];
    expect(s.reasons[0]).toMatchObject({ date: '2024-11-07T15:30:00.000Z', dateOther: '2024-11-07T15:30:00.000Z' });
  });

  it('ignores presences longer than a week: a home dated over years is not a meeting place', () => {
    const elements = [
      person('a', [at(46, '2022-10-24T07:00:00Z', '2025-04-12T09:00:00Z')]),
      person('b', [at(46.0003, '2024-11-07T15:30:00Z')]),
    ];
    expect(computeLinkSuggestions(elements, [], [], { meeting: { radius: 100, window: HOUR } })).toEqual([]);
    // …unless the analyst lifts the limit
    expect(computeLinkSuggestions(elements, [], [], { meeting: { radius: 100, window: HOUR, maxPresence: null } })).toHaveLength(1);
  });

  it('counts an event with a duration as present all along', () => {
    const elements = [
      person('a', [at(46, '2026-03-12T08:00:00Z', '2026-03-12T18:00:00Z')]),
      person('b', [at(46.0003, '2026-03-12T15:00:00Z')]),
    ];
    const [s] = computeLinkSuggestions(elements, [], [], { meeting: { radius: 100, window: 15 * 60_000 } }) as LinkSuggestion[];
    expect(s.reasons[0]).toMatchObject({ rule: 'meeting', count: 1 });
  });
});

describe('computeLinkSuggestions — meeting at scale', () => {
  // GPS trails: 20 elements × 2,000 points over a week in a 2 km square
  function trail(id: string, n: number, seed: number): Element {
    let x = seed;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
    const t0 = Date.UTC(2026, 2, 1);
    const events = Array.from({ length: n }, (_, i) => ({
      id: `${id}-${i}`, label: 'gps', date: new Date(t0 + i * (7 * 86400_000 / n)),
      geo: { type: 'point', lat: 46 + rnd() * 0.02, lng: 0.2 + rnd() * 0.02 },
    }));
    return el(id, { events } as Partial<Element>);
  }
  const trails = Array.from({ length: 20 }, (_, i) => trail(`e${i}`, 2000, i + 1));

  it('handles thousands of positions without blowing up', () => {
    // Every pair of trails crosses within 100 m and an hour at some point
    const { suggestions, meetingsTruncated } = analyzeLinkSuggestions(trails, [], [], { meeting: { radius: 100, window: 3600_000 } });
    expect(meetingsTruncated).toBe(false);
    expect(suggestions).toHaveLength(190);
  });

  it('treats everyone everywhere at once as a crowd', () => {
    const { suggestions } = analyzeLinkSuggestions(trails, [], [], { meeting: { radius: 5000, window: 7 * 86400_000 } });
    expect(suggestions).toEqual([]);
  });
});

describe('dismissed suggestions to review', () => {
  it('returns the dismissed part apart: a link keeps its pending reasons on one side, its dismissed ones on the other', () => {
    const elements = [
      el('a', { properties: props({ téléphone: '0612345678', iban: 'FR76 1111 2222' }) }),
      el('b', { properties: props({ téléphone: '0612345678', iban: 'FR76 1111 2222' }) }),
    ];
    const [both] = computeLinkSuggestions(elements, [], []) as LinkSuggestion[];
    const phone = { ...both, reasons: both.reasons.filter(r => r.key === 'téléphone') };
    const { suggestions, dismissedSuggestions } = analyzeLinkSuggestions(elements, [], [], { dismissed: new Set(dismissalIds(phone)) });
    expect((suggestions as LinkSuggestion[])[0].reasons.map(r => r.key)).toEqual(['iban']);
    expect((dismissedSuggestions as LinkSuggestion[])[0].reasons.map(r => r.key)).toEqual(['téléphone']);
  });
});

describe('stale dismissals', () => {
  const pt = (id: string, lat: number) => el(id, { geo: { type: 'point', lat, lng: 0 } });

  it('keeps a places dismissal when the viewer turns the rule off or changes the radius', () => {
    const elements = [pt('a', 46), pt('b', 46.0005)];
    const [near] = computeLinkSuggestions(elements, [], [], { nearbyRadius: 100 });
    const dismissed = new Set(dismissalIds(near));
    expect(analyzeLinkSuggestions(elements, [], [], { dismissed }).staleDismissalIds.size).toBe(0);
    expect(analyzeLinkSuggestions(elements, [], [], { dismissed, nearbyRadius: 50 }).staleDismissalIds.size).toBe(0);
  });

  it('drops a places dismissal once an element of the pair is deleted', () => {
    const elements = [pt('a', 46), pt('b', 46.0005)];
    const [near] = computeLinkSuggestions(elements, [], [], { nearbyRadius: 100 });
    const dismissed = new Set(dismissalIds(near));
    expect([...analyzeLinkSuggestions([elements[0]], [], [], { dismissed }).staleDismissalIds]).toEqual(dismissalIds(near));
  });

  it('drops a shared-value dismissal once the value is gone', () => {
    const elements = [el('a', { properties: props({ email: 'x@y.fr' }) }), el('b', { properties: props({ email: 'x@y.fr' }) })];
    const [s] = computeLinkSuggestions(elements, [], []);
    const changed = [elements[0], el('b', { properties: props({ email: 'autre@y.fr' }) })];
    expect(analyzeLinkSuggestions(changed, [], [], { dismissed: new Set(dismissalIds(s)) }).staleDismissalIds.size).toBe(1);
  });
});

describe('identifiers and documents at scale', () => {
  it('keeps a pivot for an IBAN shared by 80 elements (no cap on identifiers)', () => {
    const elements = Array.from({ length: 80 }, (_, i) => el(`v${i}`, { properties: props({ iban: 'FR76 3000 1000 0100' }) }));
    const [s] = computeLinkSuggestions(elements, [], []) as PivotSuggestion[];
    expect(s.memberIds).toHaveLength(80);
  });

  it('treats a document most elements cite as the central piece', () => {
    const elements = Array.from({ length: 8 }, (_, i) => el(`e${i}`, { source: i < 6 ? 'https://example.org/pv' : '' }));
    const [s] = computeLinkSuggestions(elements, [], []) as PivotSuggestion[];
    expect(s).toMatchObject({ kind: 'pivot', reason: { rule: 'sharedSource' } });
    expect(s.memberIds).toHaveLength(6);
  });

  it('compares property keys regardless of case and accents', () => {
    const elements = [el('a', { properties: props({ Téléphone: '0612345678' }) }), el('b', { properties: props({ telephone: '06 12 34 56 78' }) })];
    const [s] = computeLinkSuggestions(elements, [], []) as LinkSuggestion[];
    expect(s.reasons[0]).toMatchObject({ rule: 'sharedValue' });
  });
});

describe('dates stored as text', () => {
  it('recognises the usual date and date-time spellings, not phones nor IBANs', () => {
    for (const d of ['2020-11-27', '2020-11-27 15:47:12', '2020-11-27T15:47:12Z', '27/11/2020', '27.11.20']) expect(isDateLike(d)).toBe(true);
    for (const v of ['06 12 34 56 78', '06.12.34.56.78', 'FR76 3000 1000', '+33612345678']) expect(isDateLike(v)).toBe(false);
  });

  it('keeps a date as text, not as digits of a phone number', () => {
    expect(normalizeValue('2020-11-27')).toBe('2020-11-27');
  });

  it('filters a date most elements share as noise (GeoJSON DATE_CONF)', () => {
    const elements = Array.from({ length: 8 }, (_, i) =>
      el(`p${i}`, { properties: props({ DATE_CONF: '2020-11-27', ID: `SURF-${i}00${i}` }) }));
    expect(computeLinkSuggestions(elements, [], [])).toEqual([]);
  });

  it('still suggests a date only two elements share', () => {
    const elements = Array.from({ length: 8 }, (_, i) =>
      el(`p${i}`, { properties: props({ DATE_CONF: i < 2 ? '2020-11-27' : `2021-0${i}-01` }) }));
    const [s] = computeLinkSuggestions(elements, [], []) as LinkSuggestion[];
    expect([s.fromId, s.toId].sort()).toEqual(['p0', 'p1']);
  });
});

describe('rules turned off', () => {
  const elements = [
    el('a', { properties: props({ email: 'x@y.fr' }), geo: { type: 'point', lat: 46, lng: 0 } }),
    el('b', { properties: props({ email: 'x@y.fr' }), geo: { type: 'point', lat: 46.0005, lng: 0 } }),
    el('c', { properties: props({ iban: 'FR76 1111 2222' }) }),
    el('d', { properties: props({ iban: 'FR76 1111 2222' }) }),
    el('e', { properties: props({ iban: 'FR76 1111 2222' }) }),
  ];

  it('runs only the rules left on (location only, for instance)', () => {
    const s = computeLinkSuggestions(elements, [], [], { rules: { sharedValue: false }, nearbyRadius: 100 }) as LinkSuggestion[];
    expect(s.map(x => x.reasons.map(r => r.rule))).toEqual([['nearby']]);
  });

  it('keeps the dismissals of a rule turned off, links and pivots alike', () => {
    const all = computeLinkSuggestions(elements, [], []);
    const dismissed = new Set(all.flatMap(dismissalIds));
    expect(dismissed.size).toBe(2); // the a–b link and the c/d/e pivot
    const { staleDismissalIds } = analyzeLinkSuggestions(elements, [], [], { dismissed, rules: { sharedValue: false } });
    expect(staleDismissalIds.size).toBe(0);
  });
});

describe('evidenceOf (what an accepted link keeps)', () => {
  const describe_ = (r: { rule: string }) => `reason:${r.rule}`;
  it('keeps every reason in the notes, values as properties, source, and the meeting time as date', () => {
    const evidence = evidenceOf([
      { rule: 'sharedValue', key: 'téléphone', value: '06 12 34 56 78' },
      { rule: 'sharedSource', value: 'pv.pdf', assetId: 'as1' },
      { rule: 'meeting', distance: 33, date: '2026-03-12T14:00:00.000Z', dateOther: '2026-03-12T14:00:00.000Z', count: 1 },
    ], describe_, [{ id: 'as1', hash: 'abc123', filename: 'pv.pdf' }]);
    expect(evidence).toEqual({
      notes: 'reason:sharedValue\nreason:sharedSource\nreason:meeting',
      properties: [{ key: 'téléphone', value: '06 12 34 56 78', type: 'text' }],
      source: '[pv.pdf](asset:abc123)',
      date: new Date('2026-03-12T14:00:00.000Z'),
    });
  });

  it('uses a shared web page as the source', () => {
    expect(evidenceOf([{ rule: 'sharedSource', value: 'https://ex.org/a', url: 'https://ex.org/a' }], describe_, []).source).toBe('https://ex.org/a');
  });

  it('gives the link a period when the meeting bridged two times', () => {
    const evidence = evidenceOf([
      { rule: 'meeting', distance: 50, date: '2026-03-12T09:00:00.000Z', dateOther: '2026-03-12T10:50:00.000Z', count: 1 },
    ], describe_, []);
    expect(evidence.dateRange).toEqual({ start: new Date('2026-03-12T09:00:00.000Z'), end: new Date('2026-03-12T10:50:00.000Z') });
    expect(evidence.date).toBeUndefined();
  });
});
