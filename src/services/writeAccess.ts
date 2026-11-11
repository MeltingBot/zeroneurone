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
