import { describe, it, expect } from 'vitest';
import { computeLayout, type LayoutNode, type LayoutEdge } from './layouts';

function node(id: string): LayoutNode {
  return { id, label: id, position: { x: 0, y: 0 }, shape: 'rectangle', size: 'medium' };
}

// Three separate pairs and a few isolated elements: several components
const nodes = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(node);
const edges: LayoutEdge[] = [
  { id: 'l1', fromId: 'a', toId: 'b' },
  { id: 'l2', fromId: 'c', toId: 'd' },
  { id: 'l3', fromId: 'e', toId: 'f' },
];

describe('computeLayout', () => {
  it('keeps the force layout clear of a locked element, as the clusters layout does', () => {
    const obstacle = { x: 0, y: 0, r: 400 };
    for (const layoutType of ['force', 'clusters'] as const) {
      const positions = computeLayout(nodes, edges, { layoutType, center: { x: 0, y: 0 }, obstacles: [obstacle] });
      for (const [id, p] of Object.entries(positions)) {
        expect(Math.hypot(p.x - obstacle.x, p.y - obstacle.y), `${layoutType} ${id}`).toBeGreaterThan(obstacle.r * 0.5);
      }
    }
  });

  it('reports its progress to the caller only', () => {
    const phases: string[] = [];
    computeLayout(nodes, edges, { layoutType: 'grid' }, (_p, phase) => phases.push(phase));
    expect(phases.length).toBeGreaterThan(0);
    // A later call without a callback does not reach the previous one
    const before = phases.length;
    computeLayout(nodes, edges, { layoutType: 'grid' });
    expect(phases.length).toBe(before);
  });
});
