import { describe, it, expect } from 'vitest';
import type { Element, Link } from '../types';
import { DEFAULT_LINK_VISUAL } from '../types';
import { buildSVGExport } from './svgExportService';

function makeElement(id: string, color: string): Element {
  return {
    id,
    dossierId: 'd1',
    label: 'Cible',
    position: { x: 0, y: 0 },
    tags: [],
    properties: [],
    assetIds: [],
    visual: { color, shape: 'rectangle' },
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Element;
}

const SETTINGS = { linkAnchorMode: 'auto', linkCurveMode: 'straight' } as const;

describe('svgExportService colour handling', () => {
  it('does not let a colour break out of a fill attribute', () => {
    // resolveColor used to return the value verbatim, and colours reach us from
    // imported archives and collaboration peers. The .svg executes on open.
    const svg = buildSVGExport([makeElement('a', 'red" onload="alert(1)')], [], SETTINGS);
    expect(svg).not.toContain('onload=');
    expect(svg).not.toContain('alert(1)');
  });

  it('strips a closing-tag payload smuggled through a colour', () => {
    const svg = buildSVGExport([makeElement('a', '"/><script>alert(1)</script><rect fill="')], [], SETTINGS);
    expect(svg).not.toContain('<script>');
  });

  it('keeps legitimate colours untouched', () => {
    const svg = buildSVGExport([makeElement('a', '#ff8800')], [], SETTINGS);
    expect(svg).toContain('#ff8800');
  });
});

function makeNode(id: string, x: number): Element {
  return { ...makeElement(id, '#ffffff'), label: id, position: { x, y: 0 } } as Element;
}

function makeLink(id: string, overrides: Partial<Link> = {}): Link {
  return {
    id, dossierId: 'd1', fromId: 'a', toId: 'b', sourceHandle: null, targetHandle: null,
    label: id, notes: '', tags: [], properties: [], directed: true, direction: 'forward',
    confidence: null, source: '', date: null, dateRange: null,
    visual: { ...DEFAULT_LINK_VISUAL, color: '#333333' }, curveOffset: { x: 0, y: 0 },
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  } as Link;
}

describe('svgExportService links', () => {
  const nodes = [makeNode('a', 0), makeNode('b', 400)];
  const parallel = [makeLink('l1'), makeLink('l2'), makeLink('l3')];

  for (const linkCurveMode of ['straight', 'curved', 'orthogonal'] as const) {
    it(`draws parallel links apart, each with its own arrow (${linkCurveMode})`, () => {
      const svg = buildSVGExport(nodes, parallel, { linkAnchorMode: 'auto', linkCurveMode });
      const paths = [...svg.matchAll(/<g id="edge-[^"]+">\s*<path d="([^"]+)"/g)].map(m => m[1]);
      const arrows = [...svg.matchAll(/<polygon points="([^"]+)"/g)].map(m => m[1].split(' ')[0]);
      expect(paths).toHaveLength(3);
      expect(new Set(paths).size).toBe(3);
      expect(new Set(arrows).size).toBe(3);
    });
  }

  it('uses the right-angle offset in orthogonal mode, not the curve offset', () => {
    const settings = { linkAnchorMode: 'auto', linkCurveMode: 'orthogonal' } as const;
    const plain = buildSVGExport(nodes, [makeLink('l1')], settings);
    const curved = buildSVGExport(nodes, [makeLink('l1', { curveOffset: { x: 0, y: 80 } })], settings);
    const moved = buildSVGExport(nodes, [makeLink('l1', { orthogonalOffset: { x: 0, y: -60 } })], settings);
    expect(curved).toBe(plain);
    expect(moved).not.toBe(plain);
  });
});
