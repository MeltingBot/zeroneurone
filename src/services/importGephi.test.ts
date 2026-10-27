// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/database';
import type { DossierId } from '../types';
import { importGEXF } from './importGephi';

const D = 'dossier-gexf' as DossierId;

function gexf(graphAttrs: string, edges: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<gexf xmlns="http://www.gexf.net/1.3" version="1.3">
  <graph ${graphAttrs}>
    <nodes>
      <node id="a" label="A"/>
      <node id="b" label="B"/>
      <node id="c" label="C"/>
    </nodes>
    <edges>${edges}</edges>
  </graph>
</gexf>`;
}

beforeEach(async () => {
  await db.links.clear();
  await db.elements.clear();
});

describe('importGEXF edges', () => {
  it('merges A→B and B→A of an undirected graph into one link', async () => {
    const result = await importGEXF(gexf('defaultedgetype="undirected"', `
      <edge id="0" source="a" target="b"/>
      <edge id="1" source="b" target="a"/>
      <edge id="2" source="a" target="c"/>`), D);
    expect(result.linksImported).toBe(2);
    expect(result.warnings).toHaveLength(1);
    expect(await db.links.count()).toBe(2);
  });

  it('keeps both directions of a directed graph, with arrows', async () => {
    const result = await importGEXF(gexf('defaultedgetype="directed"', `
      <edge id="0" source="a" target="b"/>
      <edge id="1" source="b" target="a"/>`), D);
    expect(result.linksImported).toBe(2);
    const links = await db.links.toArray();
    expect(links.every((l) => l.direction === 'forward')).toBe(true);
  });

  it('keeps reciprocal links that carry different labels', async () => {
    const result = await importGEXF(gexf('defaultedgetype="undirected"', `
      <edge id="0" source="a" target="b" label="x"/>
      <edge id="1" source="b" target="a" label="y"/>`), D);
    expect(result.linksImported).toBe(2);
  });

  it('pairs each reverse edge once: A→B, A→B, B→A gives two links', async () => {
    const result = await importGEXF(gexf('', `
      <edge id="0" source="a" target="b"/>
      <edge id="1" source="a" target="b"/>
      <edge id="2" source="b" target="a"/>`), D);
    expect(result.linksImported).toBe(2);
  });
});

describe('importGEXF positions', () => {
  const positioned = (spacing: number) => `<?xml version="1.0" encoding="UTF-8"?>
<gexf xmlns="http://www.gexf.net/1.3" xmlns:viz="http://www.gexf.net/1.3/viz" version="1.3">
  <graph>
    <nodes>
      <node id="a" label="A"><viz:position x="0" y="0"/><viz:size value="10"/></node>
      <node id="b" label="B"><viz:position x="${spacing}" y="0"/><viz:size value="10"/></node>
      <node id="c" label="C"><viz:position x="0" y="${spacing}"/><viz:size value="10"/></node>
    </nodes>
    <edges/>
  </graph>
</gexf>`;

  const byLabel = async () => new Map((await db.elements.toArray()).map((e) => [e.label, e]));

  it('spreads a tight Gephi layout so the elements do not overlap', async () => {
    await importGEXF(positioned(7), D);
    const els = await byLabel();
    const a = els.get('A')!, b = els.get('B')!, c = els.get('C')!;
    // 56 px elements, 1.5 sizes between neighbours
    expect(b.position.x - a.position.x).toBeCloseTo(84);
    // Gephi Y points up
    expect(c.position.y - a.position.y).toBeCloseTo(-84);
    // Gephi centre (0,0) becomes the top-left corner minus half the size
    expect(a.position.x).toBeCloseTo(-28);
  });

  it('keeps a layout that is already spread out', async () => {
    await importGEXF(positioned(500), D);
    const els = await byLabel();
    expect(els.get('B')!.position.x - els.get('A')!.position.x).toBeCloseTo(500);
  });
});
