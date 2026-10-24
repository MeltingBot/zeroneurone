/**
 * Approximate text match (ZNQuery LIKE): case and accents ignored. A value
 * matches when it holds the query as is, or when every word of the query is
 * close to a word of the value: same start, or about one typo per five
 * letters (words of three letters or less must be exact).
 */

function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function words(s: string): string[] {
  return s.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Typos allowed for a query word of this length */
function allowedTypos(length: number): number {
  return length <= 3 ? 0 : Math.max(1, Math.floor(length / 5));
}

/** Levenshtein distance, giving up once it exceeds `max` */
function boundedDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    prev = curr;
  }
  return prev[b.length];
}

export function fuzzyMatch(value: string, query: string): boolean {
  const v = normalize(value);
  const q = normalize(query).trim();
  if (!q) return false;
  if (v.includes(q)) return true;
  const valueWords = words(v);
  const queryWords = words(q);
  if (queryWords.length === 0 || valueWords.length === 0) return false;
  return queryWords.every((qw) => {
    const max = allowedTypos(qw.length);
    return valueWords.some((vw) => vw.startsWith(qw) || boundedDistance(vw, qw, max) <= max);
  });
}
