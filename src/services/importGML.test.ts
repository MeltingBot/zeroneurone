import { describe, it, expect } from 'vitest';
import type { Dossier, Element, Link } from '../types';
import { DEFAULT_ELEMENT_VISUAL, DEFAULT_LINK_VISUAL } from '../types';
import { parseGML, buildGMLGraph, decodeGmlString, GmlParseError } from './importGML';
import { buildGMLExport, gmlKey, gmlString } from './exportGML';

const D = 'd1' as Dossier['id'];

describe('parseGML', () => {
  it('reads nested lists, numbers, strings and comments', () => {
    const list = parseGML('# comment\nCreator "yEd"\ngraph [\n  directed 1\n  node [ id 1 label "A b" weight -2.5e1 ]\n]');
    expect(list[0]).toEqual(['Creator', 'yEd']);
    const graph = list[1][1] as ReturnType<typeof parseGML>;
    expect(graph[0]).toEqual(['directed', 1]);
    expect(graph[1]).toEqual(['node', [['id', 1], ['label', 'A b'], ['weight', -25]]]);
  });

  it('keeps # inside strings and multi-line strings', () => {
    const list = parseGML('graph [ node [ id 1 label "#tag\nsuite" ] ]');
    const node = (list[0][1] as ReturnType<typeof parseGML>)[0][1] as ReturnType<typeof parseGML>;
    expect(node[1]).toEqual(['label', '#tag\nsuite']);
  });

  it('reports the line of a syntax error', () => {
    expect(() => parseGML('graph [\n node [ id 1\n')).toThrow(GmlParseError);
    expect(() => parseGML('graph [\n node [ id "1 ]\n]')).toThrow(/line 2/);
    expect(() => parseGML('graph [ node [ id abc ] ]')).toThrow(/Invalid value/);
  });

  it('decodes entities', () => {
    expect(decodeGmlString('&quot;Caf&#233;&quot; &amp; &#x4E2D; &unknown;')).toBe('"Café" & 中 &unknown;');
  });
});

describe('buildGMLGraph', () => {
  it('maps a yEd file: centers, size, colors, shapes, arrows', () => {
    const gml = `Creator "yFiles"
graph [
  directed 1
  node [ id 0 label "Alice" graphics [ x 100 y 50 w 30 h 30 type "ellipse" fill "#FF0000" outline "#000000" ] ]
  node [ id 1 graphics [ x 300 y 50 w 120 h 30 type "rectangle" ] LabelGraphics [ text "Société" ] ]
  node [ id 2 label "C" graphics [ x 0 y 0 w 30 h 30 type "roundrectangle" ] ]
  edge [ source 0 target 1 label "connaît" graphics [ fill "#00FF00" width 3 targetArrow "standard" ] ]
  edge [ source 1 target 2 graphics [ targetArrow "none" ] ]
  edge [ source 2 target 0 ]
]`;
    const { elements, links, warnings } = buildGMLGraph(gml, D);
    expect(warnings).toEqual([]);
    expect(elements.map((e) => e.label)).toEqual(['Alice', 'Société', 'C']);
    const [a, b, c] = elements;
    expect(a.position).toEqual({ x: 85, y: 35 });
    expect(a.visual.color).toBe('#ff0000');
    expect(a.visual.borderColor).toBe('#000000');
    expect(a.visual.shape).toBe('circle');
    expect(b.visual.shape).toBe('rectangle');
    expect(c.visual.shape).toBe('square');
    expect(a.properties).toContainEqual({ key: 'gml_id', value: '0', type: 'text' });

    expect(links).toHaveLength(3);
    expect(links[0]).toMatchObject({ label: 'connaît', direction: 'forward', directed: true });
    expect(links[0].visual.color).toBe('#00ff00');
    expect(links[0].visual.thickness).toBe(3);
    expect(links[1].direction).toBe('none');
    // No arrow info: the graph's directed flag applies
    expect(links[2].direction).toBe('forward');
  });

  it('flips Y for Gephi and lays out nodes without graphics on a grid', () => {
    const gephi = buildGMLGraph('Creator "Gephi"\ngraph [ node [ id 1 graphics [ x 10 y 20 ] ] ]', D);
    expect(gephi.elements[0].position).toEqual({ x: 10, y: -20 });

    const nx = buildGMLGraph('graph [ node [ id 0 label "a" ] node [ id 1 label "b" ] edge [ source 0 target 1 ] ]', D);
    expect(nx.elements.map((e) => e.position)).toEqual([{ x: 0, y: 0 }, { x: 200, y: 0 }]);
    expect(nx.links[0].direction).toBe('none');
  });

  it('turns other scalar keys into properties and reads string ids', () => {
    const { elements, links } = buildGMLGraph(
      'graph [ node [ id "n1" label "a" age 42 city "Lyon" extra [ k 1 ] ] node [ id "n2" ] edge [ source "n1" target "n2" weight 0.5 ] ]', D,
    );
    expect(elements[0].properties).toEqual([
      { key: 'age', value: 42, type: 'number' },
      { key: 'city', value: 'Lyon', type: 'text' },
      { key: 'gml_id', value: 'n1', type: 'text' },
    ]);
    expect(elements[1].label).toBe('n2');
    expect(links[0].properties).toEqual([{ key: 'weight', value: 0.5, type: 'number' }]);
  });

  it('warns on duplicate ids and dangling edges', () => {
    const { elements, links, warnings } = buildGMLGraph(
      'graph [ node [ id 1 ] node [ id 1 ] node [ label "x" ] edge [ source 1 target 9 ] edge [ target 1 ] ]', D,
    );
    expect(elements).toHaveLength(1);
    expect(links).toHaveLength(0);
    expect(warnings).toHaveLength(4);
  });

  it('fails without a graph list', () => {
    expect(() => buildGMLGraph('Creator "x"', D)).toThrow();
  });
});

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

