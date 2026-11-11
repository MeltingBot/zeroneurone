/**
 * What the others are doing, for the element list: who has an element
 * selected, moves or edits it (from their presence), and which elements were
 * just changed from another device (a brief highlight).
 */

import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { syncService } from '../services/syncService';
import { getYMaps } from '../types/yjs';

export interface PeerMark {
  name: string;
  color: string;
  /** Moving or editing it, not only selected */
  active: boolean;
}

/** Presence older than this is a closed tab or a replayed state */
const STALE_MS = 35_000;
/** How long a row stays highlighted after a change from elsewhere */
const TOUCH_MS = 3_000;
/** A larger remote change is a sync catching up, not someone editing */
const MAX_TOUCHED = 10;

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Element id → the people on it; the phone itself left out */
export function peerMarks(states: Map<number, unknown>, selfId: number, now: number): Map<string, PeerMark[]> {
  const marks = new Map<string, PeerMark[]>();
  for (const [clientId, raw] of states) {
    if (clientId === selfId || !raw || typeof raw !== 'object') continue;
    const s = raw as Record<string, unknown>;
    if (typeof s.lastSeen === 'number' && now - s.lastSeen > STALE_MS) continue;
    const name = typeof s.name === 'string' && s.name ? s.name : '?';
    const color = typeof s.color === 'string' ? s.color : '#9a948d';
    const active = new Set([...ids(s.dragging), ...(typeof s.editing === 'string' ? [s.editing] : [])]);
    for (const id of new Set([...ids(s.selection), ...active])) {
      const list = marks.get(id) ?? [];
      list.push({ name, color, active: active.has(id) });
      marks.set(id, list);
    }
  }
  return marks;
}

/** Elements a change from another device touched; empty for a large catch-up */
export function remoteTouchedIds(events: Y.YEvent<Y.AbstractType<unknown>>[], transaction: Y.Transaction): string[] {
  if (transaction.local) return [];
  const touched = new Set<string>();
  for (const event of events) {
    if (event.path.length > 0) touched.add(String(event.path[0]));
    else for (const [key, change] of event.keys) if (change.action !== 'delete') touched.add(key);
  }
  return touched.size > MAX_TOUCHED ? [] : [...touched];
}

/** Who is on which element, kept current with the presence */
export function usePeerMarks(ydoc: Y.Doc | null, connected: boolean): Map<string, PeerMark[]> {
  const [marks, setMarks] = useState<Map<string, PeerMark[]>>(() => new Map());
  useEffect(() => {
    const awareness = ydoc ? syncService.getAwareness() : null;
    if (!awareness) return;
    const update = () => setMarks(peerMarks(awareness.getStates() as Map<number, unknown>, awareness.clientID, Date.now()));
    update();
    awareness.on('change', update);
    // Presence that stops beating ages out without any change event
    const timer = setInterval(update, 10_000);
    return () => {
      awareness.off('change', update);
      clearInterval(timer);
    };
  }, [ydoc, connected]); // the awareness comes with the connection
  return marks;
}

/** Elements just changed from another device */
export function useRemoteTouches(ydoc: Y.Doc | null): Set<string> {
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!ydoc) return;
    const elements = getYMaps(ydoc).elements;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const onChange = (events: Y.YEvent<Y.AbstractType<unknown>>[], transaction: Y.Transaction) => {
      const changed = remoteTouchedIds(events, transaction);
      if (changed.length === 0) return;
      setTouched((current) => new Set([...current, ...changed]));
      for (const id of changed) {
        clearTimeout(timers.get(id));
        timers.set(id, setTimeout(() => {
          timers.delete(id);
          setTouched((current) => {
            const next = new Set(current);
            next.delete(id);
            return next;
          });
        }, TOUCH_MS));
      }
    };
    elements.observeDeep(onChange);
    return () => {
      elements.unobserveDeep(onChange);
      timers.forEach(clearTimeout);
    };
  }, [ydoc]);
  return touched;
}
