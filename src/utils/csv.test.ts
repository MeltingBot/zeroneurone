import { describe, it, expect } from 'vitest';
import { escapeCsvField, parseCSVLine, splitCSVRecords, unescapeCsvField } from './csv';

describe('splitCSVRecords', () => {
  it('splits plain rows and drops blank ones', () => {
    expect(splitCSVRecords('a;b\n1;2\n\n3;4\n')).toEqual(['a;b', '1;2', '3;4']);
  });

  it('normalises CRLF so the last column keeps no "\\r"', () => {
    expect(splitCSVRecords('label;telephone\r\nDUPONT;0634\r\n')).toEqual(['label;telephone', 'DUPONT;0634']);
  });

  it('keeps a line break inside a quoted cell (Excel Alt+Enter)', () => {
    expect(splitCSVRecords('label;notes\r\nDUPONT;"ligne 1\r\nligne 2"\r\nMARTIN;x\r\n'))
      .toEqual(['label;notes', 'DUPONT;"ligne 1\nligne 2"', 'MARTIN;x']);
  });

  it('is not confused by escaped quotes inside a quoted cell', () => {
    expect(splitCSVRecords('a\n"dit ""oui""\net non"\nb')).toEqual(['a', '"dit ""oui""\net non"', 'b']);
  });

  it('falls back to plain lines on an unbalanced quote rather than merging the rest of the file', () => {
    expect(splitCSVRecords('label\nécran 5" pouces\nMARTIN\nDURAND')).toEqual(['label', 'écran 5" pouces', 'MARTIN', 'DURAND']);
  });
});

describe('escapeCsvField', () => {
  it('opens formulas as text, so a spreadsheet does not run them', () => {
    expect(escapeCsvField('=HYPERLINK("http://x","clic")')).toBe(`"'=HYPERLINK(""http://x"",""clic"")"`);
    expect(escapeCsvField('+33 6 00')).toBe(`"'+33 6 00"`);
    expect(escapeCsvField('@cmd')).toBe(`"'@cmd"`);
  });

  it('leaves plain numbers as numbers, so a spreadsheet can still sum them', () => {
    expect(escapeCsvField('-1250')).toBe('-1250');
    expect(escapeCsvField('-0.75')).toBe('-0.75');
    expect(escapeCsvField('+12')).toBe('+12');
    expect(escapeCsvField('-3,5')).toBe('"-3,5"');
    // A formula starting like a number is still neutralised
    expect(escapeCsvField('-1+cmd|x')).toBe(`"'-1+cmd|x"`);
  });

  it('quotes delimiters, quotes and line breaks, and leaves plain text alone', () => {
    expect(escapeCsvField('Jean Dupont')).toBe('Jean Dupont');
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('a;b', ';')).toBe('"a;b"');
    expect(escapeCsvField('ligne\nsuivante')).toBe('"ligne\nsuivante"');
  });

  it('reads back to the original value', () => {
    for (const value of ['=1+1', '- point', '@x', 'plain', 'a,b']) {
      const [field] = parseCSVLine(escapeCsvField(value), ',');
      expect(unescapeCsvField(field)).toBe(value);
    }
  });
});
