// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as Y from 'yjs';
import type { PluginEvent } from './pluginEventBus';

/**
 * Each traced user action emits exactly one event of the expected type,
 * received by an onAny subscriber (what an audit-trail plugin uses).
 */

const ydoc = new Y.Doc();

vi.mock('../services/syncService', () => ({
  syncService: {
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

const DOSSIER = {
  id: 'd1',
  name: 'Case',
  description: '',
  settings: { existingTags: [], suggestedProperties: [] },
  createdAt: new Date(),
  updatedAt: new Date(),
};

let bus: typeof import('./pluginEventBus');
let dossierStore: typeof import('../stores/dossierStore');
let events: PluginEvent[] = [];
let off: () => void = () => {};

const types = () => events.map((e) => e.type);

beforeEach(async () => {
  bus ??= await import('./pluginEventBus');
  dossierStore ??= await import('../stores/dossierStore');
  dossierStore.useDossierStore.setState({
    currentDossier: DOSSIER as never,
    elements: [],
    links: [],
    comments: [],
    assets: [],
    isReadOnly: false,
  });
  events = [];
  off = bus.onAnyPluginEvent((e) => events.push(e));
});

afterEach(() => {
  off();
  vi.useRealTimers();
});

/** Create elements and make them visible to the store, as the Y.Doc observer would */
async function seed(...labels: string[]) {
  const store = dossierStore.useDossierStore.getState();
  const created = [];
  for (const [i, label] of labels.entries()) created.push(await store.createElement(label, { x: i * 100, y: 0 }));
  dossierStore.useDossierStore.setState({ elements: created });
  events = [];
  return created;
}

describe('core actions emit one event each', () => {
  it('bulk update: one element:updated per element, with the fields', async () => {
    const [a, b] = await seed('A', 'B');
    await dossierStore.useDossierStore.getState().updateElements([a.id, b.id], { confidence: 50 } as never);
    expect(types()).toEqual(['element:updated', 'element:updated']);
    expect(events[0].meta).toMatchObject({ fields: ['confidence'], bulk: true });
  });

  it('paste: element:created marked as a paste', async () => {
    const [a] = await seed('A');
    dossierStore.useDossierStore.getState().pasteElements([{ ...a, id: 'pasted' } as never], []);
    expect(types()).toEqual(['element:created']);
    expect(events[0]).toMatchObject({ entityId: 'pasted', meta: { via: 'paste' }, origin: 'local' });
  });

  it('merge: element:merged on the kept element', async () => {
    const [a, b] = await seed('A', 'B');
    await dossierStore.useDossierStore.getState().mergeElements(a.id, b.id);
    expect(types()).toContain('element:merged');
    expect(events.find((e) => e.type === 'element:merged')).toMatchObject({ entityId: a.id, meta: { mergedIds: [b.id] } });
  });

  it('comments: created, resolved, deleted', async () => {
    const [a] = await seed('A');
    const comment = await dossierStore.useDossierStore.getState().createComment(a.id, 'element', 'note');
    dossierStore.useDossierStore.setState({ comments: [comment] });
    await dossierStore.useDossierStore.getState().resolveComment(comment.id, 'X');
    await dossierStore.useDossierStore.getState().deleteComment(comment.id);
    expect(types()).toEqual(['comment:created', 'comment:resolved', 'comment:deleted']);
    expect(events.every((e) => e.meta?.targetId === a.id)).toBe(true);
  });

  it('dossier update carries the old and new retention', async () => {
    await dossierStore.useDossierStore.getState().updateDossier('d1' as never, { retentionDays: 30 });
    const updated = events.find((e) => e.type === 'dossier:updated')!;
    expect(updated.meta).toMatchObject({ fields: ['retentionDays'], changes: { retentionDays: { from: null, to: 30 } } });
  });

  it('marks what undo/redo replays', async () => {
    await bus.asUndo(async () => bus.emit('element:deleted', 'd1', 'x'));
    bus.emit('element:deleted', 'd1', 'y');
    expect(events.map((e) => e.origin)).toEqual(['undo', 'local']);
  });

  it('export: attached to the open dossier', () => {
    bus.emitExport('png', { scale: 2 });
    expect(events).toMatchObject([{ type: 'dossier:exported', dossierId: 'd1', meta: { format: 'png', scale: 2 } }]);
  });

  it('query: one event per text once typing pauses, none for automatic re-runs', async () => {
    await seed('Alice');
    const { useQueryStore } = await import('../stores/queryStore');
    vi.useFakeTimers();
    useQueryStore.getState().setText('label = "A"');
    useQueryStore.getState().setText('label = "Al"');
    vi.advanceTimersByTime(2500);
    useQueryStore.getState().execute(); // same text, as a data change re-run does
    vi.advanceTimersByTime(2500);
    const queries = events.filter((e) => e.type === 'query:executed');
    expect(queries).toHaveLength(1);
    expect(queries[0].meta).toMatchObject({ text: 'label = "Al"' });
  });
});

describe('report edits', () => {
  it('several saves of one section make one report:updated, sent when the report closes', async () => {
    const { useReportStore, flushReportTraces } = await import('../stores/reportStore');
    useReportStore.setState({
      currentReport: { id: 'r1', dossierId: 'd1', title: 'R', sections: [{ id: 's1', title: '', order: 0, content: '' }] } as never,
    });
    for (const content of ['a', 'ab', 'abc']) await useReportStore.getState().updateSection('s1' as never, { content });
    expect(types()).toEqual([]);
    flushReportTraces();
    expect(events).toMatchObject([{ type: 'report:updated', meta: { action: 'section-updated', sectionId: 's1' } }]);
  });
});

describe('plugin events', () => {
  it('a plugin emits under its own prefix only', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    bus.emitFromPlugin('oneneurone', 'oneneurone:request', 'd1', { model: 'm' });
    bus.emitFromPlugin('oneneurone', 'element:deleted', 'd1');
    bus.emitFromPlugin('oneneurone', 'other:thing', 'd1');
    bus.emitFromPlugin('oneneurone', 'oneneurone:', 'd1');
    expect(types()).toEqual(['oneneurone:request']);
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it('on() receives one type, onAny everything', () => {
    const one: string[] = [];
    const stop = bus.onPluginEvent('oneneurone:request', (e) => one.push(e.type));
    bus.emitFromPlugin('oneneurone', 'oneneurone:request', 'd1');
    bus.emit('element:created', 'd1', 'x');
    stop();
    expect(one).toEqual(['oneneurone:request']);
    expect(types()).toEqual(['oneneurone:request', 'element:created']);
  });
});
