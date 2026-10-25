import { describe, it, expect } from 'vitest';
import type { Property } from '../types';
import { propertyRowKeys, removePropertyAt, updatePropertyAt } from './propertyRows';

const p = (key: string, value: string) => ({ key, value, type: 'text' }) as Property;
const merged = [p('Identité', 'SFR'), p('Sensibilité', 'Sans objet'), p('Identité', 'SOCIETE SU'), p('Identité', 'SOCIETE DU')];

describe('property rows sharing a key', () => {
  it('gives each row its own key', () => {
    const keys = propertyRowKeys(merged);
    expect(new Set(keys).size).toBe(4);
  });

  it('removes only the row asked', () => {
    expect(removePropertyAt(merged, 2).map((x) => x.value)).toEqual(['SFR', 'Sans objet', 'SOCIETE DU']);
  });

  it('changes only the row edited', () => {
    const out = updatePropertyAt(merged, 2, (prop) => ({ ...prop, value: 'SOCIETE DU' }));
    expect(out.map((x) => x.value)).toEqual(['SFR', 'Sans objet', 'SOCIETE DU', 'SOCIETE DU']);
  });
});
