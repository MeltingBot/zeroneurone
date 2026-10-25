import { describe, it, expect } from 'vitest';
import type { Element, SuggestedProperty } from '../types';
import { planTagSetApply } from './tagSetApply';

const el = (id: string, tags: string[], props: [string, string][] = []) =>
  ({ id, tags, properties: props.map(([key, value]) => ({ key, value, type: 'text' })), visual: { color: '#fff', shape: 'circle' } }) as unknown as Element;
const prop = (key: string): SuggestedProperty => ({ key, type: 'text', description: '', placeholder: '' });

describe('planTagSetApply', () => {
  const elements = [
    el('a', ['Victime'], [['Nom', 'Durand']]),
    el('b', ['Suspect', 'victime']),
    el('c', ['Objet']),
  ];

  it('gives the appearance to the elements whose main tag it is, only the fields set', () => {
    const plan = planTagSetApply(elements, 'Victime', { color: '#f00', shape: null, icon: 'user' }, []);
    expect(plan.visualIds).toEqual(['a']);
    expect(plan.visual).toEqual({ color: '#f00', icon: 'user' });
  });

  it('leaves out the elements that already look so', () => {
    const plan = planTagSetApply(elements, 'Victime', { color: '#fff', shape: 'circle', icon: null }, []);
    expect(plan.visualIds).toEqual([]);
  });

  it('adds the missing suggested properties, empty, to every element carrying the tag', () => {
    const plan = planTagSetApply(elements, 'Victime', { color: null, shape: null, icon: null }, [prop('Nom'), prop('Téléphone')]);
    expect(plan.visualIds).toEqual([]);
    expect(plan.propertyChanges.map((c) => [c.id, c.after.map((p) => `${p.key}=${p.value}`)])).toEqual([
      ['a', ['Nom=Durand', 'Téléphone=']],
      ['b', ['Nom=', 'Téléphone=']],
    ]);
  });
});
