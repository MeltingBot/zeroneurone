import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { findForeignEntries } from './dossierIntegrity';

function put(doc: Y.Doc, kind: string, id: string, fields: Record<string, unknown>) {
  const map = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(fields)) map.set(k, v);
  doc.getMap(kind).set(id, map);
}

describe('findForeignEntries', () => {
  it('groups entries carrying another dossier id, by that dossier', () => {
    const doc = new Y.Doc();
    put(doc, 'elements', 'e1', { dossierId: 'B', label: 'own' });
    put(doc, 'elements', 'e2', { dossierId: 'A', label: 'Intrus 1' });
    put(doc, 'elements', 'e3', { dossierId: 'A', label: 'Intrus 2' });
    put(doc, 'links', 'l1', { dossierId: 'A', label: '' });
    put(doc, 'comments', 'c1', { dossierId: 'C', content: 'vu' });
    put(doc, 'tabs', 't1', { dossierId: 'B', name: 'own tab' });

    const groups = findForeignEntries(doc, 'B');
    expect([...groups.keys()].sort()).toEqual(['A', 'C']);
    expect(groups.get('A')).toEqual({
      counts: { elements: 2, links: 1, comments: 0, tabs: 0, reports: 0 },
      samples: ['Intrus 1', 'Intrus 2'],
    });
    expect(groups.get('C')!.counts.comments).toBe(1);
  });

  it('ignores entries without a dossier id (older data)', () => {
    const doc = new Y.Doc();
    put(doc, 'elements', 'e1', { label: 'legacy' });
    put(doc, 'elements', 'e2', { dossierId: '', label: 'empty' });
    expect(findForeignEntries(doc, 'B').size).toBe(0);
  });
});
