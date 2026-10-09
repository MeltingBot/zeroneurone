import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { rebuildYdoc, ydocFingerprint, UnsupportedYdocError } from './rebuildYdoc';

/** Round-trips through an update, as a document loaded from IndexedDB is. */
function reload(doc: Y.Doc): Y.Doc {
  const copy = new Y.Doc();
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
  return copy;
}

function buildDossier(): Y.Doc {
  const doc = new Y.Doc();
  const elements = doc.getMap('elements');
  doc.transact(() => {
    for (let i = 0; i < 50; i++) {
      const el = new Y.Map();
      elements.set(`e${i}`, el);
      el.set('label', `Element ${i}`);
      el.set('positionX', i);
      el.set('visual', { color: '#fff', shape: 'rect' });
      const tags = new Y.Array();
      el.set('tags', tags);
      tags.push(['a', 'b']);
      const notes = new Y.Text();
      el.set('notes', notes);
      notes.insert(0, 'Texte ');
      notes.insert(6, 'gras', { bold: true });
    }
    doc.getMap('meta').set('_dexieMigrated', true);
    doc.getMap('reports').set('r1', new Y.Map());
  });
  // A long editing session: moves, then elements deleted and re-created
  for (let round = 0; round < 20; round++) {
    elements.forEach((el) => doc.transact(() => (el as Y.Map<unknown>).set('positionX', Math.random())));
  }
  doc.transact(() => { for (let i = 0; i < 10; i++) elements.delete(`e${i}`); });
  return doc;
}

describe('rebuildYdoc', () => {
  it('keeps the content, formatting included, and drops the history', () => {
    const source = reload(buildDossier());
    const rebuilt = rebuildYdoc(source);

    expect(ydocFingerprint(reload(rebuilt))).toBe(ydocFingerprint(source));
    const notes = (rebuilt.getMap('elements').get('e20') as Y.Map<unknown>).get('notes') as Y.Text;
    expect(notes.toDelta()).toEqual([{ insert: 'Texte ' }, { insert: 'gras', attributes: { bold: true } }]);
    expect(Y.encodeStateAsUpdate(rebuilt).byteLength)
      .toBeLessThan(Y.encodeStateAsUpdate(source).byteLength * 0.7);
  });

  it('matches once a root has been emptied, though the update drops it', () => {
    const source = reload(buildDossier());
    const reports = source.getMap('reports');
    source.transact(() => [...reports.keys()].forEach((k) => reports.delete(k)));
    const stored = reload(rebuildYdoc(source));
    expect(stored.share.has('reports')).toBe(false);
    expect(ydocFingerprint(stored)).toBe(ydocFingerprint(source));
  });

  it('notices a difference in formatting', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const ta = new Y.Text();
    const tb = new Y.Text();
    a.getMap('elements').set('notes', ta);
    b.getMap('elements').set('notes', tb);
    ta.insert(0, 'mot', { bold: true });
    tb.insert(0, 'mot');
    expect(ydocFingerprint(a)).not.toBe(ydocFingerprint(b));
  });

  it('keeps shared plugin data', () => {
    const doc = new Y.Doc();
    doc.getMap('pluginData').set('mark-neurone|ann:h1', { pluginId: 'mark-neurone', key: 'ann:h1', value: '[]', updatedAt: 1 });
    const source = reload(doc);
    expect(ydocFingerprint(reload(rebuildYdoc(source)))).toBe(ydocFingerprint(source));
  });

  it('refuses a document with unknown root types', () => {
    const doc = new Y.Doc();
    doc.getArray('unexpected').push([1]);
    expect(() => rebuildYdoc(reload(doc))).toThrow(UnsupportedYdocError);
  });

  it('refuses a known root holding list content', () => {
    const doc = new Y.Doc();
    doc.getArray('views').push([1]);
    expect(() => rebuildYdoc(reload(doc))).toThrow(UnsupportedYdocError);
  });

  it('refuses XML content', () => {
    const doc = new Y.Doc();
    doc.getMap('reports').set('x', new Y.XmlFragment());
    expect(() => rebuildYdoc(doc)).toThrow(UnsupportedYdocError);
  });
});
