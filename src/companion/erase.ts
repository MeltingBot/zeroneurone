/**
 * Erasing a dossier's local copy from the phone. IndexedDB can leave a
 * deletion waiting without ever answering (another connection holds the
 * database, or an earlier deletion is still queued): bounded here, and a
 * failure is remembered to be retried rather than hidden.
 */

import { deleteLocalCopy } from './localCopy';
import { addPendingDeletion, removePendingDeletion } from './sessions';

const ERASE_TIMEOUT_MS = 4000;

/** True when the copy is gone; otherwise kept as a pending deletion */
export async function eraseLocalCopy(dossierId: string): Promise<boolean> {
  const erased = await Promise.race([
    deleteLocalCopy(dossierId, ERASE_TIMEOUT_MS).then(() => true, () => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ERASE_TIMEOUT_MS + 500)),
  ]);
  if (erased) removePendingDeletion(dossierId);
  else addPendingDeletion(dossierId);
  return erased;
}
