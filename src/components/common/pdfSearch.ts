/**
 * Text search over a PDF's text content, in the coordinates the text layer
 * uses: an item index (one span per text item) and an offset into its string.
 *
 * Matching ignores case, accents and ligatures (NFKD), and treats any run of
 * whitespace — including a line break between two items — as a single space.
 */

/** A text item as returned by getTextContent(), marked content excluded. */
export interface PdfTextItem {
  str: string;
  hasEOL?: boolean;
}

/** A page's searchable text, with each character traced back to its item. */
export interface PageText {
  /** Normalized text, one code point per entry. */
  chars: string[];
  /** Item of each entry of `chars`; -1 for a space standing for a break. */
  item: Int32Array;
  /** Start offset, in the item's string, of the source character. */
  start: Int32Array;
  /** End offset, in the item's string, of the source character. */
  end: Int32Array;
}

/** Part of one item covered by a match: str.slice(from, to). */
export interface MatchRange {
  item: number;
  from: number;
  to: number;
}

export interface PdfMatch {
  /** 1-based page number. */
  page: number;
  ranges: MatchRange[];
}

const COMBINING_MARKS = /\p{M}/gu;

function normalizeChar(c: string): string {
  return c.normalize('NFKD').replace(COMBINING_MARKS, '').toLowerCase();
}

/** Normalizes a query the same way page text is. */
export function normalizeQuery(query: string): string {
  let out = '';
  for (const c of query) {
    const n = /\s/.test(c) ? ' ' : normalizeChar(c);
    if (n === ' ' && (out === '' || out.endsWith(' '))) continue;
    out += n;
  }
  return out.trimEnd();
}

export function buildPageText(items: PdfTextItem[]): PageText {
  const chars: string[] = [];
  const item: number[] = [];
  const start: number[] = [];
  const end: number[] = [];
  const pushSpace = (itemIndex: number, from: number, to: number) => {
    if (chars.length === 0 || chars[chars.length - 1] === ' ') return;
    chars.push(' ');
    item.push(itemIndex);
    start.push(from);
    end.push(to);
  };

  items.forEach((it, i) => {
    // pdf.js puts the spaces between words in the strings, but not the line
    // breaks: without one, the last word of a line would run into the next.
    if (i > 0 && items[i - 1].hasEOL) pushSpace(-1, 0, 0);
    let offset = 0;
    for (const c of it.str) {
      const from = offset;
      offset += c.length;
      if (/\s/.test(c)) {
        pushSpace(i, from, offset);
        continue;
      }
      for (const n of normalizeChar(c)) {
        chars.push(n);
        item.push(i);
        start.push(from);
        end.push(offset);
      }
    }
  });

  return {
    chars,
    item: Int32Array.from(item),
    start: Int32Array.from(start),
    end: Int32Array.from(end),
  };
}

/**
 * Returns the non-overlapping matches of `query` across `pages`, in reading
 * order. `pages[0]` is page 1.
 */
export function findMatches(pages: PageText[], query: string): PdfMatch[] {
  const needle = Array.from(normalizeQuery(query));
  if (needle.length === 0) return [];
  const matches: PdfMatch[] = [];

  pages.forEach((page, p) => {
    const { chars } = page;
    let i = 0;
    while (i <= chars.length - needle.length) {
      let j = 0;
      while (j < needle.length && chars[i + j] === needle[j]) j++;
      if (j === needle.length) {
        matches.push({ page: p + 1, ranges: toRanges(page, i, i + needle.length) });
        i += needle.length;
      } else {
        i++;
      }
    }
  });

  return matches;
}

function toRanges(page: PageText, from: number, to: number): MatchRange[] {
  const ranges: MatchRange[] = [];
  for (let k = from; k < to; k++) {
    const item = page.item[k];
    if (item < 0) continue;
    const last = ranges[ranges.length - 1];
    if (last && last.item === item) {
      last.from = Math.min(last.from, page.start[k]);
      last.to = Math.max(last.to, page.end[k]);
    } else {
      ranges.push({ item, from: page.start[k], to: page.end[k] });
    }
  }
  return ranges;
}
