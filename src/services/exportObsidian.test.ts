import { describe, it, expect } from 'vitest';
import type { Asset, CanvasTab, Dossier, Element, Link, Report } from '../types';
import { DEFAULT_ELEMENT_VISUAL, DEFAULT_LINK_VISUAL } from '../types';
import {
  buildObsidianVault, convertReportRefs, toFrontmatter, toVaultBasename, type ObsidianLabels,
} from './exportObsidian';
import { computeElementDimensions } from '../utils/elementDimensions';

const labels: ObsidianLabels = {
  elementsFolder: 'Elements', canvasFolder: 'Canvas', reportFolder: 'Report', relations: 'Relations',
  events: 'Events', members: 'Members', attachments: 'Attachments', canvases: 'Canvases',
  elements: 'Elements', report: 'Report', related: 'related to', untitled: 'Untitled',
};

const dossier = { id: 'd1', name: 'Affaire X', description: 'Desc', tags: [] } as unknown as Dossier;

function el(id: string, label: string, over: Partial<Element> = {}): Element {
  return {
    id, dossierId: 'd1', label, notes: '', tags: [], properties: [], confidence: null, source: '',
    date: null, dateRange: null, position: { x: 0, y: 0 }, isPositionLocked: false, geo: null, events: [],
    visual: { ...DEFAULT_ELEMENT_VISUAL }, assetIds: [], parentGroupId: null,
    isGroup: false, isAnnotation: false, childIds: [], createdAt: new Date(), updatedAt: new Date(),
    ...over,
  } as Element;
}

function link(id: string, fromId: string, toId: string, over: Partial<Link> = {}): Link {
  return {
    id, dossierId: 'd1', fromId, toId, sourceHandle: null, targetHandle: null, label: '', notes: '',
    tags: [], properties: [], directed: true, direction: 'forward', confidence: null, source: '',
    date: null, dateRange: null, visual: { ...DEFAULT_LINK_VISUAL }, curveOffset: { x: 0, y: 0 },
    createdAt: new Date(), updatedAt: new Date(),
    ...over,
  } as Link;
}

function file(out: ReturnType<typeof buildObsidianVault>, path: string): string {
  const f = out.files.find((x) => x.path === path);
  if (!f) throw new Error(`missing ${path}; have ${out.files.map((x) => x.path).join(', ')}`);
  return f.content;
}

describe('toVaultBasename', () => {
  it('strips forbidden characters and falls back when empty', () => {
    expect(toVaultBasename('A/B: "c" [d] #e ^f|g', 'X')).toBe('A B c d e f g');
    expect(toVaultBasename('...hidden', 'X')).toBe('hidden');
    expect(toVaultBasename(' ?? ', 'Untitled')).toBe('Untitled');
  });
});

describe('toFrontmatter', () => {
  it('quotes strings and awkward keys', () => {
    const fm = toFrontmatter([['source', 'a: "b"\nc'], ['clé: x', 1], ['tags', ['t1', 't2']]]);
    expect(fm).toBe('---\nsource: "a: \\"b\\"\\nc"\n"clé: x": 1\ntags:\n  - "t1"\n  - "t2"\n---\n');
  });
});

