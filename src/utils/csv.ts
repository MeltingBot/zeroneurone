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
