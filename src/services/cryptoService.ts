/**
 * CryptoService - End-to-end encryption for Yjs collaboration
 *
 * Uses AES-256-GCM for symmetric encryption of Y.Doc updates.
 * The encryption key is generated client-side and shared via URL fragment
 * (fragments are never sent to servers).
 */

// Key length for AES-256
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM

/**
 * Generate a random encryption key for sharing
 * Returns a base64url-encoded key string
 */
export async function generateEncryptionKey(): Promise<string> {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: KEY_LENGTH },
    true, // extractable
    ['encrypt', 'decrypt']
  );

  const rawKey = await crypto.subtle.exportKey('raw', key);
  return arrayBufferToBase64Url(rawKey);
}

/**
 * Import an encryption key from base64url string
 */
export async function importEncryptionKey(keyString: string): Promise<CryptoKey> {
  const rawKey = base64UrlToArrayBuffer(keyString);
  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false, // not extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data using AES-256-GCM
 * Returns: IV (12 bytes) + ciphertext + auth tag
 */
export async function encrypt(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  // Generate random IV for each encryption
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Encrypt with AES-GCM (includes authentication tag)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data as BufferSource
  );

  // Combine IV + ciphertext
  const result = new Uint8Array(iv.length + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), iv.length);

  return result;
}

/**
 * Decrypt data using AES-256-GCM
 * Input format: IV (12 bytes) + ciphertext + auth tag
 */
export async function decrypt(key: CryptoKey, encryptedData: Uint8Array): Promise<Uint8Array> {
  // Extract IV and ciphertext
  const iv = encryptedData.slice(0, IV_LENGTH);
  const ciphertext = encryptedData.slice(IV_LENGTH);

  // Decrypt with AES-GCM (verifies authentication tag)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return new Uint8Array(decrypted);
}

/**
 * Validate that a key string is a valid encryption key
 */
export function isValidKeyString(keyString: string): boolean {
  try {
    const rawKey = base64UrlToArrayBuffer(keyString);
    // AES-256 key should be 32 bytes
    return rawKey.byteLength === 32;
  } catch {
    return false;
  }
}

/**
 * Derive a hashed room ID from investigation UUID and encryption key
 * This prevents the server from seeing the real investigation UUID
 *
 * @param investigationId - The investigation UUID
 * @param encryptionKey - The E2E encryption key (base64url)
 * @returns 32-character hex string (128 bits, collision-resistant)
 */
export async function deriveRoomId(investigationId: string, encryptionKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(investigationId + encryptionKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // 32 hex chars = 128 bits, sufficient to avoid collisions
  return hashArray.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Convert ArrayBuffer to base64url string (URL-safe, no padding)
 */
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // Convert to base64, then to base64url
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Convert base64url string to ArrayBuffer
 */
function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  // Convert base64url to base64
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding if needed
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ============================================================================
// ENCRYPTED WEBSOCKET PROVIDER WRAPPER
// ============================================================================

/**
 * Create an encrypted message handler for y-websocket
 * This wraps the WebSocket to encrypt outgoing messages and decrypt incoming ones
 */
export class EncryptedSyncProvider {
  private key: CryptoKey | null = null;
  private keyString: string | null = null;

  /**
   * Set the encryption key
   */
  async setKey(keyString: string): Promise<void> {
    this.keyString = keyString;
    this.key = await importEncryptionKey(keyString);
  }

  /**
   * Get the current key string (for sharing)
   */
  getKeyString(): string | null {
    return this.keyString;
  }

  /**
   * Check if encryption is enabled
   */
  isEnabled(): boolean {
    return this.key !== null;
  }

  /**
   * Encrypt a Y.Doc update before sending
   */
  async encryptUpdate(update: Uint8Array): Promise<Uint8Array> {
    if (!this.key) {
      throw new Error('Encryption key not set');
    }
    return encrypt(this.key, update);
  }

  /**
   * Decrypt a received Y.Doc update
   */
  async decryptUpdate(encryptedUpdate: Uint8Array): Promise<Uint8Array> {
    if (!this.key) {
      throw new Error('Encryption key not set');
    }
    return decrypt(this.key, encryptedUpdate);
  }

  /**
   * Clear the encryption key
   */
  clear(): void {
    this.key = null;
    this.keyString = null;
  }
}

// Export singleton instance
export const encryptedSyncProvider = new EncryptedSyncProvider();