describe('buildGMLExport', () => {
  it('escapes strings and sanitizes keys', () => {
    expect(gmlString('Café "x" & y\n')).toBe('"Caf&#233; &quot;x&quot; &amp; y&#10;"');
    expect(gmlKey('Date de naissance')).toBe('Date_de_naissance');
    expect(gmlKey('téléphone')).toBe('telephone');
    expect(gmlKey('2e nom')).toBe('_2e_nom');
  });

  it('is pure ASCII', () => {
    const out = buildGMLExport({ name: 'Enquête' } as Dossier, [el('a', 'Élodie — 中')], []);
    expect([...out].every((ch) => ch === '\n' || (ch >= ' ' && ch <= '~'))).toBe(true);
  });

  it('round-trips through the importer', () => {
    const elements = [
      el('a', 'Alice "A"', {
        position: { x: 100, y: 200 }, tags: ['personne', 'suspect'], notes: 'ligne 1\nligne 2', confidence: 80,
        properties: [{ key: 'âge', value: 42, type: 'number' }, { key: 'label', value: 'shadow', type: 'text' }],
        visual: { ...DEFAULT_ELEMENT_VISUAL, color: '#fef3c7', borderColor: '#a8a29e', shape: 'diamond' },
      }),
      el('b', 'Société X', { position: { x: 400, y: 200 }, visual: { ...DEFAULT_ELEMENT_VISUAL, shape: 'rectangle' } }),
      el('c', 'C', { position: { x: 250, y: 500 }, visual: { ...DEFAULT_ELEMENT_VISUAL, shape: 'square' } }),
    ];
    const links = [
      link('l1', 'a', 'b', { label: 'dirige', direction: 'forward', directed: true, visual: { ...DEFAULT_LINK_VISUAL, color: '#ff0000', thickness: 4 } }),
      link('l2', 'b', 'c', { direction: 'backward', directed: true }),
      link('l3', 'c', 'a', { direction: 'both', directed: true }),
      link('l4', 'a', 'c'),
      link('l5', 'a', 'missing'),
    ];
    const gml = buildGMLExport({ name: 'Test' } as Dossier, elements, links);
    const back = buildGMLGraph(gml, D);

    expect(back.warnings).toEqual([]);
    expect(back.elements.map((e) => e.label)).toEqual(['Alice "A"', 'Société X', 'C']);
    back.elements.forEach((e, i) => {
      expect(e.position.x).toBeCloseTo(elements[i].position.x, 1);
      expect(e.position.y).toBeCloseTo(elements[i].position.y, 1);
      expect(e.visual.shape).toBe(elements[i].visual.shape);
    });
    const a = back.elements[0];
    expect(a.tags).toEqual(['personne', 'suspect']);
    expect(a.notes).toBe('ligne 1\nligne 2');
    expect(a.confidence).toBe(80);
    expect(a.visual.color).toBe('#fef3c7');
    expect(a.properties).toContainEqual({ key: 'age', value: 42, type: 'number' });
    expect(a.properties).toContainEqual({ key: 'prop_label', value: 'shadow', type: 'text' });

    expect(back.links.map((l) => l.direction)).toEqual(['forward', 'backward', 'both', 'none']);
    expect(back.links[0].label).toBe('dirige');
    expect(back.links[0].visual.color).toBe('#ff0000');
    expect(back.links[0].visual.thickness).toBe(4);
  });
});
