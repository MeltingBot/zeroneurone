import { describe, it, expect } from 'vitest';
import type { Element, Link } from '../types';
import { layoutService } from './layoutService';

const el = (id: string) => ({
  id, label: id, position: { x: Math.random() * 5000, y: Math.random() * 5000 },
  visual: { color: '#fff', borderColor: '#000', shape: 'rectangle', size: 'medium', icon: null, image: null },
  isGroup: false, parentGroupId: null,
}) as unknown as Element;
const link = (id: string, fromId: string, toId: string) => ({ id, fromId, toId }) as unknown as Link;

describe('force layout with groups not linked to each other', () => {
  // Two linked pairs, three isolated elements
  const elements = ['a1', 'a2', 'b1', 'b2', 'x', 'y', 'z'].map(el);
  const links = [link('l1', 'a1', 'a2'), link('l2', 'b1', 'b2')];
  const { positions } = layoutService.applyLayout('force', elements, links, { center: { x: 0, y: 0 } });

  it('packs them tightly (no fixed 1500 px spread)', () => {
    const xs = [...positions.values()].map((p) => p.x);
    const ys = [...positions.values()].map((p) => p.y);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    expect(positions.size).toBe(7);
    expect(span).toBeLessThan(900);
  });

  it('keeps nodes apart', () => {
    const pts = [...positions.values()];
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)).toBeGreaterThan(30);
      }
    }
  });
});
