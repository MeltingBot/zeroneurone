import { describe, it, expect } from 'vitest';
import type { Element } from '../types';
import { mergePreview, mergeChoices, keptValues, tagChoiceId, propertyChoiceId } from './mergePreview';

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
