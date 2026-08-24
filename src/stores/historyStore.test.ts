import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useHistoryStore } from './historyStore';
import type { Element, Link } from '../types';

// historyStore reaches the other stores through `await import()`, so these
// mocks are what its undo/redo dispatch actually talks to.
const dossierStore = {
  pasteElements: vi.fn(),
  deleteElements: vi.fn().mockResolvedValue(undefined),
  deleteLinks: vi.fn().mockResolvedValue(undefined),
  updateElement: vi.fn().mockResolvedValue(undefined),
  updateLink: vi.fn().mockResolvedValue(undefined),
  updateElementPositions: vi.fn().mockResolvedValue(undefined),
  removeAsset: vi.fn().mockResolvedValue(undefined),
  addAsset: vi.fn().mockResolvedValue(undefined),
  elements: [] as Element[],
};

const tabStore = {
  addMembers: vi.fn().mockResolvedValue(undefined),
  getTabsForElement: vi.fn().mockReturnValue([]),
  restoreTab: vi.fn().mockResolvedValue(undefined),
};

const viewStore = {
  restoreView: vi.fn(),
  setFilters: vi.fn(),
  hideElements: vi.fn(),
};

const reportStore = { restoreSection: vi.fn().mockResolvedValue(undefined) };

vi.mock('./dossierStore', () => ({
  useDossierStore: { getState: () => dossierStore },
}));
vi.mock('./tabStore', () => ({
  useTabStore: { getState: () => tabStore },
}));
vi.mock('./viewStore', () => ({
  useViewStore: { getState: () => viewStore },
}));
vi.mock('./reportStore', () => ({
  useReportStore: { getState: () => reportStore },
}));

function element(id: string): Element {
  return { id, label: id, position: { x: 0, y: 0 }, childIds: [] } as unknown as Element;
}
function link(id: string): Link {
  return { id, fromId: 'a', toId: 'b' } as unknown as Link;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function push(action: any) {
  useHistoryStore.getState().pushAction(action);
}

const history = () => useHistoryStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  dossierStore.elements = [];
  useHistoryStore.setState({ past: [], future: [], maxHistory: 50 });
});

describe('history stack mechanics', () => {
  it('starts empty and reports nothing to undo or redo', () => {
    expect(history().canUndo()).toBe(false);
    expect(history().canRedo()).toBe(false);
  });

  it('records an action and makes it undoable', () => {
    push({ type: 'move-element', undo: {}, redo: {} });

    expect(history().past).toHaveLength(1);
    expect(history().canUndo()).toBe(true);
  });

  it('drops the redo branch as soon as a new action is recorded', async () => {
    push({ type: 'move-element', undo: { positions: [] }, redo: { positions: [] } });
    await history().undo();
    expect(history().canRedo()).toBe(true);

    push({ type: 'move-element', undo: {}, redo: {} });

    expect(history().canRedo()).toBe(false);
    expect(history().future).toHaveLength(0);
  });

  it('keeps only the most recent maxHistory actions', () => {
    for (let i = 0; i < 60; i++) {
      push({ type: 'move-element', undo: { elementId: `e${i}` }, redo: {} });
    }

    const { past } = history();
    expect(past).toHaveLength(50);
    // The oldest ten were dropped, the newest is on top.
    expect(past[0].undo.elementId).toBe('e10');
    expect(past[past.length - 1].undo.elementId).toBe('e59');
  });

  it('clear() empties both directions', async () => {
    push({ type: 'move-element', undo: { positions: [] }, redo: { positions: [] } });
    await history().undo();
    push({ type: 'move-element', undo: {}, redo: {} });

    history().clear();

    expect(history().past).toEqual([]);
    expect(history().future).toEqual([]);
    expect(history().canUndo()).toBe(false);
    expect(history().canRedo()).toBe(false);
  });

  it('does nothing when there is nothing to undo or redo', async () => {
    await history().undo();
    await history().redo();

    expect(dossierStore.pasteElements).not.toHaveBeenCalled();
    expect(dossierStore.deleteElements).not.toHaveBeenCalled();
  });

  it('popUndo / popRedo move an action across without executing it', () => {
    push({ type: 'delete-element', undo: { elements: [element('e1')] }, redo: {} });

    const popped = history().popUndo();

    expect(popped?.type).toBe('delete-element');
    expect(dossierStore.pasteElements).not.toHaveBeenCalled();
    expect(history().future).toHaveLength(1);

    const back = history().popRedo();
    expect(back?.type).toBe('delete-element');
    expect(history().past).toHaveLength(1);
    expect(history().future).toHaveLength(0);
  });
});

