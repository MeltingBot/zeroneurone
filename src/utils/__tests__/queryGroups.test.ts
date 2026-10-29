import { describe, it, expect } from 'vitest';
import { buildGroups } from '../queryGroups';
import type { Element, Link } from '../../types';

function el(id: string, o: Partial<Element> = {}): Element {
  return { id, label: id, tags: [], properties: [], parentGroupId: null, isGroup: false, ...o } as Element;
}
function lk(id: string, o: Partial<Link> = {}): Link {
  return { id, fromId: 'a', toId: 'b', label: id, tags: [], properties: [], ...o } as Link;
}

const outer = el('o', { label: 'Réseau', isGroup: true });
const group = el('g', { label: 'Équipe A', isGroup: true, parentGroupId: 'o' });
const a = el('a', { tags: ['personne', 'suspect'], parentGroupId: 'g', properties: [{ key: 'ville', value: 'Paris' }] });
const b = el('b', { tags: ['personne'], properties: [{ key: 'ville', value: 'Lyon' }, { key: 'pays', value: 'FR', type: 'country' }] });
const c = el('c', { properties: [{ key: 'ville', value: 'Paris' }] });
const l = lk('l', { tags: ['suspect'] });
const elements = new Map([outer, group, a, b, c].map((e) => [e.id, e]));
const links = new Map([[l.id, l]]);
const all = new Set(['a', 'b', 'c']);

describe('buildGroups', () => {
  it('counts an item in each of its tags, largest first, no value last', () => {
    const groups = buildGroups(all, new Set(['l']), elements, links, 'tag');
    expect(groups.map((g) => [g.value, g.elementIds.length + g.linkIds.length])).toEqual([
      ['personne', 2], ['suspect', 2], [null, 1],
    ]);
    expect(groups[1].linkIds).toEqual(['l']);
  });

  it('groups by canvas group, enclosing groups included (as the in_group query)', () => {
    const groups = buildGroups(all, new Set(), elements, links, 'in_group');
    expect(groups.map((g) => [g.value, g.elementIds])).toEqual([
      ['Équipe A', ['a']], ['Réseau', ['a']], [null, ['b', 'c']],
    ]);
  });

  it('groups by country properties and by a free property', () => {
    expect(buildGroups(all, new Set(), elements, links, 'country').map((g) => g.value)).toEqual(['FR', null]);
    expect(buildGroups(all, new Set(), elements, links, 'ville').map((g) => [g.value, g.elementIds])).toEqual([
      ['Paris', ['a', 'c']], ['Lyon', ['b']],
    ]);
  });
});
