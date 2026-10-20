import { describe, it, expect } from 'vitest';
import { removeOverlaps, type OverlapNode } from './removeOverlaps';

const GAP = 24;

function overlapping(nodes: OverlapNode[], gap: number): number {
  let count = 0;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if ((a.w / 2 + b.w / 2 + gap) - Math.abs(a.x - b.x) > 0 && (a.h / 2 + b.h / 2 + gap) - Math.abs(a.y - b.y) > 0) count++;
    }
  }
  return count;
}

function cloud(n: number, spread: number): OverlapNode[] {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  return Array.from({ length: n }, (_, i) => ({ x: rnd() * spread, y: rnd() * spread, w: i % 10 === 0 ? 300 : 120, h: i % 10 === 0 ? 160 : 40 }));
}

/** The previous all-pairs implementation, kept as the reference. */
function allPairs(nodes: OverlapNode[], gap: number, passes: number): void {
  for (let pass = 0; pass < passes; pass++) {
    let hasOverlap = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const ox = (a.w / 2 + b.w / 2 + gap) - Math.abs(a.x - b.x);
        const oy = (a.h / 2 + b.h / 2 + gap) - Math.abs(a.y - b.y);
        if (ox > 0 && oy > 0) {
          hasOverlap = true;
          if (ox < oy) { const p = ox / 2 + 1; if (a.x < b.x) { a.x -= p; b.x += p; } else { a.x += p; b.x -= p; } }
          else { const p = oy / 2 + 1; if (a.y < b.y) { a.y -= p; b.y += p; } else { a.y += p; b.y -= p; } }
        }
      }
    }
    if (!hasOverlap) break;
  }
}

describe('removeOverlaps', () => {
  it('clears every overlap where the all-pairs version does', () => {
    const reference = cloud(2000, 9000);
    allPairs(reference, GAP, 200);
    expect(overlapping(reference, GAP)).toBe(0);

    const nodes = cloud(2000, 9000);
    expect(overlapping(nodes, GAP)).toBeGreaterThan(0);
    removeOverlaps(nodes, { gap: GAP, passes: 200 });
    expect(overlapping(nodes, GAP)).toBe(0);
  });

  it('does no worse than the all-pairs version on a cloud too dense to clear', () => {
    const reference = cloud(800, 3000);
    allPairs(reference, GAP, 200);
    const nodes = cloud(800, 3000);
    removeOverlaps(nodes, { gap: GAP, passes: 200 });
    expect(overlapping(nodes, GAP)).toBeLessThanOrEqual(overlapping(reference, GAP) * 1.1);
  });

  it('separates a few nodes stacked on the same point', () => {
    const nodes = Array.from({ length: 5 }, () => ({ x: 0, y: 0, w: 120, h: 40 }));
    removeOverlaps(nodes, { gap: GAP, passes: 200, coincident: 'centered' });
    expect(overlapping(nodes, GAP)).toBe(0);
  });

  it('leaves stacked nodes alone with coincident: none', () => {
    const nodes = [{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }];
    removeOverlaps(nodes, { gap: 0, passes: 5, coincident: 'none' });
    expect(nodes).toEqual([{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }]);
  });

  it('pushes apart on the axis of least overlap', () => {
    const nodes = [{ x: 0, y: 0, w: 100, h: 40 }, { x: 10, y: 50, w: 100, h: 40 }];
    removeOverlaps(nodes, { gap: 0, passes: 1 });
    expect(nodes[0].x).toBe(0);
    expect(nodes[1].x).toBe(10);
    expect(nodes[1].y - nodes[0].y).toBeGreaterThanOrEqual(40);
  });

  it('handles 5,000 nodes far faster than the all-pairs version', () => {
    // ~0.6 s alone, slower when the whole suite runs in parallel; the
    // all-pairs version took ~8 s here, so this still catches a regression
    const nodes = cloud(5000, 14000);
    const t = performance.now();
    removeOverlaps(nodes, { gap: GAP, passes: 200 });
    expect(performance.now() - t).toBeLessThan(5000);
    expect(overlapping(nodes, GAP)).toBe(0);
  });
});
