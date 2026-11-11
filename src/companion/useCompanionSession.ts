/**
 * Opens a joined dossier on the phone: Y.Doc persisted in IndexedDB, socket
 * to the relay, presence, delivery of what was written offline, and the
 * dossier's data read live from the Y.Doc.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import type { CanvasTab, Comment, Element, Link } from '../types';
import { DEFAULT_SYNC_STATE, getYMaps, type SyncState } from '../types/yjs';
import { syncService } from '../services/syncService';
import { yMapToElement } from '../services/yjs/elementMapper';
import { yMapToLink } from '../services/yjs/linkMapper';
import { yMapToComment } from '../services/yjs/commentMapper';
import { yMapToTab } from '../services/yjs/tabMapper';
import { isAssetComplete, readAssetMeta, type AssetMeta } from '../services/assetSync';
import type { CompanionSession } from './sessions';
import { renameSession } from './sessions';
import { startPresence } from './presence';
import { clearPending, markDisconnected, pendingCount, updateToResend } from './pending';

/** Connected this long after a send: what was sent is considered delivered */
const SETTLE_MS = 2000;

/**
 * syncService holds one dossier, and close() finishes asynchronously: an open
 * started before the previous close ends would see its Y.Doc destroyed by it.
 * Every open and close goes through this chain.
 */
let lifecycle: Promise<unknown> = Promise.resolve();

/** A step that never answers (an IndexedDB open left blocked) must not freeze every later open and close */
const STEP_TIMEOUT_MS = 20_000;

export class StepTimeoutError extends Error {}

function withTimeout<T>(run: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new StepTimeoutError(`no answer after ${ms} ms`)), ms);
    run.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err: unknown) => { clearTimeout(timer); reject(err); },
    );
  });
}

function serialized<T>(step: () => Promise<T>): Promise<T> {
  const run = () => withTimeout(step(), STEP_TIMEOUT_MS);
  const next = lifecycle.then(run, run);
  lifecycle = next.catch((err: unknown) => {
    if (err instanceof StepTimeoutError) console.warn('[Companion] sync step abandoned:', err.message);
  });
  return next;
}

export function closeCompanionSession(): Promise<void> {
  return serialized(() => syncService.close());
}

/** Opening the dossier: past this, the phone says it could not and offers to retry */
const OPEN_TIMEOUT_MS = 15_000;

export interface AssetEntry extends AssetMeta {
  complete: boolean;
}

export interface CompanionData {
  name: string;
  closed: boolean;
  elements: Element[];
  links: Link[];
  comments: Comment[];
  assets: Map<string, AssetEntry>;
  /** Canvas tabs, in their order */
  tabs: CanvasTab[];
}

const EMPTY_DATA: CompanionData = { name: '', closed: false, elements: [], links: [], comments: [], assets: new Map(), tabs: [] };

function readData(ydoc: Y.Doc, dossierId: string): CompanionData {
  const maps = getYMaps(ydoc);
  const elements: Element[] = [];
  maps.elements.forEach((m) => {
    try { elements.push(yMapToElement(m as Y.Map<unknown>)); } catch { /* malformed entry */ }
  });
  const links: Link[] = [];
  maps.links.forEach((m) => {
    try { links.push(yMapToLink(m as Y.Map<unknown>)); } catch { /* malformed entry */ }
  });
  const comments: Comment[] = [];
  maps.comments.forEach((m) => {
    try { comments.push(yMapToComment(m as Y.Map<unknown>)); } catch { /* malformed entry */ }
  });
  const tabs: CanvasTab[] = [];
  maps.tabs.forEach((m) => {
    try { tabs.push(yMapToTab(m as Y.Map<unknown>)); } catch { /* malformed entry */ }
  });
  tabs.sort((a, b) => a.order - b.order);
  const assets = new Map<string, AssetEntry>();
  maps.assets.forEach((m, id) => {
    try {
      const map = m as Y.Map<unknown>;
      assets.set(id, { ...readAssetMeta(map, dossierId), complete: isAssetComplete(map) });
    } catch { /* malformed entry */ }
  });
  return {
    name: (maps.meta.get('name') as string | undefined) ?? '',
    closed: !!maps.meta.get('closedAt'),
    elements,
    links,
    comments,
    assets,
    tabs,
  };
}

