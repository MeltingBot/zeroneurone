import { describe, it, expect, beforeAll } from 'vitest';

// The worker module answers through `self`: stand in for it
const posted: { type: string; positions?: Record<string, { x: number; y: number }> }[] = [];
let handle: (e: { data: unknown }) => void;

beforeAll(async () => {
  const fakeSelf: { postMessage: (m: never) => void; onmessage?: (e: { data: unknown }) => void } = { postMessage: (m) => { posted.push(m); } };
  (globalThis as Record<string, unknown>).self = fakeSelf;
  await import('./graphWorker');
  handle = fakeSelf.onmessage!;
});

const el = (id: string) => ({ id, label: id, position: { x: 0, y: 0 }, shape: 'circle', size: 'medium' });
const link = (fromId: string, toId: string) => ({ id: `${fromId}-${toId}`, fromId, toId });

function layout(type: 'force' | 'clusters', ids: string[], links: ReturnType<typeof link>[]) {
  posted.length = 0;
  handle({ data: { type: 'computeLayout', requestId: 1, elements: ids.map(el), links, options: { layoutType: type, center: { x: 0, y: 0 } } } });
  const res = posted.find((m) => m.type === 'layoutResult');
  expect(res, JSON.stringify(posted.find((m) => m.type === 'error'))).toBeDefined();
  return res!.positions!;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('worker force layout around a hub', () => {
  // A hub with 30 leaves, and a ring of 10 elements also linked to it
  const leaves = Array.from({ length: 30 }, (_, i) => `leaf${i}`);
  const ring = Array.from({ length: 10 }, (_, i) => `r${i}`);
  const links = [
    ...leaves.map((l) => link('hub', l)),
    ...ring.map((r, i) => link(r, ring[(i + 1) % ring.length])),
    ...ring.map((r) => link('hub', r)),
  ];

  it('keeps the leaves close to the hub, none on top of another', () => {
    const p = layout('force', ['hub', ...leaves, ...ring], links);
    for (const l of leaves) expect(dist(p[l], p.hub)).toBeLessThan(400);
    for (let i = 0; i < leaves.length; i++) {
      for (let j = i + 1; j < leaves.length; j++) expect(dist(p[leaves[i]], p[leaves[j]])).toBeGreaterThan(40);
    }
  });
});

describe('worker force layout around a hub of groups', () => {
  // A hub with 40 groups, each a parent with two leaves of its own
  const groups = Array.from({ length: 40 }, (_, i) => `g${i}`);
  const items = groups.flatMap((g) => [`${g}a`, `${g}b`]);
  const links = [...groups.map((g) => link('hub', g)), ...groups.flatMap((g) => [link(g, `${g}a`), link(g, `${g}b`)])];

  it('fills the space around the hub instead of a hollow ring', () => {
    const p = layout('force', ['hub', ...groups, ...items], links);
    const d = groups.map((g) => dist(p[g], p.hub)).sort((a, b) => a - b);
    expect(d[0]).toBeLessThan(400);
    for (const g of groups) {
      expect(dist(p[`${g}a`], p[g])).toBeLessThan(250);
      expect(dist(p[`${g}b`], p[g])).toBeLessThan(250);
    }
  });
});

describe('worker layouts on stars', () => {
  it('lays out a star with a separate pair (force, groups packed)', () => {
    const p = layout('force', ['a', 'b', 'c', 'x', 'y'], [link('a', 'b'), link('a', 'c'), link('x', 'y')]);
    expect(Object.keys(p)).toHaveLength(5);
    for (const v of Object.values(p)) expect(Number.isFinite(v.x) && Number.isFinite(v.y)).toBe(true);
    expect(dist(p.b, p.c)).toBeGreaterThan(40);
  });

  it('lays out a lone star with force and clusters', () => {
    for (const type of ['force', 'clusters'] as const) {
      const p = layout(type, ['a', 'b', 'c', 'd'], [link('a', 'b'), link('a', 'c'), link('a', 'd')]);
      expect(Object.keys(p)).toHaveLength(4);
      for (const v of Object.values(p)) expect(Number.isFinite(v.x) && Number.isFinite(v.y)).toBe(true);
    }
  });
});
