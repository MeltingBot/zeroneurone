import { describe, it, expect } from 'vitest';
import { buildPrintHtml, pageSize, svgSize } from './printExportService';

const WIDE = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 2000 900" width="2000" height="900">\n</svg>';
const TALL = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 1200" width="400" height="1200"></svg>';

describe('printExportService', () => {
  it('reads the graph size from the viewBox', () => {
    expect(svgSize(WIDE)).toEqual({ width: 2000, height: 900 });
    expect(svgSize('<svg></svg>')).toEqual({ width: 1, height: 1 });
  });

  it('turns the sheet the way the graph is drawn in auto', () => {
    expect(pageSize('A0', 'auto', { width: 2000, height: 900 })).toEqual({ width: 1189, height: 841 });
    expect(pageSize('A0', 'auto', { width: 400, height: 1200 })).toEqual({ width: 841, height: 1189 });
    expect(pageSize('A4', 'landscape', { width: 1, height: 9 })).toEqual({ width: 297, height: 210 });
    expect(pageSize('A3', 'portrait', { width: 9, height: 1 })).toEqual({ width: 297, height: 420 });
  });

  it('sets the sheet size and fits the SVG inside the margins', () => {
    const html = buildPrintHtml(WIDE, { paper: 'A0', orientation: 'auto', title: 'Dossier' });
    expect(html).toContain('@page { size: 1189mm 841mm; margin: 10mm; }');
    expect(html).toContain('svg { display: block; width: 1169mm; height: 820mm; }');
    expect(html).not.toContain('<?xml');
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 2000 900" preserveAspectRatio="xMidYMid meet">');
    expect(html).not.toMatch(/<svg[^>]*\swidth="/);
  });

  it('escapes the title', () => {
    const html = buildPrintHtml(TALL, { paper: 'A4', orientation: 'auto', title: '</title><script>x</script>' });
    expect(html).not.toContain('<script>');
  });
});
