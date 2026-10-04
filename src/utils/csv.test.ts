import { describe, it, expect } from 'vitest';
import { splitCSVRecords } from './csv';

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
