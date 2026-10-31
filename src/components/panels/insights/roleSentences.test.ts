import { describe, it, expect } from 'vitest';
import { reportRef, roleSegments, segmentsToMarkdown, segmentsToText, type SentenceContext } from './roleSentences';

const templates: Record<string, string> = {
  'insights.roles.soleConnector': '{{x}} est le seul lien entre {{groups}}',
  'insights.roles.bridgeLink': 'Le lien {{x}} – {{y}} est le seul passage entre {{groups}}',
  'insights.roles.cutOff': '{{x}} est le seul accès à {{count}} éléments, dont {{y}}',
  'insights.roles.cutOffNamed': '{{x}} est le seul accès à {{names}}',
  'insights.roles.broker': '{{x}} fait le lien entre {{groups}}',
  'insights.roles.group': 'le groupe de {{lead}} ({{size}})',
};
const t = (key: string, o: Record<string, unknown> = {}) =>
  templates[key].replace(/\{\{(\w+)\}\}/g, (_, k) => String(o[k]));

const labels: Record<string, string> = { x: 'Karim', a: 'Alice', b: 'Bob [B|2]', c: 'Chloé', y: 'Yves' };
const ctx: SentenceContext = {
  t,
  labelOf: (id) => labels[id] ?? id,
  clusterLeads: { 0: 'a', 1: 'b', 2: 'c' },
  clusterSizes: new Map([[0, 8], [1, 5], [2, 3]]),
  locale: 'fr',
};
const side = (clusterId: number) => ({ clusterId, size: 1, leadId: '' });

describe('roleSegments', () => {
  it('names the sole connector and its two groups', () => {
    const segs = roleSegments({ kind: 'soleConnector', elementId: 'x', sides: [side(0), side(1)], others: 0, weight: 5 }, ctx);
    expect(segmentsToText(segs)).toBe('Karim est le seul lien entre le groupe de Alice (8) et le groupe de Bob [B|2] (5)');
    expect(segmentsToMarkdown(segs)).toBe(
      '[[Karim|x]] est le seul lien entre le groupe de [[Alice|a]] (8) et le groupe de [[Bob B 2|b]] (5)');
  });

  it('lists three groups the way the language does', () => {
    const segs = roleSegments({ kind: 'broker', elementId: 'x', clusterIds: [0, 1, 2], betweenness: 0.4, weight: 0 }, ctx);
    expect(segmentsToText(segs)).toBe(
      'Karim fait le lien entre le groupe de Alice (8), le groupe de Bob [B|2] (5) et le groupe de Chloé (3)');
  });

  it('says what an element alone gives access to', () => {
    const segs = roleSegments({ kind: 'cutOff', elementId: 'x', size: 4, leadId: 'y', cutIds: ['y', 'a', 'b', 'c'], weight: 4 }, ctx);
    expect(segmentsToMarkdown(segs)).toBe('[[Karim|x]] est le seul accès à 4 éléments, dont [[Yves|y]]');
  });

  it('names them all when they are few', () => {
    const segs = roleSegments({ kind: 'cutOff', elementId: 'x', size: 2, leadId: 'y', cutIds: ['y', 'a'], weight: 2 }, ctx);
    expect(segmentsToText(segs)).toBe('Karim est le seul accès à Alice et Yves');
  });
});

describe('reportRef', () => {
  it('keeps a reference whole whatever the label', () => {
    expect(reportRef('a|b]]c', 'id-1')).toBe('[[a b c|id-1]]');
    expect(reportRef('  ', 'id-1')).toBe('[[id-1|id-1]]');
  });
});
