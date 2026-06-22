import { DEFAULT_COLORS } from '../types';

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Serialize a Date to ISO string
 */
export function serializeDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

/**
 * Deserialize an ISO string to Date
 */
export function deserializeDate(str: string | null): Date | null {
  return str ? new Date(str) : null;
}

/**
 * Parse a pasted date string in common formats into a Date, so dates can be
 * pasted into native date inputs (which otherwise reject free text).
 * Accepts ISO (2000-04-18), and slash/dot/dash separated values, day-first by
 * default (18/04/2000) — matching the European display — but disambiguates when
 * a part is > 12 (handles 04/18/2000 too). An optional trailing time (HH:MM[:SS])
 * is parsed as well; date-only values default to local noon to avoid TZ drift.
 * Returns null when the text isn't a recognizable date.
 */
export function parseFlexibleDate(text: string): Date | null {
  if (!text) return null;
  const s = text.trim();
  if (!s) return null;

  const timeMatch = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  const hasTime = !!timeMatch;
  const hours = hasTime ? parseInt(timeMatch![1], 10) : 12;
  const minutes = hasTime ? parseInt(timeMatch![2], 10) : 0;
  const seconds = hasTime && timeMatch![3] ? parseInt(timeMatch![3], 10) : 0;
  if (hours > 23 || minutes > 59 || seconds > 59) return null;

  let year: number, month: number, day: number;
  const iso = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    year = +iso[1]; month = +iso[2]; day = +iso[3];
  } else {
    const dmy = s.match(/(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
    if (!dmy) return null;
    const a = +dmy[1], b = +dmy[2];
    year = +dmy[3];
    if (year < 100) year += year < 50 ? 2000 : 1900;
    if (a > 12 && b <= 12) { day = a; month = b; }
    else if (b > 12 && a <= 12) { month = a; day = b; }
    else { day = a; month = b; } // default day-first (European)
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day, hours, minutes, seconds, 0);
  // Reject impossible dates (e.g. 31/02 rolled over by the Date constructor).
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/**
 * Format a Date for copying to the clipboard as `DD/MM/YYYY` (optionally with
 * ` HH:MM`). The result round-trips through {@link parseFlexibleDate}.
 */
export function formatDateForCopy(date: Date, withTime = false): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  let out = `${d}/${m}/${y}`;
  if (withTime) {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    out += ` ${hh}:${mm}`;
  }
  return out;
}

/**
 * Get a random color from the default palette
 */
export function getRandomColor(): string {
  return DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)];
}

/**
 * Convert ArrayBuffer to hex string
 */
export function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Validate that a URL is safe for external fetch (anti-SSRF).
 * Rejects private/loopback IPs, non-http(s) protocols.
 */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const h = parsed.hostname;
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.0\.0\.0|localhost|\[::1\])/.test(h)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file extension from filename
 */
export function getExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || 'bin';
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format relative time (e.g., "il y a 2 heures")
 */
export function formatRelativeTime(date: Date, locale: string = 'fr'): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  const isFr = locale.startsWith('fr');

  if (diffSec < 60) return isFr ? "à l'instant" : "just now";
  if (diffMin < 60) return isFr ? `il y a ${diffMin} min` : `${diffMin} min ago`;
  if (diffHour < 24) return isFr ? `il y a ${diffHour}h` : `${diffHour}h ago`;
  if (diffDay < 7) return isFr ? `il y a ${diffDay}j` : `${diffDay}d ago`;

  return date.toLocaleDateString(isFr ? 'fr-FR' : 'en-US', {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Convert ArrayBuffer to base64 string efficiently.
 * Uses 32KB chunks with String.fromCharCode.apply() instead of
 * byte-by-byte reduce() which creates O(n) intermediate strings.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  const chunkSize = 0x8000; // 32KB — safe for Function.apply() stack limit
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as unknown as number[]));
  }
  return btoa(chunks.join(''));
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Sanitize a label for use in [[Label|uuid]] wiki-style links.
 * Escapes special characters that would break the link format:
 * - | (pipe) is replaced with similar Unicode character
 * - ]] (closing brackets) are replaced with similar Unicode character
 * Falls back to a short ID if the label is empty.
 */
export function sanitizeLinkLabel(label: string, id: string): string {
  if (!label || label.trim() === '') {
    return `#${id.slice(-6)}`;
  }
  return label
    .replace(/\|/g, '\u2223') // ∣ (divides)
    .replace(/\]\]/g, '\u3015'); // 〕 (right tortoise shell bracket)
}

/**
 * Restore a sanitized label back to its original characters.
 * Used when displaying or editing a label that was sanitized.
 */
export function unsanitizeLinkLabel(label: string): string {
  return label
    .replace(/\u2223/g, '|')
    .replace(/\u3015/g, ']]');
}
