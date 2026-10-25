import { describe, it, expect } from 'vitest';
import type { Node } from '@xyflow/react';
import type { Element, Link } from '../../../types';
import { buildOverviewScene, computeAbsoluteNodePositions } from './overviewScene';
import { hitPoint, hitRect, linksTouching } from './overviewHitTest';
import { LINK_ARROW_END, LINK_SELECTED, NODE_GHOST, NODE_SELECTED, SHAPE_CIRCLE, SHAPE_DIAMOND, SHAPE_GROUP } from './overviewTypes';

function element(id: string, shape: string, extra: Partial<Element['visual']> = {}): Element {
  return {
    id, label: id,
    visual: { color: '#93c5fd', borderColor: '#111827', shape, size: 'medium', customWidth: 100, customHeight: 100, ...extra },
  } as unknown as Element;
}

function node(id: string, x: number, y: number, shape = 'square', data: Record<string, unknown> = {}, extra: Partial<Node> = {}): Node {
  return {
    id, type: 'element', position: { x, y },
    data: { element: element(id, shape), ...data },
    ...extra,
  } as Node;
}

function link(id: string, fromId: string, toId: string, extra: Partial<Link> = {}): Link {
  return { id, fromId, toId, direction: 'none', visual: { color: '#6b7280', style: 'solid', thickness: 2 }, ...extra } as unknown as Link;
}

function scene(nodes: Node[], links: Link[] = [], selectedLinks = new Set<string>()) {
  return buildOverviewScene({
    nodes, links,
    isLinkShown: () => true,
    linkFlags: (l) => (selectedLinks.has(l.id) ? LINK_SELECTED : 0),
    dark: false,
    fallbackLabel: 'Unnamed',
  });
}

describe('overview scene', () => {
  it('resolves children of a group to absolute positions', () => {
    const group = { id: 'g', type: 'groupFrame', position: { x: 1000, y: 500 }, data: { element: element('g', 'rectangle') } } as Node;
    const child = node('c', 10, 20, 'square', {}, { parentId: 'g' } as Partial<Node>);
    expect(computeAbsoluteNodePositions([group, child]).get('c')).toEqual({ x: 1010, y: 520 });
    const s = scene([group, child]);
    const i = s.indexById.get('c')!;
    expect([s.x[i], s.y[i]]).toEqual([1010, 520]);
    expect(s.shape[s.indexById.get('g')!]).toBe(SHAPE_GROUP);
  });

  it('prefers the measured size to the estimate', () => {
    const s = scene([node('a', 0, 0, 'square', {}, { measured: { width: 33, height: 44 } })]);
    expect([s.w[0], s.h[0]]).toEqual([33, 44]);
  });

  it('keeps links between drawn nodes only, without self-loops, with their arrows', () => {
    const s = scene(
      [node('a', 0, 0), node('b', 300, 0)],
      [link('ab', 'a', 'b', { direction: 'forward' } as Partial<Link>), link('aa', 'a', 'a'), link('ax', 'a', 'missing')],
    );
    expect(s.linkIds).toEqual(['ab']);
    expect(s.linkFlags[0] & LINK_ARROW_END).toBeTruthy();
  });

  it('carries selection and ghost flags', () => {
    const s = scene([node('a', 0, 0, 'square', { isSelected: true }), node('b', 300, 0, 'square', { isGhost: true })]);
    expect(s.flags[0] & NODE_SELECTED).toBeTruthy();
    expect(s.flags[1] & NODE_GHOST).toBeTruthy();
  });
});

describe('overview hit-test', () => {
  it('finds the node under a point, with a tolerance', () => {
    const s = scene([node('a', 0, 0), node('b', 500, 0)]);
    expect(hitPoint(s, 50, 50, 0)).toBe(0);
    expect(hitPoint(s, 103, 50, 0)).toBe(-1);
    expect(hitPoint(s, 103, 50, 4)).toBe(0);
    expect(hitPoint(s, 550, 50, 0)).toBe(1);
  });

  it('tests the real outline of circles and diamonds', () => {
    const s = scene([node('c', 0, 0, 'circle'), node('d', 500, 0, 'diamond')]);
    expect(s.shape[0]).toBe(SHAPE_CIRCLE);
    expect(s.shape[1]).toBe(SHAPE_DIAMOND);
    // Box corner, outside the circle
    expect(hitPoint(s, 5, 5, 0)).toBe(-1);
    // A diamond's tip sticks out of its box (half-diagonal 70.7)
    expect(hitPoint(s, 550, 50 - 68, 0)).toBe(1);
    expect(hitPoint(s, 505, 5, 0)).toBe(-1);
  });

  it('puts the selected node on top and skips ghosts', () => {
    const s = scene([
      node('under', 0, 0, 'square', { isSelected: true }),
      node('over', 50, 0),
      node('ghost', 1000, 0, 'square', { isGhost: true }),
    ]);
    expect(hitPoint(s, 75, 50, 0)).toBe(0);
    expect(hitPoint(s, 1050, 50, 0)).toBe(-1);
  });

  it('falls back to the group frame around the point', () => {
    const group = { id: 'g', type: 'groupFrame', position: { x: 0, y: 0 }, data: { element: element('g', 'rectangle', { customWidth: 2000, customHeight: 2000 }) } } as Node;
    const s = scene([group, node('a', 100, 100, 'square', {}, { parentId: 'g' } as Partial<Node>)]);
    expect(s.ids[hitPoint(s, 150, 150, 0)]).toBe('a');
    expect(s.ids[hitPoint(s, 1500, 1500, 0)]).toBe('g');
  });

  it('selects every node a rectangle touches, and the links of those nodes', () => {
    const s = scene(
      [node('a', 0, 0), node('b', 300, 0), node('c', 3000, 3000), node('g', 120, 0, 'square', { isGhost: true })],
      [link('ab', 'a', 'b'), link('bc', 'b', 'c')],
    );
    const picked = hitRect(s, 90, 10, 310, 20).map((i) => s.ids[i]).sort();
    expect(picked).toEqual(['a', 'b']);
    expect(linksTouching(s, [s.indexById.get('c')!])).toEqual(['bc']);
  });

  it('scales to a large grid', () => {
    const nodes = Array.from({ length: 10000 }, (_, i) => node(`n${i}`, (i % 100) * 180, Math.floor(i / 100) * 140));
    const s = scene(nodes);
    expect(s.ids[hitPoint(s, 99 * 180 + 10, 99 * 140 + 10, 0)]).toBe('n9999');
    expect(hitRect(s, -1e6, -1e6, 1e6, 1e6)).toHaveLength(10000);
  });
});
