import { describe, it, expect } from 'vitest';
import { packClusters } from './packClusters';

function discs(n: number, seed = 1) {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // One big cluster, a few mid ones, many small ones (typical Louvain output)
  return Array.from({ length: n }, (_, i) => ({
    radius: i === 0 ? 2000 : i < 20 ? 300 + rand() * 500 : 60 + rand() * 120,
    cx: 0,
    cy: 0,
  })).sort((a, b) => b.radius - a.radius);
}

describe('packClusters', () => {
  it('keeps clusters apart', () => {
    const L = discs(300);
    packClusters(L);
    for (let i = 0; i < L.length; i++) {
      for (let j = i + 1; j < L.length; j++) {
        const d = Math.hypot(L[i].cx - L[j].cx, L[i].cy - L[j].cy);
        expect(d).toBeGreaterThanOrEqual(L[i].radius + L[j].radius);
      }
    }
  });

  it('packs many clusters into a roughly round cloud, not a row', () => {
    const L = discs(1500);
    const t0 = performance.now();
    packClusters(L);
    const ms = performance.now() - t0;
    const xs = L.flatMap((c) => [c.cx - c.radius, c.cx + c.radius]);
    const ys = L.flatMap((c) => [c.cy - c.radius, c.cy + c.radius]);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    expect(Math.max(w, h) / Math.min(w, h)).toBeLessThan(1.5);
    expect(ms).toBeLessThan(3000);
  });

  it('packs around fixed discs (locked elements), close to them, without covering them', () => {
    // 600 locked elements in a 30x20 grid around the origin
    const fixed = Array.from({ length: 600 }, (_, i) => ({
      cx: (i % 30) * 140 - 2100, cy: Math.floor(i / 30) * 140 - 1400, r: 70,
    }));
    const free = discs(300);
    packClusters(free);
    const extentFree = Math.max(...free.map((c) => Math.hypot(c.cx, c.cy) + c.radius));

    const L = discs(300);
    packClusters(L, fixed);
    for (const c of L) {
      for (const f of fixed) {
        expect(Math.hypot(c.cx - f.cx, c.cy - f.cy)).toBeGreaterThanOrEqual(c.radius + f.r);
      }
    }
    // The cloud wraps the locked block: about as wide as without it plus the block itself
    const extent = Math.max(...L.map((c) => Math.hypot(c.cx, c.cy) + c.radius));
    expect(extent).toBeLessThan(extentFree + 2 * Math.hypot(2100, 1400));
  });
});
