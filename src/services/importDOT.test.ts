import { describe, it, expect } from 'vitest';
import type { DossierId, Element, Link } from '../types';
import { DEFAULT_ELEMENT_VISUAL, DEFAULT_LINK_VISUAL } from '../types';
import { buildDOTExport, dotLabel, dotString } from './exportDOT';
import { buildDOTGraph, isDotGraph, parseDOT, DotParseError } from './importDOT';
import { isMermaidFlowchart } from './importMermaid';
import { parseDotColor } from './dotColors';

const D = 'd1' as DossierId;

function byLabel(elements: Element[], label: string): Element {
  const el = elements.find((e) => e.label === label);
  if (!el) throw new Error(`no element ${label}`);
  return el;
}

describe('parseDOT', () => {
  it('reads chains, subgraph operands, ports, comments and concatenated strings', () => {
    const g = parseDOT(`
      # preprocessor line
      /* header */ strict digraph "G" {
        a:p1:n -> b -> c; // chain
        a -> { d e }
        f [label="hel" + "lo"]
      }`);
    expect(g.strict).toBe(true);
    expect(g.directed).toBe(true);
    expect(g.name).toBe('G');
    expect([...g.nodes.keys()]).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(g.edges.map((e) => `${e.from}>${e.to}`)).toEqual(['a>b', 'b>c', 'a>d', 'a>e']);
    expect(g.nodes.get('f')!.attrs.label).toBe('hello');
  });

  it('applies node and edge defaults by scope', () => {
    const g = parseDOT(`graph {
      node [shape=box]
      a
      subgraph s { node [color=red]; b; c -- d }
      e
    }`);
    expect(g.nodes.get('a')!.attrs).toEqual({ shape: 'box' });
    expect(g.nodes.get('b')!.attrs).toEqual({ shape: 'box', color: 'red' });
    expect(g.nodes.get('e')!.attrs).toEqual({ shape: 'box' });
  });

  it('reports the line of a syntax error', () => {
    expect(() => parseDOT('digraph {\n a -> \n}')).toThrow(DotParseError);
    try { parseDOT('digraph {\n a -> \n}'); } catch (e) { expect((e as DotParseError).line).toBe(3); }
  });
});

describe('isDotGraph', () => {
  it('tells DOT from Mermaid and prose', () => {
    expect(isDotGraph('digraph { a -> b }')).toBe(true);
    expect(isDotGraph('// tool output\nstrict graph G {\n a -- b }')).toBe(true);
    expect(isDotGraph('graph TD\n  A-->B{ok}')).toBe(false);
    expect(isMermaidFlowchart('digraph { a -> b }')).toBe(false);
    expect(isDotGraph('graph theory is about { sets }')).toBe(false);
  });
});

describe('parseDotColor', () => {
  it('reads X11 names, hex, HSV and lists', () => {
    expect(parseDotColor('red')).toBe('#ff0000');
    expect(parseDotColor('LightBlue2')).toBe('#add8e6');
    expect(parseDotColor('#ABC')).toBe('#aabbcc');
    expect(parseDotColor('#11223380')).toBe('#112233');
    expect(parseDotColor('0.0 1.0 1.0')).toBe('#ff0000');
    expect(parseDotColor('blue:red')).toBe('#0000ff');
    expect(parseDotColor('transparent')).toBeUndefined();
  });
});

