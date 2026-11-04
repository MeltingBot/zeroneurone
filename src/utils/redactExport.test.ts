import { describe, it, expect } from 'vitest';
import type { CanvasTab, Comment, Dossier, Element, Link, Report, SavedQuery, View } from '../types';
import { redactExport, REDACTED } from './redactExport';
import { buildANXExport } from '../services/exportANX';

const SECRET = 'SECRET';

const dossier = {
  id: 'd1', name: `${SECRET} dossier`, description: `${SECRET} desc`, creator: `${SECRET} creator`,
  tags: [`${SECRET} client`], properties: [{ key: 'k', value: `${SECRET} v` }],
  settings: { existingTags: ['Personne'] },
} as unknown as Dossier;

function element(id: string, x: number): Element {
  return {
    id, dossierId: 'd1', label: `${SECRET} ${id}`, notes: `${SECRET} notes`, source: `${SECRET} source`,
    tags: ['Personne'], properties: [{ key: 'Téléphone', value: `${SECRET} 06`, type: 'text' }],
    confidence: 70, date: new Date(2026, 0, 2), dateRange: null, position: { x, y: 0 },
    geo: { type: 'point', lat: 48.85, lng: 2.35 },
    events: [{
      id: `ev-${id}`, date: new Date(2026, 1, 3), label: `${SECRET} event`, description: `${SECRET} d`,
      source: `${SECRET} s`, properties: [{ key: 'k', value: `${SECRET} p` }], geo: { type: 'point', lat: 1, lng: 2 },
    }],
    visual: { color: '#ff0000', borderColor: '#000', shape: 'circle', size: 'medium', icon: null, image: 'a1' },
    assetIds: ['a1'], parentGroupId: null, isGroup: false, isAnnotation: false, childIds: [],
  } as unknown as Element;
}

const elements = [element('e1', 0), element('e2', 100)];
const links = [{
  id: 'l1', fromId: 'e1', toId: 'e2', label: `${SECRET} link`, notes: `${SECRET} n`, source: `${SECRET} s`,
  tags: ['Appel'], properties: [{ key: 'k', value: `${SECRET} p` }], direction: 'forward',
  date: new Date(2026, 3, 4), dateRange: null, visual: { color: '#000', style: 'solid', thickness: 2 },
}] as unknown as Link[];

const full = {
  dossier, elements, links,
  assets: [{ id: 'a1', filename: `${SECRET}.jpg`, extractedText: `${SECRET}` }] as never,
  report: { id: 'r', title: `${SECRET} report`, sections: [] } as unknown as Report,
  tabs: [{ id: 't1', name: `${SECRET} tab`, memberElementIds: ['e1'] }] as unknown as CanvasTab[],
  views: [{
    id: 'v1', name: `${SECRET} view`, filters: { textSearch: `${SECRET}`, includeTags: ['Personne'] },
    query: { text: `label = "${SECRET}"`, outputMode: 'canvas' },
  }] as unknown as View[],
  queries: [{ id: 'q1', name: `${SECRET} q`, queryText: `${SECRET}` }] as unknown as SavedQuery[],
  queryHistory: [`${SECRET}`],
  comments: [{ id: 'c1', content: `${SECRET} comment` }] as unknown as Comment[],
};

describe('redactExport', () => {
  it('leaves no free text anywhere', () => {
    expect(JSON.stringify(redactExport(full))).not.toContain(SECRET);
  });

  it('removes locations and attached files', () => {
    const out = redactExport(full);
    for (const el of out.elements) {
      expect(el.geo).toBeNull();
      expect(el.events[0].geo).toBeUndefined();
      expect(el.assetIds).toEqual([]);
      expect(el.visual.image).toBeNull();
    }
    expect(out.assets).toEqual([]);
    expect(out.report).toBeNull();
  });

  it('keeps the structure: ids, endpoints, positions, dates, tags, confidence', () => {
    const out = redactExport(full);
    expect(out.elements.map((e) => [e.id, e.position.x, e.tags, e.confidence, e.date])).toEqual(
      elements.map((e) => [e.id, e.position.x, e.tags, e.confidence, e.date]),
    );
    expect(out.elements[0].events[0].date).toEqual(elements[0].events[0].date);
    expect(out.links[0]).toMatchObject({ id: 'l1', fromId: 'e1', toId: 'e2', tags: ['Appel'], direction: 'forward' });
    expect(out.tabs?.[0].memberElementIds).toEqual(['e1']);
    expect(out.views?.[0].filters.includeTags).toEqual(['Personne']);
  });

  it('numbers the elements, so formats keyed by label do not merge them', () => {
    const out = redactExport(full);
    expect(out.elements.map((e) => e.label)).toEqual([`${REDACTED} 1`, `${REDACTED} 2`]);
    const identities = [...buildANXExport(out.dossier, out.elements, out.links).matchAll(/<Entity[^>]*?\sIdentity="([^"]*)"/g)]
      .map((m) => m[1]);
    expect(identities).toEqual([`${REDACTED} 1`, `${REDACTED} 2`]);
  });

  it('leaves the original data untouched', () => {
    redactExport(full);
    expect(elements[0].label).toBe(`${SECRET} e1`);
    expect(dossier.name).toBe(`${SECRET} dossier`);
  });

  it('keeps absent parts absent', () => {
    const out = redactExport({ dossier, elements, links });
    expect(out.assets).toBeUndefined();
    expect(out.report).toBeUndefined();
    expect(out.comments).toBeUndefined();
  });
});
