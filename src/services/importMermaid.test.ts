import { describe, it, expect } from 'vitest';
import { parseMermaid, buildMermaidGraph, isMermaidFlowchart, MermaidParseError } from './importMermaid';

const byId = (p: ReturnType<typeof parseMermaid>, id: string) => p.nodes.find((n) => n.id === id)!;

describe('isMermaidFlowchart', () => {
  it('detects flowchart and graph headers', () => {
    expect(isMermaidFlowchart('graph TD\nA-->B')).toBe(true);
    expect(isMermaidFlowchart('flowchart LR\n  A --> B')).toBe(true);
    expect(isMermaidFlowchart('graph TD; A-->B; B-->C')).toBe(true);
  });

  it('accepts a code fence with surrounding prose', () => {
    const text = 'Voici le graphe :\n\n```mermaid\nflowchart TD\n  A --> B\n```\n\nBonne analyse.';
    expect(isMermaidFlowchart(text)).toBe(true);
  });

  it('picks the first flowchart block of a Markdown document', () => {
    const md = [
      '# Note d\'analyse',
      '',
      '```mermaid',
      'sequenceDiagram',
      'A->>B: appel',
      '```',
      '',
      'Le réseau :',
      '',
      '```mermaid',
      'flowchart LR',
      '  A[Alice] --> B[Bob]',
      '```',
    ].join('\n');
    expect(isMermaidFlowchart(md)).toBe(true);
    expect(parseMermaid(md).nodes.map((n) => n.label)).toEqual(['Alice', 'Bob']);
  });

  it('rejects Markdown without a flowchart block', () => {
    expect(isMermaidFlowchart('# Titre\n\nDu texte.\n')).toBe(false);
    expect(() => parseMermaid('# Titre\n\nDu texte.\n')).toThrow(MermaidParseError);
  });

  it('rejects prose and other diagrams', () => {
    expect(isMermaidFlowchart('graph theory is a branch of mathematics\nsecond line')).toBe(false);
    expect(isMermaidFlowchart('sequenceDiagram\nA->>B: hi')).toBe(false);
    expect(isMermaidFlowchart('graph TD')).toBe(false);
    expect(isMermaidFlowchart('')).toBe(false);
  });
});

describe('parseMermaid — header and preamble', () => {
  it('reads direction, TD maps to TB', () => {
    expect(parseMermaid('graph TD\nA-->B').direction).toBe('TB');
    expect(parseMermaid('flowchart LR\nA-->B').direction).toBe('LR');
    expect(parseMermaid('graph\nA-->B').direction).toBe('TB');
  });

  it('strips frontmatter, init directives and comments', () => {
    const p = parseMermaid([
      '---',
      'title: Réseau',
      '---',
      "%%{init: {'theme':'dark'}}%%",
      'flowchart TD',
      '  %% un commentaire',
      '  A --> B',
    ].join('\n'));
    expect(p.nodes.map((n) => n.id)).toEqual(['A', 'B']);
    expect(p.ignoredLines).toBe(0);
  });

  it('throws on non-flowchart diagrams and empty input', () => {
    expect(() => parseMermaid('sequenceDiagram\nA->>B: hi')).toThrow(MermaidParseError);
    try {
      parseMermaid('erDiagram\nA ||--o{ B : has');
    } catch (e) {
      expect((e as MermaidParseError).code).toBe('unsupportedDiagram');
      expect((e as MermaidParseError).diagramType).toBe('erDiagram');
    }
    expect(() => parseMermaid('   ')).toThrow(MermaidParseError);
  });
});

