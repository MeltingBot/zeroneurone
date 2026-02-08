import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@xyflow/react';
import { db } from '../db/database';
import { fileService } from '../services/fileService';

/**
 * HD image LOD (Level of Detail) hook.
 *
 * When a node's rendered size on screen exceeds 250px (node dimension × zoom),
 * loads the full-resolution image from OPFS and returns a blob URL.
 * Falls back to null (caller should use thumbnail).
 *
 * Uses a shared LRU cache (max 30 blob URLs) to avoid VRAM explosion.
 * Only subscribes to zoom via a boolean selector — no re-render on every zoom frame.
 */

const HD_THRESHOLD = 250; // px on screen before switching to HD
const MAX_CACHE = 30;

// ── Shared LRU cache (singleton across all ElementNode instances) ──

const cache = new Map<string, string>(); // assetId → blobUrl
const lruOrder: string[] = [];
const pendingLoads = new Set<string>();

function touchLru(assetId: string) {
  const idx = lruOrder.indexOf(assetId);
  if (idx > -1) lruOrder.splice(idx, 1);
  lruOrder.push(assetId);
}

function evictOldest() {
  while (cache.size >= MAX_CACHE && lruOrder.length > 0) {
    const evictId = lruOrder.shift()!;
    const evictUrl = cache.get(evictId);
    if (evictUrl) URL.revokeObjectURL(evictUrl);
    cache.delete(evictId);
  }
}

async function loadHdImage(assetId: string): Promise<string | null> {
  // Already cached
  if (cache.has(assetId)) {
    touchLru(assetId);
    return cache.get(assetId)!;
  }

  // Already loading
  if (pendingLoads.has(assetId)) return null;

  pendingLoads.add(assetId);
  try {
    const asset = await db.assets.get(assetId);
    if (!asset || !asset.mimeType.startsWith('image/')) return null;

    const file = await fileService.getAssetFile(asset);
    const blobUrl = URL.createObjectURL(file);

    evictOldest();
    cache.set(assetId, blobUrl);
    lruOrder.push(assetId);
    return blobUrl;
  } catch (e) {
    console.warn('[useHdImage] Failed to load HD image:', e);
    return null;
  } finally {
    pendingLoads.delete(assetId);
  }
}

// ── Hook ──

export function useHdImage(
  assetId: string | undefined,
  nodeWidth: number,
  nodeHeight: number
): string | null {
  // Synchronous cache check for initial state (avoids flash)
  const [hdUrl, setHdUrl] = useState<string | null>(() => {
    return assetId ? cache.get(assetId) ?? null : null;
  });

  // Boolean selector: only re-renders when threshold is crossed, not on every zoom frame.
  // 1000 selectors × 1 multiply + 1 compare = ~0.1ms per frame — negligible.
  const needsHd = useStore(
    useCallback(
      (state: { transform: [number, number, number] }) => {
        if (!assetId) return false;
        const zoom = state.transform[2];
        return Math.max(nodeWidth, nodeHeight) * zoom > HD_THRESHOLD;
      },
      [assetId, nodeWidth, nodeHeight]
    )
  );

  useEffect(() => {
    if (!needsHd || !assetId) {
      setHdUrl(null);
      return;
    }

    // Synchronous cache hit
    const cached = cache.get(assetId);
    if (cached) {
      touchLru(assetId);
      setHdUrl(cached);
      return;
    }

    // Async load from OPFS
    let cancelled = false;
    loadHdImage(assetId).then(url => {
      if (!cancelled && url) setHdUrl(url);
    });

    return () => { cancelled = true; };
  }, [needsHd, assetId]);

  return hdUrl;
}
