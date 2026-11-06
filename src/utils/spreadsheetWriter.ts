// Workbooks (XLSX, ODS) written from tables, several sheets each. Both
// formats are ZIP archives of XML: JSZip (already used for the ZN archives)
// is enough, no dependency added. The reading side is spreadsheet.ts.
import JSZip from 'jszip';

/** A cell: text, number, date (with its time unless at local midnight), or empty */
export type SheetCell = string | number | Date | null;

export interface SheetData {
  name: string;
  columns: string[];
  rows: SheetCell[][];
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ODS_MIME = 'application/vnd.oasis.opendocument.spreadsheet';

/** Text for XML: escaped, control characters other than tab and line breaks dropped */
function xml(text: string): string {
  return text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** A date at local midnight is a day; otherwise it has its time */
const isDay = (d: Date) => d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0;

/** Local wall clock as ISO without zone: "2024-02-10T09:15:30" (spreadsheets have no zones) */
function localIso(d: Date): string {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Text a spreadsheet shows for a date, before its own formatting applies */
function dateText(d: Date): string {
  const day = `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return isDay(d) ? day : `${day} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Sheet names as both formats accept them: no `[]:*?/\`, 31 characters at
 * most, not empty, each one different.
 */
function sheetNames(sheets: SheetData[]): string[] {
  const used = new Set<string>();
  return sheets.map((sheet, i) => {
    const base = (sheet.name.replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim() || `Sheet${i + 1}`).slice(0, 31);
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
    used.add(name.toLowerCase());
    return name;
  });
}

// ── XLSX ────────────────────────────────────────────────────────

/** "A", "B", …, "Z", "AA" */
function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

/** Serial day number of a local wall clock (1900 date system) */
function excelSerial(d: Date): number {
  const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
  return (utc - Date.UTC(1899, 11, 30)) / 86_400_000;
}

// Cell styles (cellXfs): 0 plain, 1 day (numFmt 14), 2 day and time (numFmt 22), 3 header (bold)
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="22" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function xlsxCell(ref: string, value: SheetCell, header = false): string {
  if (value === null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `<c r="${ref}" s="${isDay(value) ? 1 : 2}"><v>${excelSerial(value)}</v></c>`;
  }
  const text = xml(String(value));
  return `<c r="${ref}" t="inlineStr"${header ? ' s="3"' : ''}><is><t xml:space="preserve">${text}</t></is></c>`;
}

function xlsxSheet(sheet: SheetData): string {
  const width = sheet.columns.length;
  const lastCol = columnName(Math.max(0, width - 1));
  const rows = [sheet.columns, ...sheet.rows].map((row, r) => {
    const cells = row.slice(0, width).map((v, c) => xlsxCell(`${columnName(c)}${r + 1}`, v, r === 0)).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  }).join('');
  const cols = width > 0
    ? `<cols>${sheet.columns.map((name, c) => `<col min="${c + 1}" max="${c + 1}" width="${Math.min(60, Math.max(10, name.length + 4))}" customWidth="1"/>`).join('')}</cols>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
${cols}<sheetData>${rows}</sheetData>${width > 0 ? `<autoFilter ref="A1:${lastCol}${sheet.rows.length + 1}"/>` : ''}
</worksheet>`;
}

/** An XLSX workbook, one worksheet per table; the header row frozen and filterable */
export async function buildXlsx(sheets: SheetData[]): Promise<Blob> {
  const names = sheetNames(sheets);
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
  // The filter of each sheet is named, as spreadsheet programs write it
  const filters = sheets.map((sheet, i) => (sheet.columns.length > 0
    ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xml(names[i].replace(/'/g, "''"))}'!$A$1:$${columnName(sheet.columns.length - 1)}$${sheet.rows.length + 1}</definedName>`
    : '')).join('');
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${names.map((name, i) => `<sheet name="${xml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
${filters ? `<definedNames>${filters}</definedNames>` : ''}
</workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  zip.file('xl/styles.xml', STYLES_XML);
  sheets.forEach((sheet, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, xlsxSheet(sheet)));
  return zip.generateAsync({ type: 'blob', mimeType: XLSX_MIME, compression: 'DEFLATE' });
}

// ── ODS ─────────────────────────────────────────────────────────

/** A paragraph of a cell: runs of spaces, tabs and line breaks as ODS writes them */
function odsParagraph(text: string): string {
  return xml(text)
    .replace(/\t/g, '<text:tab/>')
    .replace(/\r?\n/g, '<text:line-break/>')
    .replace(/ {2,}/g, (spaces) => ` <text:s text:c="${spaces.length - 1}"/>`);
}

function odsCell(value: SheetCell, header = false): string {
  if (value === null || value === '') return '<table:table-cell/>';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<table:table-cell office:value-type="float" office:value="${value}"><text:p>${value}</text:p></table:table-cell>`;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const iso = isDay(value) ? localIso(value).slice(0, 10) : localIso(value);
    return `<table:table-cell table:style-name="${isDay(value) ? 'ceDay' : 'ceTime'}" office:value-type="date" office:date-value="${iso}"><text:p>${dateText(value)}</text:p></table:table-cell>`;
  }
  return `<table:table-cell${header ? ' table:style-name="ceHead"' : ''} office:value-type="string"><text:p>${odsParagraph(String(value))}</text:p></table:table-cell>`;
}

/** An ODS workbook (LibreOffice / OpenOffice Calc), one sheet per table */
export async function buildOds(sheets: SheetData[]): Promise<Blob> {
  const names = sheetNames(sheets);
  const tables = sheets.map((sheet, i) => {
    const width = sheet.columns.length;
    const rows = [sheet.columns, ...sheet.rows]
      .map((row, r) => `<table:table-row>${row.slice(0, width).map((v) => odsCell(v, r === 0)).join('')}</table:table-row>`)
      .join('');
    return `<table:table table:name="${xml(names[i])}"><table:table-column table:number-columns-repeated="${Math.max(1, width)}"/>${rows}</table:table>`;
  }).join('');
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.3">
<office:automatic-styles>
<number:date-style style:name="NDay"><number:year number:style="long"/><number:text>-</number:text><number:month number:style="long"/><number:text>-</number:text><number:day number:style="long"/></number:date-style>
<number:date-style style:name="NTime"><number:year number:style="long"/><number:text>-</number:text><number:month number:style="long"/><number:text>-</number:text><number:day number:style="long"/><number:text> </number:text><number:hours number:style="long"/><number:text>:</number:text><number:minutes number:style="long"/></number:date-style>
<style:style style:name="ceDay" style:family="table-cell" style:data-style-name="NDay"/>
<style:style style:name="ceTime" style:family="table-cell" style:data-style-name="NTime"/>
<style:style style:name="ceHead" style:family="table-cell"><style:text-properties fo:font-weight="bold"/></style:style>
</office:automatic-styles>
<office:body><office:spreadsheet>${tables}</office:spreadsheet></office:body>
</office:document-content>`;
  const zip = new JSZip();
  // The mimetype comes first, uncompressed: how readers recognise the format
  zip.file('mimetype', ODS_MIME, { compression: 'STORE' });
  zip.file('META-INF/manifest.xml', `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
<manifest:file-entry manifest:full-path="/" manifest:media-type="${ODS_MIME}"/>
<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`);
  zip.file('content.xml', content);
  return zip.generateAsync({ type: 'blob', mimeType: ODS_MIME, compression: 'DEFLATE' });
}
