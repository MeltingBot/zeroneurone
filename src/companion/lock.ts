/**
 * Locking the companion with the phone's own security: a passkey unlocked by
 * Face ID, a fingerprint or the phone's code, whose PRF secret wraps a random
 * data key. The data key encrypts the dossiers' local copies, the session
 * list (share keys included) and the private half of the key shares from
 * other apps are encrypted to.
 *
 * Every step is ordered so that a phone switched off halfway never leaves
 * data encrypted under a key it could not get back: the wrapped key is
 * written first, the record remembers the step, and the next unlock takes it
 * up. Phones without PRF are not offered the lock (no false sense of safety).
 */

import nacl from 'tweetnacl';
import { isWebAuthnAvailable, registerWebAuthnCredential, unlockWithWebAuthn, type WebAuthnOptions } from '../services/encryption/webauthnService';
import { migrateToEncrypted, migrateToPlaintext } from '../services/encryption/encryptedIndexeddbPersistence';
import { syncService } from '../services/syncService';
import { companionYdocDatabaseName } from '../services/yjs/ydocName';
import { eraseLocalCopy } from './erase';
import {
  fromB64, readLock, seal, setPrompting, setUnlocked, toB64, unlockedKey, unseal, writeLock, type LockRecord,
} from './lockState';
import { adoptLegacyCopy } from './localCopy';
import { clearPending, pendingCount } from './pending';
import { dropAllSessions, listSessions, moveSessions, pendingDeletions, plainSessions } from './sessions';
import { dropAllShares, setSharePublicKey } from './shareInbox';
import { closeCompanionSession } from './useCompanionSession';

/** The phone's own passkey, apart from the desktop's security keys */
const PASSKEY: WebAuthnOptions = {
  platform: true,
  userVerification: 'required',
  userIdKey: 'zeroneurone-companion-passkey-user',
  userName: 'zeroneurone-companion',
  displayName: 'ZeroNeurone',
};

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;

export class LockUnsupportedError extends Error {}

/** How long a step left halfway may take at unlock before it waits for next time */
const RESUME_TIMEOUT_MS = 30_000;

/**
 * Whether the lock can be offered: a passkey of the phone itself, with PRF.
 * 'unknown' when the browser cannot tell before trying (older ones).
 */