describe('parseMermaid — nodes', () => {
  it('maps shapes to ZN shapes', () => {
    const p = parseMermaid([
      'graph TD',
      'a[Rect]', 'b(Rounded)', 'c([Stadium])', 'd[[Sub]]', 'e[(Base)]',
      'f((Cercle))', 'g{Choix}', 'h{{Hexa}}', 'i>Drapeau]', 'j[/Para/]', 'k',
    ].join('\n'));
    const shapes = Object.fromEntries(p.nodes.map((n) => [n.id, n.shape]));
    expect(shapes).toEqual({
      a: 'rectangle', b: 'rectangle', c: 'rectangle', d: 'rectangle', e: 'rectangle',
      f: 'circle', g: 'diamond', h: 'hexagon', i: 'rectangle', j: 'rectangle', k: 'rectangle',
    });
    expect(byId(p, 'f').label).toBe('Cercle');
    expect(byId(p, 'k').label).toBe('k');
  });

  it('cleans labels: quotes, entities, <br>, markdown', () => {
    const p = parseMermaid([
      'graph TD',
      'a["Société (SARL) [Paris]"]',
      'b["Dit #quot;le Chef#quot;"]',
      'c[Ligne 1<br/>Ligne 2]',
      'd["`**Gras**`"]',
    ].join('\n'));
    expect(byId(p, 'a').label).toBe('Société (SARL) [Paris]');
    expect(byId(p, 'b').label).toBe('Dit "le Chef"');
    expect(byId(p, 'c').label).toBe('Ligne 1\nLigne 2');
    expect(byId(p, 'd').label).toBe('Gras');
  });

  it('supports unicode ids and later redeclaration', () => {
    const p = parseMermaid('graph TD\nÉlise --> Zoé\nÉlise[Élise Martin]');
    expect(p.nodes).toHaveLength(2);
    expect(byId(p, 'Élise').label).toBe('Élise Martin');
  });

  it('supports the extended @{ } syntax', () => {
    const p = parseMermaid('flowchart TD\nA@{ shape: diam, label: "Décision" } --> B');
    expect(byId(p, 'A').shape).toBe('diamond');
    expect(byId(p, 'A').label).toBe('Décision');
  });
});

describe('parseMermaid — edges', () => {
  it('reads operators, direction and style', () => {
    const p = parseMermaid([
      'graph LR',
      'A --> B', 'C --- D', 'E -.-> F', 'G ==> H', 'I <--> J', 'K --x L', 'M ---> N', 'O ~~~ P',
    ].join('\n'));
    const e = (from: string) => p.edges.find((x) => x.from === from);
    expect(e('A')).toMatchObject({ to: 'B', direction: 'forward', style: 'solid', thick: false });
    expect(e('C')).toMatchObject({ direction: 'none' });
    expect(e('E')).toMatchObject({ direction: 'forward', style: 'dashed' });
    expect(e('G')).toMatchObject({ direction: 'forward', thick: true });
    expect(e('I')).toMatchObject({ direction: 'both' });
    expect(e('K')).toMatchObject({ direction: 'forward' });
    expect(e('M')).toMatchObject({ to: 'N', direction: 'forward' });
    // invisible link: nodes kept, no edge
    expect(e('O')).toBeUndefined();
    expect(p.nodes.some((n) => n.id === 'P')).toBe(true);
  });

  it('reads edge labels in all forms', () => {
    const p = parseMermaid([
      'graph TD',
      'A -->|dirige| B',
      'C -- "employé de" --> D',
      'E -. soupçonné .-> F',
      'G == finance ==> H',
      'I ---|frère| J',
    ].join('\n'));
    expect(p.edges.map((e) => e.label)).toEqual(['dirige', 'employé de', 'soupçonné', 'finance', 'frère']);
    expect(p.edges[2].style).toBe('dashed');
    expect(p.edges[3].thick).toBe(true);
    expect(p.edges[4].direction).toBe('none');
  });

  it('expands chains and & groups', () => {
    const p = parseMermaid('graph TD\nA --> B --> C\nD & E --> F & G');
    expect(p.edges.map((e) => `${e.from}${e.to}`)).toEqual(['AB', 'BC', 'DF', 'DG', 'EF', 'EG']);
  });

  it('handles compact syntax and semicolons', () => {
    const p = parseMermaid('graph TD;A[Alice]-->B[Bob];B-->C;');
    expect(p.nodes.map((n) => n.label)).toEqual(['Alice', 'Bob', 'C']);
    expect(p.edges).toHaveLength(2);
  });

  it('accepts ids with - and . without eating edge operators', () => {
    const p = parseMermaid([
      'graph LR',
      'node-1[Alice] --> node-2[Bob]',
      'compte.fr-01 -.-> node-1',
      'a-b-->c.d',
      'x_1-.->y-2',
      'style node-2 fill:#f96',
      'class node-1,compte.fr-01 cible',
      'classDef cible fill:#9cf',
    ].join('\n'));
    expect(p.ignoredLines).toBe(0);
    expect(p.edges.map((e) => `${e.from}>${e.to}`)).toEqual([
      'node-1>node-2', 'compte.fr-01>node-1', 'a-b>c.d', 'x_1>y-2',
    ]);
    expect(p.edges[1].style).toBe('dashed');
    expect(p.edges[3].style).toBe('dashed');
    expect(byId(p, 'node-2').style.fill).toBe('#ff9966');
    expect(byId(p, 'compte.fr-01').style.fill).toBe('#99ccff');
  });

  it('does not treat an id starting with o/x as an arrowhead', () => {
    const p = parseMermaid('graph TD\nA --- orange\nB --> xavier');
    expect(p.edges.map((e) => e.to)).toEqual(['orange', 'xavier']);
    expect(p.edges[0].direction).toBe('none');
  });
});

