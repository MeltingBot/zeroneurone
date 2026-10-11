// @vitest-environment jsdom
import { deflateRawSync } from 'node:zlib';
import { describe, it, expect } from 'vitest';
import { isDrawioFormat, parseDrawio } from './importDrawio';

const MODEL = `<mxGraphModel><root>
  <mxCell id="0"/>
  <mxCell id="1" parent="0"/>
  <object id="alice" label="Alice &lt;b&gt;Martin&lt;/b&gt;&lt;br&gt;CEO" link="https://example.org/a" role="Gérante" placeholders="1">
    <mxCell style="ellipse;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
      <mxGeometry x="100" y="50" width="120" height="60" as="geometry"/>
    </mxCell>
  </object>
  <mxCell id="grp" value="" style="group" vertex="1" parent="1">
    <mxGeometry x="300" y="200" width="200" height="100" as="geometry"/>
  </mxCell>
  <mxCell id="bob" value="Bob" style="rhombus;dashed=1;fillColor=none;" vertex="1" parent="grp">
    <mxGeometry x="20" y="10" width="80" height="80" as="geometry"/>
  </mxCell>
  <mxCell id="note" value="Note libre" style="text;html=1;strokeColor=none;fillColor=none;align=left;" vertex="1" parent="1">
    <mxGeometry x="0" y="0" width="60" height="20" as="geometry"/>
  </mxCell>
  <mxCell id="e1" value="dirige" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#ff0000;strokeWidth=3;" edge="1" parent="1" source="alice" target="bob">
    <mxGeometry relative="1" as="geometry"/>
  </mxCell>
  <mxCell id="e2" value="" style="endArrow=none;dashed=1;" edge="1" parent="1" source="bob" target="alice">
    <mxGeometry relative="1" as="geometry"/>
  </mxCell>
  <mxCell id="e2label" value="connaît" style="edgeLabel;html=1;" vertex="1" connectable="0" parent="e2">
    <mxGeometry x="-0.2" relative="1" as="geometry"/>
  </mxCell>
  <mxCell id="e3" style="startArrow=classic;" edge="1" parent="1" source="alice" target="note">
    <mxGeometry relative="1" as="geometry"/>
  </mxCell>
  <mxCell id="e4" value="orpheline" edge="1" parent="1" source="alice">
    <mxGeometry relative="1" as="geometry"><mxPoint x="0" y="0" as="targetPoint"/></mxGeometry>
  </mxCell>
</root></mxGraphModel>`;

