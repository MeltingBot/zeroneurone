// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useDossierStore, useTabStore, useViewStore } from '../stores';
import type { Element } from '../types';
import { canvasPosition, revealElement } from './revealElement';

function el(id: string, x: number, y: number, parentGroupId: string | null = null): Element {
  return {
    id, position: { x, y }, parentGroupId, isGroup: parentGroupId === null && id.startsWith('g'),
    visual: { size: 'medium' },
  } as unknown as Element;
}

describe('canvasPosition', () => {
  it('adds up the positions of nested groups', () => {
    const elements = [el('g1', 100, 200), el('g2', 10, 20, 'g1'), el('a', 1, 2, 'g2')];
    expect(canvasPosition(elements[2], elements)).toEqual({ x: 111, y: 222 });
  });

  it('keeps the position of an element outside any group', () => {
    const elements = [el('a', 5, 6)];
    expect(canvasPosition(elements[0], elements)).toEqual({ x: 5, y: 6 });
  });

  it('stops on a parent cycle instead of looping', () => {
    const elements = [el('g1', 1, 1, 'g2'), el('g2', 1, 1, 'g1')];
    expect(canvasPosition(elements[0], elements)).toEqual({ x: 2, y: 2 });
  });
});

describe('revealElement', () => {
  beforeEach(() => {
    useTabStore.setState({ activeTabId: null });
    useViewStore.setState({ displayMode: 'canvas', pendingViewport: null });
  });

  it('centres an element inside a group on its canvas position', () => {
    useDossierStore.setState({ elements: [el('g1', 1000, 2000), el('a', 50, 60, 'g1')] });
    revealElement('a');
    const viewport = useViewStore.getState().pendingViewport!;
    // Element centre: (1000 + 50 + 28, 2000 + 60 + 28), zoom 1
    expect(viewport.x).toBe(-1078 + (window.innerWidth - 350) / 2);
    expect(viewport.y).toBe(-2088 + window.innerHeight / 2);
  });
});
