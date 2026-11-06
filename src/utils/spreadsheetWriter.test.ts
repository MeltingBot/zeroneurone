// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { buildXlsx, buildOds, type SheetData } from './spreadsheetWriter';
import { readSpreadsheet } from './spreadsheet';

const SHEETS: SheetData[] = [
  {
    name: 'Éléments',
    columns: ['Nom', 'Montant', 'Naissance'],
    rows: [
      ['Jean <Martin> & fils', 120.5, new Date(1979, 2, 29)],
      ['Paul  Durand', null, null],
    ],
  },
  {
    name: 'Liens',
    columns: ['De', 'Vers', 'Date début'],
    rows: [['Jean', 'Paul', new Date(2024, 1, 10, 9, 15, 30)]],
  },
];

/** The file as the import reads it back: sheets of text */
async function readBack(blob: Blob, name: string) {
  return readSpreadsheet(new Uint8Array(await blob.arrayBuffer()), name);
}

describe.each([
  ['xlsx', buildXlsx],
  ['ods', buildOds],
])('%s', (ext, build) => {
  it('writes one sheet per table, with its header and typed values', async () => {
    const sheets = await readBack(await build(SHEETS), `matrice.${ext}`);
    expect(sheets.map((s) => s.name)).toEqual(['Éléments', 'Liens']);
    expect(sheets[0].rows[0]).toEqual(['Nom', 'Montant', 'Naissance']);
    expect(sheets[0].rows[1]).toEqual(['Jean <Martin> & fils', '120.5', '1979-03-29']);
    expect(sheets[0].rows[2][0]).toBe('Paul  Durand');
    expect(sheets[1].rows[1]).toEqual(['Jean', 'Paul', '2024-02-10 09:15:30']);
  });
});

describe('sheet names', () => {
  it('drops the characters spreadsheets refuse and keeps names apart', async () => {
    const sheets = await readBack(await buildXlsx([
      { name: 'A/B', columns: ['x'], rows: [] },
      { name: 'a b', columns: ['x'], rows: [] },
    ]), 'n.xlsx');
    expect(sheets.map((s) => s.name)).toEqual(['A B', 'a b 2']);
  });
});

describe('ods', () => {
  it('puts the uncompressed mimetype first', async () => {
    const zip = await JSZip.loadAsync(await (await buildOds(SHEETS)).arrayBuffer());
    expect(Object.keys(zip.files)[0]).toBe('mimetype');
    expect(await zip.file('mimetype')!.async('string')).toBe('application/vnd.oasis.opendocument.spreadsheet');
  });
});