export async function lockSupport(): Promise<'yes' | 'no' | 'unknown'> {
  if (!isWebAuthnAvailable()) return 'no';
  try {
    if (!(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) return 'no';
  } catch {
    return 'no';
  }
  const capabilities = await (PublicKeyCredential as unknown as {
    getClientCapabilities?: () => Promise<Record<string, boolean>>;
  }).getClientCapabilities?.().catch(() => null);
  if (capabilities?.['extension:prf'] === false) return 'no';
  return capabilities?.['extension:prf'] ? 'yes' : 'unknown';
}

async function existingDatabases(): Promise<Set<string>> {
  if (typeof indexedDB.databases !== 'function') return new Set();
  return new Set((await indexedDB.databases()).map((d) => d.name ?? ''));
}

/** The open dossier lets go of its database, bounded (it may not answer) */
async function closeDossier(): Promise<void> {
  await Promise.race([
    closeCompanionSession().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
}

function unlockedOrThrow(): Uint8Array {
  const key = unlockedKey();
  if (!key) throw new Error('Locked');
  return key;
}

/** Turns the lock on. Asks for the passkey twice (creation, then its secret). */
export async function enableLock(timeoutMin: number): Promise<void> {
  const dek = nacl.randomBytes(32);
  let entry;
  setPrompting(true);
  try {
    entry = await registerWebAuthnCredential(dek, 'ZeroNeurone', [], PASSKEY);
  } catch (err) {
    if (err instanceof Error && err.message === 'PRF_NOT_SUPPORTED') throw new LockUnsupportedError();
    throw err;
  } finally {
    setPrompting(false);
  }
  const pair = await crypto.subtle.generateKey(ECDH, true, ['deriveKey']) as CryptoKeyPair;
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  // First the wrapped key and the step: nothing is encrypted before
  writeLock({
    v: 1,
    state: 'enabling',
    credentialId: toB64(entry.credentialId),
    prfSalt: toB64(entry.prfSalt),
    encryptedDek: toB64(entry.encryptedDEK),
    dekIv: toB64(entry.dekIV),
    timeoutMin,
    dossierIds: plainSessions().map((s) => s.dossierId),
    sharePublicKey: publicJwk,
    sharePrivateKey: seal(JSON.stringify(privateJwk), dek),
  });
  await becomeUnlocked(dek, privateJwk);
  await completeEnabling();
}

async function becomeUnlocked(dek: Uint8Array, privateJwk: JsonWebKey): Promise<void> {
  const privateKey = await crypto.subtle.importKey('jwk', privateJwk, ECDH, false, ['deriveKey']);
  setUnlocked(dek, privateKey);
  syncService.setAtRestDek(dek);
}

/** Encrypts what is still plain; safe to run again */
async function completeEnabling(): Promise<void> {
  const lock = readLock();
  if (!lock) return;
  const dek = unlockedOrThrow();
  await closeDossier();
  // No plain copy may stay: older copies (former database name) brought into
  // the encrypted one then erased, unless the desktop owns them; copies of
  // forgotten dossiers still there erased
  for (const id of lock.dossierIds) await adoptLegacyCopy(id, true);
  for (const id of pendingDeletions()) await eraseLocalCopy(id);
  const databases = await existingDatabases();
  for (const id of lock.dossierIds) {
    const name = companionYdocDatabaseName(id);
    if (databases.has(name)) await migrateToEncrypted(name, dek);
  }
  const plain = plainSessions();
  if (plain.length > 0) moveSessions(plain, dek);
  // Shares waiting in plain are dropped; new ones come encrypted
  await dropAllShares();
  await setSharePublicKey(lock.sharePublicKey);
  writeLock({ ...readLock()!, state: 'on' });
}

/** Asks for the passkey (call from a tap: Safari requires it) and opens the data key */
export async function unlock(): Promise<void> {
  const lock = readLock();
  if (!lock) return;
  setPrompting(true);
  const { dek } = await unlockWithWebAuthn([{
    credentialId: fromB64(lock.credentialId).buffer,
    prfSalt: fromB64(lock.prfSalt).buffer,
    encryptedDEK: fromB64(lock.encryptedDek).buffer,
    dekIV: fromB64(lock.dekIv).buffer,
    label: 'ZeroNeurone',
    createdAt: '',
  }], PASSKEY).finally(() => setPrompting(false));
  const privateJwk = unseal(lock.sharePrivateKey, dek);
  if (!privateJwk) throw new Error('Share key does not open');
  await becomeUnlocked(dek, JSON.parse(privateJwk) as JsonWebKey);
  // A step left halfway is taken up, bounded: if it fails or does not answer
  // (IndexedDB), the phone stays unlocked and the step waits for next time
  const step = lock.state === 'enabling' ? completeEnabling : lock.state === 'disabling' ? completeDisabling : null;
  if (step) {
    await Promise.race([step(), new Promise((resolve) => setTimeout(resolve, RESUME_TIMEOUT_MS))])
      .catch((err: unknown) => console.warn('[Companion] lock step left for next unlock:', err));
  }
}

/** Turns the lock off (unlocked): everything back in plain, the record last */
export async function disableLock(): Promise<void> {
  const lock = readLock();
  if (!lock) return;
  unlockedOrThrow();
  writeLock({ ...lock, state: 'disabling' });
  await completeDisabling();
}

async function completeDisabling(): Promise<void> {
  const lock = readLock();
  if (!lock) return;
  const dek = unlockedOrThrow();
  await closeDossier();
  const databases = await existingDatabases();
  for (const id of lock.dossierIds) {
    const name = companionYdocDatabaseName(id);
    if (databases.has(name)) await migrateToPlaintext(name, dek);
  }
  const sealed = listSessions();
  moveSessions(sealed.length > 0 ? sealed : plainSessions(), null);
  await setSharePublicKey(null);
  await dropAllShares();
  writeLock(null);
  setUnlocked(null, null);
  syncService.setAtRestDek(null);
}

export function setLockDelay(timeoutMin: number): void {
  const lock = readLock();
  if (lock) writeLock({ ...lock, timeoutMin });
}

/**
 * Without the passkey (lost, phone reset): every dossier copy, the session
 * list and waiting shares are erased, then the lock goes. The dossiers stay
 * on the computers: scanning their QR code again brings them back.
 */
export async function forgetEverything(): Promise<void> {
  const lock: LockRecord | null = readLock();
  const ids = new Set([...(lock?.dossierIds ?? []), ...pendingDeletions()]);
  await closeDossier();
  for (const id of ids) {
    await eraseLocalCopy(id);
    clearPending(id);
  }
  dropAllSessions();
  await setSharePublicKey(null).catch(() => undefined);
  await dropAllShares().catch(() => undefined);
  writeLock(null);
  setUnlocked(null, null);
  syncService.setAtRestDek(null);
}

/** Changes not sent yet in the dossiers kept, lost by "Forget everything" (readable locked) */
export function unsentChanges(): number {
  const lock = readLock();
  return (lock?.dossierIds ?? []).reduce((sum, id) => sum + pendingCount(id), 0);
}
