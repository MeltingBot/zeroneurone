// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildMapSVG, type MapSvgInput } from './mapSvg';

const base = (over: Partial<MapSvgInput> = {}): MapSvgInput => ({
  width: 800,
  height: 600,
  background: 'data:image/png;base64,AAAA',
  zones: [],
  lines: [],
  arrows: [],
  markers: [],
  clusters: [],
  linkLabels: [],
  attribution: '© OpenStreetMap',
  anonymous: false,
  ...over,
});

const parse = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml');

describe('buildMapSVG', () => {
  const full = base({
    zones: [{ rings: [[[10, 10], [100, 10], [100, 100]]], fill: '#10b981', stroke: '#059669', fillOpacity: 0.2, strokeWidth: 2, strokeOpacity: 1 }],
    lines: [{ points: [[0, 0], [200, 200]], color: '#6b6560', width: 2, opacity: 1, style: 'dashed', halo: true }],
    arrows: [{ x: 180, y: 180, rotate: 135, color: '#6b6560', opacity: 1 }],
    markers: [
      { kind: 'dot', dot: { x: 50, y: 50, w: 16, h: 16 }, fill: 'rgb(147, 197, 253)', stroke: 'rgb(168, 162, 158)', opacity: 1, label: { box: { x: 40, y: 68, w: 40, h: 14 }, text: 'Alice' } },
      { kind: 'card', card: { x: 300, y: 300, w: 48, h: 66 }, image: 'data:image/png;base64,BBBB', stroke: '#a8a29e', opacity: 0.3, label: { box: { x: 300, y: 348, w: 48, h: 18 }, text: 'Bob' } },
      { kind: 'breadcrumb', dot: { x: 400, y: 400, w: 8, h: 8 }, fill: '#e07a5f', stroke: '#a8a29e', opacity: 0.9 },
    ],
    clusters: [{ box: { x: 500, y: 500, w: 36, h: 36 }, count: '7', opacity: 1 }],
    linkLabels: [{ box: { x: 90, y: 90, w: 50, h: 18 }, text: 'appelle' }],
  });

  it('draws the basemap as an image and the rest as vectors, in a well-formed SVG', () => {
    const doc = parse(buildMapSVG(full));
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelectorAll('image')).toHaveLength(2); // basemap + card image
    expect(doc.querySelector('#zones path')).not.toBeNull();
    expect(doc.querySelectorAll('#links polyline')).toHaveLength(2); // halo + line
    expect(doc.querySelector('#links polyline:last-of-type')?.getAttribute('stroke-dasharray')).toBe('20 12');
    const texts = Array.from(doc.querySelectorAll('text')).map((t) => t.textContent);
    expect(texts).toEqual(expect.arrayContaining(['Alice', 'Bob', '7', 'appelle', '© OpenStreetMap']));
  });

  it('writes the basemap credits', () => {
    expect(buildMapSVG(base())).toContain('© OpenStreetMap');
  });

  it('escapes the texts', () => {
    const svg = buildMapSVG(base({ linkLabels: [{ box: { x: 0, y: 0, w: 40, h: 18 }, text: '<script>alert(1)</script>' }] }));
    expect(svg).not.toContain('<script>');
    expect(parse(svg).querySelector('parsererror')).toBeNull();
  });

  it('writes no label in anonymous mode', () => {
    const svg = buildMapSVG({ ...full, anonymous: true });
    expect(svg).not.toContain('Alice');
    expect(svg).not.toContain('Bob');
    expect(svg).not.toContain('appelle');
  });

  it('stands a plain fill for an unreadable basemap', () => {
    const doc = parse(buildMapSVG(base({ background: null })));
    expect(doc.querySelectorAll('image')).toHaveLength(0);
  });
});
