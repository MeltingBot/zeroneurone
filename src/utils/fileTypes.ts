/**
 * File type checks needed outside the parsers, kept apart so that using
 * them does not pull a lazily loaded parser into the main bundle.
 */

/** An email message (.eml) */
export function isEmlFile(name: string, mimeType: string): boolean {
  return mimeType === 'message/rfc822' || name.toLowerCase().endsWith('.eml');
}
