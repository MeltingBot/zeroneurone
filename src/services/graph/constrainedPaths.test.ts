import { describe, it, expect } from 'vitest';
import type { Element, Link } from '../../types';
import {
  buildFilteredAdjacency,
  findConstrainedPaths,
  hasActiveConstraints,
  kShortestPaths,
  linkPasses,
} from './constrainedPaths';

const el = (id: string, over: Partial<Element> = {}) => ({ id, isGroup: false, ...over }) as Element;
const link = (id: string, fromId: string, toId: string, over: Partial<Link> = {}): Link =>
  ({
    id, fromId, toId, label: '', tags: [], direction: 'none', directed: false,
    confidence: null, evaluation: null, date: null, dateRange: null,
    ...over,
  }) as unknown as Link;

const nodes = (...ids: string[]) => ids.map((id) => el(id));

/*
 *   a — b — d
 *   |   |   |
 *   c — e — f
 */
const grid = () => {
  const elements = nodes('a', 'b', 'c', 'd', 'e', 'f');
  const links = [
    link('ab', 'a', 'b'), link('bd', 'b', 'd'),
    link('ac', 'a', 'c'), link('ce', 'c', 'e'), link('ef', 'e', 'f'),
    link('be', 'b', 'e'), link('df', 'd', 'f'),
  ];
  return { elements, links };
};

describe('kShortestPaths (Yen)', () => {
  it('returns loopless paths shortest first, without duplicates', () => {
    const { elements, links } = grid();
    const adj = buildFilteredAdjacency(elements, links, null, 'zeroneurone');
    const paths = kShortestPaths(adj, 'a', 'f', 10, 10);
    const lengths = paths.map((p) => p.length - 1);
    expect(lengths).toEqual([...lengths].sort((x, y) => x - y));
    expect(lengths[0]).toBe(3);
    expect(new Set(paths.map((p) => p.join())).size).toBe(paths.length);
    for (const p of paths) expect(new Set(p).size).toBe(p.length);
    // a-b-d-f, a-b-e-f, a-c-e-f (3 steps), a-c-e-b-d-f (5 steps)
    expect(paths).toHaveLength(4);
  });

  it('stops at k and at the depth bound', () => {
    const { elements, links } = grid();
    const adj = buildFilteredAdjacency(elements, links, null, 'zeroneurone');
    expect(kShortestPaths(adj, 'a', 'f', 2, 10)).toHaveLength(2);
    expect(kShortestPaths(adj, 'a', 'f', 10, 3)).toHaveLength(3);
    expect(kShortestPaths(adj, 'a', 'f', 10, 2)).toEqual([]);
  });

  it('handles a long chain without overflowing', () => {
    const ids = Array.from({ length: 20000 }, (_, i) => `n${i}`);
    const links = ids.slice(1).map((id, i) => link(`l${i}`, ids[i], id));
    const adj = buildFilteredAdjacency(nodes(...ids), links, null, 'zeroneurone');
    const [p] = kShortestPaths(adj, 'n0', 'n19999', 1, 50000);
    expect(p).toHaveLength(20000);
    // Yen runs one BFS per node of the previous path: fine at realistic lengths
    const short = buildFilteredAdjacency(nodes(...ids.slice(0, 2000)), links.slice(0, 1999), null, 'zeroneurone');
    expect(kShortestPaths(short, 'n0', 'n1999', 3, 5000)).toHaveLength(1);
  });
});

describe('linkPasses', () => {
  it('filters labels and tags, include or exclude, ignoring case', () => {
    const l = link('x', 'a', 'b', { label: ' Virement ', tags: ['Banque'] });
    expect(linkPasses(l, { labels: { mode: 'include', values: ['virement'] } }, 'zeroneurone')).toBe(true);
    expect(linkPasses(l, { labels: { mode: 'exclude', values: ['virement'] } }, 'zeroneurone')).toBe(false);
    expect(linkPasses(l, { tags: { mode: 'include', values: ['appel'] } }, 'zeroneurone')).toBe(false);
    expect(linkPasses(l, { tags: { mode: 'exclude', values: ['appel'] } }, 'zeroneurone')).toBe(true);
  });

  it('keeps links meeting the period, undated ones on demand', () => {
    const dated = link('x', 'a', 'b', { date: new Date(2024, 5, 15) });
    const undated = link('y', 'a', 'b');
    const period = { start: new Date(2024, 0, 1), end: new Date(2024, 11, 31), keepUndated: false };
    expect(linkPasses(dated, { period }, 'zeroneurone')).toBe(true);
    expect(linkPasses(dated, { period: { ...period, start: new Date(2025, 0, 1), end: null } }, 'zeroneurone')).toBe(false);
    expect(linkPasses(undated, { period }, 'zeroneurone')).toBe(false);
    expect(linkPasses(undated, { period: { ...period, keepUndated: true } }, 'zeroneurone')).toBe(true);
  });

  it('applies the minimum confidence in the zeroneurone model', () => {
    const c = { minConfidence: 60 as const };
    expect(linkPasses(link('x', 'a', 'b', { confidence: 70 }), c, 'zeroneurone')).toBe(true);
    expect(linkPasses(link('x', 'a', 'b', { confidence: 50 }), c, 'zeroneurone')).toBe(false);
    expect(linkPasses(link('x', 'a', 'b'), c, 'zeroneurone')).toBe(false);
    expect(linkPasses(link('x', 'a', 'b'), { ...c, keepUnrated: true }, 'zeroneurone')).toBe(true);
  });

  it('applies the minimum grading in the admiralty model', () => {
    const c = { minEvaluation: { source: 'B', info: '2' } };
    const graded = (source: string | null, info: string | null) =>
      link('x', 'a', 'b', { evaluation: { scale: 'admiralty', source, info } });
    expect(linkPasses(graded('A', '1'), c, 'admiralty')).toBe(true);
    expect(linkPasses(graded('B', '2'), c, 'admiralty')).toBe(true);
    expect(linkPasses(graded('E', '3'), c, 'admiralty')).toBe(false);
    expect(linkPasses(graded('A', '3'), c, 'admiralty')).toBe(false);
    expect(linkPasses(graded(null, '1'), c, 'admiralty')).toBe(false);
    // An axis left ungraded counts as ungraded
    expect(linkPasses(graded(null, '1'), { ...c, keepUnrated: true }, 'admiralty')).toBe(true);
    expect(linkPasses(graded(null, '3'), { ...c, keepUnrated: true }, 'admiralty')).toBe(false);
    expect(linkPasses(graded('A', null), { minEvaluation: { source: 'B', info: null } }, 'admiralty')).toBe(true);
    // Graded in another scale: unrated for this model
    const other = link('x', 'a', 'b', { evaluation: { scale: 'europol', source: 'A', info: '1' } });
    expect(linkPasses(other, c, 'admiralty')).toBe(false);
    expect(linkPasses(other, { ...c, keepUnrated: true }, 'admiralty')).toBe(true);
  });
});

