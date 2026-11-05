// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readSpreadsheet, sheetsWithData, sheetToCsv, sheetAsCsvFile, isSpreadsheetFile } from './spreadsheet';
import { csvToRecords } from './csv';
import { parseFlexibleDate } from './index';

/** Same workbook written by openpyxl, then converted by LibreOffice to ODS and back to XLSX */
const FIXTURES = ['openpyxl.xlsx', 'libreoffice.ods', 'libreoffice.xlsx'];

/**
 * Sheet "Formats": postcode 1000 as "00000", phone 612345678 as
 * "0# ## ## ## ##", 15 % as a percentage, 1234.56 as an amount in euros,
 * 12345.6 with grouping. What the spreadsheet shows when it changes the
 * digits or the meaning, the number otherwise. LibreOffice rewrites the phone
 * format without its leading zero when it saves as XLSX.
 */
const FORMATS: Record<string, string[]> = {
  'openpyxl.xlsx': ['01000', '06 12 34 56 78', '15%', '1234.56', '12345.6'],
  'libreoffice.ods': ['01000', '06 12 34 56 78', '15 %', '1234.56', '12345.6'],
  'libreoffice.xlsx': ['01000', '612345678', '15 %', '1234.56', '12345.6'],
};
const load = (name: string) => {
  // A Uint8Array: JSZip does not take an ArrayBuffer from Node's realm under jsdom
  return new Uint8Array(readFileSync(join(__dirname, '__fixtures__', 'spreadsheet', name)));
};

describe.each(FIXTURES)('readSpreadsheet (%s)', (name) => {
  it('gives every sheet, in order, as text', async () => {
    const sheets = await readSpreadsheet(load(name), name);
    expect(sheets.map((s) => s.name)).toEqual(['Personnes', 'Vide', 'Liens', 'Formats']);
    expect(sheetsWithData(sheets).map((s) => s.name)).toEqual(['Personnes', 'Liens', 'Formats']);

    const [people, , links] = sheets;
    expect(people.rows[0]).toEqual(['label', 'Téléphone', 'Naissance', 'Appel', 'Heure', 'Montant', 'Actif', 'Note']);
    // Leading zero kept (text cell), dates and times as the CSV import reads them,
    // quotes, commas and line breaks kept
    expect(people.rows[1]).toEqual([
      'Jean Dupont', '0601020304', '1980-04-18', '2026-11-05 14:32:30', '09:05', '1234.5', 'true', 'dit "bonjour", puis\nraccroche',
    ]);
    // Empty cells kept in place, trailing ones removed
    expect(people.rows[2].slice(0, 7)).toEqual(['Marie Martin', '', '1975-12-01', '2026-11-05 14:33', '', '0.1', 'false']);
    expect(links.rows).toEqual([['from', 'to', 'type'], ['Jean Dupont', 'Marie Martin', 'Appel']]);
  });

  it('keeps what a format shows when it changes the digits or the meaning', async () => {
    const formats = (await readSpreadsheet(load(name), name))[3];
    expect(formats.rows[1]).toEqual(FORMATS[name]);
  });
});

describe('sheetToCsv', () => {
  it('is read back by the CSV import as the same records', async () => {
    const [people] = await readSpreadsheet(load('openpyxl.xlsx'), 'openpyxl.xlsx');
    const { headers, records } = csvToRecords(sheetToCsv(people.rows));
    expect(headers).toEqual(people.rows[0]);
    expect(records[0].Note).toBe('dit "bonjour", puis\nraccroche');
    expect(records[1].Note).toBe('');
    expect(parseFlexibleDate(records[0].Appel)).toEqual(new Date(2026, 10, 5, 14, 32, 30));
    expect(parseFlexibleDate(records[0].Naissance)).toEqual(new Date(1980, 3, 18));
  });

  it('names the file after the workbook, and the sheet when there are several', () => {
    const sheet = { name: 'Liens', rows: [['a'], ['b']] };
    expect(sheetAsCsvFile('Enquête.xlsx', sheet, false).name).toBe('Enquête - Liens.csv');
    expect(sheetAsCsvFile('Enquête.ods', sheet, true).name).toBe('Enquête.csv');
    expect(isSpreadsheetFile('a.XLSX') && isSpreadsheetFile('b.ods') && !isSpreadsheetFile('c.odt')).toBe(true);
  });

  it('rejects a file that is not a workbook', async () => {
    await expect(readSpreadsheet(new TextEncoder().encode('label\nA'), 'x.xlsx')).rejects.toThrow();
  });
});
