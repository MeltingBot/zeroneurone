// Spreadsheets (XLSX, ODS) read as tables of text, to be imported as CSV.
// Both formats are ZIP archives of XML: JSZip (already used for the ZN
// archives) and the browser's DOMParser are enough, no dependency added.
import JSZip from 'jszip';

export interface SheetTable {
  name: string;
  /** Rows of cells as text; the first one is the header. Trailing empty rows and columns removed. */
  rows: string[][];
}

const SPREADSHEET_RE = /\.(xlsx|xlsm|ods)$/i;

export function isSpreadsheetFile(name: string): boolean {
  return SPREADSHEET_RE.test(name);
}

/** The sheets of a workbook, in workbook order (empty ones included) */
export async function readSpreadsheet(data: ArrayBuffer | Uint8Array | Blob, name: string): Promise<SheetTable[]> {
  const zip = await JSZip.loadAsync(data);
  return /\.ods$/i.test(name) ? readOds(zip) : readXlsx(zip);
}

/** Sheets holding at least a header and one row */
export function sheetsWithData(sheets: SheetTable[]): SheetTable[] {
  return sheets.filter((s) => s.rows.length >= 2);
}

/** A table as CSV (comma, quotes where needed), as the CSV import reads it */
export function sheetToCsv(rows: string[][]): string {
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return rows
    .map((row) => Array.from({ length: width }, (_, i) => quoteCsv(row[i] ?? '')).join(','))
    .join('\n');
}

function quoteCsv(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** The sheet as a CSV file named after the workbook and the sheet */
export function sheetAsCsvFile(workbookName: string, sheet: SheetTable, single: boolean): File {
  const base = workbookName.replace(SPREADSHEET_RE, '');
  const name = single ? `${base}.csv` : `${base} - ${sheet.name}.csv`;
  return new File([sheetToCsv(sheet.rows)], name, { type: 'text/csv' });
}

// ── Shared ──────────────────────────────────────────────────────

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('Invalid spreadsheet XML');
  return doc;
}

/** Descendants by local name, whatever the prefix */
function all(node: Document | Element, localName: string): Element[] {
  return Array.from(node.getElementsByTagNameNS('*', localName));
}

/** Direct children by local name */
function children(node: Element, localName: string): Element[] {
  return Array.from(node.children).filter((c) => c.localName === localName);
}

/** Attribute by local name, whatever the prefix */
function attr(el: Element, localName: string): string | null {
  for (const a of Array.from(el.attributes)) if (a.localName === localName) return a.value;
  return null;
}

/** Remove trailing empty cells of each row, then trailing empty rows */
function trimTable(rows: string[][]): string[][] {
  const out = rows.map((r) => {
    let end = r.length;
    while (end > 0 && r[end - 1] === '') end--;
    return end === r.length ? r : r.slice(0, end);
  });
  let end = out.length;
  while (end > 0 && out[end - 1].length === 0) end--;
  return out.slice(0, end);
}

const pad = (n: number, size = 2) => String(n).padStart(size, '0');

/** Date as the CSV import reads it: day, minute or second as precise as the value */
function formatDateParts(y: number, mo: number, d: number, h: number, mi: number, s: number, hasTime: boolean): string {
  const date = `${pad(y, 4)}-${pad(mo)}-${pad(d)}`;
  if (!hasTime) return date;
  return `${date} ${pad(h)}:${pad(mi)}${s ? `:${pad(s)}` : ''}`;
}

// ── XLSX ────────────────────────────────────────────────────────

/** Built-in number formats that are dates or times */
const XLSX_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

