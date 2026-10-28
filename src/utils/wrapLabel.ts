/** Bounds of the link label width option, in characters. */
export const LABEL_WRAP_MIN = 5;
export const LABEL_WRAP_MAX = 200;
export const LABEL_WRAP_DEFAULT = 20;

/**
 * A label cut into lines of at most `maxChars` characters, at spaces. A word
 * longer than the width stays whole on its own line. Without a width (option
 * off), the label stays on one line.
 */
export function wrapLabelLines(text: string, maxChars: number | undefined): string[] {
  if (!maxChars || text.length <= maxChars) return [text];
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    if (!line) line = word;
    else if (line.length + 1 + word.length <= maxChars) line += ' ' + word;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [text];
}

/** Offset of each line from the label centre, so the block stays centred on it. */
export function lineOffsets(count: number, lineHeight: number): number[] {
  return Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * lineHeight);
}

/** <tspan>s of a wrapped label, centred on (x, y); `escape` makes each line XML-safe. */
export function svgLabelTspans(lines: string[], x: number, y: number, lineHeight: number, escape: (s: string) => string): string {
  if (lines.length === 1) return escape(lines[0]);
  return lineOffsets(lines.length, lineHeight)
    .map((dy, i) => `<tspan x="${x}" y="${y + dy}">${escape(lines[i])}</tspan>`)
    .join('');
}