describe('undo / redo dispatch', () => {
  it('restores deleted elements and links, then re-deletes them on redo', async () => {
    const els = [element('e1')];
    const lks = [link('l1')];
    push({
      type: 'delete-element',
      undo: { elements: els, links: lks },
      redo: { elementIds: ['e1'], linkIds: ['l1'] },
    });

    await history().undo();
    expect(dossierStore.pasteElements).toHaveBeenCalledWith(els, lks);

    await history().redo();
    expect(dossierStore.deleteElements).toHaveBeenCalledWith(['e1']);
    expect(dossierStore.deleteLinks).toHaveBeenCalledWith(['l1']);
  });

  it('puts deleted elements back into the tabs they belonged to', async () => {
    push({
      type: 'delete-elements',
      undo: { elements: [element('e1')], tabMembership: { tab1: ['e1'], tab2: ['e1'] } },
      redo: {},
    });

    await history().undo();

    expect(tabStore.addMembers).toHaveBeenCalledWith('tab1', ['e1']);
    expect(tabStore.addMembers).toHaveBeenCalledWith('tab2', ['e1']);
  });

  it('removes created elements on undo and recreates them on redo', async () => {
    const els = [element('e1')];
    push({ type: 'create-element', undo: {}, redo: { elementIds: ['e1'], elements: els } });

    await history().undo();
    expect(dossierStore.deleteElements).toHaveBeenCalledWith(['e1']);

    await history().redo();
    expect(dossierStore.pasteElements).toHaveBeenCalledWith(els, []);
  });

  it('applies the previous values on undo and the new ones on redo', async () => {
    push({
      type: 'update-element',
      undo: { elementId: 'e1', changes: { label: 'before' } },
      redo: { elementId: 'e1', changes: { label: 'after' } },
    });

    await history().undo();
    expect(dossierStore.updateElement).toHaveBeenCalledWith('e1', { label: 'before' });

    await history().redo();
    expect(dossierStore.updateElement).toHaveBeenLastCalledWith('e1', { label: 'after' });
  });

  it('restores and re-applies link changes', async () => {
    push({
      type: 'update-link',
      undo: { linkId: 'l1', linkChanges: { label: 'before' } },
      redo: { linkId: 'l1', linkChanges: { label: 'after' } },
    });

    await history().undo();
    expect(dossierStore.updateLink).toHaveBeenCalledWith('l1', { label: 'before' });

    await history().redo();
    expect(dossierStore.updateLink).toHaveBeenLastCalledWith('l1', { label: 'after' });
  });

  it('restores previous positions on undo', async () => {
    const before = [{ id: 'e1', position: { x: 0, y: 0 } }];
    const after = [{ id: 'e1', position: { x: 50, y: 50 } }];
    push({ type: 'move-elements', undo: { positions: before }, redo: { positions: after } });

    await history().undo();
    expect(dossierStore.updateElementPositions).toHaveBeenCalledWith(before);

    await history().redo();
    expect(dossierStore.updateElementPositions).toHaveBeenLastCalledWith(after);
  });

  it('restores a deleted view from its snapshot', async () => {
    const snapshot = { id: 'v1', name: 'My view' };
    push({ type: 'delete-view', undo: { snapshot }, redo: {} });

    await history().undo();

    expect(viewStore.restoreView).toHaveBeenCalledWith(snapshot);
  });

  it('detaches the asset again when undoing an attachment', async () => {
    push({
      type: 'add-asset',
      undo: { snapshot: { elementId: 'e1', assetId: 'a1' } },
      redo: {},
    });

    await history().undo();

    expect(dossierStore.removeAsset).toHaveBeenCalledWith('e1', 'a1');
  });

  it('undoes actions in reverse order', async () => {
    push({ type: 'update-element', undo: { elementId: 'e1', changes: { label: 'first' } }, redo: {} });
    push({ type: 'update-element', undo: { elementId: 'e2', changes: { label: 'second' } }, redo: {} });

    await history().undo();
    await history().undo();

    expect(dossierStore.updateElement.mock.calls.map((c) => c[0])).toEqual(['e2', 'e1']);
  });
});

// These pin down gaps the audit found. They are expected to change with lot R1,
// which moves history recording into the stores and adds the missing cases.
describe('known gaps (lot R1)', () => {
  it("'create-link' is a declared action type with no undo handler", async () => {
    push({ type: 'create-link', undo: {}, redo: { linkIds: ['l1'] } });

    await history().undo();

    // Nothing happens: the link stays on the canvas even though the user
    // pressed Ctrl+Z. Canvas.tsx never pushes this action today either.
    expect(dossierStore.deleteLinks).not.toHaveBeenCalled();
    expect(dossierStore.pasteElements).not.toHaveBeenCalled();
  });

  it('an unhandled action is still consumed from the stack', async () => {
    push({ type: 'create-link', undo: {}, redo: {} });

    await history().undo();

    // The entry is gone from `past` without anything having been undone, so a
    // second Ctrl+Z skips past it to an older, unrelated action.
    expect(history().past).toHaveLength(0);
    expect(history().future).toHaveLength(1);
  });
});
