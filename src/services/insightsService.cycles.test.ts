import { describe, it, expect } from 'vitest';
import type { Element, Link } from '../types';
import { insightsService } from './insightsService';

function el(id: string): Element {
  return { id, label: id, isGroup: false } as unknown as Element;
}

function link(id: string, fromId: string, toId: string, direction: Link['direction'] = 'none'): Link {
  return { id, fromId, toId, direction, directed: direction !== 'none' } as unknown as Link;
}

/** Link id → walked from→to, for one cycle. */
function flowOf(links: { linkId: string; forward: boolean }[]): Record<string, boolean> {
  return Object.fromEntries(links.map((l) => [l.linkId, l.forward]));
}

describe('findCycles links', () => {
  it('gives the links of the cycle, not the chord between its elements', () => {
    // Square a-b-c-d with a chord a-c
    insightsService.buildGraph(['a', 'b', 'c', 'd'].map(el), [
      link('ab', 'a', 'b'), link('bc', 'b', 'c'), link('cd', 'c', 'd'), link('da', 'd', 'a'), link('ac', 'a', 'c'),
    ]);
    const square = insightsService.findCycles(6, 100, false).find((c) => c.length === 4)!;
    expect(square.links.map((l) => l.linkId).sort()).toEqual(['ab', 'bc', 'cd', 'da']);
  });

  it('tells which way each link is walked', () => {
    // a→b, c→b written against the loop, c→a
    insightsService.buildGraph(['a', 'b', 'c'].map(el), [
      link('ab', 'a', 'b', 'forward'), link('cb', 'c', 'b', 'backward'), link('ca', 'c', 'a', 'forward'),
    ]);
    const [cycle] = insightsService.findCycles(6, 100, true);
    // a → b → c → a: ab forward, cb walked b→c (against from→to), ca forward
    expect(flowOf(cycle.links)).toEqual({ ab: true, cb: false, ca: true });
  });

  it('keeps every parallel link of a step, only those walkable in directed mode', () => {
    insightsService.buildGraph(['a', 'b', 'c'].map(el), [
      link('ab1', 'a', 'b', 'forward'), link('ab2', 'a', 'b', 'none'), link('ba', 'b', 'a', 'forward'),
      link('bc', 'b', 'c', 'forward'), link('ca', 'c', 'a', 'forward'),
    ]);
    const cycles = insightsService.findCycles(6, 100, true);
    const triangle = cycles.find((c) => c.length === 3)!;
    // b→a cannot be walked a→b
    expect(triangle.links.map((l) => l.linkId).sort()).toEqual(['ab1', 'ab2', 'bc', 'ca']);
  });
});

describe('cycle link flow shown on the canvas', () => {
  it('shows no sense for an undirected search, the walked sense for a directed one', async () => {
    const { useInsightsStore } = await import('../stores/insightsStore');
    insightsService.buildGraph(['a', 'b', 'c'].map(el), [
      link('ab', 'a', 'b', 'forward'), link('cb', 'c', 'b', 'backward'), link('ca', 'c', 'a', 'forward'),
    ]);
    useInsightsStore.getState().findCycles(6, false);
    expect(Object.fromEntries(useInsightsStore.getState().cycleLinkFlow)).toEqual({ ab: 'both', cb: 'both', ca: 'both' });
    useInsightsStore.getState().findCycles(6, true);
    expect(Object.fromEntries(useInsightsStore.getState().cycleLinkFlow)).toEqual({ ab: 'forward', cb: 'backward', ca: 'forward' });
    // One cycle picked from the list keeps the mode of the search
    useInsightsStore.getState().highlightCycle(0);
    expect(useInsightsStore.getState().cycleLinkFlow.get('cb')).toBe('backward');
  });
});
