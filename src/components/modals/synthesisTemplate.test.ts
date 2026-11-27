// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_REPORT_OPTIONS } from '../../services/reportService';
import { clearTemplate, defaultTemplate, loadTemplate, parseTemplate, saveTemplate } from './synthesisTemplate';

describe('synthesisTemplate', () => {
  beforeEach(() => localStorage.clear());

  it('has no template until one is saved', () => {
    expect(loadTemplate()).toBeNull();
  });

  it('keeps the options and captures, not the title, the order or the scope', () => {
    const options = { ...DEFAULT_REPORT_OPTIONS, title: 'Dossier A', includeFiches: true, fichePerPage: true, sortElementsBy: 'date' as const, primaryElementIds: ['x'] };
    expect(saveTemplate(options, { canvas: true, map: false, timeline: true })).toBe(true);
    const template = loadTemplate()!;
    expect(template.options.includeFiches).toBe(true);
    expect(template.options.fichePerPage).toBe(true);
    expect(template.options.sortElementsBy).toBe('date');
    expect(template.captures).toEqual({ canvas: true, map: false, timeline: true });
    expect(template.options).not.toHaveProperty('title');
    expect(template.options).not.toHaveProperty('sectionOrder');
    expect(template.options).not.toHaveProperty('primaryElementIds');
  });

  it('gives the default to missing or wrong values and drops unknown ones', () => {
    const template = parseTemplate({ options: { includeFiches: 'yes', sortElementsBy: 'size', pageBreaks: false, gone: true }, captures: { map: 1 } })!;
    expect(template.options.includeFiches).toBe(DEFAULT_REPORT_OPTIONS.includeFiches);
    expect(template.options.sortElementsBy).toBe('label');
    expect(template.options.pageBreaks).toBe(false);
    expect(template.options.ficheLinks).toBe(DEFAULT_REPORT_OPTIONS.ficheLinks);
    expect(template.options).not.toHaveProperty('gone');
    expect(template.captures).toEqual(defaultTemplate().captures);
    expect(parseTemplate('nope')).toBeNull();
  });

  it('forgets the template', () => {
    saveTemplate(DEFAULT_REPORT_OPTIONS, defaultTemplate().captures);
    clearTemplate();
    expect(loadTemplate()).toBeNull();
    localStorage.setItem('zn:synthesis:template', '{broken');
    expect(loadTemplate()).toBeNull();
  });
});
