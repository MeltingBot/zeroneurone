/**
 * WebAuthnService — Déverrouillage par clé de sécurité (WebAuthn PRF)
 *
 * Utilise l'extension PRF (Pseudo-Random Function) de WebAuthn Level 3
 * pour dériver une KEK déterministe depuis une clé physique (YubiKey).
 * La DEK est chiffrée en AES-256-GCM avec cette KEK et stockée dans
 * `_encryptionMeta.webauthnCredentials[]`.
 *
 * Zéro dépendance externe — Web Authentication API + Web Crypto API uniquement.
 */

import type { WebAuthnCredentialEntry } from './encryptionService';

// ============================================================================
// CONSTANTES
// ============================================================================

const AES_GCM_IV_LENGTH = 12;
const PRF_SALT_LENGTH = 32;
const HKDF_INFO = new TextEncoder().encode('zeroneurone-kek');
const RP_NAME = 'ZeroNeurone';

// ============================================================================
// FEATURE DETECTION
// ============================================================================

export function isWebAuthnAvailable(): boolean {
  return typeof window !== 'undefined'
    && !!window.PublicKeyCredential
    && typeof navigator.credentials?.create === 'function';
}

// ============================================================================
// KEK DERIVATION VIA HKDF
// ============================================================================

async function deriveKEKFromPrf(
  prfOutput: ArrayBuffer,
  salt: ArrayBuffer
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    prfOutput,
    'HKDF',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: HKDF_INFO,
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ============================================================================
// DEK ENCRYPT / DECRYPT
// ============================================================================

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(length);
  const arr = new Uint8Array(buf);
  crypto.getRandomValues(arr);
  return arr as Uint8Array<ArrayBuffer>;
}

async function encryptDEK(
  dek: ArrayBuffer,
  kek: CryptoKey
): Promise<{ encryptedDEK: ArrayBuffer; dekIV: ArrayBuffer }> {
  const iv = randomBytes(AES_GCM_IV_LENGTH);
  const encryptedDEK = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    kek,
    dek
  );
  return { encryptedDEK, dekIV: iv.buffer };
}

async function decryptDEK(
  encryptedDEK: ArrayBuffer,
  dekIV: ArrayBuffer,
  kek: CryptoKey
): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: dekIV },
    kek,
    encryptedDEK
  );
}

// ============================================================================
// HELPERS INTERNES
// ============================================================================

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function getOrCreateUserId(): Uint8Array<ArrayBuffer> {
  const KEY = 'zeroneurone:webauthn-user-id';
  const stored = localStorage.getItem(KEY);
  if (stored) {
    const raw = atob(stored);
    const buf = new ArrayBuffer(raw.length);
    const arr = new Uint8Array(buf);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr as Uint8Array<ArrayBuffer>;
  }
  const id = randomBytes(16);
  localStorage.setItem(KEY, btoa(String.fromCharCode(...id)));
  return id;
}

/** Cast any PRF output to ArrayBuffer */
function toArrayBuffer(v: unknown): ArrayBuffer {
  if (v instanceof ArrayBuffer) return v;
  if (ArrayBuffer.isView(v)) return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer;
  throw new Error('Expected ArrayBuffer or ArrayBufferView');
}

// ============================================================================
// ENREGISTREMENT D'UNE CLÉ
// ============================================================================

export async function registerWebAuthnCredential(
  dek: Uint8Array,
  label: string,
  existingCredentialIds: ArrayBuffer[] = []
): Promise<WebAuthnCredentialEntry> {
  const prfSalt = randomBytes(PRF_SALT_LENGTH);
  const userId = getOrCreateUserId();

  const createOptions: CredentialCreationOptions = {
    publicKey: {
      rp: {
        name: RP_NAME,
        id: location.hostname,
      },
      user: {
        id: userId,
        name: 'zeroneurone-user',
        displayName: 'ZeroNeurone',
      },
      challenge: randomBytes(32),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        userVerification: 'discouraged',
      },
      excludeCredentials: existingCredentialIds.map(id => ({
        type: 'public-key' as const,
        id,
      })),
      extensions: {
        prf: {},
      } as AuthenticationExtensionsClientInputs,
    },
  };

  const credential = await navigator.credentials.create(createOptions) as PublicKeyCredential | null;
  if (!credential) throw new Error('Registration cancelled');

  const extensions = credential.getClientExtensionResults() as any;
  console.debug('[WebAuthn] create() extensions:', extensions);

  const prfResult = extensions?.prf;
  if (!prfResult?.enabled) {
    throw new Error('PRF_NOT_SUPPORTED');
  }

  const credentialId = credential.rawId;

  // Petit délai pour laisser l'authenticator se réinitialiser
  await new Promise(r => setTimeout(r, 500));

  const getOptions: CredentialRequestOptions = {
    publicKey: {
      challenge: randomBytes(32),
      rpId: location.hostname,
      allowCredentials: [{
        type: 'public-key',
        id: credentialId,
      }],
      userVerification: 'discouraged',
      extensions: {
        prf: {
          eval: {
            first: prfSalt.buffer,
          },
        },
      } as AuthenticationExtensionsClientInputs,
    },
  };

  console.debug('[WebAuthn] get() for PRF eval, options:', getOptions);

  const assertion = await navigator.credentials.get(getOptions) as PublicKeyCredential | null;
  if (!assertion) throw new Error('PRF evaluation cancelled');

  const getExtensions = assertion.getClientExtensionResults() as any;
  console.debug('[WebAuthn] get() extensions:', JSON.stringify(Object.keys(getExtensions)));
  console.debug('[WebAuthn] get() prf:', getExtensions?.prf);
  console.debug('[WebAuthn] get() prf.results:', getExtensions?.prf?.results);
  if (getExtensions?.prf) {
    console.debug('[WebAuthn] get() prf keys:', Object.keys(getExtensions.prf));
    if (getExtensions.prf.results) {
      console.debug('[WebAuthn] get() prf.results keys:', Object.keys(getExtensions.prf.results));
      console.debug('[WebAuthn] get() prf.results.first type:', typeof getExtensions.prf.results.first, getExtensions.prf.results.first);
    }
  }

  const evalResult = getExtensions?.prf?.results?.first;
  if (!evalResult) throw new Error('PRF evaluation failed: no prf.results.first in extensions. Got: ' + JSON.stringify(Object.keys(getExtensions?.prf ?? {})));

  const kek = await deriveKEKFromPrf(toArrayBuffer(evalResult), prfSalt.buffer);
  const { encryptedDEK, dekIV } = await encryptDEK(dek.buffer as ArrayBuffer, kek);

  return {
    credentialId,
    prfSalt: prfSalt.buffer,
    encryptedDEK,
    dekIV,
    label,
    createdAt: new Date().toISOString(),
  };
}