/** A custom format code showing a date or a time (quoted text and colours left out) */
function isDateFormatCode(code: string): boolean {
  const bare = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  return /[dmyhs]/i.test(bare) && !/^[#0.,%\s]*$/.test(bare);
}

/** Built-in number formats that show something else than the plain number */
const XLSX_BUILTIN_CODES: Record<number, string> = { 9: '0%', 10: '0.00%' };

/** Spaces of the display (non-breaking, narrow) as plain spaces */
const plainSpaces = (text: string) => text.replace(/[\u00a0\u202f\u2007]/g, ' ');

/**
 * What a number shows when its format changes its meaning or its digits: a
 * percentage, or a number shown with leading zeros (postcode, phone number).
 * Null otherwise: grouping, decimals, a currency or a rounding leave the
 * number as stored, still a number for the import. Same rule for ODS.
 */
function displayOrNull(display: string, isPercent: boolean): string | null {
  const text = plainSpaces(display).trim();
  if (isPercent) return text;
  return /^0\d/.test(text.replace(/\s/g, '')) ? text : null;
}

/**
 * An XLSX number through its format code, for the formats displayOrNull
 * keeps: percentages, and whole numbers placed in digit placeholders
 * ("00000", "0# ## ## ## ##"). Other formats are not rendered.
 */
function formatXlsxNumber(value: number, code: string): string | null {
  const section = splitFormatSections(code)[0].replace(/\[[^\]]*\]/g, '');
  const tokens = formatTokens(section);
  if (!tokens) return null;
  const placeholders = tokens.filter((t) => t.kind === 'digit').length;
  if (placeholders === 0) return null;
  const literal = (t: FormatToken) => (t.kind === 'literal' ? t.text : '');

  if (tokens.some((t) => t.kind === 'literal' && t.text === '%')) {
    const decimalsAt = tokens.findIndex((t) => t.kind === 'literal' && t.text === '.');
    const decimals = decimalsAt === -1 ? 0 : tokens.slice(decimalsAt + 1).filter((t) => t.kind === 'digit').length;
    const number = (value * 100).toFixed(decimals);
    // The literals around the digits (a space before %, a sign) are kept
    const first = tokens.findIndex((t) => t.kind === 'digit');
    let last = -1;
    tokens.forEach((t, i) => { if (t.kind === 'digit') last = i; });
    const inner = tokens.slice(first, last + 1).filter((t) => t.kind === 'literal' && !/[.,]/.test(t.text)).length;
    if (inner > 0) return null;
    return displayOrNull(tokens.slice(0, first).map(literal).join('') + number + tokens.slice(last + 1).map(literal).join(''), true);
  }

  // Digit placeholders filled from the right; leading digits beyond them go first
  if (!Number.isInteger(value) || value < 0 || tokens.some((t) => t.kind === 'literal' && /[.,]/.test(t.text))) return null;
  const digits = String(value).split('');
  const out: string[] = [];
  let remaining = placeholders;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t.kind === 'literal') { out.unshift(t.text); continue; }
    remaining--;
    if (remaining === 0 && digits.length > 1) { out.unshift(digits.join('')); digits.length = 0; continue; }
    const d = digits.pop();
    out.unshift(d ?? (t.char === '0' ? '0' : t.char === '?' ? ' ' : ''));
  }
  return displayOrNull(out.join(''), false);
}

type FormatToken = { kind: 'digit'; char: '0' | '#' | '?' } | { kind: 'literal'; text: string };

/** Sections of a format code (positive;negative;zero;text), quotes respected */
function splitFormatSections(code: string): string[] {
  const sections: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '"') quoted = !quoted;
    if (ch === '\\' && !quoted) { current += ch + (code[i + 1] ?? ''); i++; continue; }
    if (ch === ';' && !quoted) { sections.push(current); current = ''; continue; }
    current += ch;
  }
  sections.push(current);
  return sections;
}

/** Placeholders and literals of a format section; null for what is not a plain number pattern */
function formatTokens(section: string): FormatToken[] | null {
  const tokens: FormatToken[] = [];
  for (let i = 0; i < section.length; i++) {
    const ch = section[i];
    if (ch === '0' || ch === '#' || ch === '?') tokens.push({ kind: 'digit', char: ch });
    else if (ch === '\\') { tokens.push({ kind: 'literal', text: section[i + 1] ?? '' }); i++; }
    else if (ch === '"') {
      const end = section.indexOf('"', i + 1);
      if (end === -1) return null;
      tokens.push({ kind: 'literal', text: section.slice(i + 1, end) });
      i = end;
    } else if (ch === '_' || ch === '*') i++; // padding to a character's width: nothing shown here
    else if (/[\s\-+()/:.,%]/.test(ch)) tokens.push({ kind: 'literal', text: ch === ' ' ? ' ' : ch });
    else return null; // General, @, E+, letters: not rendered
  }
  return tokens;
}

async function zipText(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path);
  return file ? file.async('string') : null;
}

/** Path of a relationship target, relative to the folder of the part that points at it */
function resolvePart(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

/** Column index of a cell reference ("C12" → 2) */
function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const code = ch.toUpperCase().charCodeAt(0);
    if (code < 65 || code > 90) break;
    n = n * 26 + (code - 64);
  }
  return n - 1;
}

/** Text of a string item: plain or rich (runs), phonetic hints left out */
function stringItemText(si: Element): string {
  return children(si, 't').length > 0
    ? children(si, 't').map((t) => t.textContent ?? '').join('')
    : children(si, 'r').map((r) => children(r, 't').map((t) => t.textContent ?? '').join('')).join('');
}

