/**
 * Asking a computer for an attachment's bytes (the phone, which does not sync
 * the files document) and answering with them. Custom y-websocket message
 * types in the dossier's room, encrypted like every message; answers go to
 * the asker alone (relay "for one client" messages, relay/forward.js).
 *
 * Pure encoding: shared by the desktop (answers) and the companion (asks).
 */

import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';

export const MSG_ASSET_REQUEST = 100;
export const MSG_ASSET_CHUNK = 101;
export const MSG_ASSET_MISSING = 102;

/** A request older than this was replayed late by the relay: not answered */
export const REQUEST_MAX_AGE_S = 60;

export interface AssetRequest {
  assetId: string;
  /** The asker's relay client tag: the answer goes to it alone */
  replyTo: string;
  /** Seconds since epoch */
  at: number;
}

export interface AssetChunk {
  assetId: string;
  index: number;
  total: number;
  bytes: Uint8Array;
}

export function encodeRequest(request: AssetRequest): Uint8Array {
  const e = encoding.createEncoder();
  encoding.writeVarUint(e, MSG_ASSET_REQUEST);
  encoding.writeVarString(e, request.assetId);
  encoding.writeVarString(e, request.replyTo);
  encoding.writeVarUint(e, request.at);
  return encoding.toUint8Array(e);
}

/** Read after the message type (y-websocket has read it) */
export function decodeRequest(d: decoding.Decoder): AssetRequest {
  return { assetId: decoding.readVarString(d), replyTo: decoding.readVarString(d), at: decoding.readVarUint(d) };
}

export function encodeChunk(chunk: AssetChunk): Uint8Array {
  const e = encoding.createEncoder();
  encoding.writeVarUint(e, MSG_ASSET_CHUNK);
  encoding.writeVarString(e, chunk.assetId);
  encoding.writeVarUint(e, chunk.index);
  encoding.writeVarUint(e, chunk.total);
  encoding.writeVarUint8Array(e, chunk.bytes);
  return encoding.toUint8Array(e);
}

export function decodeChunk(d: decoding.Decoder): AssetChunk {
  return {
    assetId: decoding.readVarString(d),
    index: decoding.readVarUint(d),
    total: decoding.readVarUint(d),
    bytes: decoding.readVarUint8Array(d),
  };
}

export function encodeMissing(assetId: string): Uint8Array {
  const e = encoding.createEncoder();
  encoding.writeVarUint(e, MSG_ASSET_MISSING);
  encoding.writeVarString(e, assetId);
  return encoding.toUint8Array(e);
}

export function decodeMissing(d: decoding.Decoder): string {
  return decoding.readVarString(d);
}

/** Whether a request is fresh enough to answer */
export function isFresh(request: AssetRequest, nowS = Math.floor(Date.now() / 1000)): boolean {
  return nowS - request.at <= REQUEST_MAX_AGE_S;
}
