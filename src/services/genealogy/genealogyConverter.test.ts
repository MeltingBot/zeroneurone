import { describe, expect, it } from 'vitest';
import { convertToZeroNeurone } from './genealogyConverter';
import { DEFAULT_GENEALOGY_IMPORT_OPTIONS, type GenealogyData } from './types';

function data(persons: GenealogyData['persons']): GenealogyData {
  return { format: 'gedcom-5.5.1', fileName: 'test.ged', persons, families: [], metadata: {} } as GenealogyData;
}

describe('genealogy dates keep their precision', () => {
  const result = convertToZeroNeurone(data([{
    id: '@I1@', firstName: 'Jean', lastName: 'Martin', sex: 'M', familiesAsSpouse: [],
    birthDate: { year: 1890, modifier: 'about', raw: 'ABT 1890' },
    deathDate: { year: 1950, month: 3, modifier: 'exact', raw: 'MAR 1950' },
  }]), 'dossier-1', { ...DEFAULT_GENEALOGY_IMPORT_OPTIONS, autoLayout: false });
  const person = result.elements[0];

  it('marks a year-only, approximate birth as such', () => {
    const birth = person.events?.find((e) => e.date.getFullYear() === 1890);
    expect(birth?.precision).toBe('year');
    expect(birth?.approximate).toBe(true);
  });

  it('marks a month-only death as such', () => {
    const death = person.events?.find((e) => e.date.getFullYear() === 1950);
    expect(death?.precision).toBe('month');
    expect(death?.approximate).toBeUndefined();
  });

  it('gives the lifespan the coarser precision of its bounds', () => {
    expect(person.dateRange?.precision).toBe('year');
    expect(person.dateRange?.approximate).toBe(true);
  });
});
