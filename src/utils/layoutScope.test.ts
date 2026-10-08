import { describe, it, expect } from 'vitest';
import type { Element, Link } from '../types';
import { buildLayoutScope } from './layoutScope';

function makeElement(over: Partial<Element> = {}): Element {
  return {
    id: 'e1',
    dossierId: 'd1',
    label: 'A',
    position: { x: 0, y: 0 },
    visual: { color: '#ffffff', borderColor: '#333333', shape: 'square', size: 'medium', icon: null, image: null },
    parentGroupId: null,
    isGroup: false,
    isAnnotation: false,
    childIds: [],
    ...over,
  } as unknown as Element;
}

function makeLink(id: string, fromId: string, toId: string): Link {
  return { id, fromId, toId } as unknown as Link;
}

// Group G (400x300 at 100,100) holding c1, c2; free elements a, b.
const group = makeElement({
  id: 'G',
  isGroup: true,
  childIds: ['c1', 'c2'],
  position: { x: 100, y: 100 },
  visual: { color: '#ffffff', borderColor: '#333333', shape: 'rectangle', size: 'medium', icon: null, image: null, customWidth: 400, customHeight: 300 },
});
const c1 = makeElement({ id: 'c1', parentGroupId: 'G', position: { x: 10, y: 10 } });
const c2 = makeElement({ id: 'c2', parentGroupId: 'G', position: { x: 100, y: 10 } });
const a = makeElement({ id: 'a', position: { x: 600, y: 0 } });
const b = makeElement({ id: 'b', position: { x: 800, y: 0 } });
const elements = [group, c1, c2, a, b];
const links = [
  makeLink('l1', 'c1', 'c2'), // internal to G
  makeLink('l2', 'c1', 'a'),
  makeLink('l3', 'c2', 'a'),
  makeLink('l4', 'a', 'b'),
];

describe('buildLayoutScope', () => {
  it('lays a group out as one block and leaves its children alone', () => {
    const scope = buildLayoutScope(elements, links, new Set());
    expect(scope.elements.map((el) => el.id).sort()).toEqual(['G', 'a', 'b']);
    const proxy = scope.elements.find((el) => el.id === 'G')!;
    expect(proxy.isGroup).toBe(false);
    expect(proxy.visual.customWidth).toBe(400);
  });

  it('re-targets child links to the group and drops internal ones', () => {
    const scope = buildLayoutScope(elements, links, new Set());
    const pairs = scope.links.map((l) => `${l.fromId}-${l.toId}`).sort();
    expect(pairs).toEqual(['G-a', 'G-a', 'a-b']);
  });

  it('converts top-left positions to centres and back', () => {
    const scope = buildLayoutScope(elements, links, new Set());
    const proxy = scope.elements.find((el) => el.id === 'G')!;
    expect(proxy.position).toEqual({ x: 300, y: 250 });
    expect(scope.toStoredPosition('G', { x: 300, y: 250 })).toEqual({ x: 100, y: 100 });
    expect(scope.originalPositions.find((p) => p.id === 'G')!.position).toEqual({ x: 100, y: 100 });
  });

  it('moves the whole group when a selected child is mixed with outer elements', () => {
    const scope = buildLayoutScope(elements, links, new Set(['c1', 'a']));
    expect(scope.elements.map((el) => el.id).sort()).toEqual(['G', 'a']);
  });

  it('arranges children inside their group when only they are selected', () => {
    const scope = buildLayoutScope(elements, links, new Set(['c1', 'c2']));
    expect(scope.elements.map((el) => el.id).sort()).toEqual(['c1', 'c2']);
    expect(scope.links.map((l) => l.id)).toEqual(['l1']);
    expect(scope.originalPositions.find((p) => p.id === 'c1')!.position).toEqual({ x: 10, y: 10 });
  });

  it('keeps a nested group selected with its siblings as a block', () => {
    const nested = makeElement({ id: 'N', isGroup: true, parentGroupId: 'G' });
    const scope = buildLayoutScope([...elements, nested], links, new Set(['c1', 'N']));
    expect(scope.elements.map((el) => el.id).sort()).toEqual(['N', 'c1']);
    expect(scope.elements.find((el) => el.id === 'N')!.isGroup).toBe(false);
  });
});
