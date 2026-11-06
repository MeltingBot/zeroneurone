import { describe, it, expect } from 'vitest';
import type { Element, Link } from '../types';
import { mergePreview, mergeChoices, keptValues, tagChoiceId, propertyChoiceId, sameLinkContent } from './mergePreview';

const el = (id: string, notes: string, props: [string, string][]) =>
  ({ id, notes, properties: props.map(([key, value]) => ({ key, value, type: 'text' })) }) as unknown as Element;

describe('mergePreview', () => {
  it('counts the notes put end to end, the properties kept and the keys with several values', () => {
    const target = el('t', 'vu le 12', [['marque', 'Bosch'], ['n° série', 'A1']]);
    const sources = [
      el('a', '', [['marque', 'Bosch']]),
      el('b', 'volé de nuit', [['marque', 'Makita'], ['couleur', 'bleu']]),
      el('c', '   ', [['n° série', 'A1']]),
    ];
    expect(mergePreview(target, sources)).toEqual({ notesCount: 2, propertyCount: 4, multiValueKeys: 1 });
  });

  it('is quiet when there is nothing to warn about', () => {
    expect(mergePreview(el('t', '', []), [el('a', '', [])])).toEqual({ notesCount: 0, propertyCount: 0, multiValueKeys: 0 });
  });
});

const tagged = (id: string, tags: string[], props: [string, unknown][]) =>
  ({ id, tags, properties: props.map(([key, value]) => ({ key, value, type: value instanceof Date ? 'date' : 'text' })) }) as unknown as Element;

describe('mergeChoices', () => {
  const target = tagged('t', ['Personne', 'Suspect'], [['ville', 'Paris'], ['tel', '0601'], ['naissance', new Date(2000, 0, 2)]]);
  const source = tagged('s', ['Personne'], [['ville', 'Lyon'], ['tel', '0601'], ['naissance', new Date(2000, 0, 2)], ['email', 'a@b.fr']]);
  const choices = mergeChoices(target, [source]);

  it('puts the kept element first and lists each key once, in order of appearance', () => {
    expect(choices.columns.map((c) => c.element.id)).toEqual(['t', 's']);
    expect(choices.keys).toEqual(['ville', 'tel', 'naissance', 'email']);
  });

  it('makes one choice of a tag or value held by both, equal dates included', () => {
    expect(choices.columns[0].tags[0]).toBe(choices.columns[1].tags[0]);
    expect(choices.columns[0].properties.get('tel')![0]).toBe(choices.columns[1].properties.get('tel')![0]);
    expect(choices.columns[0].properties.get('naissance')![0]).toBe(choices.columns[1].properties.get('naissance')![0]);
    expect(choices.all).toHaveLength(2 + 5);
  });

  it('tells the keys whose values differ', () => {
    expect([...choices.conflicts]).toEqual(['ville']);
  });

  it('gives what the kept element ends with, from the choices kept', () => {
    const drop = new Set([tagChoiceId('Suspect'), propertyChoiceId({ key: 'ville', value: 'Paris' })]);
    const kept = new Set(choices.all.map((c) => c.id).filter((id) => !drop.has(id)));
    const { tags, properties } = keptValues(choices, kept);
    expect(tags).toEqual(['Personne']);
    expect(properties.map((p) => [p.key, p.value instanceof Date ? 'date' : p.value])).toEqual([
      ['tel', '0601'], ['naissance', 'date'], ['ville', 'Lyon'], ['email', 'a@b.fr'],
    ]);
  });
});

describe('sameLinkContent', () => {
  const link = (over: Partial<Link> = {}) => ({
    fromId: 'a', toId: 'c', direction: 'forward', label: 'appel', date: null, dateRange: null, properties: [], ...over,
  }) as Link;

  it('is the same link only with the same ends, direction, label, dates and properties', () => {
    expect(sameLinkContent(link(), link())).toBe(true);
    expect(sameLinkContent(link(), link({ label: 'virement' }))).toBe(false);
    expect(sameLinkContent(link(), link({ toId: 'd' }))).toBe(false);
    expect(sameLinkContent(link(), link({ fromId: 'c', toId: 'a' }))).toBe(false);
    expect(sameLinkContent(link(), link({ dateRange: { start: new Date(2024, 0, 1), end: new Date(2024, 0, 1) } }))).toBe(false);
    expect(sameLinkContent(link(), link({ properties: [{ key: 'montant', value: 20 }] }))).toBe(false);
  });

  it('takes the ends either way when neither link is directed, and equal dates as equal', () => {
    expect(sameLinkContent(link({ direction: 'none' }), link({ direction: 'none', fromId: 'c', toId: 'a' }))).toBe(true);
    const day = (d: number) => ({ start: new Date(2024, 0, d), end: new Date(2024, 0, d) });
    expect(sameLinkContent(link({ dateRange: day(1) }), link({ dateRange: day(1) }))).toBe(true);
    expect(sameLinkContent(link({ dateRange: day(1) }), link({ dateRange: day(2) }))).toBe(false);
  });
});
