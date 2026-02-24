/**
 * zipEncryption — Chiffrement d'archives ZIP avec mot de passe
 *
 * Format d'un fichier .znzip :
 *   [magic: 4 bytes "ZNEZ"]
 *   [salt:  16 bytes]
 *   [iv:    12 bytes]
 *   [ciphertext: reste]
 *
 * Dérivation clé : PBKDF2-SHA256, 200 000 itérations → AES-256-GCM
 */

const MAGIC = new Uint8Array([0x5a, 0x4e, 0x45, 0x5a]); // "ZNEZ"
const MAGIC_LEN = 4;
const SALT_LEN = 16;
const IV_LEN = 12;
const HEADER_LEN = MAGIC_LEN + SALT_LEN + IV_LEN; // 32 bytes
const ITERATIONS = 200_000;

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Retourne true si le buffer commence par le magic header ZNEZ */
export function isEncryptedZipBuffer(buf: ArrayBuffer): boolean {
  if (buf.byteLength < HEADER_LEN) return false;
  const view = new Uint8Array(buf, 0, MAGIC_LEN);
  return MAGIC.every((b, i) => view[i] === b);
}

/** Chiffre un Blob (ZIP) avec le mot de passe fourni → ArrayBuffer .znzip */
export async function encryptZip(blob: Blob, password: string): Promise<ArrayBuffer> {
  const plaintext = await blob.arrayBuffer();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveKey(password, salt);

  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  const result = new Uint8Array(HEADER_LEN + ciphertext.byteLength);
  result.set(MAGIC, 0);
  result.set(salt, MAGIC_LEN);
  result.set(iv, MAGIC_LEN + SALT_LEN);
  result.set(new Uint8Array(ciphertext), HEADER_LEN);
  return result.buffer;
}

/**
 * Déchiffre un ArrayBuffer .znzip avec le mot de passe fourni.
 * Lance une erreur si le magic est absent ou si le déchiffrement échoue.
 */
export async function decryptZip(buf: ArrayBuffer, password: string): Promise<ArrayBuffer> {
  if (!isEncryptedZipBuffer(buf)) {
    throw new Error('Fichier non chiffré ou format invalide');
  }
  const salt = new Uint8Array(buf, MAGIC_LEN, SALT_LEN);
  const iv = new Uint8Array(buf, MAGIC_LEN + SALT_LEN, IV_LEN);
  const ciphertext = buf.slice(HEADER_LEN);
  const key = await deriveKey(password, salt);

  try {
    return await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  } catch {
    throw new Error('Mot de passe incorrect');
  }
}
