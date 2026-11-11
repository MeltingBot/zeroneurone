/**
 * Getting an attachment's bytes from a computer of the dossier (the phone does
 * not sync the files document, filesSync.ts): asked in the dossier's room,
 * answered in chunks to this phone alone (assetRequests.ts).
 */

import {
  MSG_ASSET_CHUNK, MSG_ASSET_MISSING, decodeChunk, decodeMissing, encodeRequest,
} from '../services/assetRequests';
import { syncService } from '../services/syncService';

/** No chunk for this long: no computer answers */
const ANSWER_TIMEOUT_MS = 15_000;

export class FileUnavailableError extends Error {}

interface Pending {
  chunks: (Uint8Array | undefined)[];
  received: number;
  total: number;
  onProgress?: (received: number, total: number) => void;
  resolve: (bytes: Uint8Array) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, Pending>();

function rearm(assetId: string, p: Pending): void {
  clearTimeout(p.timer);
  p.timer = setTimeout(() => {
    pending.delete(assetId);
    p.reject(new FileUnavailableError('No answer'));
  }, ANSWER_TIMEOUT_MS);
}

syncService.setMessageHandler(MSG_ASSET_CHUNK, (decoder) => {
  const chunk = decodeChunk(decoder);
  const p = pending.get(chunk.assetId);
  if (!p) return;
  p.total = chunk.total;
  // Two computers may answer: each chunk counted once
  if (!p.chunks[chunk.index]) {
    p.chunks[chunk.index] = chunk.bytes;
    p.received++;
  }
  p.onProgress?.(p.received, p.total);
  if (p.received < p.total) {
    rearm(chunk.assetId, p);
    return;
  }
  clearTimeout(p.timer);
  pending.delete(chunk.assetId);
  const size = p.chunks.reduce((sum, c) => sum + (c?.length ?? 0), 0);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of p.chunks) {
    bytes.set(c!, offset);
    offset += c!.length;
  }
  p.resolve(bytes);
});

syncService.setMessageHandler(MSG_ASSET_MISSING, (decoder) => {
  const assetId = decodeMissing(decoder);
  const p = pending.get(assetId);
  // Another computer may still have it: only the wait ends it
  if (p) rearm(assetId, p);
});

/**
 * Asks the computers online for an attachment. Rejects with
 * FileUnavailableError when none is online or none answers.
 */
export function requestFile(assetId: string, onProgress?: (received: number, total: number) => void): Promise<Uint8Array> {
  const tag = syncService.getClientTag();
  if (!tag || syncService.getState().peerCount === 0) return Promise.reject(new FileUnavailableError('No computer online'));
  const existing = pending.get(assetId);
  if (existing) {
    existing.onProgress = onProgress;
    return new Promise((resolve, reject) => {
      const { resolve: r0, reject: j0 } = existing;
      existing.resolve = (b) => { r0(b); resolve(b); };
      existing.reject = (e) => { j0(e); reject(e); };
    });
  }
  return new Promise((resolve, reject) => {
    const p: Pending = { chunks: [], received: 0, total: 1, onProgress, resolve, reject, timer: setTimeout(() => {}, 0) };
    pending.set(assetId, p);
    rearm(assetId, p);
    if (!syncService.sendToRoom(encodeRequest({ assetId, replyTo: tag, at: Math.floor(Date.now() / 1000) }))) {
      clearTimeout(p.timer);
      pending.delete(assetId);
      reject(new FileUnavailableError('Not connected'));
    }
  });
}