describe('parseMermaid — subgraphs, styles, tolerance', () => {
  it('turns subgraphs into the node subgraph title', () => {
    const p = parseMermaid([
      'flowchart TD',
      'subgraph S1 [Société Alpha]',
      '  A --> B',
      'end',
      'subgraph Famille',
      '  C',
      'end',
      'D --> A',
    ].join('\n'));
    expect(byId(p, 'A').subgraph).toBe('Société Alpha');
    expect(byId(p, 'C').subgraph).toBe('Famille');
    expect(byId(p, 'D').subgraph).toBeNull();
  });

  it('drops edges to subgraph ids instead of creating nodes', () => {
    const p = parseMermaid('flowchart TD\nsubgraph S1 [Groupe]\nA\nend\nB --> S1');
    expect(p.nodes.map((n) => n.id).sort()).toEqual(['A', 'B']);
    expect(p.edges).toHaveLength(0);
  });

  it('applies classDef, class, ::: and style', () => {
    const p = parseMermaid([
      'graph TD',
      'A:::suspect --> B',
      'C',
      'classDef suspect fill:#f96,stroke:#333',
      'classDef cible fill:#9cf',
      'class B,C cible',
      'style C stroke:#ff0000,stroke-dasharray: 5 5',
    ].join('\n'));
    expect(byId(p, 'A').style).toEqual({ fill: '#ff9966', stroke: '#333333' });
    expect(byId(p, 'B').style).toEqual({ fill: '#99ccff' });
    expect(byId(p, 'C').style).toEqual({ fill: '#99ccff', stroke: '#ff0000', dashed: true });
  });

  it('skips and counts lines it cannot parse, ignores known directives', () => {
    const p = parseMermaid([
      'graph TD',
      'A --> B',
      'this is not valid ((',
      'linkStyle 0 stroke:#f00',
      'click A "https://example.com"',
      'B --> C',
    ].join('\n'));
    expect(p.edges).toHaveLength(2);
    expect(p.ignoredLines).toBe(1);
  });
});

describe('buildMermaidGraph', () => {
  it('builds complete elements and links with a non-overlapping layout', () => {
    const p = parseMermaid([
      'flowchart LR',
      'subgraph S [Alpha]',
      'A((Alice)) -->|dirige| B{Bob}',
      'end',
      'B -.- C',
      'style A fill:#f96',
    ].join('\n'));
    const { elements, links } = buildMermaidGraph(p, 'dossier-1');

    expect(elements).toHaveLength(3);
    const alice = elements.find((e) => e.label === 'Alice')!;
    expect(alice.visual.shape).toBe('circle');
    expect(alice.visual.color).toBe('#ff9966');
    expect(alice.tags).toEqual(['Alpha']);
    expect(alice.dossierId).toBe('dossier-1');

    expect(links).toHaveLength(2);
    const dirige = links.find((l) => l.label === 'dirige')!;
    expect(dirige.fromId).toBe(alice.id);
    expect(dirige.direction).toBe('forward');
    const dashed = links.find((l) => l.label === '')!;
    expect(dashed.visual.style).toBe('dashed');
    expect(dashed.direction).toBe('none');

    // LR: ranks spread horizontally, top-left anchored at 0
    const xs = elements.map((e) => e.position.x);
    expect(Math.min(...xs)).toBe(0);
    expect(new Set(xs).size).toBe(3);
  });
});
