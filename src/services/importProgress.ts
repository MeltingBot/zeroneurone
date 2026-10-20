import { useSyncExternalStore } from 'react';
import { db } from '../db/database';

/**
 * Progress of the running import, for every format: the elements and links
 * written so far, counted by Dexie hooks rather than by each importer. A
 * total is not known for every format, so it is a count, not a percentage.
 */

export interface ImportProgress {
  active: boolean;
  elements: number;
  links: number;
}

const IDLE: ImportProgress = { active: false, elements: 0, links: 0 };
let snapshot: ImportProgress = IDLE;
let counts = { elements: 0, links: 0 };
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

/** Runs an import while counting what it writes. Nested calls share one count. */
export async function withImportProgress<T>(run: () => Promise<T>): Promise<T> {
  if (running++ === 0) {
    counts = { elements: 0, links: 0 };
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
