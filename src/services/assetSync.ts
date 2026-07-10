/**
 * AssetSync - Chunked binary transfer of assets via Y.Doc
 *
 * Assets are stored in the Y.Doc as a Y.Map per asset, with binary data
 * split into a Y.Array<Uint8Array> of fixed-size chunks. This lets peers:
 *  - Receive assets progressively (one WS message per chunk)
 *  - Track byte-level progress in real time
 *  - Resume after disconnect (Y.js CRDT delivers missing chunks)
 *  - Avoid blocking the main thread on large base64 conversions
 */

import * as Y from 'yjs';
import type { Asset } from '../types';

/** Chunk size for asset binary transfer (512 KB). Larger chunks mean fewer
 *  WebSocket messages, keeping asset transfers well under the relay's per-second
 *  message rate limit (exceeding it makes the relay silently drop updates,
 *  which leaves media stuck mid-transfer). */
export const ASSET_CHUNK_SIZE = 512 * 1024;

/** Delay between chunk pushes (ms). Throttles the message rate so a burst of
 *  chunks (several media at once) never trips the relay rate limit. */
export const ASSET_CHUNK_SEND_DELAY_MS = 12;

/** Hard cap on asset size in shared mode. Larger files are refused. */
export const MAX_SHARED_ASSET_SIZE = 50 * 1024 * 1024;

/** Asset metadata as carried in the Y.Map (no binary). */
export interface AssetMeta {
  id: string;
  dossierId: string;
  filename: string;
  mimeType: string;
  size: number;
  hash: string;
  thumbnailDataUrl: string | null;
  extractedText: string | null;
  createdAt: Date;
}

export function readAssetMeta(map: Y.Map<any>, fallbackDossierId: string): AssetMeta {
  return {
    id: map.get('id') as string,
    dossierId: map.get('dossierId') || fallbackDossierId,
    filename: map.get('filename') || 'unknown',
    mimeType: map.get('mimeType') || 'application/octet-stream',
    size: map.get('size') || 0,
    hash: map.get('hash') || '',
    thumbnailDataUrl: map.get('thumbnailDataUrl') || null,
    extractedText: map.get('extractedText') || null,
    createdAt: map.get('createdAt') ? new Date(map.get('createdAt')) : new Date(),
  };
}

export function getChunksArray(map: Y.Map<any>): Y.Array<Uint8Array> | null {
  const chunks = map.get('chunks');
  return chunks instanceof Y.Array ? (chunks as Y.Array<Uint8Array>) : null;
}

export function getChunkCount(map: Y.Map<any>): number {
  return Number(map.get('chunkCount')) || 0;
}

export function isAssetComplete(map: Y.Map<any>): boolean {
  const arr = getChunksArray(map);
  if (!arr) return false;
  const expected = getChunkCount(map);
  return expected > 0 && arr.length >= expected;
}

/** Sum of bytes currently present in the chunks Y.Array. */
export function getReceivedBytes(map: Y.Map<any>): number {
  const arr = getChunksArray(map);
  if (!arr) return 0;
  let total = 0;
  arr.forEach((c) => {
    if (c instanceof Uint8Array) total += c.byteLength;
  });
  return total;
}

/** Assemble all chunks into a single Uint8Array. Call only when complete. */
export function assembleChunks(map: Y.Map<any>): Uint8Array {
  const arr = getChunksArray(map);
  if (!arr) return new Uint8Array(0);
  const parts: Uint8Array[] = [];
  let total = 0;
  arr.forEach((c) => {
    if (c instanceof Uint8Array) {
      parts.push(c);
      total += c.byteLength;
    }
  });
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of parts) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/**
 * Push an asset to the Y.Doc as chunked binary.
 *
 * Each chunk is pushed in its own microtask boundary so that Y.js emits one
 * update per chunk (one WebSocket message), letting peers track granular
 * progress and the WebSocket flush between chunks.
 *
 * @param onChunkSent  Called after each chunk push with cumulative bytes sent.
 *                     Use it to drive the source-side progress UI.
 */
export async function pushAssetChunked(
  ydoc: Y.Doc,
  assetsMap: Y.Map<any>,
  asset: Asset,
  arrayBuffer: ArrayBuffer,
  onChunkSent?: (bytesSent: number, totalBytes: number) => void,
): Promise<void> {
  const totalSize = arrayBuffer.byteLength;
  const chunkCount = Math.max(1, Math.ceil(totalSize / ASSET_CHUNK_SIZE));

  const chunksArray = new Y.Array<Uint8Array>();
  const assetYMap = new Y.Map<any>();

  // Set all metadata + empty chunks array atomically so peers see a coherent
  // asset entry before chunks start arriving.
  ydoc.transact(() => {
    assetYMap.set('id', asset.id);
    assetYMap.set('dossierId', asset.dossierId);
    assetYMap.set('filename', asset.filename);
    assetYMap.set('mimeType', asset.mimeType);
    assetYMap.set('size', asset.size);
    assetYMap.set('hash', asset.hash);
    assetYMap.set('thumbnailDataUrl', asset.thumbnailDataUrl);
    assetYMap.set('extractedText', asset.extractedText);
    assetYMap.set('createdAt', asset.createdAt.toISOString());
    assetYMap.set('chunkSize', ASSET_CHUNK_SIZE);
    assetYMap.set('chunkCount', chunkCount);
    assetYMap.set('chunks', chunksArray);
    assetsMap.set(asset.id, assetYMap);
  });

  for (let i = 0; i < chunkCount; i++) {
    const start = i * ASSET_CHUNK_SIZE;
    const end = Math.min(start + ASSET_CHUNK_SIZE, totalSize);
    // Copy the slice into a fresh Uint8Array so Y.js owns its memory.
    const chunk = new Uint8Array(arrayBuffer.slice(start, end));
    chunksArray.push([chunk]);
    onChunkSent?.(end, totalSize);
    // Throttle: one WS message per chunk. A short delay keeps the message rate
    // under the relay's per-second cap (over it, updates are dropped and the
    // asset never assembles), and lets the WebSocket drain between chunks.
    await new Promise<void>((resolve) => setTimeout(resolve, ASSET_CHUNK_SEND_DELAY_MS));
  }
}
