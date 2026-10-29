// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { gatherPositions } from '../groupElements';

describe('gatherPositions', () => {
  it('packs far-apart boxes in a grid around their centre, in reading order', () => {
    const boxes = [
      { id: 'c', x: 0, y: 5000, w: 100, h: 50 },
      { id: 'a', x: 0, y: 0, w: 100, h: 50 },
      { id: 'd', x: 5000, y: 5000, w: 100, h: 50 },
      { id: 'b', x: 5000, y: 0, w: 100, h: 50 },
    ];
    const pos = gatherPositions(boxes);
    // 2 x 2 grid, cells of 150 x 100 (box + 50 gap), centred on (2550, 2525)
    expect(pos.get('a')).toEqual({ x: 2425, y: 2450 });
    expect(pos.get('b')).toEqual({ x: 2575, y: 2450 });
    expect(pos.get('c')).toEqual({ x: 2425, y: 2550 });
    expect(pos.get('d')).toEqual({ x: 2575, y: 2550 });
  });

  it('uses a near-square grid', () => {
    const boxes = Array.from({ length: 10 }, (_, i) => ({ id: `e${i}`, x: i * 1000, y: 0, w: 50, h: 50 }));
    const xs = new Set([...gatherPositions(boxes).values()].map((p) => p.x));
    expect(xs.size).toBe(4); // ceil(sqrt(10)) columns
  });
});