describe('buildDOTGraph', () => {
  it('maps labels, shapes, colours, arrows and properties', () => {
    const { elements, links } = buildDOTGraph(`digraph {
      a [label="Alice\\nMartin" shape=box style="filled,dashed" fillcolor=lightblue color=navy weight=3]
      b [label=<<b>Bob</b><br/>&amp; co>]
      r [shape=record label="{id|<p>name}"]
      a -> b [label="pays" color=red penwidth=3 style=dotted]
      b -> r [dir=both]
      r -> a [arrowhead=none]
      a -> r [dir=back]
    }`, D);
    const a = byLabel(elements, 'Alice\nMartin');
    expect(a.visual).toMatchObject({ shape: 'rectangle', color: '#add8e6', borderColor: '#000080', borderStyle: 'dashed' });
    expect(a.properties).toEqual(expect.arrayContaining([
      { key: 'weight', value: 3, type: 'number' },
      { key: 'dot_id', value: 'a', type: 'text' },
    ]));
    expect(byLabel(elements, 'Bob\n& co')).toBeTruthy();
    expect(byLabel(elements, 'id | name')).toBeTruthy();
    expect(links.map((l) => l.direction)).toEqual(['forward', 'both', 'none', 'backward']);
    expect(links[0]).toMatchObject({ label: 'pays', visual: { color: '#ff0000', thickness: 3, style: 'dotted' } });
  });

  it('reads escapes in labels and notes only: paths keep their backslashes', () => {
    const dot = String.raw`digraph { a [label="one\ntwo" tooltip="x\ny" path="C:\Users\nadia\Documents" tags="T1;C:\temp"] }`;
    const [a] = buildDOTGraph(dot, D).elements;
    expect(a.label).toBe('one\ntwo');
    expect(a.notes).toBe('x\ny');
    expect(a.properties).toContainEqual({ key: 'path', value: String.raw`C:\Users\nadia\Documents`, type: 'text' });
    expect(a.tags).toEqual(['T1', String.raw`C:\temp`]);
  });

  it('keeps an undirected graph undirected', () => {
    const { links } = buildDOTGraph('graph { a -- b -- c }', D);
    expect(links.map((l) => l.direction)).toEqual(['none', 'none']);
  });

  it('tags the nodes of a cluster with its label, or its name', () => {
    const { elements } = buildDOTGraph(`digraph {
      subgraph cluster_bank { label="Banque Alpha"; a; b }
      subgraph cluster_shell { c }
      subgraph cluster_0 { d }
      subgraph notacluster { e }
      a -> c -> d -> e
    }`, D);
    expect(byLabel(elements, 'a').tags).toEqual(['Banque Alpha']);
    expect(byLabel(elements, 'c').tags).toEqual(['shell']);
    expect(byLabel(elements, 'd').tags).toEqual(['cluster_0']);
    expect(byLabel(elements, 'e').tags).toEqual([]);
  });

  it('merges the duplicate edges of a strict graph', () => {
    const { links } = buildDOTGraph('strict graph { a -- b [label=x]; b -- a [label=y]; a -- c }', D);
    expect(links).toHaveLength(2);
    expect(links[0].label).toBe('y');
  });

  it('skips invisible edges and self-loops, with a warning', () => {
    const { links, warnings } = buildDOTGraph('digraph { a -> b [style=invis]; a -> a; a -> b }', D);
    expect(links).toHaveLength(1);
    expect(warnings).toHaveLength(1);
  });

  it('keeps Graphviz positions when every node has one (Y up)', () => {
    const { elements } = buildDOTGraph(`digraph {
      a [pos="0,100!" width=1]
      b [pos="200,0!" width=1]
    }`, D);
    const a = byLabel(elements, 'a');
    const b = byLabel(elements, 'b');
    expect(b.position.x).toBeGreaterThan(a.position.x);
    expect(b.position.y).toBeGreaterThan(a.position.y); // b is lower: Y flipped
  });

  it('lays out with dagre along rankdir otherwise', () => {
    const { elements } = buildDOTGraph('digraph { rankdir=LR; a -> b -> c }', D);
    const [a, b, c] = ['a', 'b', 'c'].map((l) => byLabel(elements, l));
    expect(a.position.x).toBeLessThan(b.position.x);
    expect(b.position.x).toBeLessThan(c.position.x);
  });
});

// ── Export, and the round trip through the import ───────────────────────────

function el(id: string, label: string, over: Partial<Element> = {}): Element {
  return {
    id, dossierId: D, label, notes: '', tags: [], properties: [], confidence: null, source: '',
    date: null, dateRange: null, position: { x: 0, y: 0 }, isPositionLocked: false, geo: null, events: [],
    visual: { ...DEFAULT_ELEMENT_VISUAL }, assetIds: [], parentGroupId: null,
    isGroup: false, isAnnotation: false, childIds: [], createdAt: new Date(), updatedAt: new Date(),
    ...over,
  } as Element;
}

function link(id: string, fromId: string, toId: string, over: Partial<Link> = {}): Link {
  return {
    id, dossierId: D, fromId, toId, sourceHandle: null, targetHandle: null, label: '', notes: '',
    tags: [], properties: [], directed: false, direction: 'none', confidence: null, source: '',
    date: null, dateRange: null, visual: { ...DEFAULT_LINK_VISUAL }, curveOffset: { x: 0, y: 0 },
    createdAt: new Date(), updatedAt: new Date(),
    ...over,
  } as Link;
}

