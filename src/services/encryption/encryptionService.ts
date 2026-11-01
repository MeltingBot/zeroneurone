/**
 * EncryptionService — DEK/KEK key management and encryption metadata
 *
 * Architecture:
 *   Password → PBKDF2 → KEK → decrypts DEK → opens Dexie + y-indexeddb
 *
 * The DEK (Data Encryption Key) is generated once and stored encrypted
 * in the Dexie `_encryptionMeta` table. Changing the password re-encrypts
 * the DEK only, not the whole database.
 *
 * Schema versions:
 *   v1 — PBKDF2-SHA256 100,000 iterations (legacy)
 *   v2 — PBKDF2-SHA256 600,000 iterations (NIST SP 800-132 recommendation, 2023+)
 *        Upgraded automatically on the first unlock of a v1 meta.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface WebAuthnCredentialEntry {
  credentialId: ArrayBuffer;
  /** 32 random bytes, unique per credential */
  prfSalt: ArrayBuffer;
  /** DEK encrypted with the PRF-derived KEK (AES-256-GCM) */
  encryptedDEK: ArrayBuffer;
  /** IV AES-GCM 12 bytes */
  dekIV: ArrayBuffer;
  label: string;
  createdAt: string;
}

export interface EncryptionMeta {
  id: 'main';
  /** PBKDF2 salt, 16 bytes, generated once */
  salt: ArrayBuffer;
  /** DEK encrypted with the KEK (AES-256-GCM) */
  encryptedDEK: ArrayBuffer;
  /** IV of the DEK's AES-GCM encryption */
  dekIV: ArrayBuffer;
  /** Encryption schema version (for future migrations) */
  version: number;
  createdAt: string;
  /** WebAuthn PRF credentials for hardware-key unlocking */
  webauthnCredentials?: WebAuthnCredentialEntry[];
  /** Auto-lock delay in minutes (null = disabled) */
  autoLockMinutes?: number | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** PBKDF2 iterations per schema version */
const PBKDF2_ITERATIONS: Record<number, number> = {
  1: 100_000,  // legacy
  2: 600_000,  // NIST SP 800-132 (2023)
};
const PBKDF2_CURRENT_VERSION = 2;
const PBKDF2_HASH = 'SHA-256';
const DEK_LENGTH = 32; // bytes (256 bits)
const SALT_LENGTH = 16; // bytes
const AES_GCM_IV_LENGTH = 12; // bytes

// ============================================================================
// HELPERS
// ============================================================================

/** Random bytes typed with a plain ArrayBuffer */
function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(length);
  const arr = new Uint8Array(buf);
  crypto.getRandomValues(arr);
  return arr as Uint8Array<ArrayBuffer>;
}

// ============================================================================
// KEY DERIVATION
// ============================================================================

/**
 * Derives a KEK (Key Encryption Key) from a password and a salt
 * with PBKDF2. The KEK is only used to encrypt/decrypt the DEK.
 */
async function deriveKEK(password: string, salt: ArrayBuffer, iterations: number): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ============================================================================
// DEK ENCRYPTION / DECRYPTION
// ============================================================================

async function encryptDEK(
  dek: ArrayBuffer,
  kek: CryptoKey
): Promise<{ encryptedDEK: ArrayBuffer; dekIV: ArrayBuffer }> {
  const dekIV = randomBytes(AES_GCM_IV_LENGTH);
  const encryptedDEK = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: dekIV },
    kek,
    dek
  );
  return { encryptedDEK, dekIV: dekIV.buffer };
}

async function decryptDEK(
  encryptedDEK: ArrayBuffer,
  dekIV: ArrayBuffer,
  kek: CryptoKey
): Promise<ArrayBuffer> {
  try {
    return await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: dekIV },
      kek,
      encryptedDEK
    );
  } catch {
    throw new Error('Mot de passe incorrect');
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Sets up encryption for the first time.
 * Generates salt + DEK and encrypts the DEK with the password-derived KEK.
 * Returns the metadata to store in `_encryptionMeta`.
 */
export async function initializeEncryption(password: string): Promise<{
  meta: EncryptionMeta;
  dek: Uint8Array;
}> {
  const salt = randomBytes(SALT_LENGTH);
  const dekBytes = randomBytes(DEK_LENGTH);

  const iterations = PBKDF2_ITERATIONS[PBKDF2_CURRENT_VERSION];
  const kek = await deriveKEK(password, salt.buffer, iterations);
  const { encryptedDEK, dekIV } = await encryptDEK(dekBytes.buffer, kek);

  const meta: EncryptionMeta = {
    id: 'main',
    salt: salt.buffer,
    encryptedDEK,
    dekIV,
    version: PBKDF2_CURRENT_VERSION,
    createdAt: new Date().toISOString(),
  };

  return { meta, dek: dekBytes };
}

/**
 * Decrypts the DEK from the stored metadata and the given password.
 * Returns the DEK (32-byte Uint8Array), or throws when the password is wrong.
 *
 * When the meta is legacy (v1), re-encrypts the DEK with the current
 * parameters (v2) and returns the updated meta in `upgradedMeta`.
 * The caller is responsible for persisting `upgradedMeta` to `_encryptionMeta`.
 */
export async function unlockEncryption(
  meta: EncryptionMeta,
  password: string
): Promise<{ dek: Uint8Array; upgradedMeta: EncryptionMeta | null }> {
  const version = meta.version ?? 1;
  const iterations = PBKDF2_ITERATIONS[version] ?? PBKDF2_ITERATIONS[1];

  const kek = await deriveKEK(password, meta.salt, iterations);
  const dekBuffer = await decryptDEK(meta.encryptedDEK, meta.dekIV, kek);
  const dek = new Uint8Array(dekBuffer);

  // Automatic upgrade to the current version
  if (version < PBKDF2_CURRENT_VERSION) {
    const newIterations = PBKDF2_ITERATIONS[PBKDF2_CURRENT_VERSION];
    const newSalt = randomBytes(SALT_LENGTH);
    const newKek = await deriveKEK(password, newSalt.buffer, newIterations);
    const { encryptedDEK, dekIV } = await encryptDEK(dek.buffer as ArrayBuffer, newKek);

    const upgradedMeta: EncryptionMeta = {
      ...meta,
      salt: newSalt.buffer,
      encryptedDEK,
      dekIV,
      version: PBKDF2_CURRENT_VERSION,
    };

    return { dek, upgradedMeta };
  }

  return { dek, upgradedMeta: null };
}

/**
 * Changes the password by re-encrypting the DEK with the new KEK.
 * Near-instant (only the ~32-byte DEK is re-encrypted).
 * Always written in the current version.
 */
export async function changePassword(
  meta: EncryptionMeta,
  oldPassword: string,
  newPassword: string
): Promise<EncryptionMeta> {
  const { dek } = await unlockEncryption(meta, oldPassword);

  const newIterations = PBKDF2_ITERATIONS[PBKDF2_CURRENT_VERSION];
  const newSalt = randomBytes(SALT_LENGTH);
  const newKek = await deriveKEK(newPassword, newSalt.buffer, newIterations);
  const { encryptedDEK, dekIV } = await encryptDEK(dek.buffer as ArrayBuffer, newKek);

  return {
    ...meta,
    salt: newSalt.buffer,
    encryptedDEK,
    dekIV,
    version: PBKDF2_CURRENT_VERSION,
  };
}
