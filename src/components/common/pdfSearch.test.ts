import { describe, it, expect } from 'vitest';
import { buildPageText, findMatches, type PdfTextItem } from './pdfSearch';

const page = (...items: PdfTextItem[]) => buildPageText(items);

describe('findMatches', () => {
  it('ignores case and accents and reports the source offsets', () => {
    const matches = findMatches([page({ str: 'Le Général arrive' })], 'general');
    expect(matches).toEqual([{ page: 1, ranges: [{ item: 0, from: 3, to: 10 }] }]);
  });

  it('matches across items split inside a word', () => {
    const matches = findMatches([page({ str: 'Zero' }, { str: 'Neurone' })], 'zeroneurone');
    expect(matches[0].ranges).toEqual([
      { item: 0, from: 0, to: 4 },
      { item: 1, from: 0, to: 7 },
    ]);
  });

  it('treats a line break as a space and collapses whitespace', () => {
    const pages = [page({ str: 'fin de', hasEOL: true }, { str: 'ligne' })];
    expect(findMatches(pages, 'de   ligne')).toHaveLength(1);
    expect(findMatches(pages, 'deligne')).toHaveLength(0);
  });

  it('expands ligatures', () => {
    const matches = findMatches([page({ str: 'le ﬁchier' })], 'fichier');
    expect(matches[0].ranges).toEqual([{ item: 0, from: 3, to: 9 }]);
  });

  it('returns non-overlapping matches in page order', () => {
    const matches = findMatches([page({ str: 'aaa' }), page({ str: 'xa' })], 'aa');
    expect(matches.map((m) => m.page)).toEqual([1]);
    expect(findMatches([page({ str: 'aaaa' })], 'aa')).toHaveLength(2);
  });

  it('finds nothing for a blank query', () => {
    expect(findMatches([page({ str: 'texte' })], '   ')).toEqual([]);
  });
});
