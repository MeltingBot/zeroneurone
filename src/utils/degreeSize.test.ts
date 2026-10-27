import { describe, it, expect } from 'vitest';
import type { Element } from '../types';
import { DEFAULT_ELEMENT_VISUAL } from '../types';
import { buildDegreeMap, degreeSizeFactor, scaleByDegree, scaleElementsByDegree, storedPosition, DEGREE_SIZE_MAX_FACTOR } from './degreeSize';
import { computeElementDimensions } from './elementDimensions';

function el(id: string, over: Partial<Element> = {}): Element {
  return {
    id, dossierId: 'd1', label: id, notes: '', tags: [], properties: [], confidence: null, source: '',
    date: null, dateRange: null, position: { x: 0, y: 0 }, isPositionLocked: false, geo: null, events: [],
    visual: { ...DEFAULT_ELEMENT_VISUAL }, assetIds: [], parentGroupId: null,
    isGroup: false, isAnnotation: false, childIds: [], createdAt: new Date(), updatedAt: new Date(),
    ...over,
  } as Element;
}

describe('degreeSizeFactor', () => {
  it('grows with the square root of the degree, up to a ceiling', () => {
    expect(degreeSizeFactor(0)).toBe(1);
    expect(degreeSizeFactor(1)).toBe(1);
    expect(degreeSizeFactor(4)).toBe(1.25);
    expect(degreeSizeFactor(9)).toBe(1.5);
    expect(degreeSizeFactor(25)).toBe(2);
    expect(degreeSizeFactor(81)).toBe(DEGREE_SIZE_MAX_FACTOR);
    expect(degreeSizeFactor(10_000)).toBe(DEGREE_SIZE_MAX_FACTOR);
  });
});

describe('buildDegreeMap', () => {
  it('counts both ends, a self-link once', () => {
    const m = buildDegreeMap([
      { fromId: 'a', toId: 'b' }, { fromId: 'a', toId: 'c' }, { fromId: 'b', toId: 'a' }, { fromId: 'c', toId: 'c' },
    ]);
    expect(Object.fromEntries(m)).toEqual({ a: 3, b: 2, c: 2 });
  });
});

describe('scaleByDegree', () => {
  it('multiplies the drawn footprint, past the shape ceiling', () => {
    const long = el('a', { label: 'Un libellé assez long pour atteindre le plafond' });
    const base = computeElementDimensions(long.visual, long.label, false);
    const scaled = scaleByDegree(long, 25, false);
    expect(scaled).not.toBe(long);
    expect(scaled.visual.customWidth).toBe(Math.round(base.width * 2));
    expect(scaled.visual.customHeight).toBe(Math.round(base.height * 2));
    expect(long.visual.customWidth).toBeUndefined();
  });

  it('enlarges a hand-resized element from its own size', () => {
    const custom = el('b', { visual: { ...DEFAULT_ELEMENT_VISUAL, shape: 'rectangle', customWidth: 80, customHeight: 60 } });
    const scaled = scaleByDegree(custom, 9, false);
    expect(scaled.visual.customWidth).toBe(120);
    expect(scaled.visual.customHeight).toBe(90);
  });

  it('grows around the center, and maps drawn positions back', () => {
    const custom = el('b', { position: { x: 100, y: 200 }, visual: { ...DEFAULT_ELEMENT_VISUAL, shape: 'rectangle', customWidth: 80, customHeight: 60 } });
    const scaled = scaleByDegree(custom, 9, false);
    expect(scaled.position).toEqual({ x: 80, y: 185 });
    expect(scaled.position.x + scaled.visual.customWidth! / 2).toBe(100 + 40);
    expect(storedPosition(custom, scaled, { x: 180, y: 285 })).toEqual({ x: 200, y: 300 });
  });

  it('leaves unlinked, group and annotation elements alone', () => {
    const a = el('a');
    expect(scaleByDegree(a, 0, false)).toBe(a);
    const group = el('g', { isGroup: true });
    expect(scaleByDegree(group, 10, false)).toBe(group);
    const note = el('n', { isAnnotation: true });
    expect(scaleByDegree(note, 10, false)).toBe(note);
  });
});

describe('scaleElementsByDegree', () => {
  it('scales each element by its own links', () => {
    const [a, b, c] = scaleElementsByDegree([el('a'), el('b'), el('c')], [{ fromId: 'a', toId: 'b' }, { fromId: 'a', toId: 'b' }]);
    expect(a.visual.customWidth).toBe(b.visual.customWidth);
    expect(a.visual.customWidth).toBeGreaterThan(computeElementDimensions(DEFAULT_ELEMENT_VISUAL, 'a', false).width);
    expect(c.visual.customWidth).toBeUndefined();
  });
});
