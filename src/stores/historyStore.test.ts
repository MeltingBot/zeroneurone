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
  updateElements: vi.fn().mockResolvedValue(undefined),
  updateDossier: vi.fn().mockResolvedValue(undefined),
  updateLinks: vi.fn().mockResolvedValue(undefined),
  updateElementPositions: vi.fn().mockResolvedValue(undefined),
  removeAsset: vi.fn().mockResolvedValue(undefined),
  addAsset: vi.fn().mockResolvedValue(undefined),
  mergeElements: vi.fn().mockResolvedValue(undefined),
  elements: [] as Element[],
};

const tabStore = {
  addMembers: vi.fn().mockResolvedValue(undefined),
  getTabsForElement: vi.fn().mockReturnValue([]),
  restoreTab: vi.fn().mockResolvedValue(undefined),
  deleteTab: vi.fn().mockResolvedValue(undefined),
  removeMembers: vi.fn().mockResolvedValue(undefined),
  tabs: [] as Array<{ id: string; name: string; memberElementIds: string[]; excludedElementIds: string[] }>,
};

const viewStore = {
  restoreView: vi.fn(),
  setFilters: vi.fn(),
  hideElements: vi.fn(),
  clearFilters: vi.fn(),
  showAllElements: vi.fn(),
};

const reportStore = { restoreSection: vi.fn().mockResolvedValue(undefined) };
const suggestionsStore = { refresh: vi.fn() };

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
vi.mock('./suggestionsStore', () => ({
  useSuggestionsStore: { getState: () => suggestionsStore },
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

  it('undoes several merges in one action, last first, and replays them in order', async () => {
    const snap = (sourceId: string) => ({
      targetId: 't', sourceId, sourceElement: element(sourceId), targetBefore: { notes: sourceId }, linksBefore: [], deletedLinkIds: [],
    });
    push({ type: 'merge-elements', undo: { snapshot: [snap('a'), snap('b')] }, redo: { snapshot: [snap('a'), snap('b')] } });

    await history().undo();
    expect(dossierStore.updateElement.mock.calls.map((c: unknown[]) => c[1])).toEqual([{ notes: 'b' }, { notes: 'a' }]);

    await history().redo();
    expect(dossierStore.mergeElements.mock.calls.map((c: unknown[]) => c[1])).toEqual(['a', 'b']);
  });

  it('puts a merged element back in its tabs, and takes the kept one out of those it joined', async () => {
    tabStore.addMembers.mockClear();
    push({
      type: 'merge-elements',
      undo: { snapshot: { targetId: 't', sourceId: 'a', sourceElement: element('a'), targetBefore: {}, linksBefore: [], deletedLinkIds: [], sourceTabIds: ['telecom'], targetAddedTabIds: ['telecom'] } },
      redo: { snapshot: { targetId: 't', sourceId: 'a' } },
    });
    await history().undo();
    expect(tabStore.addMembers).toHaveBeenCalledWith('telecom', ['a']);
    expect(tabStore.removeMembers).toHaveBeenCalledWith('telecom', ['t']);
  });

  it('removes the tabs an import created on undo, and brings them back on redo', async () => {
    tabStore.tabs = [
      { id: 't9', name: 'Énergie', memberElementIds: ['e1'], excludedElementIds: [] },
      { id: 't1', name: 'Existant', memberElementIds: ['e0'], excludedElementIds: [] },
    ];
    push({ type: 'create-elements', undo: { createdTabIds: ['t9'] }, redo: { elementIds: ['e1'], elements: [element('e1')] } });

    await history().undo();
    expect(dossierStore.deleteElements).toHaveBeenCalledWith(['e1']);
    expect(tabStore.deleteTab).toHaveBeenCalledTimes(1);
    expect(tabStore.deleteTab).toHaveBeenCalledWith('t9');

    await history().redo();
    expect(tabStore.restoreTab).toHaveBeenCalledWith({ id: 't9', name: 'Énergie', memberElementIds: [], excludedElementIds: [] });
    tabStore.tabs = [];
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

describe('link creation', () => {
  it('removes the created link on undo and puts it back on redo', async () => {
    const created = [link('l1')];
    push({ type: 'create-link', undo: {}, redo: { linkIds: ['l1'], links: created } });

    await history().undo();
    expect(dossierStore.deleteLinks).toHaveBeenCalledWith(['l1']);

    await history().redo();
    expect(dossierStore.pasteElements).toHaveBeenCalledWith([], created);
  });
});

describe('element merge', () => {
  // A merge deletes the source element, retargets its links, drops the ones
  // that became duplicates, and folds their metadata into the survivors.
  const snapshot = {
    targetId: 'target',
    sourceId: 'source',
    sourceElement: element('source'),
    targetBefore: { notes: 'target notes before', tags: ['a'] },
    linksBefore: [
      { id: 'retargeted', fromId: 'source', toId: 'other', label: 'kept', notes: '', tags: [], properties: [] },
      { id: 'dropped', fromId: 'source', toId: 'target', label: 'gone', notes: '', tags: [], properties: [] },
    ],
    deletedLinkIds: ['dropped'],
  };

  it('brings back the source element and the links the merge dropped', async () => {
    push({ type: 'merge-elements', undo: { snapshot }, redo: { snapshot } });

    await history().undo();

    expect(dossierStore.pasteElements).toHaveBeenCalledWith(
      [snapshot.sourceElement],
      [snapshot.linksBefore[1]]
    );
  });

  it('rewinds the target element to its pre-merge values', async () => {
    push({ type: 'merge-elements', undo: { snapshot }, redo: { snapshot } });

    await history().undo();

    expect(dossierStore.updateElement).toHaveBeenCalledWith('target', snapshot.targetBefore);
  });

  it('restores the endpoints of retargeted links but not of dropped ones', async () => {
    push({ type: 'merge-elements', undo: { snapshot }, redo: { snapshot } });

    await history().undo();

    const updated = dossierStore.updateLink.mock.calls.map((c) => c[0]);
    expect(updated).toEqual(['retargeted']);
    expect(dossierStore.updateLink).toHaveBeenCalledWith(
      'retargeted',
      expect.objectContaining({ fromId: 'source', toId: 'other', label: 'kept' })
    );
  });

  it('replays the merge on redo', async () => {
    push({ type: 'merge-elements', undo: { snapshot }, redo: { snapshot } });
    await history().undo();

    await history().redo();

    expect(dossierStore.mergeElements).toHaveBeenCalledWith('target', 'source');
  });
});

describe('unhandled action types', () => {
  it('warns instead of skipping silently', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    push({ type: 'not-a-real-type', undo: {}, redo: {} });

    await history().undo();

    // The entry still leaves `past` — leaving it would make Ctrl+Z a no-op
    // that never advances — but it no longer disappears without a trace.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not-a-real-type'));
    expect(history().past).toHaveLength(0);
    warn.mockRestore();
  });

  it('every declared action type has both an undo and a redo handler', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const declared = [
      'create-element', 'delete-element', 'update-element', 'move-element',
      'create-link', 'delete-link', 'update-link',
      'create-elements', 'delete-elements', 'move-elements',
      'extract-to-element', 'dissolve-group', 'remove-from-group',
      'create-group', 'delete-tab', 'delete-view', 'delete-section',
      'clear-filters', 'add-asset', 'merge-elements',
    ];

    for (const type of declared) {
      useHistoryStore.setState({ past: [], future: [] });
      push({ type, undo: {}, redo: {} });
      await history().undo();
      await history().redo();
    }

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('update-bulk', () => {
  const action = {
    type: 'update-bulk',
    undo: {
      bulkElements: [{ id: 'e1', changes: { visual: { color: '#111111' } } }],
      bulkLinks: [
        { id: 'l1', changes: { label: 'avant' } },
        { id: 'l2', changes: { label: '' } },
      ],
    },
    redo: {
      bulkCalls: [
        { kind: 'elements', ids: ['e1'], changes: { visual: { color: '#ff0000' } } },
        { kind: 'links', ids: ['l1', 'l2'], changes: { label: 'détient' } },
      ],
    },
  };

  it('undo restores every item to its own previous values', async () => {
    push(action);
    await history().undo();

    expect(dossierStore.updateElement).toHaveBeenCalledWith('e1', { visual: { color: '#111111' } });
    expect(dossierStore.updateLink).toHaveBeenCalledWith('l1', { label: 'avant' });
    expect(dossierStore.updateLink).toHaveBeenCalledWith('l2', { label: '' });
  });

  it('redo replays the bulk calls in order', async () => {
    push(action);
    await history().undo();
    await history().redo();

    expect(dossierStore.updateElements).toHaveBeenCalledWith(['e1'], { visual: { color: '#ff0000' } });
    expect(dossierStore.updateLinks).toHaveBeenCalledWith(['l1', 'l2'], { label: 'détient' });
  });

  it('applyUndo runs an action popped by an external handler, stacks untouched', async () => {
    push(action);
    const popped = history().popUndo()!;
    await history().applyUndo(popped);

    expect(dossierStore.updateLink).toHaveBeenCalledWith('l1', { label: 'avant' });
    expect(history().past).toHaveLength(0);
    expect(history().future).toHaveLength(1);
  });
});

describe('dismiss-suggestions', () => {
  it('undo restores the previous dismissals, redo the new ones', async () => {
    push({
      type: 'dismiss-suggestions',
      undo: { snapshot: { dossierId: 'd1', dismissedSuggestions: ['x'] } },
      redo: { snapshot: { dossierId: 'd1', dismissedSuggestions: ['x', 'y'] } },
    });
    await history().undo();
    expect(dossierStore.updateDossier).toHaveBeenLastCalledWith('d1', { dismissedSuggestions: ['x'] });
    expect(suggestionsStore.refresh).toHaveBeenCalledTimes(1);
    await history().redo();
    expect(dossierStore.updateDossier).toHaveBeenLastCalledWith('d1', { dismissedSuggestions: ['x', 'y'] });
  });
});

