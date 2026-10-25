import { useSyncExternalStore } from 'react';
import { useProgressStore } from '../stores/progressStore';

/**
 * Progress of the archive being built (ZIP, encrypted ZIP, Obsidian vault):
 * the attached files read, then the compression, then the encryption. Shown
 * in the export modal and by the activity bar.
 */

export type ExportPhase = 'files' | 'data' | 'compress' | 'encrypt';

export interface ExportProgress {
  active: boolean;
  phase: ExportPhase | null;
  /** files: read so far / total; compress: percent */
  done: number;
  total: number;
}

const IDLE: ExportProgress = { active: false, phase: null, done: 0, total: 0 };
let snapshot: ExportProgress = IDLE;
let pending: ExportProgress = IDLE;
let running = 0;
let lastPublish = 0;
const listeners = new Set<() => void>();
const TASK = 'export';

/** Overall share of the work, for the activity bar */
function overallPercent(p: ExportProgress): number | null {
  if (!p.phase) return null;
  const share = p.total > 0 ? p.done / p.total : 0;
  if (p.phase === 'files') return Math.round(share * 35);
  if (p.phase === 'data') return 35;
  if (p.phase === 'compress') return 40 + Math.round(share * 55);
  return 95;
}

function publish() {
  lastPublish = Date.now();
  snapshot = running > 0 ? pending : IDLE;
  if (running > 0) useProgressStore.getState().update(TASK, overallPercent(snapshot));
  listeners.forEach((listener) => listener());
}

/**
 * Reported by the export service. A new phase is published at once; within a
 * phase, at most every 100 ms. Published right away, not on a timer: the
 * archive keeps the page busy and a timer would only fire at the end.
 */
export function reportExportProgress(phase: ExportPhase, done: number, total: number): void {
  if (running === 0) return;
  const newPhase = pending.phase !== phase;
  pending = { active: true, phase, done, total };
  if (newPhase || Date.now() - lastPublish >= 100) publish();
}

/**
 * Let the page paint the progress before a long step goes on. A hidden tab
 * never paints (no animation frame): the wait then ends on a short timer, so
 * the export goes on in the background.
 */
export function yieldForPaint(): Promise<void> {
  if (running === 0) return Promise.resolve();
  if (typeof document !== 'undefined' && document.hidden) return new Promise((resolve) => setTimeout(resolve, 0));
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    requestAnimationFrame(() => setTimeout(finish, 0));
    setTimeout(finish, 50);
  });
}

/** Runs an export while showing its progress. Nested calls share one display. */
export async function withExportProgress<T>(run: () => Promise<T>): Promise<T> {
  if (running++ === 0) {
    pending = { active: true, phase: null, done: 0, total: 0 };
    useProgressStore.getState().start(TASK, 'activity.export', 0);
    publish();
  }
  try {
    return await run();
  } finally {
    if (--running === 0) {
      useProgressStore.getState().end(TASK);
      publish();
    }
  }
}

export function useExportProgress(): ExportProgress {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => snapshot,
  );
}
