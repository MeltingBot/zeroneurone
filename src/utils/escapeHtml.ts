/**
 * HTML/JS escaping helpers for generated documents.
 *
 * These are used when building HTML that leaves the app (interactive report,
 * printed synthesis) or when injecting user-controlled data into innerHTML.
 * Element labels, notes, colours and URLs can all come from an imported file
 * or from a collaboration peer, so none of them can be trusted.
 */

/** Escape text for insertion into an HTML text node or a quoted attribute. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Serialise a value for embedding inside an inline <script> block.
 *
 * JSON.stringify alone is not enough: a string containing "</script>" would
 * close the block and let the rest execute as markup. U+2028/U+2029 are also
 * escaped because they terminate a line in older JS parsers.
 */
export function escapeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Return a safe href, or null when the URL uses a disallowed scheme.
 * Allows http(s), mailto and same-document fragments only.
 */
export function sanitizeUrl(url: string): string | null {
  const trimmed = url.trim();
  // Reject control characters, which can be used to smuggle "javascript:".
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(trimmed)) return null;
  // Quotes and angle brackets have no place in a URL we are about to quote.
  if (/["'<>`]/.test(trimmed)) return null;
  if (!/^(https?:\/\/|mailto:|#)/i.test(trimmed)) return null;
  return trimmed;
}

// Hex, functional notations, and bare keywords (named CSS colours).
const COLOR_PATTERN =
  /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%/]+(deg)?[\d\s.,%/]*\)|[a-z]{3,20})$/i;

/**
 * Validate a colour before injecting it into innerHTML or a style attribute.
 * Returns the fallback when the value is not a plain colour token.
 */
export function safeColor(color: string | undefined | null, fallback: string): string {
  if (!color) return fallback;
  const trimmed = color.trim();
  if (trimmed.length > 64) return fallback;
  // var(--token) is emitted by our own theme code and carries no quotes.
  if (/^var\(--[a-z0-9-]+\)$/i.test(trimmed)) return trimmed;
  return COLOR_PATTERN.test(trimmed) ? trimmed : fallback;
}
