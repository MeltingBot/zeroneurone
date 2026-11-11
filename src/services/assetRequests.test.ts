import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import * as decoding from 'lib0/decoding';
import {
  MSG_ASSET_CHUNK, MSG_ASSET_MISSING, MSG_ASSET_REQUEST,
  decodeChunk, decodeMissing, decodeRequest, encodeChunk, encodeMissing, encodeRequest, isFresh,
} from './assetRequests';
import { isOnDemand, pushAssetMeta } from './assetSync';

const read = (bytes: Uint8Array) => {
  const d = decoding.createDecoder(bytes);
  return { type: decoding.readVarUint(d), d };
};

describe('attachment requests', () => {
  it('round-trips a request, a chunk and a "missing" answer', () => {
    const req = read(encodeRequest({ assetId: 'a1', replyTo: 'phoneTag', at: 1000 }));
    expect(req.type).toBe(MSG_ASSET_REQUEST);
    expect(decodeRequest(req.d)).toEqual({ assetId: 'a1', replyTo: 'phoneTag', at: 1000 });

    const chunk = read(encodeChunk({ assetId: 'a1', index: 2, total: 3, bytes: new Uint8Array([7, 8, 9]) }));
    expect(chunk.type).toBe(MSG_ASSET_CHUNK);
    expect(decodeChunk(chunk.d)).toEqual({ assetId: 'a1', index: 2, total: 3, bytes: new Uint8Array([7, 8, 9]) });

    const missing = read(encodeMissing('a1'));
    expect(missing.type).toBe(MSG_ASSET_MISSING);
    expect(decodeMissing(missing.d)).toBe('a1');
  });

  it('answers only recent requests (one relayed late is ignored)', () => {
    expect(isFresh({ assetId: 'a', replyTo: 't', at: 1000 }, 1030)).toBe(true);
    expect(isFresh({ assetId: 'a', replyTo: 't', at: 1000 }, 1200)).toBe(false);
  });

  it('puts only metadata and thumbnail in the main document', () => {
    const doc = new Y.Doc();
    const assets = doc.getMap('assets') as Y.Map<Y.Map<unknown>>;
    pushAssetMeta(doc, assets, {
      id: 'a1', dossierId: 'd', filename: 'p.jpg', mimeType: 'image/jpeg', size: 1234, hash: 'h',
      opfsPath: '', thumbnailDataUrl: 'data:image/jpeg;base64,xx', extractedText: null, createdAt: new Date(0),
    });
    const entry = assets.get('a1')!;
    expect(isOnDemand(entry)).toBe(true);
    expect(entry.get('chunks')).toBeUndefined();
    expect(entry.get('thumbnailDataUrl')).toBe('data:image/jpeg;base64,xx');
  });
});
