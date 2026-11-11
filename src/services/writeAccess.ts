/**
 * Read-only sharing, client side (the relay's half: relay/access.js).
 *
 * A dossier shared with a read link lives in a signed room, named after the
 * public half of a write key (Ed25519): `w1-` + base64url(SHA-256 of the
 * key). Every link carries the public key; only write links carry the seed of
 * the private key. A writer signs the room and the time at each connection
 * (the proof is valid five minutes, so it is made again on every reconnection,
 * encryptedWebSocket.ts); a reader connects with the public key alone, and the
 * relay passes on only its presence and requests.
 *
 * The share link carries the seed locked by a six-digit write code (`wlock`):
 * without the code, the link only reads. The code guards the original against
 * a change by mistake; it does not hold against someone who has the link and
 * tries every code.
 */

import nacl from 'tweetnacl';

export const SIGNED_ROOM_PREFIX = 'w1-';

export interface WriteAccess {
  /** Public write key, base64url (32 bytes) */
  publicKey: string;
  /** Seed of the private write key, base64url (32 bytes): write links only */
  seed?: string;
}

const toB64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function fromB64url(value: string): Uint8Array {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** A new write key (for a share with a read link) */
export function generateWriteAccess(): Required<WriteAccess> {
  const seed = nacl.randomBytes(32);
  const { publicKey } = nacl.sign.keyPair.fromSeed(seed);
  return { publicKey: toB64url(publicKey), seed: toB64url(seed) };
}

/** The room of a write key */
export async function signedRoomId(publicKey: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(fromB64url(publicKey))));
  return SIGNED_ROOM_PREFIX + toB64url(digest);
}

/** Whether a room (dossier or files room) is a signed one */
export function isSignedRoom(roomId: string): boolean {
  return roomId.startsWith(SIGNED_ROOM_PREFIX);
}

/** Whether these keys only read */
export function isReadOnly(access: WriteAccess | null | undefined): boolean {
  return !!access && !access.seed;
}

/** Whether a string is a 32-byte base64url key */
export function isValidAccessKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
  try { return fromB64url(value).length === 32; } catch { return false; }
}

/**
 * Seconds to add to this device's clock to get the relay's (its /health),
 * so that a device whose clock is off still proves writing: the relay
 * refuses a proof more than five minutes from its own time.
 */
let relayClockOffsetS = 0;

export function setRelayClockOffset(seconds: number): void {
  relayClockOffsetS = Number.isFinite(seconds) ? Math.round(seconds) : 0;
}

export function relayNow(): number {
  return Math.floor(Date.now() / 1000) + relayClockOffsetS;
}

export function writeProofMessage(roomId: string, timestamp: number): string {
  return `zn-write-v1:${roomId}:${timestamp}`;
}

/**
 * The connection URL of a signed room with the write key, and a fresh proof
 * when the key can write. `url` ends with the room, then its query.
 */
export function withAccess(url: string, access: WriteAccess, nowSeconds = relayNow()): string {
  const parsed = new URL(url);
  const roomId = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() ?? '');
  parsed.searchParams.set('wpub', access.publicKey);
  parsed.searchParams.delete('wts');
  parsed.searchParams.delete('wsig');
  if (access.seed) {
    const { secretKey } = nacl.sign.keyPair.fromSeed(fromB64url(access.seed));
    const signature = nacl.sign.detached(new TextEncoder().encode(writeProofMessage(roomId, nowSeconds)), secretKey);
    parsed.searchParams.set('wts', String(nowSeconds));
    parsed.searchParams.set('wsig', toB64url(signature));
  }
  return parsed.toString();
}

const WRITE_CODE_ITERATIONS = 300_000;
const lockCache = new Map<string, string>();

/** The write code of a key: six digits, from the seed (nothing to store) */
export async function writeCodeOf(seed: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`zn-write-code-v1:${seed}`)));
  const value = new DataView(digest.buffer).getUint32(0) % 1_000_000;
  return String(value).padStart(6, '0');
}

async function codeKey(code: string, publicKey: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: Uint8Array.from(fromB64url(publicKey)), iterations: WRITE_CODE_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// One key per (code, public key), which locks one value only: a fixed IV is safe
const LOCK_IV = new Uint8Array(12);

/** The seed locked by the write code, for the share link */
export async function lockSeed(access: Required<WriteAccess>): Promise<string> {
  const cached = lockCache.get(access.publicKey);
  if (cached) return cached;
  const key = await codeKey(await writeCodeOf(access.seed), access.publicKey);
  const locked = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: LOCK_IV }, key, Uint8Array.from(fromB64url(access.seed))));
  const value = toB64url(locked);
  lockCache.set(access.publicKey, value);
  return value;
}

/** The seed from the link and the write code, or null when the code is wrong */
export async function unlockSeed(publicKey: string, locked: string, code: string): Promise<string | null> {
  try {
    const key = await codeKey(code.trim(), publicKey);
    const seed = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: LOCK_IV }, key, Uint8Array.from(fromB64url(locked))));
    const value = toB64url(seed);
    // The seed must be that of the room's key
    return toB64url(nacl.sign.keyPair.fromSeed(seed).publicKey) === publicKey ? value : null;
  } catch {
    return null;
  }
}

/** Whether a string is a locked seed (32 bytes + 16 of tag, base64url) */
export function isValidWriteLock(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{64}$/.test(value);
}
