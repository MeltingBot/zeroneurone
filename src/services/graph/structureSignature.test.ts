import { describe, it, expect } from 'vitest';
import { graphStructureSignature } from './structureSignature';
import type { Element, Link } from '../../types';

function el(id: string, over: Partial<Element> = {}): Element {
  return {
    id, label: `Label ${id}`, tags: [], isGroup: false,
    position: { x: 0, y: 0 },
    ...over,
  } as unknown as Element;
}

function link(id: string, fromId: string, toId: string): Link {
  return { id, fromId, toId } as unknown as Link;
}

const ELEMENTS = [el('a'), el('b'), el('c')];
const LINKS = [link('l1', 'a', 'b'), link('l2', 'b', 'c')];
const sig = (e = ELEMENTS, l = LINKS) => graphStructureSignature(e, l);

describe('graphStructureSignature', () => {
  it('is stable for an unchanged graph', () => {
    expect(sig()).toBe(sig());
  });

  it('ignores positions — the whole point', () => {
    const moved = ELEMENTS.map((e) => ({ ...e, position: { x: 999, y: 999 } }));
    expect(sig(moved)).toBe(sig());
  });

  it('ignores array order, so a re-sync does not trigger a recompute', () => {
    expect(sig([...ELEMENTS].reverse(), [...LINKS].reverse())).toBe(sig());
  });

  it('changes when an element is added or removed', () => {
    expect(sig([...ELEMENTS, el('d')])).not.toBe(sig());
    expect(sig(ELEMENTS.slice(0, 2))).not.toBe(sig());
  });

  it('changes when a label changes — duplicate detection reads it', () => {
    expect(sig([el('a', { label: 'Autre' }), ELEMENTS[1], ELEMENTS[2]])).not.toBe(sig());
  });

  it('changes when tags change — clustering and filters read them', () => {
    expect(sig([el('a', { tags: ['x'] }), ELEMENTS[1], ELEMENTS[2]])).not.toBe(sig());
  });

  it('changes when a link is added, removed or rewired', () => {
    expect(sig(ELEMENTS, [...LINKS, link('l3', 'a', 'c')])).not.toBe(sig());
    expect(sig(ELEMENTS, LINKS.slice(0, 1))).not.toBe(sig());
    expect(sig(ELEMENTS, [link('l1', 'a', 'c'), LINKS[1]])).not.toBe(sig());
  });

  it('distinguishes a link direction flip', () => {
    expect(sig(ELEMENTS, [link('l1', 'b', 'a'), LINKS[1]])).not.toBe(sig());
  });

  it('handles the empty graph', () => {
    expect(sig([], [])).toBe(graphStructureSignature([], []));
    expect(sig([], [])).not.toBe(sig());
  });

  it('stays fast on a large graph', () => {
    const many = Array.from({ length: 10_000 }, (_, i) => el(`e${i}`, { tags: [`t${i % 20}`] }));
    const manyLinks = Array.from({ length: 15_000 }, (_, i) =>
      link(`l${i}`, `e${i % 10_000}`, `e${(i * 7) % 10_000}`)
    );

    const t0 = performance.now();
    graphStructureSignature(many, manyLinks);
    const elapsed = performance.now() - t0;

    // Runs on every store change, so it must stay far below the cost of the
    // analysis it guards (~250 ms at 5 000 elements).
    expect(elapsed).toBeLessThan(100);
  });
});
