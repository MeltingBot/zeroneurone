// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import type { Element, Link } from '../types';
import { buildNewElement, buildComment } from '../services/yjs/factories';
import { parseJoinLink } from '../utils/joinUrl';
import { capturePosition, CAPTURE_GAP } from './placement';
import { beginWrite, clearPending, markDisconnected, pendingCount, updateToResend } from './pending';
import { excerptAround, stripMarkdown } from './search';
import { buckets, entryIndexFor, scaleOf, timelineEntries } from './timeline';
import { layoutNeighborhood } from './neighborhoodLayout';
import { companionPathOf } from './shareLink';
import { dossierPropertyKeys, dossierTags, findKey } from './vocabulary';
import { peerMarks, remoteTouchedIds } from './activity';
import { linkCounts, sortElements } from './sorting';
import { getYMaps } from '../types/yjs';

const el = (id: string, label: string, extra: Partial<Element> = {}): Element =>
  ({ ...buildNewElement('d', label, { x: 0, y: 0 }), id, ...extra });

const link = (id: string, fromId: string, toId: string, extra: Partial<Link> = {}): Link =>
  ({ id, fromId, toId, label: '', notes: '', tags: [], properties: [], direction: 'forward', date: null, dateRange: null, ...extra } as Link);

describe('factories', () => {
  it('builds an element with the desktop defaults and the given options', () => {
    const e = buildNewElement('dos', 'Label', { x: 1, y: 2 }, { notes: 'n' });
    expect(e).toMatchObject({
      dossierId: 'dos', label: 'Label', position: { x: 1, y: 2 }, notes: 'n',
      tags: [], assetIds: [], geo: null, isGroup: false, visual: { shape: 'rectangle', color: '#ffffff' },
    });
    expect(e.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('builds an open comment signed by its author', () => {
    const c = buildComment('dos', 't', 'element', 'hello', { name: 'Ann', color: '#123456' });
    expect(c).toMatchObject({ targetId: 't', targetType: 'element', content: 'hello', authorName: 'Ann', resolved: false });
  });
});

describe('parseJoinLink', () => {
  it('reads the current format (key, id and name in the fragment)', () => {
    const link = parseJoinLink('room', '?server=wss%3A%2F%2Fr.example&async=1', '#key=K&id=uuid&name=Terrain');
    expect(link).toEqual({
      roomId: 'room', dossierId: 'uuid', encryptionKey: 'K', name: 'Terrain',
      server: 'wss://r.example', asyncEnabled: true, isLegacyFormat: false,
    });
  });

  it('reads legacy links (UUID in the path, name in the query)', () => {
    const link = parseJoinLink('uuid', '?name=Old', '#key=K');
    expect(link).toMatchObject({ roomId: 'uuid', dossierId: 'uuid', name: 'Old', asyncEnabled: false, isLegacyFormat: true });
  });
});

describe('capturePosition', () => {
  it('starts at the origin in an empty dossier', () => {
    expect(capturePosition([])).toEqual({ x: 0, y: 0 });
  });

  it('goes under the lowest element, aligned on the leftmost', () => {
    expect(capturePosition([{ x: 100, y: 50 }, { x: -20, y: 300 }, { x: 40, y: 10 }]))
      .toEqual({ x: -20, y: 300 + CAPTURE_GAP });
  });
});

describe('pending writes', () => {
  beforeEach(() => localStorage.clear());

  it('resends what was written offline, from the state before the first write', () => {
    const doc = new Y.Doc();
    doc.getMap('elements').set('before', 1);
    // The desktop already has what came before
    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
    beginWrite('d', doc, 'a', false);
    doc.getMap('elements').set('a', 2);
    beginWrite('d', doc, 'b', false);
    doc.getMap('elements').set('b', 3);
    expect(pendingCount('d')).toBe(2);

    const update = updateToResend('d', doc)!;
    // Only what was written since: smaller than the whole document
    expect(update.byteLength).toBeLessThan(Y.encodeStateAsUpdate(doc).byteLength);
    Y.applyUpdate(peer, update);
    expect(peer.getMap('elements').toJSON()).toEqual({ before: 1, a: 2, b: 3 });
  });

  it('sends nothing more for a write made while connected, unless the socket dropped', () => {
    const doc = new Y.Doc();
    beginWrite('d', doc, 'a', true);
    doc.getMap('elements').set('a', 1);
    expect(updateToResend('d', doc)).toBeNull();
    markDisconnected('d');
    expect(updateToResend('d', doc)).not.toBeNull();
    clearPending('d');
    expect(pendingCount('d')).toBe(0);
  });
});

describe('stripMarkdown', () => {
  it('keeps the text of notes without Markdown markers', () => {
    expect(stripMarkdown('# Titre\nVu **deux fois** [ici](https://x.y) et `code`\n- point')).toBe('Titre\nVu deux fois ici et code\npoint');
  });
});

describe('excerptAround', () => {
  it('shows a few words around the match, case-insensitively', () => {
    expect(excerptAround('Garé devant le n° 12', 'devant')).toEqual({ before: 'Garé ', match: 'devant', after: ' le n° 12' });
  });

  it('marks cut text with an ellipsis', () => {
    const text = `${'a'.repeat(50)} needle ${'b'.repeat(50)}`;
    const e = excerptAround(text, 'NEEDLE')!;
    expect(e.match).toBe('needle');
    expect(e.before.startsWith('…')).toBe(true);
    expect(e.after.endsWith('…')).toBe(true);
  });

  it('returns null when the term is absent', () => {
    expect(excerptAround('nothing here', 'x1')).toBeNull();
  });
});

describe('timelineEntries', () => {
  it('lists element periods, events and dated links in order', () => {
    const a = el('a', 'Alice', { date: new Date(2026, 0, 3, 10, 0) });
    const b = el('b', 'Bob', {
      dateRange: { start: new Date(2026, 0, 1), end: new Date(2026, 0, 2) },
      events: [{ id: 'ev', date: new Date(2025, 11, 31), label: 'Arrivée' }],
    });
    const entries = timelineEntries([a, b], [link('l', 'a', 'b', { date: new Date(2026, 0, 2, 8, 0), label: 'appel' })], 'Sans titre');
    // Alice's date is its collection date: not on the timeline
    expect(entries.map((e) => e.label)).toEqual(['Arrivée', 'Bob', 'appel']);
    expect(entries[0]).toMatchObject({ context: 'Bob', elementId: 'b', precision: 'day' });
    expect(entries[2]).toMatchObject({ context: 'Alice — Bob', elementId: 'a', precision: 'minute' });
    // An event opens its element on it
    expect(entries[0].eventId).toBe('ev');
  });
});

describe('timeline jump strip', () => {
  const dated = (...dates: Date[]) =>
    timelineEntries(dates.map((d, i) => el(`e${i}`, `E${i}`, { dateRange: { start: d, end: null } })), [], '');

  it('cuts a short span into months, gaps included', () => {
    const entries = dated(new Date(2026, 0, 5), new Date(2026, 0, 20), new Date(2026, 3, 1));
    expect(scaleOf(entries)).toBe('month');
    expect(buckets(entries, 'month').map((b) => [b.key, b.count])).toEqual([
      ['2026-01', 2], ['2026-02', 0], ['2026-03', 0], ['2026-04', 1],
    ]);
  });

  it('cuts two years and more into years', () => {
    const entries = dated(new Date(2020, 5, 1), new Date(2023, 1, 1));
    expect(scaleOf(entries)).toBe('year');
    expect(buckets(entries, 'year').map((b) => b.key)).toEqual(['2020', '2021', '2022', '2023']);
  });

  it('finds the entry to show for a day, in either order', () => {
    const entries = dated(new Date(2026, 0, 5), new Date(2026, 0, 20, 15), new Date(2026, 3, 1));
    expect(entryIndexFor(entries, new Date(2026, 0, 10), false)).toBe(1);
    expect(entryIndexFor(entries, new Date(2026, 0, 20), false)).toBe(1);
    expect(entryIndexFor(entries, new Date(2027, 0, 1), false)).toBe(2);
    const newest = [...entries].reverse();
    expect(entryIndexFor(newest, new Date(2026, 0, 20), true)).toBe(1);
    expect(entryIndexFor(newest, new Date(2026, 1, 1), true)).toBe(1);
  });
});

describe('layoutNeighborhood', () => {
  const els = new Map(['c', 'n1', 'n2', 'far', 'alone'].map((id) => [id, el(id, id)]));
  const links = [link('1', 'c', 'n1'), link('2', 'n2', 'c'), link('3', 'n1', 'far'), link('4', 'c', 'n1')];

  it('puts the element in the centre and its neighbours around it', () => {
    const layout = layoutNeighborhood('c', els, links, 1, '?');
    expect(layout.nodes.map((n) => [n.id, n.ring])).toEqual([['c', 0], ['n1', 1], ['n2', 1]]);
    expect(layout.nodes[0]).toMatchObject({ x: 0, y: 0 });
    // Parallel links drawn once
    expect(layout.edges).toHaveLength(2);
  });

  it('adds the second ring at depth 2', () => {
    const layout = layoutNeighborhood('c', els, links, 2, '?');
    expect(layout.nodes.find((n) => n.id === 'far')?.ring).toBe(2);
    expect(layout.nodes.some((n) => n.id === 'alone')).toBe(false);
    expect(layout.edges).toHaveLength(3);
  });
});

describe('companionPathOf', () => {
  const origin = window.location.origin;

  it('takes desktop /join/ links and companion /m/ links alike', () => {
    for (const route of ['join', 'm']) {
      const target = companionPathOf(`${origin}/${route}/room1?server=wss%3A%2F%2Fr&async=1#key=K&id=u`)!;
      expect(target.sameOrigin).toBe(true);
      expect(target.sub).toBe('room1?server=wss%3A%2F%2Fr&async=1#key=K&id=u');
    }
  });

  it('recognises another server, under a sub-directory too', () => {
    const target = companionPathOf('https://zn.example/app/join/r?async=1#key=K&id=u')!;
    expect(target.sameOrigin).toBe(false);
    expect(target.sub).toBe('r?async=1#key=K&id=u');
  });

  it('rejects text that is not a share link', () => {
    expect(companionPathOf('hello')).toBeNull();
    expect(companionPathOf(`${origin}/dossier/abc`)).toBeNull();
    expect(companionPathOf(`${origin}/join/room#id=u`)).toBeNull();
  });
});

describe('dossier vocabulary', () => {
  it('offers the tags used in the dossier, most used first', () => {
    const elements = [
      el('a', 'A', { tags: ['Personne', 'Suspect'] }),
      el('b', 'B', { tags: ['Personne'] }),
      el('c', 'C', { tags: ['Adresse', 'Personne'] }),
    ];
    expect(dossierTags(elements)).toEqual(['Personne', 'Adresse', 'Suspect']);
  });

  it('offers property keys with their most frequent type, locations left out', () => {
    const elements = [
      el('a', 'A', { properties: [{ key: 'Naissance', type: 'date', value: null }, { key: 'Lieu', type: 'geo', value: null }] }),
      el('b', 'B', { properties: [{ key: 'Naissance', type: 'date', value: null }, { key: 'Pseudo', value: 'x' }] }),
      el('c', 'C', { properties: [{ key: 'Naissance', type: 'text', value: 'vers 1980' }] }),
    ];
    const keys = dossierPropertyKeys(elements);
    expect(keys).toEqual([{ key: 'Naissance', type: 'date' }, { key: 'Pseudo', type: 'text' }]);
    expect(findKey(keys, ' naissance ')).toEqual({ key: 'Naissance', type: 'date' });
    expect(findKey(keys, 'Téléphone')).toBeUndefined();
  });
});

describe('activity of the others', () => {
  it('marks who is on which element, the phone and stale presence left out', () => {
    const now = 100_000;
    const states = new Map<number, unknown>([
      [1, { name: 'Moi', color: '#111', selection: ['a'], lastSeen: now }],
      [2, { name: 'Alice', color: '#e00', selection: ['a', 'b'], editing: 'b', dragging: [], lastSeen: now - 1000 }],
      [3, { name: 'Bob', color: '#00e', selection: [], dragging: ['a'], lastSeen: now }],
      [4, { name: 'Fantôme', color: '#0e0', selection: ['a'], lastSeen: now - 60_000 }],
    ]);
    const marks = peerMarks(states, 1, now);
    expect(marks.get('a')).toEqual([
      { name: 'Alice', color: '#e00', active: false },
      { name: 'Bob', color: '#00e', active: true },
    ]);
    expect(marks.get('b')).toEqual([{ name: 'Alice', color: '#e00', active: true }]);
  });

  it('notices elements changed from another device, not its own writes nor a catch-up', () => {
    const desktop = new Y.Doc();
    const phone = new Y.Doc();
    Y.applyUpdate(phone, Y.encodeStateAsUpdate(desktop));
    const seen: string[][] = [];
    getYMaps(phone).elements.observeDeep((events, tr) => seen.push(remoteTouchedIds(events, tr)));
    const sync = () => Y.applyUpdate(phone, Y.encodeStateAsUpdate(desktop, Y.encodeStateVector(phone)));

    const el = new Y.Map<unknown>();
    getYMaps(desktop).elements.set('e1', el);
    sync();
    el.set('label', 'Renamed');
    sync();
    // Written on the phone itself: not a change from elsewhere
    (getYMaps(phone).elements.get('e1') as Y.Map<unknown>).set('notes', 'mine');
    // Many at once: a sync catching up
    desktop.transact(() => { for (let i = 0; i < 20; i++) getYMaps(desktop).elements.set(`x${i}`, new Y.Map()); });
    sync();
    expect(seen).toEqual([['e1'], ['e1'], [], []]);
  });
});

describe('element list order', () => {
  const at = (d: number) => new Date(2026, 0, d);
  const elements = [
    el('a', 'élément 10', { updatedAt: at(1) }),
    el('b', 'Zoé', { updatedAt: at(3) }),
    el('c', 'element 9', { updatedAt: at(2) }),
    el('d', '', { updatedAt: at(4) }),
  ];
  const links = [link('l1', 'a', 'b'), link('l2', 'a', 'c'), link('l3', 'b', 'a'), link('l4', 'c', 'c')];
  const counts = linkCounts(links);

  it('counts the links of each element, a loop once', () => {
    expect(Object.fromEntries(counts)).toEqual({ a: 3, b: 2, c: 2 });
  });

  it('orders by last change, by name (accents and numbers aside, unnamed last) or by links', () => {
    expect(sortElements(elements, 'recent', counts, 'fr').map((e) => e.id)).toEqual(['d', 'b', 'c', 'a']);
    expect(sortElements(elements, 'name', counts, 'fr').map((e) => e.id)).toEqual(['c', 'a', 'b', 'd']);
    expect(sortElements(elements, 'links', counts, 'fr').map((e) => e.id)).toEqual(['a', 'c', 'b', 'd']);
  });
});