export function useCompanionSession(session: CompanionSession) {
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The local copy could not be opened (error, or no answer): retry offered */
  const [openFailed, setOpenFailed] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>(DEFAULT_SYNC_STATE);
  const [data, setData] = useState<CompanionData>(EMPTY_DATA);
  const [pending, setPending] = useState(() => pendingCount(session.dossierId));
  /** Writes still streaming (photo chunks): delivery is not settled before they end */
  const busyRef = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { dossierId } = session;

  // Open the Y.Doc and the socket
  useEffect(() => {
    let cancelled = false;
    let stopPresence: (() => void) | null = null;
    serialized(() => {
      if (cancelled) return Promise.resolve(null);
      syncService.setServerUrl(session.server);
      return syncService.openShared(session.dossierId, session.encryptionKey, session.roomId, true);
    })
      .then((doc) => {
        if (!doc) return;
        setOpenFailed(false);
        if (cancelled) return;
        setYdoc(doc);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.warn('[Companion] open failed:', err);
        setError(err instanceof Error ? err.message : String(err));
        setOpenFailed(true);
      });
    const openTimer = setTimeout(() => {
      if (!cancelled && !syncService.getYDocFor(session.dossierId)) setOpenFailed(true);
    }, OPEN_TIMEOUT_MS);
    const unsubscribe = syncService.onStateChange((state) => {
      setSyncState(state);
      if (state.connected && !stopPresence) stopPresence = startPresence();
      if (!state.connected && stopPresence) {
        stopPresence();
        stopPresence = null;
      }
    });
    return () => {
      cancelled = true;
      clearTimeout(openTimer);
      unsubscribe();
      stopPresence?.();
      void closeCompanionSession();
    };
  }, [session.dossierId, session.encryptionKey, session.roomId, session.server]);

  // Read the dossier live
  useEffect(() => {
    if (!ydoc) return;
    let frame = 0;
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = readData(ydoc, dossierId);
        setData(next);
        if (next.name) renameSession(dossierId, next.name);
      });
    };
    refresh();
    ydoc.on('update', refresh);
    return () => {
      cancelAnimationFrame(frame);
      ydoc.off('update', refresh);
    };
  }, [ydoc, dossierId]);

  // Deliver what was written offline, then forget it once settled
  const settle = useMemo(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = null;
    // This dossier's Y.Doc only: mid-switch the service may hold another one
    const doc = syncService.getYDocFor(dossierId);
    if (!doc || !syncService.getState().connected || busyRef.current > 0) return;
    if (pendingCount(dossierId) === 0) return;
    const update = updateToResend(dossierId, doc);
    if (update && !syncService.broadcastUpdate(update)) return;
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      if (syncService.getState().connected && busyRef.current === 0) {
        clearPending(dossierId);
        setPending(0);
      }
    }, SETTLE_MS);
  }, [dossierId]);

  const wasConnected = useRef(false);
  useEffect(() => {
    if (!ydoc) return;
    if (syncState.connected) {
      settle();
    } else if (wasConnected.current) {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      markDisconnected(dossierId);
    }
    wasConnected.current = syncState.connected;
  }, [ydoc, syncState.connected, settle, dossierId]);

  // A settle skipped because another write was still streaming is retried here
  useEffect(() => {
    const retry = setInterval(() => {
      if (!settleTimer.current && busyRef.current === 0 && pendingCount(dossierId) > 0) settle();
    }, 3000);
    return () => {
      clearInterval(retry);
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, [dossierId, settle]);

  /** Wraps a write: counts it as pending and settles once it is done */
  const track = useMemo(() => async <T,>(write: () => Promise<T> | T): Promise<T> => {
    busyRef.current += 1;
    try {
      const result = await write();
      return result;
    } finally {
      busyRef.current -= 1;
      setPending(pendingCount(dossierId));
      settle();
    }
  }, [dossierId, settle]);

  return { dossierId, ydoc, error, openFailed, syncState, data, pending, track };
}
