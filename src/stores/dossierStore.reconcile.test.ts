// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Dossier, Element, Link } from '../types';

/**
 * The Dexie copy of a dossier is written incrementally from Y.Doc changes, so
 * content present before the observer was attached (a dossier joined through
 * a share link) never reached it. reconcileDexieMirror rewrites it on open
 * when its row counts differ from the store.
 */

vi.mock('../services/syncService', () => ({
  syncService: {
    getYDoc: () => null,
    isConnected: () => false,
    getProvider: () => null,
    broadcastAsset: vi.fn(),
    setAtRestDek: vi.fn(),
    onStateChange: vi.fn(),
    onAwarenessChange: vi.fn(),
    getAwareness: () => null,
  },
}));
vi.mock('../plugins/pluginEventBus', () => ({ emit: vi.fn() }));

const DOSSIER_ID = 'd-reconcile';

function element(id: string): Element {
  const now = new Date();
  return {
    id, dossierId: DOSSIER_ID, label: id, notes: '', tags: [], properties: [], confidence: null, source: '',
    date: null, dateRange: null, position: { x: 0, y: 0 }, isPositionLocked: false, geo: null, events: [],
    visual: { color: '#ffffff', borderColor: '#e5e7eb', shape: 'rectangle', size: 'medium', icon: null, image: null },
    assetIds: [], parentGroupId: null, isGroup: false, isAnnotation: false, childIds: [], createdAt: now, updatedAt: now,
  } as Element;
}

function link(id: string, fromId: string, toId: string): Link {
  const now = new Date();
  return {
    id, dossierId: DOSSIER_ID, fromId, toId, sourceHandle: null, targetHandle: null, label: '', notes: '', tags: [],
    properties: [], directed: false, direction: 'none', confidence: null, source: '', date: null, dateRange: null,
    visual: { color: '#6b7280', style: 'solid', thickness: 2 }, curveOffset: { x: 0, y: 0 }, createdAt: now, updatedAt: now,
  } as Link;
}

let mod: typeof import('./dossierStore');
let db: typeof import('../db/database').db;

beforeEach(async () => {
  mod ??= await import('./dossierStore');
  db ??= (await import('../db/database')).db;
  await db.elements.clear();
  await db.links.clear();
});

const state = (elements: Element[], links: Link[]) => () => ({
  currentDossier: { id: DOSSIER_ID } as Dossier,
  elements,
  links,
});

describe('reconcileDexieMirror', () => {
  it('fills a partial copy and drops rows the dossier no longer has', async () => {
    const elements = Array.from({ length: 50 }, (_, i) => element(`e${i}`));
    const links = Array.from({ length: 20 }, (_, i) => link(`l${i}`, `e${i}`, `e${i + 1}`));
    // Partial copy: 5 elements, plus one that is gone from the dossier
    await db.elements.bulkPut([...elements.slice(0, 5), element('stale')]);

    expect(await mod.reconcileDexieMirror(DOSSIER_ID, state(elements, links))).toBe(true);

    const ids = (await db.elements.where({ dossierId: DOSSIER_ID }).primaryKeys()) as string[];
    expect(ids.sort()).toEqual(elements.map((e) => e.id).sort());
    expect(await db.links.where({ dossierId: DOSSIER_ID }).count()).toBe(20);
  });

  it('leaves a complete copy alone', async () => {
    const elements = Array.from({ length: 10 }, (_, i) => element(`e${i}`));
    await db.elements.bulkPut(elements);
    const put = vi.spyOn(db.elements, 'bulkPut');

    expect(await mod.reconcileDexieMirror(DOSSIER_ID, state(elements, []))).toBe(false);
    expect(put).not.toHaveBeenCalled();
    put.mockRestore();
  });
});
