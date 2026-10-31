import { describe, it, expect } from 'vitest';
import type { Element } from '../../types';
import { findMergeCandidates } from './candidates';

const el = (id: string, label: string, properties: [string, string][] = [], tags: string[] = []) =>
  ({ id, label, tags, properties: properties.map(([key, value]) => ({ key, value, type: 'text' })) }) as unknown as Element;

const rules = (c: { reasons: { rule: string }[] }) => c.reasons.map((r) => r.rule);

describe('findMergeCandidates', () => {
  it('pairs two records of one person, same phone written apart', () => {
    const [c, ...rest] = findMergeCandidates([
      el('a', 'Jean Dupont', [['Téléphone', '06 12 34 56 78']]),
      el('b', 'Jean Dupond', [['tel', '+33612345678']]),
      el('c', 'Marie Curie'),
    ]);
    expect(rest).toEqual([]);
    expect(c.elementIds).toEqual(['a', 'b']);
    expect(c.level).toBe('veryLikely');
    expect(rules(c)).toEqual(expect.arrayContaining(['sameIdentifier', 'phonetic']));
  });

  it('finds a name written in another order or with a typo', () => {
    const found = findMergeCandidates([
      el('a', 'DUPONT Jean'), el('b', 'Jean Dupont'),
      el('c', 'Société Générale Immobilière'), el('d', 'Societe Generale Imobiliere'),
    ]);
    expect(found.map((c) => c.elementIds.join('')).sort()).toEqual(['ab', 'cd']);
    const sameName = found.find((c) => c.elementIds[0] === 'a')!;
    expect(rules(sameName)).toContain('sameName');
    expect(sameName.level).toBe('likely');
    expect(found.find((c) => c.elementIds[0] === 'c')!.level).toBe('possible');
  });

  it('takes a phone number as a name for an identifier', () => {
    const [c] = findMergeCandidates([el('a', '06 12 34 56 78'), el('b', '+33 6 12 34 56 78')]);
    expect(c).toMatchObject({ elementIds: ['a', 'b'], level: 'veryLikely', reasons: [{ rule: 'sameIdentifier', kind: 'phone' }] });
  });

  it('never merges a number with the record that carries it', () => {
    expect(findMergeCandidates([
      el('a', 'Jean Dupont', [['tel', '06 12 34 56 78']]),
      el('b', '06 12 34 56 78'),
    ])).toEqual([]);
  });

  it('holds back what tells two things apart', () => {
    expect(findMergeCandidates([el('a', 'Lot 3'), el('b', 'Lot 4')])).toEqual([]);
    // A number in one name only says nothing against the pair
    const [plate] = findMergeCandidates([
      el('a', 'Peugeot 308', [['Plaque', 'AB-123-CD']]),
      el('b', 'Véhicule suspect', [['Immatriculation', 'ab 123 cd']]),
    ]);
    expect(plate.level).toBe('likely');
    // Same name, two phones: one person with two lines, or two of one name.
    // Proposed, the conflict shown, one level lower than the same name alone
    const [twoLines] = findMergeCandidates([
      el('a', 'Jean Martin', [['tel', '06 12 34 56 78']]),
      el('b', 'Jean Martin', [['tel', '07 98 76 54 32']]),
    ]);
    expect(twoLines.level).toBe('possible');
    expect(twoLines.reasons).toContainEqual({ rule: 'conflict', kind: 'phone' });
    // Close names only: possible, left out once likely ones only are asked
    expect(findMergeCandidates([el('a', 'Martin'), el('b', 'Marin')])[0].level).toBe('possible');
    expect(findMergeCandidates([el('a', 'Martin'), el('b', 'Marin')], { minRank: 2 })).toEqual([]);
  });

  it('uses the phone library when given', () => {
    const parse = (t: string) => (t.replace(/\D/g, '').endsWith('7911123456') ? '+447911123456' : null);
    const found = findMergeCandidates([
      el('a', 'Alpha', [['phone', '+44 7911 123456']]),
      el('b', 'Bravo', [['phone', '+44 (0)7911 123456']]),
    ], { parsePhone: parse });
    expect(found).toHaveLength(1);
    expect(found[0].reasons[0]).toMatchObject({ rule: 'sameIdentifier', kind: 'phone' });
  });

  it('stays fast on a large dossier', () => {
    const first = ['Jean', 'Marie', 'Pierre', 'Sophie', 'Luc', 'Anne', 'Paul', 'Julie'];
    const last = ['Dupont', 'Martin', 'Bernard', 'Thomas', 'Petit', 'Robert', 'Richard', 'Durand'];
    const elements = Array.from({ length: 5000 }, (_, i) =>
      el(`e${i}`, `${first[i % 8]} ${last[(i * 7) % 8]} ${i}`, [['tel', `06${String(10000000 + i).padStart(8, '0')}`]]));
    const t0 = performance.now();
    findMergeCandidates(elements);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});