describe('findConstrainedPaths', () => {
  it('walks parallel links when one of them is admitted, and lists it', () => {
    const elements = nodes('a', 'b', 'c');
    const links = [
      link('ab1', 'a', 'b', { confidence: 20 }),
      link('ab2', 'a', 'b', { confidence: 90 }),
      link('bc', 'b', 'c', { confidence: 80 }),
    ];
    const { paths } = findConstrainedPaths(elements, links, 'a', 'c', {
      k: 5, maxDepth: 5, model: 'zeroneurone', constraints: { minConfidence: 60 },
    });
    expect(paths).toEqual([{ path: ['a', 'b', 'c'], linkIds: [['ab2'], ['bc']], length: 2 }]);
  });

  it('drops the paths through a weakly graded link', () => {
    const { elements, links } = grid();
    const graded = links.map((l) =>
      link(l.id, l.fromId, l.toId, { evaluation: { scale: 'europol', source: l.id === 'bd' || l.id === 'be' ? 'C' : 'A', info: '1' } }),
    );
    const { paths } = findConstrainedPaths(elements, graded, 'a', 'f', {
      k: 10, maxDepth: 10, model: 'europol', constraints: { minEvaluation: { source: 'B', info: null } },
    });
    expect(paths.map((p) => p.path.join(''))).toEqual(['acef']);
  });

  it('follows link direction on demand', () => {
    const elements = nodes('a', 'b', 'c');
    const links = [link('ab', 'a', 'b', { direction: 'forward' }), link('cb', 'c', 'b', { direction: 'forward' })];
    const free = findConstrainedPaths(elements, links, 'a', 'c', { k: 1, maxDepth: 5, model: 'zeroneurone' });
    expect(free.paths).toHaveLength(1);
    const directed = findConstrainedPaths(elements, links, 'a', 'c', {
      k: 1, maxDepth: 5, model: 'zeroneurone', constraints: { respectDirection: true },
    });
    expect(directed).toEqual({ paths: [], blockedByConstraints: true });
    const backward = [link('ab', 'a', 'b', { direction: 'forward' }), link('cb', 'c', 'b', { direction: 'backward' })];
    expect(findConstrainedPaths(elements, backward, 'a', 'c', {
      k: 1, maxDepth: 5, model: 'zeroneurone', constraints: { respectDirection: true },
    }).paths).toHaveLength(1);
  });

  it('tells a filtered-out path from no path at all', () => {
    const elements = nodes('a', 'b', 'c');
    const links = [link('ab', 'a', 'b', { label: 'appel' })];
    const opts = { k: 1, maxDepth: 5, model: 'zeroneurone' as const, constraints: { labels: { mode: 'exclude' as const, values: ['appel'] } } };
    expect(findConstrainedPaths(elements, links, 'a', 'b', opts).blockedByConstraints).toBe(true);
    expect(findConstrainedPaths(elements, links, 'a', 'c', opts).blockedByConstraints).toBe(false);
  });

  it('ignores groups and self-loops', () => {
    const elements = [el('a'), el('g', { isGroup: true }), el('b')];
    const links = [link('ag', 'a', 'g'), link('gb', 'g', 'b'), link('aa', 'a', 'a')];
    expect(findConstrainedPaths(elements, links, 'a', 'b', { k: 1, maxDepth: 5, model: 'zeroneurone' }).paths).toEqual([]);
  });
});

describe('hasActiveConstraints', () => {
  it('ignores empty filters', () => {
    expect(hasActiveConstraints(null)).toBe(false);
    expect(hasActiveConstraints({ labels: { mode: 'include', values: [] }, keepUnrated: true })).toBe(false);
    expect(hasActiveConstraints({ respectDirection: true })).toBe(true);
  });

  it('ignores a threshold of the other evaluation model', () => {
    expect(hasActiveConstraints({ minConfidence: 60 }, 'europol')).toBe(false);
    expect(hasActiveConstraints({ minConfidence: 60 }, 'zeroneurone')).toBe(true);
    expect(hasActiveConstraints({ minEvaluation: { source: 'B', info: null } }, 'zeroneurone')).toBe(false);
    expect(hasActiveConstraints({ minEvaluation: { source: 'B', info: null } }, 'admiralty')).toBe(true);
  });
});
