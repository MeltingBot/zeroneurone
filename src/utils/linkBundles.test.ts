import { describe, it, expect } from 'vitest';
import type { Link } from '../types';
import { bundleLine, bundleLinks } from './linkBundles';

const link = (id: string, fromId: string, toId: string, direction: Link['direction'] = 'forward') =>
  ({ id, fromId, toId, direction, directed: direction !== 'none', label: id, properties: [], confidence: 50 }) as unknown as Link;

describe('bundleLinks', () => {
  const links = [link('ab1', 'a', 'b'), link('x', 'a', 'c'), link('ba', 'b', 'a'), link('ab2', 'a', 'b', 'none')];

  it('draws every link in "multiple" mode', () => {
    expect(bundleLinks(links, 'multiple').shown).toBe(links);
    expect(bundleLinks(links, undefined).bundles.size).toBe(0);
  });

  it('merges every link of a pair in "single" mode, arrows of all of them', () => {
    const { shown, bundles } = bundleLinks(links, 'single');
    expect(shown.map((l) => l.id)).toEqual(['ab1', 'x']);
    const ab = bundles.get('ab1')!;
    expect(ab.links.map((l) => l.id)).toEqual(['ab1', 'ba', 'ab2']);
    // a → b and b → a: arrows at both ends of the line
    expect(ab.direction).toBe('both');
    expect(bundles.has('x')).toBe(false);
  });

  it('merges links going the same way in "directed" mode', () => {
    const more = [...links, link('ab3', 'a', 'b'), link('ba2', 'b', 'a', 'backward')];
    const { shown, bundles } = bundleLinks(more, 'directed');
    // a → b (ab1, ab3, and ba2 whose arrow points at b), b → a alone, and the link without arrow
    expect(shown.map((l) => l.id)).toEqual(['ab1', 'x', 'ba', 'ab2']);
    expect(bundles.get('ab1')!.links.map((l) => l.id)).toEqual(['ab1', 'ab3', 'ba2']);
    expect(bundles.get('ab1')!.direction).toBe('forward');
    expect(bundles.size).toBe(1);
  });

  it('draws a merged line without label, properties or grading', () => {
    const line = bundleLine(bundleLinks(links, 'single').bundles.get('ab1')!);
    expect(line).toMatchObject({ id: 'ab1', label: '', properties: [], confidence: null, direction: 'both' });
  });
});
