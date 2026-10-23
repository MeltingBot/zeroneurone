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

describe('buildLayoutScope with locked elements', () => {
  const ids = (scope: ReturnType<typeof buildLayoutScope>) => scope.elements.map((el) => el.id).sort();

  it('leaves a locked element out of the whole-dossier layout', () => {
    const lockedA = { ...a, isPositionLocked: true };
    const scope = buildLayoutScope([group, c1, c2, lockedA, b], links, new Set());
    expect(ids(scope)).toEqual(['G', 'b']);
    expect(scope.links.every((l) => l.fromId !== 'a' && l.toId !== 'a')).toBe(true);
  });

  it('leaves a locked element out of a selection layout', () => {
    const lockedA = { ...a, isPositionLocked: true };
    const scope = buildLayoutScope([group, c1, c2, lockedA, b], links, new Set(['a', 'b', 'G']));
    expect(ids(scope)).toEqual(['G', 'b']);
  });

  it('keeps a group in place when one of its children is locked', () => {
    const lockedC1 = { ...c1, isPositionLocked: true };
    const scope = buildLayoutScope([group, lockedC1, c2, a, b], links, new Set());
    expect(ids(scope)).toEqual(['a', 'b']);
  });

  it('arranges the unlocked children inside a group, not the locked one', () => {
    const c3 = makeElement({ id: 'c3', parentGroupId: 'G', position: { x: 200, y: 10 } });
    const lockedC1 = { ...c1, isPositionLocked: true };
    const scope = buildLayoutScope([group, lockedC1, c2, c3, a, b], links, new Set(['c1', 'c2', 'c3']));
    expect(ids(scope)).toEqual(['c2', 'c3']);
  });
});

describe('buildLayoutScope in a canvas tab', () => {
  const ids = (scope: ReturnType<typeof buildLayoutScope>) => scope.elements.map((el) => el.id).sort();

  it('moves only the tab members and turns every other block into an obstacle', () => {
    const scope = buildLayoutScope(elements, links, new Set(), new Set(['a', 'b']));
    expect(ids(scope)).toEqual(['a', 'b']);
    // G (top-level block) is an obstacle; its children are not counted on their own
    expect(scope.obstacles).toHaveLength(1);
    expect(scope.obstacles[0]).toMatchObject({ x: 100, y: 100, width: 400, height: 300 });
  });

  it('ignores selected elements outside the tab', () => {
    const scope = buildLayoutScope(elements, links, new Set(['a', 'b', 'G']), new Set(['a', 'b']));
    expect(ids(scope)).toEqual(['a', 'b']);
  });

  it('falls back to the whole tab when fewer than 2 selected elements are members', () => {
    const scope = buildLayoutScope(elements, links, new Set(['a', 'G']), new Set(['a', 'b']));
    expect(ids(scope)).toEqual(['a', 'b']);
  });

  it('keeps unselected members clear as obstacles', () => {
    const scope = buildLayoutScope(elements, links, new Set(['a', 'G']), new Set(['a', 'b', 'G']));
    expect(ids(scope)).toEqual(['G', 'a']);
    expect(scope.obstacles.map((o) => o.x)).toEqual([800]);
  });
});
