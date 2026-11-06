import { describe, it, expect } from 'vitest';
import { anyNodeInView } from './nodesInView';

// A 1000 × 600 canvas
const W = 1000, H = 600;

describe('anyNodeInView', () => {
  const node = (id: string, x: number, y: number, parentId?: string) => ({ id, position: { x, y }, parentId });

  it('sees a node inside the view, and one only partly inside', () => {
    expect(anyNodeInView([node('a', 100, 100)], { x: 0, y: 0, zoom: 1 }, W, H)).toBe(true);
    expect(anyNodeInView([node('a', -100, 100)], { x: 0, y: 0, zoom: 1 }, W, H)).toBe(true);
  });

  it('sees none when the view is on an empty area, panned or zoomed in', () => {
    expect(anyNodeInView([node('a', 5000, 5000)], { x: 0, y: 0, zoom: 1 }, W, H)).toBe(false);
    // Zoomed ×4 on the area around (0, 0): a node at (400, 400) is out of view
    expect(anyNodeInView([node('a', 400, 400)], { x: 0, y: 0, zoom: 4 }, W, H)).toBe(false);
  });

  it('follows the pan and zoom of the viewport', () => {
    // Panned to the area around (5000, 5000)
    expect(anyNodeInView([node('a', 5000, 5000)], { x: -4900, y: -4900, zoom: 1 }, W, H)).toBe(true);
    // Zoomed out ×0.1: the view spans 10 000 × 6 000
    expect(anyNodeInView([node('a', 5000, 5000)], { x: 0, y: 0, zoom: 0.1 }, W, H)).toBe(true);
  });

  it('places a node in a group from its group', () => {
    const nodes = [node('g', 5000, 5000), node('child', 10, 10, 'g')];
    expect(anyNodeInView(nodes.slice(1).concat([{ ...nodes[0], position: { x: 9000, y: 9000 } }]), { x: -4900, y: -4900, zoom: 1 }, W, H)).toBe(false);
    expect(anyNodeInView(nodes, { x: -4900, y: -4900, zoom: 1 }, W, H)).toBe(true);
  });

  it('uses the measured size of a node', () => {
    // A wide node starting left of the view reaches into it
    expect(anyNodeInView([{ ...node('a', -900, 100), measured: { width: 1000, height: 50 } }], { x: 0, y: 0, zoom: 1 }, W, H)).toBe(true);
    expect(anyNodeInView([node('a', -900, 100)], { x: 0, y: 0, zoom: 1 }, W, H)).toBe(false);
  });
});

describe('anyNodeInView and filters', () => {
  it('does not count a node hidden by a filter', () => {
    expect(anyNodeInView([{ id: 'a', position: { x: 100, y: 100 }, hidden: true }], { x: 0, y: 0, zoom: 1 }, W, H)).toBe(false);
  });
});
