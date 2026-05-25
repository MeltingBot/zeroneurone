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
