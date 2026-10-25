import { describe, it, expect } from 'vitest';
import type { Element } from '../types';
import { mergePreview } from './mergePreview';

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
