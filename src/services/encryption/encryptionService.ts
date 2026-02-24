/**
 * EncryptionService — Gestion des clés DEK/KEK et métadonnées de chiffrement
 *
 * Architecture :
 *   Mot de passe → PBKDF2 → KEK → déchiffre DEK → ouvre Dexie + y-indexeddb
 *
 * La DEK (Data Encryption Key) est générée une seule fois, stockée chiffrée
 * dans la table `_encryptionMeta` de Dexie. Changer le mot de passe = re-chiffrer
 * la DEK uniquement, pas toute la base.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface EncryptionMeta {
  id: 'main';
  /** Sel PBKDF2, 16 bytes, généré une seule fois */
  salt: ArrayBuffer;
  /** DEK chiffrée avec la KEK (AES-256-GCM) */
  encryptedDEK: ArrayBuffer;
  /** IV du chiffrement AES-GCM de la DEK */
  dekIV: ArrayBuffer;
  /** Version du schéma de chiffrement (pour migrations futures) */
  version: number;
  createdAt: string;
}

export interface EncryptionState {
  enabled: boolean;
  /** DEK en mémoire — null si non déchiffrée */
  dek: Uint8Array | null;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_HASH = 'SHA-256';
const DEK_LENGTH = 32; // bytes (256 bits)
const SALT_LENGTH = 16; // bytes
const AES_GCM_IV_LENGTH = 12; // bytes

// ============================================================================
// HELPERS
// ============================================================================

/** Génère des bytes aléatoires avec le bon type ArrayBuffer */
function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(length);
  const arr = new Uint8Array(buf);
  crypto.getRandomValues(arr);
  return arr as Uint8Array<ArrayBuffer>;
}

// ============================================================================
// DÉRIVATION DE CLÉ
// ============================================================================

/**
 * Dérive une KEK (Key Encryption Key) depuis un mot de passe et un sel
 * via PBKDF2. La KEK est utilisée uniquement pour chiffrer/déchiffrer la DEK.
 */
async function deriveKEK(password: string, salt: ArrayBuffer): Promise<CryptoKey> {
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
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ============================================================================
// CHIFFREMENT / DÉCHIFFREMENT DE LA DEK
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
// API PUBLIQUE
// ============================================================================

/**
 * Initialise le chiffrement pour la première fois.
 * Génère sel + DEK, chiffre la DEK avec la KEK dérivée du mot de passe.
 * Retourne les métadonnées à stocker dans `_encryptionMeta`.
 */
export async function initializeEncryption(password: string): Promise<{
  meta: EncryptionMeta;
  dek: Uint8Array;
}> {
  const salt = randomBytes(SALT_LENGTH);
  const dekBytes = randomBytes(DEK_LENGTH);

  const kek = await deriveKEK(password, salt.buffer);
  const { encryptedDEK, dekIV } = await encryptDEK(dekBytes.buffer, kek);

  const meta: EncryptionMeta = {
    id: 'main',
    salt: salt.buffer,
    encryptedDEK,
    dekIV,
    version: 1,
    createdAt: new Date().toISOString(),
  };

  return { meta, dek: dekBytes };
}

/**
 * Déchiffre la DEK depuis les métadonnées stockées et le mot de passe fourni.
 * Retourne la DEK (Uint8Array 32 bytes) ou lance une erreur si mot de passe incorrect.
 */
export async function unlockEncryption(
  meta: EncryptionMeta,
  password: string
): Promise<Uint8Array> {
  const kek = await deriveKEK(password, meta.salt);
  const dekBuffer = await decryptDEK(meta.encryptedDEK, meta.dekIV, kek);
  return new Uint8Array(dekBuffer);
}

/**
 * Change le mot de passe en re-chiffrant la DEK avec la nouvelle KEK.
 * Opération quasi-instantanée (seule la DEK ~32 octets est re-chiffrée).
 */
export async function changePassword(
  meta: EncryptionMeta,
  oldPassword: string,
  newPassword: string
): Promise<EncryptionMeta> {
  const dek = await unlockEncryption(meta, oldPassword);

  const newSalt = randomBytes(SALT_LENGTH);
  const newKek = await deriveKEK(newPassword, newSalt.buffer);
  const { encryptedDEK, dekIV } = await encryptDEK(dek.buffer as ArrayBuffer, newKek);

  return {
    ...meta,
    salt: newSalt.buffer,
    encryptedDEK,
    dekIV,
  };
}