describe('buildObsidianVault', () => {
  it('deduplicates basenames case-insensitively and adds aliases', () => {
    const out = buildObsidianVault({
      dossier, labels, links: [],
      elements: [el('a', 'Alice'), el('b', 'alice'), el('c', 'Bob/Martin')],
    });
    expect(file(out, 'Elements/Alice.md')).not.toContain('aliases');
    // zn_id closes the frontmatter
    expect(file(out, 'Elements/Alice.md')).toMatch(/zn_id: "a"\n---\n/);
    expect(file(out, 'Elements/alice (2).md')).toContain('aliases:\n  - "alice"');
    expect(file(out, 'Elements/Bob Martin.md')).toContain('aliases:\n  - "Bob/Martin"');
    expect(file(out, 'Elements/Bob Martin.md')).not.toContain('# Bob/Martin');
  });

  it('places relations according to direction', () => {
    const out = buildObsidianVault({
      dossier, labels,
      elements: [el('a', 'A'), el('b', 'B'), el('c', 'C'), el('d', 'D')],
      links: [
        link('l1', 'a', 'b', { label: 'emploie', confidence: 70 }),
        link('l2', 'a', 'c', { label: 'appelle', direction: 'backward' }),
        link('l3', 'a', 'd', { direction: 'none' }),
      ],
    });
    const a = file(out, 'Elements/A.md');
    const b = file(out, 'Elements/B.md');
    const c = file(out, 'Elements/C.md');
    const d = file(out, 'Elements/D.md');
    expect(a).toContain('emploie:\n  - "[[B]]"');
    expect(a).toContain('- → emploie [[B]] · 70 %');
    expect(b).not.toContain('emploie:');
    expect(b).toContain('- ← emploie [[A]]');
    // backward: arrow points from C to A
    expect(a).not.toContain('appelle:');
    expect(a).toContain('- ← appelle [[C]]');
    expect(c).toContain('appelle:\n  - "[[A]]"');
    // undirected, unlabelled: both sides, default key
    expect(a).toContain('related to:\n  - "[[D]]"');
    expect(d).toContain('related to:\n  - "[[A]]"');
    expect(d).toContain('- — [[A]]');
  });

  it('suffixes relation keys that collide with properties or reserved keys', () => {
    const out = buildObsidianVault({
      dossier, labels,
      elements: [el('a', 'A', { properties: [{ key: 'employeur', value: 'X' }] }), el('b', 'B')],
      links: [link('l1', 'a', 'b', { label: 'employeur' }), link('l2', 'a', 'b', { label: 'source' })],
    });
    const a = file(out, 'Elements/A.md');
    expect(a).toContain('employeur: "X"');
    expect(a).toContain('employeur (relation):\n  - "[[B]]"');
    expect(a).toContain('source (relation):\n  - "[[B]]"');
  });

  it('writes metadata, events, members and attachments', () => {
    const assets = [
      { id: 'as1', filename: 'photo.JPG' }, { id: 'as2', filename: 'photo.jpg' }, { id: 'as3', filename: 'rapport.pdf' },
    ] as Asset[];
    const out = buildObsidianVault({
      dossier, labels, links: [], assets,
      elements: [
        el('g', 'Groupe', { isGroup: true, childIds: ['a'] }),
        el('a', 'A', {
          parentGroupId: 'g', tags: ['#suspect principal'], confidence: 80, date: new Date(2021, 2, 4),
          geo: { type: 'point', lat: 48.85, lng: 2.35 }, assetIds: ['as1', 'as2', 'as3'],
          visual: { ...DEFAULT_ELEMENT_VISUAL, image: 'as1' }, dateRange: { start: new Date('2020-05-01'), end: null },
          events: [{ id: 'e1', date: new Date(2022, 0, 1), label: 'Arrivée', description: 'Ligne 1' }],
        }),
      ],
    });
    expect(out.assetPaths.get('as1')).toBe('attachments/photo.JPG');
    expect(out.assetPaths.get('as2')).toBe('attachments/photo (2).jpg');
    const a = file(out, 'Elements/A.md');
    expect(a).toContain('tags:\n  - "suspect-principal"');
    expect(a).toContain('confidence: 80');
    expect(a).toContain('date: "2021-03-04"');
    expect(a).toContain('location:\n  - 48.85\n  - 2.35');
    expect(a).toContain('group: "[[Groupe]]"');
    expect(a).toContain('![[attachments/photo.JPG]]');
    expect(a).toContain('date_start: "2020-05-01"');
    expect(a.match(/photo\.JPG/g)).toHaveLength(1);
    expect(a).toContain('## Attachments\n\n![[attachments/photo (2).jpg]]\n\n- [[attachments/rapport.pdf]]');
    expect(a).toContain('- **2022-01-01 — Arrivée**\n  Ligne 1');
    expect(file(out, 'Elements/Groupe.md')).toContain('## Members\n\n- [[A]]');
  });

  it('builds one canvas per tab with arrows, labels and groups first', () => {
    const tabs = [
      { id: 't2', name: 'Second', order: 1, memberElementIds: ['a'] },
      { id: 't1', name: 'Principal', order: 0, memberElementIds: ['a', 'b', 'n', 'g'] },
    ] as CanvasTab[];
    const out = buildObsidianVault({
      dossier, labels, tabs,
      elements: [
        el('a', 'A', { position: { x: 10, y: 20 }, parentGroupId: 'g' }),
        el('b', 'B', { visual: { ...DEFAULT_ELEMENT_VISUAL, color: '#ff0000' } }),
        el('n', 'Note', { isAnnotation: true, notes: 'Post-it' }),
        el('g', 'G', { isGroup: true, position: { x: 100, y: 100 }, visual: { ...DEFAULT_ELEMENT_VISUAL, customWidth: 300, customHeight: 200 } }),
      ],
      links: [
        link('l1', 'a', 'b', { label: 'connaît', direction: 'both', visual: { ...DEFAULT_LINK_VISUAL, color: '#00ff00' } }),
        link('l2', 'b', 'n', { direction: 'backward' }),
      ],
    });
    const canvas = JSON.parse(file(out, 'Canvas/Principal.canvas'));
    type N = { id: string; x: number; y: number; width: number; height: number };
    const node = (id: string): N => canvas.nodes.find((n: N) => n.id === id);
    expect(canvas.nodes[0]).toMatchObject({ id: 'g', type: 'group', label: 'G' });
    expect(node('a')).toMatchObject({ type: 'file', file: 'Elements/A.md', width: 300, height: 160 });
    expect(node('n')).toMatchObject({ width: 300, height: 160 });
    // Card centred on the ZN node centre (scaled x3)
    const dims = computeElementDimensions(DEFAULT_ELEMENT_VISUAL, 'A', false);
    expect(node('a').x + 150).toBe(Math.round((110 + dims.width / 2) * 3));
    // The group frame wraps its child card, and is at least the scaled ZN frame
    const g = node('g');
    const a = node('a');
    expect(g.x).toBeLessThanOrEqual(a.x - 40);
    expect(g.y).toBeLessThanOrEqual(a.y - 40);
    expect(g.x + g.width).toBeGreaterThanOrEqual(a.x + a.width + 40);
    expect(g.y + g.height).toBeGreaterThanOrEqual(a.y + a.height + 40);
    expect(g.x).toBeLessThanOrEqual(300);
    expect(g.width).toBeGreaterThanOrEqual(900);
    expect(canvas.nodes.find((n: { id: string }) => n.id === 'b')).toMatchObject({ color: '#ff0000' });
    expect(canvas.nodes.find((n: { id: string }) => n.id === 'n')).toMatchObject({ type: 'text', text: 'Post-it' });
    expect(canvas.edges).toEqual([
      { id: 'l1', fromNode: 'a', toNode: 'b', fromEnd: 'arrow', toEnd: 'arrow', label: 'connaît', color: '#00ff00' },
      { id: 'l2', fromNode: 'b', toNode: 'n', fromEnd: 'arrow', toEnd: 'none' },
    ]);
    expect(JSON.parse(file(out, 'Canvas/Second.canvas')).edges).toEqual([]);
    // No note for annotations
    expect(out.files.some((f) => f.path === 'Elements/Note.md')).toBe(false);
  });

  it('falls back to a single canvas named after the dossier and writes the index', () => {
    const out = buildObsidianVault({ dossier, labels, elements: [el('a', 'A')], links: [] });
    expect(JSON.parse(file(out, 'Canvas/Affaire X.canvas')).nodes).toHaveLength(1);
    const index = file(out, 'Affaire X.md');
    expect(index).toContain('- [[Affaire X.canvas]]');
    expect(index).toContain('## Elements\n\n- [[A]]');
  });

  it('exports the report with converted references', () => {
    const report = {
      id: 'r', title: 'Synthèse', sections: [
        { id: 's2', title: 'Deux', order: 1, content: 'Fin', elementIds: [], graphSnapshot: null },
        { id: 's1', title: 'Un', order: 0, content: 'Voir [[Alice D.|a1]] et [[Lien|b2]].', elementIds: [], graphSnapshot: null },
      ],
    } as unknown as Report;
    const out = buildObsidianVault({
      dossier, labels, report, elements: [el('a1', 'Alice'), el('b', 'B')], links: [link('b2', 'a1', 'b')],
    });
    const md = file(out, 'Report/Synthèse.md');
    expect(md).toBe('## Un\n\nVoir [[Alice|Alice D.]] et Lien.\n\n## Deux\n\nFin\n');
    expect(file(out, 'Affaire X.md')).toContain('## Report\n\n- [[Synthèse]]');
  });
});

describe('convertReportRefs', () => {
  it('handles legacy refs and deleted targets', () => {
    const names = new Map([['abc', 'Alice']]);
    expect(convertReportRefs('[Alice](#element:abc) [[Gone|dead]]', names, new Set()))
      .toBe('[[Alice]] ~~Gone~~');
  });
});
