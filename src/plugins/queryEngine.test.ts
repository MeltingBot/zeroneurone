// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as Y from 'yjs';
import type { Element, Link } from '../types';
import { parseQueryText, evaluateQueryText, queryVocabulary } from './queryEngine';

/**
 * api.query: same results as the query panel, nothing outside `within`,
 * and no effect on the query store, the history or the event bus.
 */

const ydoc = new Y.Doc();

vi.mock('../services/syncService', () => ({
  syncService: {
    // Files document of a shared dossier (filesSync.ts), absent here
    getFilesDoc: () => null,
    onFilesChange: () => () => {},
    setMessageHandler: () => {},
    getYDoc: () => ydoc,
    getDossierId: () => 'd1',
    isConnected: () => false,
    getProvider: () => null,
    broadcastAsset: vi.fn(),
    setAtRestDek: vi.fn(),
    onStateChange: vi.fn(),
    onAwarenessChange: vi.fn(),
    getAwareness: () => null,
  },
}));

vi.mock('../services/fileService', () => ({
  fileService: {
    getAssetsByDossier: vi.fn().mockResolvedValue([]),
    saveAsset: vi.fn(),
    deleteAsset: vi.fn().mockResolvedValue(undefined),
    getFileBlob: vi.fn().mockResolvedValue(null),
  },
}));

function el(id: string, label: string, tags: string[] = []): Element {
  return {
    id, dossierId: 'd1', label, notes: '', tags, properties: [], confidence: null, source: '',
    date: null, dateRange: null, position: { x: 0, y: 0 }, isPositionLocked: false, geo: null, events: [],
    visual: { color: '#f5f5f4', shape: 'rectangle', size: 'medium', icon: null, borderColor: '#a8a29e', image: null },
    assetIds: [], parentGroupId: null, isGroup: false, isAnnotation: false, childIds: [],
    createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-06-01'),
  } as Element;
}

function lk(id: string, fromId: string, toId: string, label = ''): Link {
  return {
    id, dossierId: 'd1', fromId, toId, sourceHandle: null, targetHandle: null, label, notes: '', tags: [],
    properties: [], directed: false, direction: 'none', confidence: null, source: '', date: null, dateRange: null,
    visual: { color: '#6b7280', style: 'solid', thickness: 1 }, curveOffset: { x: 0, y: 0 },
    createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-06-01'),
  } as Link;
}

// a — b — c — d, e isolated; a and c are suspects
const elements = [
  el('a', 'Alice Dupont', ['suspect']),
  el('b', 'Bob Dupont'),
  el('c', 'Carla', ['suspect']),
  el('d', 'Dan'),
  el('e', 'Eve Dupont'),
];
const links = [lk('ab', 'a', 'b', 'appel'), lk('bc', 'b', 'c', 'appel'), lk('cd', 'c', 'd', 'virement')];

describe('parse', () => {
  it('accepts a valid query', () => {
    expect(parseQueryText('label CONTAINS "Dupont"')).toEqual({ ok: true });
  });

  it('reports an incomplete query with its position', () => {
    const r = parseQueryText('label CONTAINS');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toBeTruthy();
    expect(typeof r.error.position).toBe('number');
  });

  it('gives positions in the text as given, leading spaces included', () => {
    const plain = parseQueryText('label CONTAINS');
    const padded = parseQueryText('   label CONTAINS');
    if (plain.ok || padded.ok) throw new Error('expected errors');
    expect(padded.error.position).toBe(plain.error.position + 3);
  });

  it('rejects an empty text', () => {
    expect(parseQueryText('  ').ok).toBe(false);
  });
});

