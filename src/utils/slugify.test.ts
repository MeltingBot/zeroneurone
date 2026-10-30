import { describe, it, expect } from 'vitest';
import { createSlugger, slugify } from './slugify';

describe('slugify', () => {
  it('drops accents and joins words with dashes', () => {
    expect(slugify('Éléments clés : synthèse')).toBe('elements-cles-synthese');
  });

  it('keeps anchors unique within a document', () => {
    const slug = createSlugger();
    expect([slug('Contexte'), slug('Contexte'), slug('???'), slug('')]).toEqual(['contexte', 'contexte-2', 'section', 'section-2']);
  });
});
