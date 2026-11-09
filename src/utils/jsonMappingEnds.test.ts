import { describe, expect, it } from 'vitest';
import { endIdentityFields, endIdentityKey, type FieldMapping } from './jsonMapping';

const f = (m: Partial<FieldMapping>): FieldMapping => ({ enabled: true, target: 'property', propKey: '', ...m });

describe('link end identity', () => {
  it('keeps the value alone without identifying fields', () => {
    expect(endIdentityKey(' 0601 ', { x: 'a' }, [])).toBe('0601');
  });

  it('tells homonyms apart by their identifying fields', () => {
    const a = endIdentityKey('ARMANDO', { prenom: 'Jean', ne: '1960' }, ['prenom', 'ne']);
    const b = endIdentityKey('ARMANDO', { prenom: 'Paul', ne: '1960' }, ['prenom', 'ne']);
    expect(a).not.toBe(b);
    // The same row written again is the same element (ids compared as idKey)
    expect(endIdentityKey('ARMANDO', { prenom: ' Jean ', ne: 1960 }, ['prenom', 'ne'])).toBe(a);
  });

  it('a missing identifying value makes an element of its own', () => {
    expect(endIdentityKey('ARMANDO', { prenom: 'Jean' }, ['prenom', 'ne']))
      .not.toBe(endIdentityKey('ARMANDO', { prenom: 'Jean', ne: '1960' }, ['prenom', 'ne']));
  });

  it('lists the enabled fields identifying one end', () => {
    const mapping = {
      prenom: f({ holder: 'from', identifies: true }),
      csp: f({ holder: 'from' }),
      code: f({ holder: 'to', identifies: true }),
      off: f({ holder: 'from', identifies: true, enabled: false }),
    };
    expect(endIdentityFields(mapping, 'from')).toEqual(['prenom']);
    expect(endIdentityFields(mapping, 'to')).toEqual(['code']);
  });
});