describe('evaluate', () => {
  it('returns arrays of ids', () => {
    expect(evaluateQueryText('label CONTAINS "Dupont"', elements, links)).toEqual({
      elementIds: ['a', 'b', 'e'],
      linkIds: [],
    });
  });

  it('returns the parse error', () => {
    const r = evaluateQueryText('label CONTAINS', elements, links);
    expect('error' in r).toBe(true);
  });

  it('matches links', () => {
    const r = evaluateQueryText('label = "virement"', elements, links);
    expect(r).toEqual({ elementIds: [], linkIds: ['cd'] });
  });

  it('keeps nothing outside within, and only links between two of its elements', () => {
    const r = evaluateQueryText('label = "appel" OR label CONTAINS "Dupont"', elements, links, { within: ['a', 'b', 'd'] });
    if ('error' in r) throw new Error(r.error.message);
    expect(r.elementIds).toEqual(['a', 'b']);
    expect(r.linkIds).toEqual(['ab']);
  });

  it('accepts any iterable as within, and an empty one keeps nothing', () => {
    const r = evaluateQueryText('label CONTAINS "Dupont"', elements, links, { within: new Set(['e']) });
    expect(r).toEqual({ elementIds: ['e'], linkIds: [] });
    expect(evaluateQueryText('label CONTAINS "Dupont"', elements, links, { within: [] }))
      .toEqual({ elementIds: [], linkIds: [] });
  });

  it('WITHIN follows links through elements outside within', () => {
    // d is 3 hops from a, through b and c that lie outside `within`: d is still reached
    const r = evaluateQueryText('WITHIN 3 HOPS OF _id = "a"', elements, links, { within: ['a', 'd'] });
    if ('error' in r) throw new Error(r.error.message);
    expect(r.elementIds).toEqual(['a', 'd']);
  });
});

describe('vocabulary', () => {
  it('lists reserved fields and operators', () => {
    const v = queryVocabulary();
    expect(v.fields).toContain('label');
    expect(v.fields).toContain('tag');
    expect(v.operators).toContain('CONTAINS');
    expect(v.operators).toContain('AND');
  });
});

describe('api.query against the query panel', () => {
  let dossierStore: typeof import('../stores/dossierStore');
  let queryStore: typeof import('../stores/queryStore');
  let bus: typeof import('./pluginEventBus');
  let api: typeof import('./pluginAPI');

  beforeEach(async () => {
    dossierStore ??= await import('../stores/dossierStore');
    queryStore ??= await import('../stores/queryStore');
    bus ??= await import('./pluginEventBus');
    api ??= await import('./pluginAPI');
    dossierStore.useDossierStore.setState({
      currentDossier: { id: 'd1', name: 'Case', description: '', settings: { existingTags: [], suggestedProperties: [] }, createdAt: new Date(), updatedAt: new Date() } as never,
      elements,
      links,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    queryStore.useQueryStore.getState().setText('');
  });

  it('gives the panel results, WITHIN included', () => {
    for (const text of ['label CONTAINS "Dupont"', 'tag = "suspect" AND NOT label STARTS "A"', 'WITHIN 1 HOPS OF tag = "suspect"', 'label = "appel"']) {
      queryStore.useQueryStore.getState().setText(text);
      const panel = queryStore.useQueryStore.getState().results!;
      const r = api.pluginAPI.query.evaluate(text);
      if ('error' in r) throw new Error(r.error.message);
      expect(new Set(r.elementIds)).toEqual(panel.elementIds);
      expect(new Set(r.linkIds)).toEqual(panel.linkIds);
    }
  });

  it('leaves the query store, the history and the event bus untouched', () => {
    vi.useFakeTimers();
    const seen: string[] = [];
    const off = bus.onAnyPluginEvent((e) => seen.push(e.type));
    const before = queryStore.useQueryStore.getState();
    api.pluginAPI.query.parse('label CONTAINS "Dupont"');
    api.pluginAPI.query.evaluate('label CONTAINS "Dupont"');
    api.pluginAPI.query.evaluate('label CONTAINS');
    vi.advanceTimersByTime(5000);
    off();
    expect(queryStore.useQueryStore.getState()).toBe(before);
    expect(seen).toEqual([]);
    expect(api.pluginAPI.features.queryEngine).toBe(true);
  });

  it('is given to a community plugin only with dossier read access', async () => {
    const { buildSandboxedAPI } = await import('./pluginSandbox');
    const scoped = api.createScopedPluginAPI('p');
    expect(buildSandboxedAPI(scoped, 'community', ['stores:dossier:read']).query).toBe(scoped.query);
    expect(buildSandboxedAPI(scoped, 'community', ['stores:dossier:write']).query).toBe(scoped.query);
    expect(buildSandboxedAPI(scoped, 'community', ['stores:query:read']).query).toBeUndefined();
  });
});
