import { describe, it, expect } from 'vitest';
import { fuzzyMatch } from './fuzzyMatch';

describe('fuzzyMatch', () => {
  it('ignores case and accents, and finds the query held as is', () => {
    expect(fuzzyMatch('Société Générale', 'societe gen')).toBe(true);
  });

  it('tolerates about one typo per five letters', () => {
    expect(fuzzyMatch('Jean Dupont', 'dupond')).toBe(true);
    expect(fuzzyMatch('Jean Martin', 'jean martn')).toBe(true);
    expect(fuzzyMatch('Jean Martin', 'jaen mrtni')).toBe(false);
  });

  it('needs every word, in any order', () => {
    expect(fuzzyMatch('Martin Jean', 'jean martin')).toBe(true);
    expect(fuzzyMatch('Jean Dupont', 'jean martin')).toBe(false);
  });

  it('keeps short words exact', () => {
    expect(fuzzyMatch('SAS', 'SAD')).toBe(false);
  });
});
