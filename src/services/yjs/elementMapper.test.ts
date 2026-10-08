import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import {
  elementToYMap,
  yMapToElement,
  updateElementYMap,
  MissingPositionError,
} from './elementMapper';
import type { Element } from '../../types';
import { DEFAULT_ELEMENT_VISUAL } from '../../types';

function makeElement(overrides: Partial<Element> = {}): Element {
  return {
    id: 'el-1',
    dossierId: 'dossier-1',
    label: 'Test',
    notes: '',
    tags: [],
    properties: [],
    confidence: null,
    source: '',
    date: null,
    dateRange: null,
    position: { x: 100, y: 200 },
    isPositionLocked: false,
    geo: null,
    events: [],
    visual: { ...DEFAULT_ELEMENT_VISUAL },
    assetIds: [],
    parentGroupId: null,
    isGroup: false,
    isAnnotation: false,
    childIds: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('elementMapper — position safety', () => {
  it('round-trips a valid position', () => {
    const ydoc = new Y.Doc();
    const ymap = elementToYMap(makeElement({ position: { x: 42, y: -7.5 } }));
    ydoc.getMap('elements').set('el-1', ymap);
    const result = yMapToElement(ymap);
    expect(result.position).toEqual({ x: 42, y: -7.5 });
  });

  it('throws MissingPositionError when no position fields are present', () => {
    const ydoc = new Y.Doc();
    const ymap = new Y.Map<any>();
    ymap.set('id', 'el-1');
    ymap.set('label', 'No position');
    ydoc.getMap('elements').set('el-1', ymap);
    expect(() => yMapToElement(ymap)).toThrow(MissingPositionError);
  });

  it('throws when positionX is undefined and legacy position object is missing', () => {
    const ydoc = new Y.Doc();
    const ymap = new Y.Map<any>();
    ymap.set('id', 'el-1');
    ymap.set('label', 'Half-synced');
    ymap.set('positionY', 100); // only Y, X missing — partial-sync race
    ydoc.getMap('elements').set('el-1', ymap);
    expect(() => yMapToElement(ymap)).toThrow(MissingPositionError);
  });

  it('falls back to legacy nested position object when positionX/Y are absent', () => {
    const ydoc = new Y.Doc();
    const ymap = new Y.Map<any>();
    ymap.set('id', 'el-1');
    ymap.set('label', 'Legacy');
    ymap.set('position', { x: 10, y: 20 });
    ydoc.getMap('elements').set('el-1', ymap);
    const result = yMapToElement(ymap);
    expect(result.position).toEqual({ x: 10, y: 20 });
  });

  it('updateElementYMap rejects NaN / undefined position writes', () => {
    const ydoc = new Y.Doc();
    const ymap = elementToYMap(makeElement({ position: { x: 50, y: 60 } }));
    ydoc.getMap('elements').set('el-1', ymap);

    // NaN payload (e.g. computed from a bad drag handler) must NOT overwrite
    // the previously-good positionX/Y — otherwise the next read would throw
    // MissingPositionError on every peer.
    updateElementYMap(
      ymap,
      { position: { x: NaN, y: NaN } as any },
      ydoc,
    );
    expect(ymap.get('positionX')).toBe(50);
    expect(ymap.get('positionY')).toBe(60);

    // Undefined coords are likewise ignored.
    updateElementYMap(
      ymap,
      { position: { x: undefined as any, y: undefined as any } },
      ydoc,
    );
    expect(ymap.get('positionX')).toBe(50);
    expect(ymap.get('positionY')).toBe(60);
  });

  it('updateElementYMap accepts valid finite positions including 0', () => {
    const ydoc = new Y.Doc();
    const ymap = elementToYMap(makeElement({ position: { x: 50, y: 60 } }));
    ydoc.getMap('elements').set('el-1', ymap);

    updateElementYMap(ymap, { position: { x: 0, y: 0 } }, ydoc);
    expect(ymap.get('positionX')).toBe(0);
    expect(ymap.get('positionY')).toBe(0);
  });
});

describe('elementMapper — event properties across peers', () => {
  // Y.js encodes a Date as a plain object with no own keys ({}): date
  // properties inside events must go through the property serializer.
  it('keeps a date property of an event on the remote peer', () => {
    const when = new Date(2024, 2, 12, 14, 30);
    const local = new Y.Doc();
    local.getMap('elements').set('el-1', elementToYMap(makeElement({
      events: [{
        id: 'ev-1',
        date: new Date(2024, 2, 12),
        label: 'Rencontre',
        properties: [{ key: 'heure_rdv', value: when, type: 'datetime' }],
      }],
    })));

    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(local));
    const result = yMapToElement(remote.getMap('elements').get('el-1') as Y.Map<any>);

    const value = result.events[0].properties?.[0].value;
    expect(value).toBeInstanceOf(Date);
    expect((value as Date).getTime()).toBe(when.getTime());
  });

  it('applies the same serialization when events are updated', () => {
    const when = new Date(2024, 5, 1, 9, 0);
    const local = new Y.Doc();
    const ymap = elementToYMap(makeElement());
    local.getMap('elements').set('el-1', ymap);
    updateElementYMap(ymap, {
      events: [{ id: 'ev-1', date: new Date(2024, 5, 1), label: 'Départ', properties: [{ key: 'h', value: when, type: 'datetime' }] }],
    }, local);

    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(local));
    const result = yMapToElement(remote.getMap('elements').get('el-1') as Y.Map<any>);
    expect((result.events[0].properties?.[0].value as Date).getTime()).toBe(when.getTime());
  });
});

