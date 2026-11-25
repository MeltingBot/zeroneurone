// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildTimelineSVG, type TimelineSvgInput } from './timelineSvg';
import type { TimelineItem } from './timelineItems';

const item = (id: string, label: string, start: Date, end?: Date, over: Partial<TimelineItem> = {}): TimelineItem => ({
  id, label, start, end, color: '#e07a5f', type: 'event',
  thumbLetter: label[0], thumbColor: '#93c5fd', thumbShape: 'circle',
  ...over,
});

const base = (over: Partial<TimelineSvgInput>): TimelineSvgInput => ({
  mode: 'scatter',
  items: [],
  lanes: [],
  collapsedLanes: new Set(),
  viewStart: new Date(2020, 0, 1),
  zoom: 2, // px per day: 2020 spans about 730 px
  width: 800,
  language: 'fr',
  anonymous: false,
  ...over,
});

const parse = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml');

describe('buildTimelineSVG', () => {
  it('draws the items crossing the span, one row each, in a well-formed SVG', () => {
    const items = [
      item('a', 'Réunion', new Date(2020, 1, 1)),
      item('b', 'Contrat', new Date(2020, 2, 1), new Date(2020, 5, 1)),
      item('c', 'Hors champ', new Date(2015, 0, 1)),
    ];
    const doc = parse(buildTimelineSVG(base({ items })));
    expect(doc.querySelector('parsererror')).toBeNull();
    const texts = Array.from(doc.querySelectorAll('text')).map((t) => t.textContent);
    expect(texts).toContain('Réunion');
    expect(texts).toContain('Contrat');
    expect(texts).not.toContain('Hors champ');
    // Axis: months of 2020
    expect(texts.some((t) => /2020|févr|mars/.test(t ?? ''))).toBe(true);
  });

  it('escapes the labels', () => {
    const svg = buildTimelineSVG(base({ items: [item('a', '<script>alert(1)</script>', new Date(2020, 1, 1))] }));
    expect(svg).not.toContain('<script>');
    expect(parse(svg).querySelector('parsererror')).toBeNull();
  });

  it('writes no label nor initial in anonymous mode', () => {
    const svg = buildTimelineSVG(base({ anonymous: true, items: [item('a', 'Secret', new Date(2020, 1, 1))] }));
    expect(svg).not.toContain('Secret');
    expect(svg).not.toContain('>S<');
  });

  it('draws the lanes with their label column, items cut to the span', () => {
    const lanes = [
      { key: 'l1', label: 'Alice', items: [item('a', 'Appel', new Date(2020, 3, 1), new Date(2020, 4, 1))] },
      { key: 'l2', label: 'Bob', items: [item('b', 'Don', new Date(2020, 6, 1))] },
      { key: 'l3', label: 'Repliée', items: [item('c', 'Caché', new Date(2020, 6, 1))] },
    ];
    const svg = buildTimelineSVG(base({ mode: 'swimlane', lanes, collapsedLanes: new Set(['l3']) }));
    const doc = parse(svg);
    expect(doc.querySelector('parsererror')).toBeNull();
    const texts = Array.from(doc.querySelectorAll('text')).map((t) => t.textContent);
    expect(texts).toEqual(expect.arrayContaining(['Alice', 'Bob', 'Appel', 'Don', 'Repliée (1)']));
    expect(texts).not.toContain('Caché');
    expect(doc.querySelector('clipPath#tl-lanes')).not.toBeNull();
  });

  it('widens the drawing for labels written after the last items', () => {
    const svg = buildTimelineSVG(base({ items: [item('a', 'Un libellé assez long pour dépasser', new Date(2020, 11, 20))] }));
    const width = Number(parse(svg).documentElement.getAttribute('width'));
    expect(width).toBeGreaterThan(800);
  });
});
