// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { gatherPositions, placeInGroup } from '../groupElements';

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

describe('placeInGroup', () => {
  it('puts entering boxes in a row under the members, inside the frame', () => {
    const members = [{ id: 'm', x: 40, y: 40, w: 100, h: 50 }];
    const entering = [
      { id: 'b', x: 900, y: 0, w: 100, h: 50 },
      { id: 'a', x: -900, y: 0, w: 100, h: 50 },
    ];
    const { positions, size } = placeInGroup({ width: 300, height: 200 }, members, entering);
    // 300 wide: b no longer fits beside a (40 + 100 + 50 + 100 > 300 - 40)
    // Reading order, first row at member bottom (90) + gap (50)
    expect(positions.get('a')).toEqual({ x: 40, y: 140 });
    expect(positions.get('b')).toEqual({ x: 40, y: 240 });
    // Width kept, 240 + 50 + 40 = 330 high
    expect(size).toEqual({ width: 300, height: 330 });
  });

  it('widens the frame for a box wider than it', () => {
    const { positions, size } = placeInGroup({ width: 100, height: 100 }, [], [{ id: 'w', x: 0, y: 0, w: 200, h: 50 }]);
    expect(positions.get('w')).toEqual({ x: 40, y: 40 });
    expect(size).toEqual({ width: 280, height: 130 });
  });

  it('wraps at the frame width and never shrinks the frame', () => {
    const entering = Array.from({ length: 3 }, (_, i) => ({ id: `e${i}`, x: i, y: 0, w: 100, h: 50 }));
    const { positions, size } = placeInGroup({ width: 400, height: 500 }, [], entering);
    expect(positions.get('e0')).toEqual({ x: 40, y: 40 });
    expect(positions.get('e1')).toEqual({ x: 190, y: 40 });
    expect(positions.get('e2')).toEqual({ x: 40, y: 140 });
    expect(size).toEqual({ width: 400, height: 500 });
  });
});
