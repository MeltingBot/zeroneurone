import { describe, it, expect } from 'vitest';
import type { Link } from '../types';
import { linkVisualState, type LinkVisualContext } from './linkVisualState';

const link = (id: string, fromId = 'a', toId = 'b') => ({ id, fromId, toId }) as Link;
const ctx = (over: Partial<LinkVisualContext> = {}): LinkVisualContext => ({
  selectedLinkIds: new Set(),
  dimmedElementIds: new Set(),
  emphasizedElementCount: 2,
  queryFilterActive: false,
  queryMatchLinkIds: new Set(),
  temporal: null,
  showUndated: false,
  ...over,
});

describe('linkVisualState — path links', () => {
  it('glows the walked links of an undirected path alone, without moving dashes', () => {
    const c = ctx({ glowLinks: new Set(['walked']) });
    expect(linkVisualState(link('walked'), c)).toMatchObject({ isHighlighted: true, flow: null });
    // A chord between two path elements stays plain
    expect(linkVisualState(link('chord'), c)).toMatchObject({ isHighlighted: false, flow: null });
  });

  it('shows the walked sense of a directed path, as for a cycle', () => {
    const c = ctx({ flowLinks: new Map([['walked', 'forward']]) });
    expect(linkVisualState(link('walked'), c)).toMatchObject({ isHighlighted: true, flow: 'forward' });
    expect(linkVisualState(link('chord'), c)).toMatchObject({ isHighlighted: false });
  });

  it('keeps the element-based glow when no link set is given', () => {
    expect(linkVisualState(link('any'), ctx()).isHighlighted).toBe(true);
    expect(linkVisualState(link('any'), ctx({ emphasizedElementCount: 0 })).isHighlighted).toBe(false);
  });
});
