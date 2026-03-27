import { describe, it, expect } from 'vitest';
import { getAutocompleteSuggestions } from '../autocomplete';
import type { Element, Link } from '../../../types';

// ── Test data ──

const elements: Element[] = [
  {
    id: 'el-1', dossierId: 'd1', label: 'Alice', notes: '', tags: ['personne', 'suspect'],
    properties: [{ key: 'ville', value: 'Paris' }, { key: 'age', value: 35, type: 'number' }],
    confidence: 80, source: 'police', date: null, dateRange: null,
    position: { x: 0, y: 0 }, isPositionLocked: false, geo: null, events: [],
    visual: { color: '#f5f5f4', shape: 'rectangle', size: 'medium', icon: null, borderColor: '#a8a29e', image: null },
    assetIds: [], parentGroupId: null, isGroup: false, isAnnotation: false, childIds: [],
    createdAt: new Date(), updatedAt: new Date(),
  } as Element,
  {
    id: 'el-2', dossierId: 'd1', label: 'Bob', notes: '', tags: ['personne'],
    properties: [{ key: 'ville', value: 'Lyon' }, { key: 'Numero SIREN', value: '123456789' }],
    confidence: 60, source: 'douane', date: null, dateRange: null,
    position: { x: 0, y: 0 }, isPositionLocked: false, geo: null, events: [],
    visual: { color: '#f5f5f4', shape: 'rectangle', size: 'medium', icon: null, borderColor: '#a8a29e', image: null },
    assetIds: [], parentGroupId: null, isGroup: false, isAnnotation: false, childIds: [],
    createdAt: new Date(), updatedAt: new Date(),
  } as Element,
];

const links: Link[] = [];

// ── Tests ──

describe('autocomplete — field suggestions', () => {
  it('suggests reserved fields at start', () => {
    const s = getAutocompleteSuggestions('', 0, elements, links);
    const fields = s.filter(x => x.type === 'field');
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.some(f => f.text === 'label')).toBe(true);
    expect(fields.some(f => f.text === 'tag')).toBe(true);
    expect(fields.some(f => f.text === 'confidence')).toBe(true);
  });

  it('suggests property keys from data', () => {
    const s = getAutocompleteSuggestions('', 0, elements, links);
    const fields = s.filter(x => x.type === 'field');
    expect(fields.some(f => f.text === 'ville')).toBe(true);
    expect(fields.some(f => f.text === 'age')).toBe(true);
    // Quoted field with spaces
    expect(fields.some(f => f.text === '"Numero SIREN"')).toBe(true);
  });

  it('filters by partial input', () => {
    const s = getAutocompleteSuggestions('con', 3, elements, links);
    const fields = s.filter(x => x.type === 'field');
    expect(fields.some(f => f.text === 'confidence')).toBe(true);
    expect(fields.every(f => f.text.toLowerCase().includes('con'))).toBe(true);
  });

  it('suggests fields after AND', () => {
    const s = getAutocompleteSuggestions('tag = "personne" AND ', 21, elements, links);
    const fields = s.filter(x => x.type === 'field');
    expect(fields.length).toBeGreaterThan(0);
  });
});

describe('autocomplete — operator suggestions', () => {
  it('suggests operators after field', () => {
    const s = getAutocompleteSuggestions('confidence ', 11, elements, links);
    const ops = s.filter(x => x.type === 'operator');
    expect(ops.length).toBeGreaterThan(0);
    expect(ops.some(o => o.text === '=')).toBe(true);
    // Number field: should include comparison operators
    expect(ops.some(o => o.text === '>')).toBe(true);
  });

  it('suggests string operators for string fields', () => {
    const s = getAutocompleteSuggestions('notes ', 6, elements, links);
    const ops = s.filter(x => x.type === 'operator');
    expect(ops.some(o => o.text === 'CONTAINS')).toBe(true);
    expect(ops.some(o => o.text === 'STARTS')).toBe(true);
  });
});

describe('autocomplete — value suggestions', () => {
  it('suggests tag values for tag field', () => {
    const s = getAutocompleteSuggestions('tag = ', 6, elements, links);
    const tags = s.filter(x => x.type === 'tag');
    expect(tags.some(t => t.text === '"personne"')).toBe(true);
    expect(tags.some(t => t.text === '"suspect"')).toBe(true);
  });

  it('suggests boolean for boolean fields', () => {
    const s = getAutocompleteSuggestions('has_geo = ', 10, elements, links);
    const vals = s.filter(x => x.type === 'value');
    expect(vals.map(v => v.text)).toContain('true');
    expect(vals.map(v => v.text)).toContain('false');
  });

  it('suggests type values for type field', () => {
    const s = getAutocompleteSuggestions('type = ', 7, elements, links);
    const vals = s.filter(x => x.type === 'value');
    expect(vals.map(v => v.text)).toContain('"element"');
    expect(vals.map(v => v.text)).toContain('"link"');
  });

  it('suggests existing values for free properties', () => {
    const s = getAutocompleteSuggestions('ville = ', 8, elements, links);
    const vals = s.filter(x => x.type === 'value');
    expect(vals.some(v => v.text === '"Paris"')).toBe(true);
    expect(vals.some(v => v.text === '"Lyon"')).toBe(true);
  });
});

describe('autocomplete — keyword suggestions', () => {
  it('suggests keywords after complete condition', () => {
    const s = getAutocompleteSuggestions('tag = "personne" ', 17, elements, links);
    const kws = s.filter(x => x.type === 'keyword');
    expect(kws.some(k => k.text === 'AND')).toBe(true);
    expect(kws.some(k => k.text === 'OR')).toBe(true);
  });
});