/** An Excel serial date as text: the wall-clock time it shows, no time zone applied */
function excelSerialToText(serial: number, date1904: boolean): string {
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const ms = Math.round((epoch + serial * 86400000) / 1000) * 1000;
  const d = new Date(ms);
  const hasTime = Math.abs(serial - Math.floor(serial)) > 1e-9;
  if (serial < 1 && hasTime) {
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${d.getUTCSeconds() ? `:${pad(d.getUTCSeconds())}` : ''}`;
  }
  return formatDateParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), hasTime);
}

async function readXlsx(zip: JSZip): Promise<SheetTable[]> {
  const workbookXml = await zipText(zip, 'xl/workbook.xml');
  if (!workbookXml) throw new Error('Not an XLSX workbook');
  const workbook = parseXml(workbookXml);
  const date1904 = all(workbook, 'workbookPr').some((p) => /^(1|true)$/i.test(attr(p, 'date1904') ?? ''));

  const rels = new Map<string, string>();
  const relsXml = await zipText(zip, 'xl/_rels/workbook.xml.rels');
  if (relsXml) {
    for (const rel of all(parseXml(relsXml), 'Relationship')) {
      rels.set(rel.getAttribute('Id') ?? '', resolvePart('xl/workbook.xml', rel.getAttribute('Target') ?? ''));
    }
  }

  const shared: string[] = [];
  const sharedXml = await zipText(zip, 'xl/sharedStrings.xml');
  if (sharedXml) for (const si of all(parseXml(sharedXml), 'si')) shared.push(stringItemText(si));

  // Style index → is a date format, and its number format code
  const dateStyles: boolean[] = [];
  const styleCodes: (string | null)[] = [];
  const stylesXml = await zipText(zip, 'xl/styles.xml');
  if (stylesXml) {
    const styles = parseXml(stylesXml);
    const custom = new Map<number, string>();
    for (const f of all(styles, 'numFmt')) custom.set(Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode') ?? '');
    const cellXfs = all(styles, 'cellXfs')[0];
    if (cellXfs) {
      for (const xf of children(cellXfs, 'xf')) {
        const id = Number(xf.getAttribute('numFmtId') ?? 0);
        dateStyles.push(XLSX_DATE_FORMATS.has(id) || (custom.has(id) && isDateFormatCode(custom.get(id)!)));
        styleCodes.push(custom.get(id) ?? XLSX_BUILTIN_CODES[id] ?? null);
      }
    }
  }

  const sheets: SheetTable[] = [];
  for (const sheet of all(workbook, 'sheet')) {
    const name = sheet.getAttribute('name') ?? `Sheet${sheets.length + 1}`;
    const relId = attr(sheet, 'id');
    const path = (relId && rels.get(relId)) || `xl/worksheets/sheet${sheets.length + 1}.xml`;
    const xml = await zipText(zip, path);
    // A chart sheet or a missing part: no table
    if (!xml) { sheets.push({ name, rows: [] }); continue; }
    sheets.push({ name, rows: readXlsxSheet(parseXml(xml), shared, dateStyles, styleCodes, date1904) });
  }
  return sheets;
}

function readXlsxSheet(doc: Document, shared: string[], dateStyles: boolean[], styleCodes: (string | null)[], date1904: boolean): string[][] {
  const rows: string[][] = [];
  const sheetData = all(doc, 'sheetData')[0];
  if (!sheetData) return rows;
  let nextRow = 0;
  for (const row of children(sheetData, 'row')) {
    const r = row.getAttribute('r');
    const rowIndex = r ? Number(r) - 1 : nextRow;
    nextRow = rowIndex + 1;
    const cells: string[] = [];
    let nextCol = 0;
    for (const c of children(row, 'c')) {
      const ref = c.getAttribute('r');
      const col = ref ? columnIndex(ref) : nextCol;
      nextCol = col + 1;
      const type = c.getAttribute('t') ?? 'n';
      const v = children(c, 'v')[0]?.textContent ?? '';
      let text: string;
      if (type === 's') text = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') text = children(c, 'is').map(stringItemText).join('');
      else if (type === 'b') text = v === '1' ? 'true' : v === '0' ? 'false' : v;
      else if (type === 'd') text = v.replace('T', ' ').replace(/(:\d{2})(\.\d+)?Z?$/, '$1');
      else if (type === 'n' && v !== '' && dateStyles[Number(c.getAttribute('s') ?? 0)]) text = excelSerialToText(Number(v), date1904);
      else if (type === 'n' && v !== '') {
        const code = styleCodes[Number(c.getAttribute('s') ?? 0)];
        text = (code && formatXlsxNumber(Number(v), code)) ?? v;
      } else text = v; // formula string, error
      while (cells.length < col) cells.push('');
      cells[col] = text;
    }
    while (rows.length < rowIndex) rows.push([]);
    rows[rowIndex] = cells;
  }
  return trimTable(rows);
}

// ── ODS ─────────────────────────────────────────────────────────

/** Text of a paragraph: spaces (text:s), tabs and line breaks kept */
function odsParagraphText(node: Node): string {
  let out = '';
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) { out += child.nodeValue ?? ''; continue; }
    if (child.nodeType !== 1) continue;
    const el = child as Element;
    if (el.localName === 's') out += ' '.repeat(Number(attr(el, 'c') ?? 1));
    else if (el.localName === 'tab') out += '\t';
    else if (el.localName === 'line-break') out += '\n';
    else if (el.localName === 'annotation') continue; // comments are not the value
    else out += odsParagraphText(el);
  }
  return out;
}

/** "PT14H30M05S" → "14:30:05" */
function odsDurationToTime(value: string): string {
  const m = value.match(/PT(\d+)H(\d+)M(\d+)(?:[.,]\d+)?S/i);
  if (!m) return value;
  return `${pad(Number(m[1]))}:${pad(Number(m[2]))}${Number(m[3]) ? `:${pad(Number(m[3]))}` : ''}`;
}

function odsCellText(cell: Element): string {
  const type = attr(cell, 'value-type');
  if (type === 'float' || type === 'percentage' || type === 'currency') {
    // The display when it shows more than the number (see displayOrNull)
    const display = children(cell, 'p').map(odsParagraphText).join('\n');
    return (type !== 'currency' && displayOrNull(display, type === 'percentage')) || (attr(cell, 'value') ?? '');
  }
  if (type === 'boolean') return attr(cell, 'boolean-value') ?? '';
  if (type === 'date') {
    const v = attr(cell, 'date-value') ?? '';
    const m = v.match(/^(-?\d{4,})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return v;
    const hasTime = m[4] !== undefined && !(m[4] === '00' && m[5] === '00' && (m[6] ?? '00') === '00');
    return formatDateParts(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0), hasTime);
  }
  if (type === 'time') return odsDurationToTime(attr(cell, 'time-value') ?? '');
  return children(cell, 'p').map(odsParagraphText).join('\n');
}

/** Repeated empty rows or cells fill a sheet to its million rows: they count only before content */
const MAX_REPEAT = 100_000;

async function readOds(zip: JSZip): Promise<SheetTable[]> {
  const xml = await zipText(zip, 'content.xml');
  if (!xml) throw new Error('Not an ODS spreadsheet');
  const doc = parseXml(xml);
  const sheets: SheetTable[] = [];
  for (const table of all(doc, 'table')) {
    // Tables nested in a cell (rare) belong to that cell, not to the workbook
    if (table.parentElement?.localName !== 'spreadsheet') continue;
    sheets.push({ name: attr(table, 'name') ?? `Sheet${sheets.length + 1}`, rows: readOdsTable(table) });
  }
  return sheets;
}

function readOdsTable(table: Element): string[][] {
  const rows: string[][] = [];
  let pendingEmptyRows = 0;
  // Rows may sit in groups (header rows, row groups)
  const rowElements = all(table, 'table-row').filter((r) => nearestTable(r) === table);
  for (const row of rowElements) {
    const repeat = Math.min(Number(attr(row, 'number-rows-repeated') ?? 1), MAX_REPEAT);
    const cells: string[] = [];
    let pendingEmptyCells = 0;
    for (const cell of Array.from(row.children)) {
      if (cell.localName !== 'table-cell' && cell.localName !== 'covered-table-cell') continue;
      const span = Math.min(Number(attr(cell, 'number-columns-repeated') ?? 1), MAX_REPEAT);
      const text = cell.localName === 'covered-table-cell' ? '' : odsCellText(cell);
      if (text === '') { pendingEmptyCells += span; continue; }
      for (; pendingEmptyCells > 0; pendingEmptyCells--) cells.push('');
      for (let i = 0; i < span; i++) cells.push(text);
    }
    if (cells.length === 0) { pendingEmptyRows += repeat; continue; }
    for (; pendingEmptyRows > 0; pendingEmptyRows--) rows.push([]);
    for (let i = 0; i < repeat; i++) rows.push(i === 0 ? cells : [...cells]);
  }
  return trimTable(rows);
}

/** The table a row belongs to (a cell may hold a nested table) */
function nearestTable(el: Element): Element | null {
  let p = el.parentElement;
  while (p && p.localName !== 'table') p = p.parentElement;
  return p;
}
