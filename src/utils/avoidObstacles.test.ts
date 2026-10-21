import { describe, it, expect } from 'vitest';
import { avoidObstacles } from './avoidObstacles';
import type { Rect } from './layoutScope';

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

// 20x20 grid of 100px nodes, 150px apart (block ~2950px wide)
const block: Rect[] = Array.from({ length: 400 }, (_, i) => ({
  x: (i % 20) * 150, y: Math.floor(i / 20) * 150, width: 100, height: 100,
}));

describe('avoidObstacles', () => {
  it('does not move a block that covers nothing', () => {
    expect(avoidObstacles(block, [{ x: 10000, y: 0, width: 100, height: 100 }])).toEqual({ x: 0, y: 0 });
  });

  it('moves the whole block off locked elements in the middle of it', () => {
    const locked: Rect[] = Array.from({ length: 50 }, (_, i) => ({
      x: 1000 + (i % 10) * 120, y: 1000 + Math.floor(i / 10) * 120, width: 100, height: 100,
    }));
    const shift = avoidObstacles(block, locked);
    expect(shift).not.toEqual({ x: 0, y: 0 });
    for (const n of block) {
      const moved = { ...n, x: n.x + shift.x, y: n.y + shift.y };
      expect(locked.some((o) => overlaps(moved, o))).toBe(false);
    }
  });
});