// ============================================================================
// DÉVERROUILLAGE VIA CLÉ DE SÉCURITÉ
// ============================================================================

export async function unlockWithWebAuthn(
  credentials: WebAuthnCredentialEntry[]
): Promise<{ dek: Uint8Array; credentialId: ArrayBuffer }> {
  if (credentials.length === 0) throw new Error('No WebAuthn credentials');

  const evalByCredential: Record<string, { first: ArrayBuffer }> = {};
  const saltMap = new Map<string, { salt: ArrayBuffer; entry: WebAuthnCredentialEntry }>();

  for (const cred of credentials) {
    const key = toBase64Url(cred.credentialId);
    evalByCredential[key] = { first: cred.prfSalt };
    saltMap.set(key, { salt: cred.prfSalt, entry: cred });
  }

  const getOptions: CredentialRequestOptions = {
    publicKey: {
      challenge: randomBytes(32),
      rpId: location.hostname,
      allowCredentials: credentials.map(c => ({
        type: 'public-key' as const,
        id: c.credentialId,
      })),
      userVerification: 'discouraged',
      extensions: {
        prf: { evalByCredential },
      } as AuthenticationExtensionsClientInputs,
    },
  };

  const assertion = await navigator.credentials.get(getOptions) as PublicKeyCredential | null;
  if (!assertion) throw new Error('Authentication cancelled');

  const usedCredId = assertion.rawId;
  const usedKey = toBase64Url(usedCredId);

  const prfResults = (assertion.getClientExtensionResults() as any)?.prf?.results;
  const prfOutput = prfResults?.first;

  if (!prfOutput) {
    return unlockWithWebAuthnFallback(usedCredId, credentials);
  }

  const match = saltMap.get(usedKey);
  if (!match) throw new Error('Unknown credential');

  const kek = await deriveKEKFromPrf(toArrayBuffer(prfOutput), match.salt);
  const dekBuffer = await decryptDEK(match.entry.encryptedDEK, match.entry.dekIV, kek);

  return { dek: new Uint8Array(dekBuffer), credentialId: usedCredId };
}

async function unlockWithWebAuthnFallback(
  credentialId: ArrayBuffer,
  credentials: WebAuthnCredentialEntry[]
): Promise<{ dek: Uint8Array; credentialId: ArrayBuffer }> {
  const key = toBase64Url(credentialId);
  const entry = credentials.find(c => toBase64Url(c.credentialId) === key);
  if (!entry) throw new Error('Unknown credential');

  const getOptions: CredentialRequestOptions = {
    publicKey: {
      challenge: randomBytes(32),
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: credentialId }],
      userVerification: 'discouraged',
      extensions: {
        prf: { eval: { first: entry.prfSalt } },
      } as AuthenticationExtensionsClientInputs,
    },
  };

  const assertion = await navigator.credentials.get(getOptions) as PublicKeyCredential | null;
  if (!assertion) throw new Error('Authentication cancelled');

  const prfOutput = (assertion.getClientExtensionResults() as any)?.prf?.results?.first;
  if (!prfOutput) throw new Error('PRF evaluation failed');

  const kek = await deriveKEKFromPrf(toArrayBuffer(prfOutput), entry.prfSalt);
  const dekBuffer = await decryptDEK(entry.encryptedDEK, entry.dekIV, kek);

  return { dek: new Uint8Array(dekBuffer), credentialId };
}