const wrap = (...diagrams: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net">${diagrams
    .map((d, i) => `<diagram id="p${i}" name="Page-${i + 1}">${d}</diagram>`)
    .join('')}</mxfile>`;

const compress = (xml: string) => deflateRawSync(Buffer.from(encodeURIComponent(xml))).toString('base64');

describe('isDrawioFormat', () => {
  it('detects mxfile and bare mxGraphModel', () => {
    expect(isDrawioFormat(wrap(MODEL))).toBe(true);
    expect(isDrawioFormat(MODEL)).toBe(true);
    expect(isDrawioFormat('﻿<?xml version="1.0"?>\n<!-- x -->\n<mxfile>')).toBe(true);
  });

  it('rejects GraphML and ANX', () => {
    expect(isDrawioFormat('<?xml version="1.0"?><graphml xmlns="http://graphml.graphdrawing.org/xmlns"></graphml>')).toBe(false);
    expect(isDrawioFormat('<?xml version="1.0"?><Chart><ChartItemCollection/></Chart>')).toBe(false);
  });
});

describe('parseDrawio', () => {
  it('reads vertices with labels, shapes, colors and object attributes', async () => {
    const { nodes } = await parseDrawio(wrap(MODEL));
    expect(nodes.map((n) => n.id)).toEqual(['alice', 'bob', 'note']);

    const alice = nodes[0];
    expect(alice.label).toBe('Alice Martin CEO');
    expect(alice.shape).toBe('circle');
    expect(alice.fillColor).toBe('#dae8fc');
    expect(alice.strokeColor).toBe('#6c8ebf');
    expect(alice.properties).toEqual([
      { key: 'url', value: 'https://example.org/a', type: 'link' },
      { key: 'role', value: 'Gérante' },
    ]);
    expect({ x: alice.x, y: alice.y, width: alice.width, height: alice.height }).toEqual({ x: 100, y: 50, width: 120, height: 60 });
  });

  it('resolves group-relative geometry and skips empty groups', async () => {
    const { nodes } = await parseDrawio(wrap(MODEL));
    const bob = nodes.find((n) => n.id === 'bob')!;
    expect({ x: bob.x, y: bob.y }).toEqual({ x: 320, y: 210 });
    expect(bob.shape).toBe('diamond');
    expect(bob.dashed).toBe(true);
    expect(bob.fillColor).toBe('transparent');
    expect(nodes.some((n) => n.id === 'grp')).toBe(false);
  });

  it('flags free text', async () => {
    const { nodes } = await parseDrawio(wrap(MODEL));
    expect(nodes.find((n) => n.id === 'note')!.isText).toBe(true);
    expect(nodes.find((n) => n.id === 'alice')!.isText).toBe(false);
  });

  it('reads edges: default arrow, endArrow=none, startArrow, child labels', async () => {
    const { edges, warnings } = await parseDrawio(wrap(MODEL));
    expect(edges).toHaveLength(3);

    const [e1, e2, e3] = edges;
    expect(e1).toMatchObject({ source: 'alice', target: 'bob', label: 'dirige', direction: 'forward', style: 'solid', color: '#ff0000', width: 3 });
    expect(e2).toMatchObject({ source: 'bob', target: 'alice', label: 'connaît', direction: 'none', style: 'dashed' });
    expect(e3.direction).toBe('both');
    expect(warnings.some((w) => w.includes('1 connecteur'))).toBe(true);
  });

  it('inflates compressed diagrams', async () => {
    const plain = await parseDrawio(wrap(MODEL));
    const packed = await parseDrawio(wrap(compress(MODEL)));
    expect(packed.nodes).toEqual(plain.nodes);
    expect(packed.edges).toEqual(plain.edges);
  });

  it('parses a bare mxGraphModel', async () => {
    const { nodes, pageCount } = await parseDrawio(MODEL);
    expect(pageCount).toBe(1);
    expect(nodes).toHaveLength(3);
  });

  it('stacks pages vertically and keeps ids page-scoped', async () => {
    const { nodes, edges, pageCount, warnings } = await parseDrawio(wrap(MODEL, compress(MODEL)));
    expect(pageCount).toBe(2);
    expect(nodes).toHaveLength(6);
    expect(new Set(nodes.map((n) => n.id)).size).toBe(6);
    expect(edges.every((e) => e.source.split(':')[0] === e.target.split(':')[0])).toBe(true);

    const page1Bottom = Math.max(...nodes.filter((n) => n.id.startsWith('0:')).map((n) => n.y + n.height));
    const page2Top = Math.min(...nodes.filter((n) => n.id.startsWith('1:')).map((n) => n.y));
    expect(page2Top).toBeGreaterThan(page1Bottom);
    expect(warnings.some((w) => w.includes('2 pages'))).toBe(true);
  });

  it('turns embedded images into data URLs and remote images into url properties', async () => {
    const model = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="i1" value="" style="shape=image;image=data:image/png,iVBORw0KGgo=;" vertex="1" parent="1"><mxGeometry width="40" height="40" as="geometry"/></mxCell>
      <mxCell id="i2" value="Logo" style="image;image=https://example.org/logo.png;" vertex="1" parent="1"><mxGeometry width="40" height="40" as="geometry"/></mxCell>
    </root></mxGraphModel>`;
    const { nodes } = await parseDrawio(model);
    expect(nodes[0].imageData).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(nodes[1].imageData).toBeUndefined();
    expect(nodes[1].properties).toEqual([{ key: 'url', value: 'https://example.org/logo.png', type: 'link' }]);
  });

  it('rejects malformed XML', async () => {
    await expect(parseDrawio('<mxfile><diagram>')).rejects.toThrow();
  });
});
