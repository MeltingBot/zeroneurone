import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';

/**
 * Spike for lot R1-C: can Y.UndoManager replace the hand-rolled undo stack?
 *
 * The stack in historyStore is purely local. In a shared session it replays
 * operations into the shared Y.Doc without knowing which changes were ours, so
 * a local Ctrl+Z can revert an edit a peer made in the meantime.
 *
 * Y.UndoManager solves this with transaction origins. These tests check the
 * three assumptions the decision rests on, against the installed Yjs, rather
 * than against the documentation.
 */

const REMOTE = Symbol('remote-peer');
const PERSISTENCE = Symbol('indexeddb-persistence');

function setup() {
  const doc = new Y.Doc();
  const elements = doc.getMap<Y.Map<unknown>>('elements');
  // Default options: tracks only transactions whose origin is null.
  const undoManager = new Y.UndoManager(elements);
  return { doc, elements, undoManager };
}

function addElement(map: Y.Map<Y.Map<unknown>>, id: string, label: string) {
  const el = new Y.Map<unknown>();
  el.set('id', id);
  el.set('label', label);
  map.set(id, el);
}

describe('Y.UndoManager — assumptions behind lot R1-C', () => {
  it('tracks local edits, which carry no origin in this codebase', () => {
    const { doc, elements, undoManager } = setup();

    // dossierStore calls ydoc.transact(fn) with no origin argument.
    doc.transact(() => addElement(elements, 'e1', 'Alice'));
    expect(elements.has('e1')).toBe(true);

    undoManager.undo();

    expect(elements.has('e1')).toBe(false);
  });

  it('ignores changes carrying a foreign origin, so a peer edit survives undo', () => {
    const { doc, elements, undoManager } = setup();

    doc.transact(() => addElement(elements, 'mine', 'Alice'));
    // A peer's update arrives; y-websocket applies it with the provider as origin.
    doc.transact(() => addElement(elements, 'theirs', 'Bob'), REMOTE);

    undoManager.undo();

    // Only our own element is rolled back. This is the behaviour the current
    // hand-rolled stack cannot provide.
    expect(elements.has('mine')).toBe(false);
    expect(elements.has('theirs')).toBe(true);
  });

  it('does not treat a document reloaded from IndexedDB as undoable history', () => {
    const { doc, elements, undoManager } = setup();

    // encryptedIndexeddbPersistence replays stored updates inside
    // Y.transact(doc, fn, persistence, false) — the third argument is the
    // origin, so the whole replay is attributed to the persistence layer.
    const source = new Y.Doc();
    const sourceElements = source.getMap<Y.Map<unknown>>('elements');
    source.transact(() => addElement(sourceElements, 'stored', 'From disk'));
    const update = Y.encodeStateAsUpdate(source);

    Y.transact(doc, () => Y.applyUpdate(doc, update), PERSISTENCE, false);

    expect(elements.has('stored')).toBe(true);
    expect(undoManager.undoStack).toHaveLength(0);

    undoManager.undo();

    // Without that origin the first Ctrl+Z after opening a dossier would erase
    // everything that had just been loaded.
    expect(elements.has('stored')).toBe(true);
  });

  it('a nested applyUpdate inherits the enclosing transaction origin', () => {
    const { doc, elements, undoManager } = setup();

    const source = new Y.Doc();
    const sourceElements = source.getMap<Y.Map<unknown>>('elements');
    source.transact(() => addElement(sourceElements, 'nested', 'x'));

    // applyUpdate is called without an origin of its own; it must not fall back
    // to null, otherwise the previous test's guarantee would not hold.
    Y.transact(doc, () => Y.applyUpdate(doc, Y.encodeStateAsUpdate(source)), REMOTE, false);

    expect(elements.has('nested')).toBe(true);
    expect(undoManager.undoStack).toHaveLength(0);
  });

  it('coalesces rapid successive edits into one undo step', () => {
    const { doc, elements, undoManager } = setup();

    // captureTimeout defaults to 500ms, so edits in the same tick merge.
    doc.transact(() => addElement(elements, 'a', 'A'));
    doc.transact(() => addElement(elements, 'b', 'B'));

    expect(undoManager.undoStack).toHaveLength(1);

    undoManager.undo();

    // Both disappear together. Import flows would need stopCapturing() between
    // user actions, or an explicit captureTimeout of 0.
    expect(elements.has('a')).toBe(false);
    expect(elements.has('b')).toBe(false);
  });

  it('can scope tracking to chosen roots, leaving the rest untouched', () => {
    const doc = new Y.Doc();
    const elements = doc.getMap<Y.Map<unknown>>('elements');
    const assets = doc.getMap<Y.Map<unknown>>('assets');
    const undoManager = new Y.UndoManager(elements);

    doc.transact(() => {
      addElement(elements, 'e1', 'Alice');
      addElement(assets as Y.Map<Y.Map<unknown>>, 'a1', 'file.pdf');
    });

    undoManager.undo();

    // Asset chunks are streamed between peers; they must not be rolled back by
    // an undo of the element that references them.
    expect(elements.has('e1')).toBe(false);
    expect(assets.has('a1')).toBe(true);
  });
});
