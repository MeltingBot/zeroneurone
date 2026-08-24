import i18next from 'i18next';
import { toast } from '../stores/toastStore';

/**
 * Report a failed local write.
 *
 * Persistence to Dexie runs fire-and-forget behind the Y.Doc, so without this
 * an unwritable database looks exactly like a successful save until the user
 * reloads and finds work missing.
 */

// One notice per window, whatever the number of failing writes: a Y.Doc sync
// can fire dozens of writes in a row, and quota errors hit all of them.
const NOTICE_INTERVAL_MS = 30_000;
let lastNoticeAt = 0;

/** Walk the error chain: Dexie wraps the original DOMException in `inner`. */
function errorNames(error: unknown): string[] {
  const names: string[] = [];
  let current = error as { name?: unknown; inner?: unknown; cause?: unknown } | null | undefined;
  for (let depth = 0; depth < 4 && current; depth++) {
    if (typeof current.name === 'string') names.push(current.name);
    current = (current.inner ?? current.cause) as typeof current;
  }
  return names;
}

export function isQuotaExceeded(error: unknown): boolean {
  return errorNames(error).some(
    (name) => name === 'QuotaExceededError' || name === 'QuotaExceeded'
  );
}

/**
 * @param context short identifier of the write that failed, for the console
 */
export function onPersistFailure(error: unknown, context: string): void {
  const quota = isQuotaExceeded(error);
  console.error(`[persist] ${context} failed${quota ? ' (quota exceeded)' : ''}`, error);

  const now = Date.now();
  if (now - lastNoticeAt < NOTICE_INTERVAL_MS) return;
  lastNoticeAt = now;

  toast.error(
    i18next.t(quota ? 'common:errors.storageFull' : 'common:errors.persistFailed'),
    8000
  );
}

/** Test seam: forget the throttling window. */
export function resetPersistFailureThrottle(): void {
  lastNoticeAt = 0;
}
