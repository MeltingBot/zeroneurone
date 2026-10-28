import { describe, it, expect } from 'vitest';
import { lineOffsets, svgLabelTspans, wrapLabelLines } from './wrapLabel';

describe('wrapLabelLines', () => {
  it('keeps one line without a width or when the label fits', () => {
    expect(wrapLabelLines('a long label here', undefined)).toEqual(['a long label here']);
    expect(wrapLabelLines('short', 20)).toEqual(['short']);
  });

  it('cuts at spaces within the width', () => {
    expect(wrapLabelLines('a pour associé et gérant de fait', 12)).toEqual(['a pour', 'associé et', 'gérant de', 'fait']);
  });

  it('keeps a word longer than the width whole', () => {
    expect(wrapLabelLines('voir anticonstitutionnellement ici', 10)).toEqual(['voir', 'anticonstitutionnellement', 'ici']);
  });

  it('collapses repeated spaces', () => {
    expect(wrapLabelLines('un   deux  trois', 8)).toEqual(['un deux', 'trois']);
  });
});

describe('svg helpers', () => {
  it('centres the lines on the label point', () => {
    expect(lineOffsets(1, 14)).toEqual([0]);
    expect(lineOffsets(3, 14)).toEqual([-14, 0, 14]);
  });

  it('writes tspans only for several lines, escaped', () => {
    const esc = (s: string) => s.replace(/</g, '&lt;');
    expect(svgLabelTspans(['a<b'], 0, 0, 14, esc)).toBe('a&lt;b');
    expect(svgLabelTspans(['a', 'b'], 10, 20, 14, esc)).toBe('<tspan x="10" y="13">a</tspan><tspan x="10" y="27">b</tspan>');
  });
});
