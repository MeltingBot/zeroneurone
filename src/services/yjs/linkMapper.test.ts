import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { linkToYMap, yMapToLink, updateLinkYMap } from './linkMapper';
import type { Link } from '../../types';
import { DEFAULT_LINK_VISUAL } from '../../types';

function makeLink(overrides: Partial<Link> = {}): Link {
  return {
    id: 'link-1',
    dossierId: 'dossier-1',
    fromId: 'a',
    toId: 'b',
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
    visual: { ...DEFAULT_LINK_VISUAL },
    curveOffset: { x: 0, y: 0 },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function attach(link: Link): { ydoc: Y.Doc; ymap: Y.Map<unknown> } {
  const ydoc = new Y.Doc();
  const ymap = linkToYMap(link);
  ydoc.getMap('links').set(link.id, ymap);
  return { ydoc, ymap };
}

describe('linkMapper — route offsets', () => {
  it('keeps the right-angle offset apart from the curve offset', () => {
    const { ymap } = attach(makeLink({ curveOffset: { x: 5, y: 6 }, orthogonalOffset: { x: -20, y: 30 } }));
    const result = yMapToLink(ymap);
    expect(result.curveOffset).toEqual({ x: 5, y: 6 });
    expect(result.orthogonalOffset).toEqual({ x: -20, y: 30 });
  });

  it('reads links without a right-angle offset (older links) as having none', () => {
    const { ymap } = attach(makeLink());
    expect(yMapToLink(ymap).orthogonalOffset).toBeUndefined();
  });

  it('updates and clears the right-angle offset without touching the curve offset', () => {
    const { ydoc, ymap } = attach(makeLink({ curveOffset: { x: 5, y: 6 } }));
    updateLinkYMap(ymap, { orthogonalOffset: { x: 12, y: -8 } }, ydoc);
    expect(yMapToLink(ymap).orthogonalOffset).toEqual({ x: 12, y: -8 });
    updateLinkYMap(ymap, { orthogonalOffset: null }, ydoc);
    const cleared = yMapToLink(ymap);
    expect(cleared.orthogonalOffset).toBeUndefined();
    expect(cleared.curveOffset).toEqual({ x: 5, y: 6 });
  });

  it('keeps a hand-drawn right-angle route, updates and clears it', () => {
    const route = { first: 'x' as const, positions: [-100, 80, 100] };
    const { ydoc, ymap } = attach(makeLink({ orthogonalRoute: route }));
    expect(yMapToLink(ymap).orthogonalRoute).toEqual(route);
    updateLinkYMap(ymap, { orthogonalRoute: { first: 'y', positions: [40] } }, ydoc);
    expect(yMapToLink(ymap).orthogonalRoute).toEqual({ first: 'y', positions: [40] });
    updateLinkYMap(ymap, { orthogonalRoute: null }, ydoc);
    expect(yMapToLink(ymap).orthogonalRoute).toBeUndefined();
  });

  it('ignores a malformed right-angle route from a peer', () => {
    const { ymap } = attach(makeLink());
    ymap.set('orthogonalRoute', { first: 'z', positions: [1] });
    expect(yMapToLink(ymap).orthogonalRoute).toBeUndefined();
    ymap.set('orthogonalRoute', { first: 'x', positions: [1, 'a'] });
    expect(yMapToLink(ymap).orthogonalRoute).toBeUndefined();
  });
});
