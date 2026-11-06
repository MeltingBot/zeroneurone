// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Y from 'yjs';

/**
 * Elements put back by a paste or an undo are in the app state at once, not
 * on the next sync from the Y.Doc: an action right after (a redo) finds them.
 */

const ydoc = new Y.Doc();

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

let dossierStore: typeof import('./dossierStore');
const state = () => dossierStore.useDossierStore.getState();

beforeEach(async () => {
  dossierStore ??= await import('./dossierStore');
  dossierStore.useDossierStore.setState({
    currentDossier: { id: 'd1', name: 'Case', description: '', settings: { existingTags: [], suggestedProperties: [] }, createdAt: new Date(), updatedAt: new Date() } as never,
    elements: [],
    links: [],
    comments: [],
    assets: [],
    isReadOnly: false,
  });
});

describe('pasteElements', () => {
  it('puts the elements and links in the app state at once', async () => {
    const a = await state().createElement('A', { x: 0, y: 0 });
    const b = await state().createElement('B', { x: 100, y: 0 });
    const link = await state().createLink(a.id, b.id);
    dossierStore.useDossierStore.setState({ elements: [a], links: [] });

    state().pasteElements([b], [link]);

    expect(state().elements.map((el) => el.label)).toEqual(['A', 'B']);
    expect(state().links.map((l) => l.id)).toEqual([link.id]);
  });

  it('replaces an element of the same id rather than doubling it', async () => {
    const a = await state().createElement('A', { x: 0, y: 0 });
    dossierStore.useDossierStore.setState({ elements: [a] });
    state().pasteElements([{ ...a, label: 'A2' }], []);
    expect(state().elements.map((el) => el.label)).toEqual(['A2']);
  });

  it('lets a merge be redone right after it was undone', async () => {
    const a = await state().createElement('A', { x: 0, y: 0 });
    const b = await state().createElement('B', { x: 100, y: 0 });
    dossierStore.useDossierStore.setState({ elements: [a, b] });
    const snap = await state().mergeElements(a.id, b.id);

    // The undo of the merge, then the redo straight away (no sync in between)
    state().pasteElements([snap.sourceElement], []);
    await state().updateElement(snap.targetId, snap.targetBefore);
    await expect(state().mergeElements(a.id, b.id)).resolves.toBeDefined();
    expect(state().elements.map((el) => el.id)).toEqual([a.id]);
  });
});
