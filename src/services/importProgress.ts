import { useSyncExternalStore } from 'react';
import { db } from '../db/database';

/**
 * Progress of the running import, for every format: the elements and links
 * written so far, counted by Dexie hooks rather than by each importer. A
 * total is not known for every format, so it is a count, not a percentage.
 * Media files are reported by the importer itself, with their total.
 */

export interface ImportProgress {
  active: boolean;
  elements: number;
  links: number;
  /** Media files processed so far, out of the total in the archive */
  media: { done: number; total: number } | null;
}

const IDLE: ImportProgress = { active: false, elements: 0, links: 0, media: null };
let snapshot: ImportProgress = IDLE;
let counts: Omit<ImportProgress, 'active'> = { elements: 0, links: 0, media: null };
let running = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function publish() {
  timer = null;
  snapshot = running > 0 ? { active: true, ...counts } : IDLE;
  listeners.forEach((listener) => listener());
}

// Hooks fire once per row, thousands of times: publish at most every 100 ms
function schedule() {
  if (!timer) timer = setTimeout(publish, 100);
}

const countElement = () => { counts.elements++; schedule(); };
const countLink = () => { counts.links++; schedule(); };

/** Media files processed by the running import; ignored when none is running. */
export function reportMediaProgress(done: number, total: number): void {
  if (running === 0) return;
  counts.media = { done, total };
  schedule();
}

/** Runs an import while counting what it writes. Nested calls share one count. */
export async function withImportProgress<T>(run: () => Promise<T>): Promise<T> {
  if (running++ === 0) {
    counts = { elements: 0, links: 0, media: null };
    db.elements.hook('creating', countElement);
    db.links.hook('creating', countLink);
    publish();
  }
  try {
    return await run();
  } finally {
    if (--running === 0) {
      db.elements.hook('creating').unsubscribe(countElement);
      db.links.hook('creating').unsubscribe(countLink);
      if (timer) clearTimeout(timer);
      publish();
    }
  }
}

export function useImportProgress(): ImportProgress {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => snapshot,
  );
}
