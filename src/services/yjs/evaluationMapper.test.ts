import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { elementToYMap, yMapToElement, updateElementYMap } from './elementMapper';
import { linkToYMap, yMapToLink, updateLinkYMap } from './linkMapper';
import type { Element, Link } from '../../types';
import { DEFAULT_ELEMENT_VISUAL, DEFAULT_LINK_VISUAL } from '../../types';

function makeElement(overrides: Partial<Element> = {}): Element {
  return {
    id: 'el-1', dossierId: 'dossier-1', label: 'Test', notes: '', tags: [], properties: [],
    confidence: null, source: '', date: null, dateRange: null, position: { x: 0, y: 0 },
    isPositionLocked: false, geo: null, events: [], visual: { ...DEFAULT_ELEMENT_VISUAL },
    assetIds: [], parentGroupId: null, isGroup: false, isAnnotation: false, childIds: [],
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeLink(overrides: Partial<Link> = {}): Link {
  return {
    id: 'ln-1', dossierId: 'dossier-1', fromId: 'a', toId: 'b', sourceHandle: null, targetHandle: null,
    label: '', notes: '', tags: [], properties: [], directed: false, direction: 'none',
    confidence: null, source: '', date: null, dateRange: null, visual: { ...DEFAULT_LINK_VISUAL },
    curveOffset: { x: 0, y: 0 }, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('Y.js mappers — evaluation', () => {
  it('round-trips an element evaluation and keeps confidence untouched', () => {
    const ydoc = new Y.Doc();
    const ymap = elementToYMap(makeElement({ confidence: 70, evaluation: { scale: 'europol', source: 'B', info: '2' } }));
    ydoc.getMap('elements').set('el-1', ymap);
    const result = yMapToElement(ymap);
    expect(result.evaluation).toEqual({ scale: 'europol', source: 'B', info: '2' });
    expect(result.confidence).toBe(70);
  });

  it('reads a missing evaluation as null', () => {
    const ydoc = new Y.Doc();
    const ymap = elementToYMap(makeElement());
    ydoc.getMap('elements').set('el-1', ymap);
    expect(yMapToElement(ymap).evaluation).toBeNull();
  });

  it('drops codes that do not belong to the scale', () => {
    const ydoc = new Y.Doc();
    const ymap = elementToYMap(makeElement());
    ydoc.getMap('elements').set('el-1', ymap);
    ymap.set('evaluation', { scale: 'europol', source: 'F', info: '2' });
    expect(yMapToElement(ymap).evaluation).toEqual({ scale: 'europol', source: null, info: '2' });
  });

  it('updates and clears an element evaluation', () => {
    const ydoc = new Y.Doc();
    const ymap = elementToYMap(makeElement());
    ydoc.getMap('elements').set('el-1', ymap);
    updateElementYMap(ymap, { evaluation: { scale: 'admiralty', source: 'F', info: '6' } }, ydoc);
    expect(yMapToElement(ymap).evaluation).toEqual({ scale: 'admiralty', source: 'F', info: '6' });
    updateElementYMap(ymap, { evaluation: null }, ydoc);
    expect(yMapToElement(ymap).evaluation).toBeNull();
  });

  it('round-trips and updates a link evaluation', () => {
    const ydoc = new Y.Doc();
    const ymap = linkToYMap(makeLink({ evaluation: { scale: 'admiralty', source: 'C', info: '3' } }));
    ydoc.getMap('links').set('ln-1', ymap);
    expect(yMapToLink(ymap).evaluation).toEqual({ scale: 'admiralty', source: 'C', info: '3' });
    updateLinkYMap(ymap, { evaluation: { scale: 'europol', source: 'A', info: '1' } }, ydoc);
    expect(yMapToLink(ymap).evaluation).toEqual({ scale: 'europol', source: 'A', info: '1' });
  });
});
