/**
 * Split CSV text into records, keeping line breaks that sit inside quotes.
 *
 * A quoted cell may span several lines (RFC 4180; Excel writes one for every
 * Alt+Enter), so splitting on '\n' first would cut such a row in two. Each
 * returned record still carries its quotes and is meant for a per-record field
 * parser. Line endings are normalised to '\n', including inside cells, and
 * blank records are dropped.
 *
 * A doubled quote ("") toggles the state twice, so it needs no special case.
 */
export function splitCSVRecords(content: string): string[] {
  const text = content.replace(/\r\n?/g, '\n');
  const records: string[] = [];
  let start = 0;
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === '\n' && !inQuotes) {
      records.push(text.slice(start, i));
      start = i + 1;
    }
  }
  records.push(text.slice(start));

  // An unbalanced quote (a stray inch mark, say) would swallow every row after
  // it into one record: fall back to plain lines so only that row suffers.
  const result = inQuotes ? text.split('\n') : records;
  return result.filter((r) => r.trim());
}

/**
 * Delimiter of a CSV, from its first record: the most frequent of `,`, `;`
 * and tab outside quotes (`,` when none).
 */
export function detectCSVDelimiter(content: string): string {
  const candidates = [',', ';', '\t'];
  const firstLine = splitCSVRecords(content)[0] ?? '';

  let inQuotes = false;
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') {
      if (inQuotes && firstLine[i + 1] === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && candidates.includes(ch)) {
      counts[ch]++;
    }
  }

  let best = ',';
  let bestCount = -1;
  for (const c of candidates) {
    if (counts[c] > bestCount) {
      best = c;
      bestCount = counts[c];
    }
  }
  return bestCount > 0 ? best : ',';
}

/** Fields of one CSV record (quotes removed, doubled quotes unescaped). */
export function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

/**
 * Rows of a CSV with a header line, as records keyed by column name (BOM
 * dropped, headers trimmed). Empty or duplicate header names get a
 * numbered name so that no column is lost.
 */
export function csvToRecords(content: string): { headers: string[]; records: Record<string, string>[] } {
  const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const lines = splitCSVRecords(text);
  if (lines.length === 0) return { headers: [], records: [] };
  const delimiter = detectCSVDelimiter(text);

  const seen = new Map<string, number>();
  const headers = parseCSVLine(lines[0], delimiter).map((raw, i) => {
    const base = raw.trim() || `column_${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });

  const records = lines.slice(1).map((line) => {
    const values = parseCSVLine(line, delimiter);
    const record: Record<string, string> = {};
    headers.forEach((h, i) => { record[h] = (values[i] ?? '').trim(); });
    return record;
  });
  return { headers, records };
}

/** Values the native import reads in a `type` column */
const NATIVE_TYPES = new Set(['element', 'lien', 'link', 'event', 'evenement', 'événement']);

/**
 * Whether the native CSV import understands this file; other CSV files need
 * the column mapping. Native: a `type` column holding only element, lien /
 * link or event, or, without one, a label column (label / nom / name) or both ends of
 * a link. A `type` column of another tool (account type, say) would make the
 * native import skip every row, so it calls for the mapping.
 */
export function isNativeCSV(content: string): boolean {
  const { headers, records } = csvToRecords(content);
  const lower = headers.map((h) => h.toLowerCase());
  const typeCol = headers[lower.indexOf('type')];
  if (typeCol !== undefined) {
    const values = records.map((r) => r[typeCol].toLowerCase()).filter(Boolean);
    return values.length > 0 && values.every((v) => NATIVE_TYPES.has(v));
  }
  const h = new Set(lower);
  const any = (names: string[]) => names.some((n) => h.has(n));
  if (any(['label', 'nom', 'name'])) return true;
  return any(['de', 'from', 'source']) && any(['vers', 'to', 'target']);
}