describe('buildDOTExport', () => {
  it('escapes labels, keeps other values as written', () => {
    expect(dotLabel('a "b"\nc\\d')).toBe(String.raw`"a \"b\"\nc\\d"`);
    expect(dotString(String.raw`C:\Users\nadia`)).toBe(String.raw`"C:\Users\nadia"`);
    expect(dotString('dir\\')).toBe('"dir\\\\"');
  });

  it('writes a graph when no link has an arrow, a digraph otherwise', () => {
    const els = [el('1', 'A'), el('2', 'B')];
    const plain = buildDOTExport('x', els, [link('l', '1', '2')]);
    expect(plain).toContain('graph "x" {');
    expect(plain).not.toContain('digraph');
    expect(plain).toContain('n0 -- n1');
    const directed = buildDOTExport('x', els, [link('l', '1', '2', { direction: 'forward', directed: true }), link('m', '2', '1')]);
    expect(directed).toContain('digraph "x" {');
    expect(directed).toContain('n1 -> n0 [dir=none]');
  });

  it('round-trips through the import', () => {
    const els = [
      el('1', 'Alice\n"Al"', {
        notes: 'note\nligne 2', tags: ['Banque', 'Suspect'], confidence: 70, source: 'PV 12',
        position: { x: 0, y: 0 },
        visual: { ...DEFAULT_ELEMENT_VISUAL, shape: 'rectangle', color: '#add8e6', borderColor: '#000080', borderStyle: 'dashed' },
        properties: [
          { key: 'Téléphone', value: '+33 6 12', type: 'text' },
          { key: 'chemin', value: String.raw`C:\Users\nadia\Documents`, type: 'text' },
          { key: 'montant', value: 1200, type: 'number' },
          { key: 'label', value: 'clash', type: 'text' },
        ],
      }),
      el('2', 'Bob', { position: { x: 400, y: 300 }, visual: { ...DEFAULT_ELEMENT_VISUAL, shape: 'diamond' } }),
      el('3', 'Carol', { position: { x: 800, y: 0 } }),
    ];
    const lnks = [
      link('a', '1', '2', { label: 'paie', direction: 'forward', directed: true, visual: { color: '#ff0000', style: 'dotted', thickness: 4 } }),
      link('b', '2', '3', { direction: 'backward', directed: true }),
      link('c', '3', '1', { direction: 'both', directed: true }),
      link('d', '1', '3'),
    ];
    const back = buildDOTGraph(buildDOTExport('Dossier', els, lnks), D);

    const a = byLabel(back.elements, 'Alice\n"Al"');
    expect(a).toMatchObject({ notes: 'note\nligne 2', tags: ['Banque', 'Suspect'], confidence: 70, source: 'PV 12' });
    expect(a.visual).toMatchObject({ shape: 'rectangle', color: '#add8e6', borderColor: '#000080', borderStyle: 'dashed' });
    expect(a.properties).toEqual(expect.arrayContaining([
      { key: 'Téléphone', value: '+33 6 12', type: 'text' },
      { key: 'chemin', value: String.raw`C:\Users\nadia\Documents`, type: 'text' },
      { key: 'montant', value: 1200, type: 'number' },
      { key: 'prop_label', value: 'clash', type: 'text' },
    ]));
    expect(byLabel(back.elements, 'Bob').visual.shape).toBe('diamond');

    // Same layout, within rounding
    const b = byLabel(back.elements, 'Bob');
    const c = byLabel(back.elements, 'Carol');
    expect(Math.abs(b.position.x - a.position.x - 400)).toBeLessThan(3);
    expect(Math.abs(b.position.y - a.position.y - 300)).toBeLessThan(3);
    expect(Math.abs(c.position.x - a.position.x - 800)).toBeLessThan(3);

    expect(back.links.map((l) => l.direction)).toEqual(['forward', 'backward', 'both', 'none']);
    expect(back.links[0]).toMatchObject({ label: 'paie', visual: { color: '#ff0000', style: 'dotted', thickness: 4 } });

    // Reexported, the ids taken from the first export stay
    const again = buildDOTExport('Dossier', back.elements, back.links);
    expect(again).toContain('n0 -> n1');
    expect(again).not.toContain('dot_id');
  });
});
