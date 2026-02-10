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
