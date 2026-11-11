// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Y from 'yjs';

/**
 * Merging two elements keeps every link: only a link the merged element
 * brings that says exactly the same as one of the kept element is folded.
 */

const ydoc = new Y.Doc();

vi.mock('../services/syncService', () => ({
  syncService: {
    getYDoc: () => ydoc,
    // The store only writes into the shown dossier's Y.Doc (getYDocFor)
    getYDocFor: (id: string | null | undefined) => (id ? ydoc : null),
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

async function four() {
  const [a, b, c, d] = [
    await state().createElement('A', { x: 0, y: 0 }),
    await state().createElement('B', { x: 100, y: 0 }),
    await state().createElement('C', { x: 200, y: 0 }),
    await state().createElement('D', { x: 300, y: 0 }),
  ];
  dossierStore.useDossierStore.setState({ elements: [a, b, c, d], links: [] });
  const name = (id: string) => [a, b, c, d].find((e) => e.id === id)?.label;
  const linksText = () => state().links.map((l) => `${name(l.fromId)}->${name(l.toId)} ${l.label}`).sort();
  return { a, b, c, d, linksText };
}

describe('merging elements and their links', () => {
  it('keeps links in parallel, those of the kept element and those brought', async () => {
    const { a, b, c, d, linksText } = await four();
    const links = [
      await state().createLink(a.id, c.id, { label: '100 EUR' }),
      await state().createLink(a.id, c.id, { label: '50 EUR' }),
      await state().createLink(b.id, c.id, { label: '20 EUR' }),
      await state().createLink(b.id, d.id, { label: '10 EUR' }),
    ];
    dossierStore.useDossierStore.setState({ links });

    await state().mergeElements(a.id, b.id);

    expect(linksText()).toEqual(['A->C 100 EUR', 'A->C 20 EUR', 'A->C 50 EUR', 'A->D 10 EUR']);
  });

  it('folds a link brought that says exactly the same, its tags kept', async () => {
    const { a, b, c, linksText } = await four();
    const links = [
      await state().createLink(a.id, c.id, { label: 'connaît', tags: ['affaire 1'] }),
      await state().createLink(b.id, c.id, { label: 'connaît', tags: ['affaire 2'] }),
    ];
    dossierStore.useDossierStore.setState({ links });

    await state().mergeElements(a.id, b.id);

    expect(linksText()).toEqual(['A->C connaît']);
    expect(state().links[0].tags).toEqual(['affaire 1', 'affaire 2']);
  });

  it('folds one for one: of two identical links brought, one stays', async () => {
    const { a, b, c, linksText } = await four();
    const links = [
      await state().createLink(a.id, c.id, { label: 'appel' }),
      await state().createLink(b.id, c.id, { label: 'appel' }),
      await state().createLink(b.id, c.id, { label: 'appel' }),
    ];
    dossierStore.useDossierStore.setState({ links });

    await state().mergeElements(a.id, b.id);

    expect(linksText()).toEqual(['A->C appel', 'A->C appel']);
  });
});
