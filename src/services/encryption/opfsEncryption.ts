/**
 * opfsEncryption — AES-256-GCM encryption of OPFS files
 *
 * Encrypted file layout:
 *   [magic: 2 bytes 0xE3 0xE3] [iv: 12 bytes] [ciphertext]
 *
 * Automatic detection (isEncrypted) reads both forms
 * during migration and when files are mixed.
 */

/** Magic bytes prefixing every encrypted OPFS file */
const OPFS_ENC_MAGIC = new Uint8Array([0xe3, 0xe3]);
const MAGIC_LEN = 2;
const IV_LEN = 12;
const HEADER_LEN = MAGIC_LEN + IV_LEN; // 14 bytes

function dekToKey(dek: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', dek as unknown as ArrayBuffer, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/** True when the buffer starts with the OPFS magic bytes */
export function isOpfsEncrypted(buf: ArrayBuffer): boolean {
  if (buf.byteLength < HEADER_LEN) return false;
  const view = new Uint8Array(buf, 0, MAGIC_LEN);
  return view[0] === OPFS_ENC_MAGIC[0] && view[1] === OPFS_ENC_MAGIC[1];
}

/**
 * Encrypts an ArrayBuffer with the DEK.
 * Returns: magic (2) + iv (12) + ciphertext
 */
export async function encryptOpfsBuffer(
  dek: Uint8Array,
  plaintext: ArrayBuffer
): Promise<ArrayBuffer> {
  const key = await dekToKey(dek);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );

  const result = new Uint8Array(HEADER_LEN + ciphertext.byteLength);
  result.set(OPFS_ENC_MAGIC, 0);
  result.set(iv, MAGIC_LEN);
  result.set(new Uint8Array(ciphertext), HEADER_LEN);
  return result.buffer;
}

/**
 * Decrypts an ArrayBuffer produced by encryptOpfsBuffer.
 * Throws when the buffer lacks the magic header or decryption fails.
 */
export async function decryptOpfsBuffer(
  dek: Uint8Array,
  encrypted: ArrayBuffer
): Promise<ArrayBuffer> {
  if (!isOpfsEncrypted(encrypted)) {
    throw new Error('[opfsEncryption] Buffer sans magic header');
  }
  const key = await dekToKey(dek);
  const iv = new Uint8Array(encrypted, MAGIC_LEN, IV_LEN);
  const ciphertext = encrypted.slice(HEADER_LEN);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
}
