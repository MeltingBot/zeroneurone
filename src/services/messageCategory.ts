/**
 * The category of a message in a signed room (writeAccess.ts), in clear in
 * front of the encrypted payload (`ZNC` magic and one byte, relay/access.js):
 * presence, request or data. The relay passes a reader's presence and
 * requests only; a receiver checks that the decrypted message is of the
 * category it came under, so a reader cannot pass changes off as presence.
 */

import * as decoding from 'lib0/decoding';
import { MSG_ASSET_REQUEST } from './assetRequests';

export const CATEGORY = { presence: 1, request: 2, data: 3 } as const;
export type Category = (typeof CATEGORY)[keyof typeof CATEGORY];

const MAGIC = [0xff, 0x5a, 0x4e, 0x43];

// y-websocket message types (y-websocket/src/y-websocket.js)
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_QUERY_AWARENESS = 3;
const SYNC_STEP_1 = 0;

/** What a plain (decrypted) message is; anything unknown counts as data */
export function categoryOf(message: Uint8Array): Category {
  try {
    const decoder = decoding.createDecoder(message);
    const type = decoding.readVarUint(decoder);
    if (type === MESSAGE_SYNC) {
      return decoding.readVarUint(decoder) === SYNC_STEP_1 ? CATEGORY.request : CATEGORY.data;
    }
    if (type === MESSAGE_AWARENESS) return CATEGORY.presence;
    if (type === MESSAGE_QUERY_AWARENESS || type === MSG_ASSET_REQUEST) return CATEGORY.request;
  } catch { /* malformed: data, the strictest */ }
  return CATEGORY.data;
}

export function withCategory(category: Category, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(MAGIC.length + 1 + payload.length);
  out.set(MAGIC, 0);
  out[MAGIC.length] = category;
  out.set(payload, MAGIC.length + 1);
  return out;
}

/** The category and the rest of a received frame, or null when it has none */
export function readCategory(frame: Uint8Array): { category: number; body: Uint8Array } | null {
  if (frame.length < MAGIC.length + 1) return null;
  for (let i = 0; i < MAGIC.length; i++) if (frame[i] !== MAGIC[i]) return null;
  return { category: frame[MAGIC.length], body: frame.subarray(MAGIC.length + 1) };
}
