/**
 * Numbers written as text, as imports (CSV, JSON mapping) receive them.
 * A decimal comma is accepted ("12,5"). Values that only look like numbers
 * stay text: a leading zero (phone numbers, postcodes, ids), spaces
 * ("06 39 98 33 17"), or more than 12 digits: identifiers (IMEI and IMSI
 * have 15, account numbers more), not quantities.
 */

const NUMBER_RE = /^[-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/;

/** The number a text holds, or null when it is not one (see above). */
export function parseNumericText(text: string): number | null {
  const s = text.trim();
  if (!NUMBER_RE.test(s)) return null;
  if (/^[-+]?0\d/.test(s)) return null;
  if (s.replace(/\D/g, '').length > 12) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Whether every non-blank value of a column is a number (and there is one).
 * A comma that may separate thousands, as in an English export, keeps the
 * column as text rather than giving wrong numbers: commas next to decimal
 * points ("1,234" and "12.5"), or commas all followed by three digits
 * ("1,234", "25,000").
 */
export function isNumericColumn(values: Iterable<unknown>): boolean {
  let seen = false;
  let commas = 0;
  let thousandsLike = 0;
  let points = 0;
  for (const v of values) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'number') { if (!Number.isFinite(v)) return false; seen = true; continue; }
    const s = String(v).trim();
    if (!s) continue;
    if (parseNumericText(s) === null) return false;
    if (s.includes(',')) {
      commas++;
      if (/^[-+]?\d{1,3},\d{3}$/.test(s)) thousandsLike++;
    } else if (s.includes('.')) {
      points++;
    }
    seen = true;
  }
  if (commas > 0 && (points > 0 || thousandsLike === commas)) return false;
  return seen;
}

/**
 * Key two labels are compared by to suggest duplicates. With `numbers`, a
 * phone number in any writing is reduced to its digits: spaces, dots, dashes,
 * slashes and brackets dropped ("06 39 98 33 17" = "06.39.98.33.17" =
 * "0639983317"). Any other value is kept as written (trimmed).
 */
export function matchKey(value: string, numbers: boolean): string {
  const v = value.trim();
  if (!numbers) return v;
  const compact = v.replace(/[\s.\-/()\u00a0]/g, '');
  return /^\+?\d{6,15}$/.test(compact) ? compact : v;
}
