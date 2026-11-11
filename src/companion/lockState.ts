/**
 * State of the companion's lock (the flows are in lock.ts).
 *
 * The record in localStorage holds nothing secret: the passkey's id and PRF
 * salt, the data key wrapped under the passkey, the share key pair's public
 * half and its private half wrapped under the data key, the dossiers' ids
 * (so "Forget everything" works without the passkey) and the delay. Once
 * unlocked, the data key lives in memory only.
 */

import nacl from 'tweetnacl';
import { LOCK_KEY } from './hasDossiers';

export type LockStep = 'enabling' | 'on' | 'disabling';

export interface LockRecord {
  v: 1;
  /** A step left halfway (phone switched off) is taken up at the next unlock */
  state: LockStep;
  credentialId: string;
  prfSalt: string;
  encryptedDek: string;
  dekIv: string;
  /** Minutes in the background before the lock covers the app again */
  timeoutMin: number;
  /** Ids of the dossiers kept on the phone, readable without the key */
  dossierIds: string[];
  /** Shares from other apps are encrypted to this key by the service worker */
  sharePublicKey: JsonWebKey;
  /** Its private half, sealed with the data key */
  sharePrivateKey: string;
}

const KEY = LOCK_KEY;
export const LOCK_DELAYS = [0, 1, 5, 15] as const;
export const DEFAULT_LOCK_DELAY = 5;

export function readLock(): LockRecord | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null') as LockRecord | null;
    return parsed && parsed.v === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function writeLock(record: LockRecord | null): void {
  if (record) localStorage.setItem(KEY, JSON.stringify(record));
  else localStorage.removeItem(KEY);
}

export function lockEnabled(): boolean {
  return readLock() !== null;
}

// ----------------------------------------------------------------------------
// Unlocked state (memory only)
// ----------------------------------------------------------------------------

let dek: Uint8Array | null = null;
let sharePrivate: CryptoKey | null = null;
/** A passkey prompt is open: the page it hides is not "in the background" */
let prompting = false;

export function isPrompting(): boolean {
  return prompting;
}

export function setPrompting(value: boolean): void {
  prompting = value;
}

export function unlockedKey(): Uint8Array | null {
  return dek;
}

export function shareKey(): CryptoKey | null {
  return sharePrivate;
}

export function setUnlocked(key: Uint8Array | null, share: CryptoKey | null): void {
  dek = key;
  sharePrivate = share;
}

// ----------------------------------------------------------------------------
// Sealing small values with the data key
// ----------------------------------------------------------------------------

export function toB64(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
  return btoa(binary);
}

export function fromB64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Text sealed with `key` (secretbox), as base64 nonce + box */
export function seal(text: string, key: Uint8Array): string {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  // Copied into this realm's Uint8Array: tweetnacl checks the type strictly
  const box = nacl.secretbox(Uint8Array.from(new TextEncoder().encode(text)), nonce, Uint8Array.from(key));
  const out = new Uint8Array(nonce.length + box.length);
  out.set(nonce);
  out.set(box, nonce.length);
  return toB64(out);
}

/** The text sealed by seal(), or null when `key` does not open it */
export function unseal(sealed: string, key: Uint8Array): string | null {
  const bytes = fromB64(sealed);
  const opened = nacl.secretbox.open(
    bytes.subarray(nacl.secretbox.nonceLength), bytes.subarray(0, nacl.secretbox.nonceLength), Uint8Array.from(key),
  );
  return opened ? new TextDecoder().decode(opened) : null;
}

/** A forgotten dossier's id leaves the record once its copy is erased */
export function dropLockedId(dossierId: string): void {
  const lock = readLock();
  if (lock && lock.dossierIds.includes(dossierId)) {
    writeLock({ ...lock, dossierIds: lock.dossierIds.filter((id) => id !== dossierId) });
  }
}
