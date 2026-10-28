// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as Y from 'yjs';
import type { Element, Link } from '../types';

/**
 * Y.Doc → Zustand/Dexie sync on adds and deletes.
 *
 * An add or a delete used to re-read every element of the Y.Doc and rewrite
 * every Dexie row: in a 10k dossier, creating one element cost 10k parses and
 * 10k writes. Only the ids the observer reported are processed now.
 */

let ydoc = new Y.Doc();

vi.mock('../services/syncService', () => ({
  syncService: {
    getYDoc: () => ydoc,
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

vi.mock('../plugins/pluginEventBus', () => ({ emit: vi.fn(), setCurrentDossierIdGetter: vi.fn() }));

const repo = vi.hoisted(() => ({
  elementBulkUpsert: vi.fn().mockResolvedValue(undefined),
  elementDeleteMany: vi.fn().mockResolvedValue(undefined),
  linkBulkUpsert: vi.fn().mockResolvedValue(undefined),
  linkDeleteMany: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../db/repositories', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/repositories')>();
  return {
    ...actual,
    elementRepository: {
      ...actual.elementRepository,
      bulkUpsert: repo.elementBulkUpsert,
      deleteMany: repo.elementDeleteMany,
    },
    linkRepository: {
      ...actual.linkRepository,
      bulkUpsert: repo.linkBulkUpsert,
      deleteMany: repo.linkDeleteMany,
    },
  };
});

let dossierStore: typeof import('./dossierStore');
let mappers: {
  elementToYMap: typeof import('../services/yjs/elementMapper').elementToYMap;
  yMapToElement: typeof import('../services/yjs/elementMapper').yMapToElement;
  linkToYMap: typeof import('../services/yjs/linkMapper').linkToYMap;
  yMapToLink: typeof import('../services/yjs/linkMapper').yMapToLink;
};

const DOSSIER = {
  id: 'd1',
  name: 'Case',
  description: '',
  settings: { existingTags: [], suggestedProperties: [] },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const COUNT = 2000;

function makeElement(id: string, i: number): Element {
  const now = new Date();
  return {
    id,
    dossierId: DOSSIER.id,
    label: `E${i}`,
    notes: '',
    tags: [],
    properties: [],
    confidence: null,
    source: '',
    date: null,
    dateRange: null,
    position: { x: i * 10, y: 0 },
    isPositionLocked: false,
    geo: null,
    events: [],
    visual: { color: '#ffffff', borderColor: '#e5e7eb', shape: 'rectangle', size: 'medium', icon: null, image: null },
    assetIds: [],
    parentGroupId: null,
    isGroup: false,
    isAnnotation: false,
    childIds: [],
    createdAt: now,
    updatedAt: now,
  } as Element;
}

function makeLink(id: string, fromId: string, toId: string): Link {
  const now = new Date();
  return {
    id,
    dossierId: DOSSIER.id,
    fromId,
    toId,
    sourceHandle: null,
    targetHandle: null,
    label: '',
    notes: '',
    tags: [],
    properties: [],
    directed: false,
    direction: 'none',
    confidence: null,
    source: '',
    date: null,
    dateRange: null,
    visual: { color: '#6b7280', style: 'solid', thickness: 2 },
    curveOffset: { x: 0, y: 0 },
    createdAt: now,
    updatedAt: now,
  } as Link;
}

/** Element ids handed to bulkUpsert across all calls. */
function upsertedElementIds(): string[] {
  return repo.elementBulkUpsert.mock.calls.flatMap(([rows]) => (rows as Element[]).map((r) => r.id));
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

let stopObserving: () => void = () => {};

beforeEach(async () => {
  // jsdom has no requestAnimationFrame unless asked; the observer batches with it.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
  dossierStore ??= await import('./dossierStore');
  const em = await import('../services/yjs/elementMapper');
  const lm = await import('../services/yjs/linkMapper');
  mappers = { elementToYMap: em.elementToYMap, yMapToElement: em.yMapToElement, linkToYMap: lm.linkToYMap, yMapToLink: lm.yMapToLink };

  // A loaded dossier: COUNT elements in a chain of links, state read from the doc.
  ydoc = new Y.Doc();
  const elementsMap = ydoc.getMap('elements');
  const linksMap = ydoc.getMap('links');
  ydoc.transact(() => {
    for (let i = 0; i < COUNT; i++) elementsMap.set(`e${i}`, mappers.elementToYMap(makeElement(`e${i}`, i)));
    for (let i = 1; i < COUNT; i++) linksMap.set(`l${i}`, mappers.linkToYMap(makeLink(`l${i}`, `e${i - 1}`, `e${i}`)));
  });
  const elements: Element[] = [];
  elementsMap.forEach((m) => elements.push(mappers.yMapToElement(m as Y.Map<unknown>)));
  const links: Link[] = [];
  linksMap.forEach((m) => links.push(mappers.yMapToLink(m as Y.Map<unknown>)));

  dossierStore.useDossierStore.setState({
    currentDossier: DOSSIER as never,
    elements,
    links,
    comments: [],
    assets: [],
    isReadOnly: false,
  });
  stopObserving = dossierStore.setupYDocObserver(ydoc, () => dossierStore.useDossierStore.getState()._syncFromYDoc());
  vi.clearAllMocks();
});

afterEach(() => {
  stopObserving();
  vi.unstubAllGlobals();
});

describe('incremental sync on adds and deletes', () => {
  it('a remote add parses and writes one row, and keeps the other element objects', async () => {
    const before = dossierStore.useDossierStore.getState().elements;

    ydoc.transact(() => {
      ydoc.getMap('elements').set('new', mappers.elementToYMap(makeElement('new', COUNT)));
    });
    await settle();

    const after = dossierStore.useDossierStore.getState().elements;
    expect(after).toHaveLength(COUNT + 1);
    expect(upsertedElementIds()).toEqual(['new']);
    // Untouched elements are the very same objects: Canvas caches by identity.
    for (let i = 0; i < COUNT; i++) expect(after[i]).toBe(before[i]);
  });

  it('a remote delete removes the element from state and from Dexie', async () => {
    ydoc.transact(() => {
      ydoc.getMap('elements').delete('e5');
    });
    await settle();

    const ids = dossierStore.useDossierStore.getState().elements.map((e) => e.id);
    expect(ids).not.toContain('e5');
    expect(ids).toHaveLength(COUNT - 1);
    expect(repo.elementDeleteMany).toHaveBeenCalledWith(['e5']);
    expect(repo.elementBulkUpsert).not.toHaveBeenCalled();
  });

  it('a local delete of 500 elements never rewrites the whole dossier', async () => {
    const ids = Array.from({ length: 500 }, (_, i) => `e${i}`);
    await dossierStore.useDossierStore.getState().deleteElements(ids);
    // The local fast path defers the Dexie copy to the 500 ms safety re-sync.
    await new Promise((resolve) => setTimeout(resolve, 650));

    const state = dossierStore.useDossierStore.getState();
    expect(state.elements).toHaveLength(COUNT - 500);
    // Links l1..l500 touch a deleted element (l500 joins e499 and e500).
    expect(state.links).toHaveLength(COUNT - 1 - 500);
    expect(repo.elementBulkUpsert).not.toHaveBeenCalled();
    expect(repo.linkBulkUpsert).not.toHaveBeenCalled();
    const syncDeleted = repo.elementDeleteMany.mock.calls.map(([d]) => (d as string[]).length);
    expect(syncDeleted).toContain(500);
    expect(repo.linkDeleteMany.mock.calls.flatMap(([d]) => d as string[])).toHaveLength(500);
  });

  it('rebuilds once from the Y.Doc when state has drifted from it', async () => {
    // State misses e7 (an event lost before the observer was attached).
    dossierStore.useDossierStore.setState((s) => ({ elements: s.elements.filter((e) => e.id !== 'e7') }));

    ydoc.transact(() => {
      ydoc.getMap('elements').set('new', mappers.elementToYMap(makeElement('new', COUNT)));
    });
    await settle();

    const ids = dossierStore.useDossierStore.getState().elements.map((e) => e.id);
    expect(ids).toHaveLength(COUNT + 1);
    expect(ids).toContain('e7');
    expect(ids).toContain('new');
  });
});
