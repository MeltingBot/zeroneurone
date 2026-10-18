import { describe, it, expect } from 'vitest';
import { computeCausalConnections } from './causality';

const day = (d: number) => new Date(2026, 0, d);
const event = (id: string, sourceId: string, start: number, end?: number) =>
  ({ id, sourceId, start: day(start), end: end !== undefined ? day(end) : null });
const names = (connections: { fromItem: { id: string }; toItem: { id: string } }[]) =>
  connections.map(c => `${c.fromItem.id}->${c.toItem.id}`).sort();

describe('computeCausalConnections', () => {
  const links = [{ fromId: 'A', toId: 'B' }];

  it('keeps only the latest preceding event of each linked element', () => {
    const items = [event('a1', 'A', 1), event('a2', 'A', 5), event('a3', 'A', 9), event('b1', 'B', 10)];
    expect(names(computeCausalConnections(items, links, 365))).toEqual(['a3->b1']);
  });

  it('connects in both directions along the chain', () => {
    const items = [event('a1', 'A', 1), event('b1', 'B', 3), event('a2', 'A', 6)];
    expect(names(computeCausalConnections(items, links, 365))).toEqual(['a1->b1', 'b1->a2']);
  });

  it('ignores unlinked elements, events outside the window and simultaneous events', () => {
    expect(computeCausalConnections([event('a', 'A', 1), event('c', 'C', 2)], links, 365)).toEqual([]);
    expect(computeCausalConnections([event('a', 'A', 1), event('b', 'B', 20)], links, 10)).toEqual([]);
    expect(computeCausalConnections([event('a', 'A', 4), event('b', 'B', 4)], links, 365)).toEqual([]);
  });

  it('measures from the end of a period', () => {
    const items = [event('a', 'A', 1, 8), event('b', 'B', 5), event('b2', 'B', 9)];
    // a still runs when b starts; b2 follows a
    expect(names(computeCausalConnections(items, links, 365))).toEqual(['a->b2']);
  });
});
