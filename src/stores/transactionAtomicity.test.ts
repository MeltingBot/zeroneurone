// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Y from 'yjs';

/**
 * How many Y.Doc transactions does one user action produce?
 *
 * Y.UndoManager reasons in transactions: one transaction is one undo step.
 * A mutation that writes in two transactions therefore needs two Ctrl+Z, and
 * if the second write is scheduled asynchronously the grouping depends on
 * timing rather than on intent — which cannot be tested or relied upon.
 *
 * This measures the current state so the atomicity work has a definite scope.
 * See docs/undo-redo-decision.md.
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

vi.mock('../plugins/pluginEventBus', () => ({ emit: vi.fn() }));

let dossierStore: typeof import('./dossierStore');

/** Count the transactions a block of work commits to the doc. */
async function countTransactions(work: () => Promise<unknown>): Promise<number> {
  let count = 0;
  const onAfter = () => { count += 1; };
  ydoc.on('afterTransaction', onAfter);
  try {
    await work();
    // Let any `import().then()` continuation settle — that is exactly the
    // pattern that produces a second, detached transaction.
    await new Promise((resolve) => setTimeout(resolve, 50));
  } finally {
    ydoc.off('afterTransaction', onAfter);
  }
  return count;
}

const DOSSIER = {
  id: 'd1',
  name: 'Case',
  description: '',
  settings: { existingTags: [], suggestedProperties: [] },
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(async () => {
  dossierStore ??= await import('./dossierStore');
  dossierStore.useDossierStore.setState({
    currentDossier: DOSSIER as never,
    elements: [],
    links: [],
    comments: [],
    assets: [],
    isReadOnly: false,
  });
});


/** Put elements in a canvas tab so the delete cascade is actually exercised. */
async function inTab(elementIds: string[]) {
  const { useTabStore } = await import('./tabStore');
  const tab = await useTabStore.getState().createTab(DOSSIER.id, 'Onglet');
  await useTabStore.getState().addMembers(tab.id, elementIds);
}

describe('Y.Doc transactions per user action', () => {
  it('creating an element is atomic', async () => {
    const store = dossierStore.useDossierStore.getState();

    const count = await countTransactions(() =>
      store.createElement('Alice', { x: 0, y: 0 })
    );

    expect(count).toBe(1);
  });

  it('creating a link is atomic', async () => {
    const store = dossierStore.useDossierStore.getState();
    const a = await store.createElement('A', { x: 0, y: 0 });
    const b = await store.createElement('B', { x: 100, y: 0 });

    const count = await countTransactions(() =>
      dossierStore.useDossierStore.getState().createLink(a.id, b.id)
    );

    expect(count).toBe(1);
  });

  it('updating an element is atomic', async () => {
    const store = dossierStore.useDossierStore.getState();
    const el = await store.createElement('Alice', { x: 0, y: 0 });

    const count = await countTransactions(() =>
      dossierStore.useDossierStore.getState().updateElement(el.id, { label: 'Bob' })
    );

    expect(count).toBe(1);
  });

  // it.fails: known gap, kept red-on-green so that fixing atomicity makes this
  // test report a failure — the signal to flip it back to `it`.
  it.fails('deleting an element is atomic', async () => {
    const store = dossierStore.useDossierStore.getState();
    const el = await store.createElement('Alice', { x: 0, y: 0 });
    // Without tab membership the cascade is a no-op and the count says nothing.
    await inTab([el.id]);

    const count = await countTransactions(() =>
      dossierStore.useDossierStore.getState().deleteElement(el.id)
    );

    // Measured: 3 transactions. The element leaves the elements map in one,
    // then the tab cascade — scheduled after a dynamic import — writes its own.
    // Three transactions means three undo steps, and their grouping depends on
    // how fast that import resolves rather than on intent.
    expect(count).toBe(1);
  });

  // it.fails: known gap, kept red-on-green so that fixing atomicity makes this
  // test report a failure — the signal to flip it back to `it`.
  it.fails('deleting several elements is atomic', async () => {
    const store = dossierStore.useDossierStore.getState();
    const a = await store.createElement('A', { x: 0, y: 0 });
    const b = await store.createElement('B', { x: 100, y: 0 });
    await inTab([a.id, b.id]);

    const count = await countTransactions(() =>
      dossierStore.useDossierStore.getState().deleteElements([a.id, b.id])
    );

    expect(count).toBe(1);
  });

  it('deleting a link is atomic', async () => {
    const store = dossierStore.useDossierStore.getState();
    const a = await store.createElement('A', { x: 0, y: 0 });
    const b = await store.createElement('B', { x: 100, y: 0 });
    const link = await dossierStore.useDossierStore.getState().createLink(a.id, b.id);

    const count = await countTransactions(() =>
      dossierStore.useDossierStore.getState().deleteLink(link.id)
    );

    expect(count).toBe(1);
  });

  // it.fails: known gap, kept red-on-green so that fixing atomicity makes this
  // test report a failure — the signal to flip it back to `it`.
  it.fails('merging two elements is atomic', async () => {
    const store = dossierStore.useDossierStore.getState();
    const a = await store.createElement('A', { x: 0, y: 0 });
    const b = await store.createElement('B', { x: 100, y: 0 });
    dossierStore.useDossierStore.setState({ elements: [a, b] });
    await inTab([a.id, b.id]);

    const count = await countTransactions(() =>
      dossierStore.useDossierStore.getState().mergeElements(a.id, b.id)
    );

    expect(count).toBe(1);
  });

  it('moving elements is atomic', async () => {
    const store = dossierStore.useDossierStore.getState();
    const a = await store.createElement('A', { x: 0, y: 0 });

    const count = await countTransactions(() =>
      dossierStore.useDossierStore.getState().updateElementPositions([
        { id: a.id, position: { x: 50, y: 50 } },
      ])
    );

    expect(count).toBe(1);
  });
});
