import { describe, it, expect } from 'vitest';
import type { Element } from '../types';
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