describe('elementMapper — date precision across peers', () => {
  it('keeps event and dateRange precision on the remote peer', () => {
    const local = new Y.Doc();
    local.getMap('elements').set('el-1', elementToYMap(makeElement({
      dateRange: { start: new Date(1900, 0, 1), end: null, precision: 'year', approximate: true },
      events: [{ id: 'ev-1', date: new Date(2019, 2, 1), label: 'Arrivée', precision: 'month', approximate: true }],
    })));
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(local));
    const result = yMapToElement(remote.getMap('elements').get('el-1') as Y.Map<any>);
    expect(result.events[0].precision).toBe('month');
    expect(result.events[0].approximate).toBe(true);
    expect(result.dateRange?.precision).toBe('year');
    expect(result.dateRange?.approximate).toBe(true);
  });

  it('leaves dates without precision unchanged', () => {
    const ydoc = new Y.Doc();
    const ymap = elementToYMap(makeElement({ events: [{ id: 'ev-1', date: new Date(2019, 2, 1), label: 'X' }] }));
    ydoc.getMap('elements').set('el-1', ymap);
    const result = yMapToElement(ymap);
    expect(result.events[0].precision).toBeUndefined();
    expect('approximate' in result.events[0]).toBe(false);
  });
});

describe('elementMapper — source time zone across peers', () => {
  it('keeps the time zone of events and date ranges', () => {
    const local = new Y.Doc();
    local.getMap('elements').set('el-1', elementToYMap(makeElement({
      dateRange: { start: new Date(2024, 0, 1), end: null, timeZone: 'Asia/Beirut' },
      events: [{ id: 'ev-1', date: new Date(2024, 2, 1), label: 'Appel', timeZone: 'Asia/Beirut' }],
    })));
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(local));
    const result = yMapToElement(remote.getMap('elements').get('el-1') as Y.Map<any>);
    expect(result.events[0].timeZone).toBe('Asia/Beirut');
    expect(result.dateRange?.timeZone).toBe('Asia/Beirut');
  });

  it('keeps the time zone of a datetime property, on create and on update', () => {
    const when = new Date('2024-04-20T00:12:00Z');
    const prop = { key: 'appel', value: when, type: 'datetime' as const, timeZone: 'Asia/Beirut' };
    const local = new Y.Doc();
    const ymap = elementToYMap(makeElement({ properties: [prop] }));
    local.getMap('elements').set('el-1', ymap);
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(local));
    const created = yMapToElement(remote.getMap('elements').get('el-1') as Y.Map<any>);
    expect(created.properties[0].timeZone).toBe('Asia/Beirut');
    expect((created.properties[0].value as Date).getTime()).toBe(when.getTime());

    local.transact(() => updateElementYMap(ymap, { properties: [{ ...prop, timeZone: 'Asia/Tokyo' }] }, local));
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(local));
    expect(yMapToElement(remote.getMap('elements').get('el-1') as Y.Map<any>).properties[0].timeZone).toBe('Asia/Tokyo');

    local.transact(() => updateElementYMap(ymap, { properties: [{ key: 'appel', value: when, type: 'datetime' }] }, local));
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(local));
    expect(yMapToElement(remote.getMap('elements').get('el-1') as Y.Map<any>).properties[0]).not.toHaveProperty('timeZone');
  });
});
