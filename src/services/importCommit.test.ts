// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Y from 'yjs';
import { db } from '../db/database';
import { getYMaps } from '../types/yjs';
import { elementToYMap, yMapToElement } from './yjs';
import { commentToYMap } from './yjs/commentMapper';
import type { Comment, Element, ElementEvent, Link } from '../types';

const open = vi.hoisted(() => ({ ydoc: null as Y.Doc | null, dossierId: null as string | null }));
vi.mock('./syncService', () => ({
  syncService: {
    getYDoc: () => open.ydoc,
    getDossierId: () => open.dossierId,
  },
}));

import { snapshotBeforeImport, commitImportToYDoc } from './importCommit';

const DOSSIER = 'dossier-1';

function element(id: string, label: string, events: ElementEvent[] = []): Element {
  return {
    id, dossierId: DOSSIER, label, notes: '', tags: [], properties: [], confidence: null,
    source: '', date: null, dateRange: null, position: { x: 0, y: 0 }, isPositionLocked: false,
    geo: null, visual: { color: '#ffffff', borderColor: '#000000', shape: 'rectangle', size: 'medium', icon: null, image: null },
    assetIds: [], parentGroupId: null, isGroup: false, isAnnotation: false, childIds: [], events,
    createdAt: new Date(), updatedAt: new Date(Date.now() - 60_000),
  } as Element;
}

function link(id: string, fromId: string, toId: string): Link {
  return {
    id, dossierId: DOSSIER, fromId, toId, sourceHandle: null, targetHandle: null, label: '', notes: '',
    tags: [], properties: [], directed: false, direction: 'none', confidence: null, source: '',
    date: null, dateRange: null, visual: { color: '#000000', style: 'solid', thickness: 1 },
    curveOffset: { x: 0, y: 0 }, createdAt: new Date(), updatedAt: new Date(),
  } as unknown as Link;
}

function comment(id: string, targetId: string, content: string): Comment {
  return {
    id, dossierId: DOSSIER, targetId, targetType: 'element', authorName: 'A', authorColor: '#000000',
    content, resolved: false, resolvedBy: null, resolvedAt: null, createdAt: new Date(), updatedAt: new Date(),
  } as Comment;
}

function event(id: string, label: string): ElementEvent {
  return { id, date: new Date('2024-01-01'), label } as ElementEvent;
}

describe('commitImportToYDoc', () => {
  let ydoc: Y.Doc;

  beforeEach(async () => {
    await Promise.all([db.elements.clear(), db.links.clear(), db.comments.clear(), db.canvasTabs.clear()]);
    ydoc = new Y.Doc();
    open.ydoc = ydoc;
    open.dossierId = DOSSIER;
  });

  it('adds what the import created and keeps what lives only in the Y.Doc', async () => {
    const before = element('a', 'Avant');
    await db.elements.add(before);
    // Deleted from the Y.Doc but still in Dexie: must not come back
    await db.elements.add(element('stale', 'Ancien'));
    const maps = getYMaps(ydoc);
    maps.elements.set('a', elementToYMap(before));
    maps.comments.set('c0', commentToYMap(comment('c0', 'a', 'Commentaire témoin')));

    const snapshot = await snapshotBeforeImport(DOSSIER);
    await db.elements.add(element('b', 'Importé'));
    await db.links.add(link('l1', 'a', 'b'));
    await db.comments.add(comment('c1', 'b', 'Commentaire importé'));
    await commitImportToYDoc(snapshot);

    expect([...maps.elements.keys()].sort()).toEqual(['a', 'b']);
    expect([...maps.links.keys()]).toEqual(['l1']);
    expect([...maps.comments.keys()].sort()).toEqual(['c0', 'c1']);
  });

  it('appends imported events to an existing element without overwriting its other fields', async () => {
    const before = element('a', 'Libellé local', [event('e0', 'Ancien')]);
    await db.elements.add(before);
    const maps = getYMaps(ydoc);
    // A peer renamed the element and added an event: Dexie does not know it
    maps.elements.set('a', elementToYMap({ ...before, label: 'Libellé du pair', events: [event('e0', 'Ancien'), event('p1', 'Du pair')] }));

    const snapshot = await snapshotBeforeImport(DOSSIER);
    // What the CSV import does: append events onto the Dexie copy
    await db.elements.update('a', { events: [event('e0', 'Ancien'), event('e1', 'Importé')], updatedAt: new Date() });
    await commitImportToYDoc(snapshot);

    const merged = yMapToElement(maps.elements.get('a') as Y.Map<unknown>);
    expect(merged.label).toBe('Libellé du pair');
    expect(merged.events.map((e) => e.id)).toEqual(['e0', 'p1', 'e1']);
  });

  it('does nothing when the dossier Y.Doc is not open', async () => {
    open.dossierId = 'autre';
    const snapshot = await snapshotBeforeImport(DOSSIER);
    await db.elements.add(element('b', 'Importé'));
    await commitImportToYDoc(snapshot);
    expect(getYMaps(ydoc).elements.size).toBe(0);
  });
});
