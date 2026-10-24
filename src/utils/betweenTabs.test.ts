import { describe, it, expect } from 'vitest';
import type { CanvasTab, Link } from '../types';
import { computeBetweenTabs } from './betweenTabs';

const tab = (id: string, members: string[]) => ({ id, name: id, memberElementIds: members }) as unknown as CanvasTab;
const link = (id: string, fromId: string, toId: string) => ({ id, fromId, toId }) as unknown as Link;

describe('computeBetweenTabs', () => {
  // A: a1, a2, s   B: b1, s   outside: r (linked to a1 and b1), x (linked to a1 only)
  const tabs = [tab('A', ['a1', 'a2', 's']), tab('B', ['b1', 's'])];
  const links = [
    link('l1', 'a1', 'b1'), // direct
    link('l2', 's', 'b1'),  // inside B (s is shared)
    link('l3', 'a1', 'r'), link('l4', 'r', 'b1'), // r relays
    link('l5', 'a2', 'x'),  // x touches A only
  ];
  const r = computeBetweenTabs(tabs, 'A', 'B', links)!;

  it('finds the shared elements', () => expect(r.common).toEqual(['s']));
  it('finds the links going from one tab to the other only', () => {
    expect(r.directLinks).toEqual(['l1']);
    expect(r.directEnds.sort()).toEqual(['a1', 'b1']);
  });
  it('finds the relays linked to both tabs', () => expect(r.relays).toEqual(['r']));
});
