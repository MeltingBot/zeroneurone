import { describe, it, expect } from 'vitest';
import type { Element, Link } from '../types';
import { DEFAULT_ELEMENT_VISUAL, DEFAULT_LINK_VISUAL } from '../types';
import { buildMermaidExport } from './exportMermaid';
import { parseMermaid } from './importMermaid';

function el(id: string, label: string, over: Partial<Element> = {}): Element {
  return {
    id, dossierId: 'd1', label, notes: '', tags: [], properties: [], confidence: null, source: '',
    date: null, dateRange: null, position: { x: 0, y: 0 }, isPositionLocked: false, geo: null, events: [],
    visual: { ...DEFAULT_ELEMENT_VISUAL, shape: 'rectangle' }, assetIds: [], parentGroupId: null,
    isGroup: false, isAnnotation: false, childIds: [], createdAt: new Date(), updatedAt: new Date(),
    ...over,
  } as Element;
}

function link(id: string, fromId: string, toId: string, over: Partial<Link> = {}): Link {
  return {
    id, dossierId: 'd1', fromId, toId, sourceHandle: null, targetHandle: null, label: '', notes: '',
    tags: [], properties: [], directed: true, direction: 'forward', confidence: null, source: '',
    date: null, dateRange: null, visual: { ...DEFAULT_LINK_VISUAL }, curveOffset: { x: 0, y: 0 },
    createdAt: new Date(), updatedAt: new Date(),
    ...over,
  } as Link;
}

describe('buildMermaidExport', () => {
  it('exports shapes, labels, links and styles', () => {
    const out = buildMermaidExport(
      [
        el('a', 'Alice "la Chef"', { visual: { ...DEFAULT_ELEMENT_VISUAL, shape: 'circle', color: '#ff9966' } }),
        el('b', 'Société\nAlpha'),
      ],
      [link('l1', 'a', 'b', { label: 'dirige | gère' })],
    );
    expect(out).toContain('flowchart TD');
    expect(out).toContain('n1(("Alice #quot;la Chef#quot;"))');
    expect(out).toContain('n2["Société<br/>Alpha"]');
    expect(out).toContain('n1 -->|"dirige #124; gère"| n2');
    expect(out).toContain('style n1 fill:#ff9966');
  });

  it('skips links leaving the selection and swaps backward links', () => {
    const out = buildMermaidExport(
      [el('a', 'A'), el('b', 'B')],
      [link('l1', 'a', 'z'), link('l2', 'a', 'b', { direction: 'backward' })],
    );
    expect(out).not.toContain('z');
    expect(out).toContain('n2 --> n1');
  });

  it('round-trips through the importer', () => {
    const elements = [
      el('g', 'Groupe', { isGroup: true }),
      el('a', 'Alice', { parentGroupId: 'g', visual: { ...DEFAULT_ELEMENT_VISUAL, shape: 'diamond' } }),
      el('b', 'Bob', { visual: { ...DEFAULT_ELEMENT_VISUAL, shape: 'hexagon', borderColor: '#112233' } }),
      el('c', 'Carole', { visual: { ...DEFAULT_ELEMENT_VISUAL, shape: 'square' } }),
    ];
    const links = [
      link('l1', 'a', 'b', { label: 'connaît', direction: 'both' }),
      link('l2', 'b', 'c', { direction: 'none', visual: { ...DEFAULT_LINK_VISUAL, style: 'dashed' } }),
      link('l3', 'c', 'a', { visual: { ...DEFAULT_LINK_VISUAL, thickness: 4 } }),
    ];
    const parsed = parseMermaid(buildMermaidExport(elements, links));

    expect(parsed.ignoredLines).toBe(0);
    const byLabel = Object.fromEntries(parsed.nodes.map((n) => [n.label, n]));
    expect(Object.keys(byLabel).sort()).toEqual(['Alice', 'Bob', 'Carole']);
    expect(byLabel.Alice.shape).toBe('diamond');
    expect(byLabel.Alice.subgraph).toBe('Groupe');
    expect(byLabel.Bob.shape).toBe('hexagon');
    expect(byLabel.Bob.style.stroke).toBe('#112233');
    // ZN squares come back as rectangles (fixed-size squares wrap labels)
    expect(byLabel.Carole.shape).toBe('rectangle');

    expect(parsed.edges).toHaveLength(3);
    expect(parsed.edges[0]).toMatchObject({ label: 'connaît', direction: 'both' });
    expect(parsed.edges[1]).toMatchObject({ direction: 'none', style: 'dashed' });
    expect(parsed.edges[2]).toMatchObject({ direction: 'forward', thick: true });
  });
});
