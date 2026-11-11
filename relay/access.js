/**
 * Read-only sharing: who may change a dossier.
 *
 * A dossier shared with a read link lives in a "signed" room, named after the
 * public half of a write key (Ed25519): `w1-` + base64url(SHA-256 of the
 * key), plus `.files` for its files room. Every link carries the public key
 * (`wpub=`); only write links hold the private one, which signs the room and
 * the time at connection (`wts=`, `wsig=`). The relay recomputes the room
 * name from the key, so nothing has to be remembered: a reader cannot bring
 * another key, nor register one first while the room is empty.
 *
 * Each message of a signed room carries its category in clear (`ZNC` magic
 * and one byte, after the `ZNT` header of a message for one client):
 * presence, request (asking to sync, asking for a file) or data (changes,
 * sync answers, file chunks). From a reader, the relay passes presence and
 * requests only. Clients apply document content only from data messages, so
 * a reader lying about a category gets nothing through either.
 *
 * Rooms not named `w1-` work as before: everyone writes.
 * Used by relay/index.js and server/index.js.
 */

import { createHash, createPublicKey, verify } from 'node:crypto';

export const SIGNED_ROOM_PREFIX = 'w1-';
/** A write proof older (or newer) than this is refused */
export const WRITE_PROOF_MAX_AGE_S = 300;

export const CATEGORY = Object.freeze({ presence: 1, request: 2, data: 3 });
const CATEGORY_MAGIC = [0xff, 0x5a, 0x4e, 0x43];

const FILES_SUFFIX = '.files';
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/** The room name for a write public key (32 raw bytes) */
export function roomIdForKey(publicKey) {
  const digest = createHash('sha256').update(Buffer.from(publicKey)).digest('base64url');
  return SIGNED_ROOM_PREFIX + digest;
}

/** What a write key signs to prove it at connection */
export function writeProofMessage(roomId, timestamp) {
  return `zn-write-v1:${roomId}:${timestamp}`;
}

function signedBase(roomId) {
  if (!roomId.startsWith(SIGNED_ROOM_PREFIX)) return null;
  return roomId.endsWith(FILES_SUFFIX) ? roomId.slice(0, -FILES_SUFFIX.length) : roomId;
}

function fromB64url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  return Buffer.from(value, 'base64url');
}

/**
 * Who connects to `roomId`, from its URL parameters: `{ writer }`, or
 * `{ refused }` with the reason.
 */
export function accessOf(roomId, params, nowSeconds = Math.floor(Date.now() / 1000)) {
  const base = signedBase(roomId);
  if (!base) return { writer: true };

  const publicKey = fromB64url(params.get('wpub'));
  if (!publicKey || publicKey.length !== 32 || roomIdForKey(publicKey) !== base) {
    return { refused: 'write key does not match the room' };
  }
  const signature = params.get('wsig');
  if (!signature) return { writer: false };

  const timestamp = Number(params.get('wts'));
  if (!Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > WRITE_PROOF_MAX_AGE_S) {
    return { refused: 'write proof expired' };
  }
  const sig = fromB64url(signature);
  if (!sig || sig.length !== 64) return { refused: 'invalid write proof' };
  const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, publicKey]), format: 'der', type: 'spki' });
  // The room as the client named it: a proof for the files room is not one for the dossier room
  const valid = verify(null, Buffer.from(writeProofMessage(roomId, timestamp)), key, sig);
  return valid ? { writer: true } : { refused: 'invalid write proof' };
}

/** The category of a message (without its `ZNT` header), or null when it has none */
export function categoryOf(data) {
  if (data.length < CATEGORY_MAGIC.length + 1) return null;
  for (let i = 0; i < CATEGORY_MAGIC.length; i++) if (data[i] !== CATEGORY_MAGIC[i]) return null;
  return data[CATEGORY_MAGIC.length];
}

/** Whether the relay passes a reader's message on: presence and requests only */
export function readerMayRelay(data) {
  const category = categoryOf(data);
  return category === CATEGORY.presence || category === CATEGORY.request;
}
