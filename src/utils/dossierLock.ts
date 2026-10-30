import i18next from 'i18next';
import { create } from 'zustand';
import { toast } from '../stores/toastStore';
import type { Dossier } from '../types';

/**
 * Write lock of the open dossier, checked by every store that changes its
 * content. A closed dossier, or one whose retention expired with a read-only
 * policy, refuses writes: the action throws and the user sees a short notice.
 *
 * Kept outside the stores so that each of them can check it without importing
 * dossierStore (which imports several of them).
 */
export type DossierLockReason = 'closed' | 'retention' | 'plugin';

let openLock: DossierLockReason | null = null;
let lastNoticeAt = 0;

export class DossierLockedError extends Error {
  readonly reason: DossierLockReason;
  constructor(reason: DossierLockReason) {
    super(reason === 'closed' ? 'Dossier is closed (read-only)'
      : reason === 'plugin' ? 'Writes suspended by a plugin'
      : 'Dossier is read-only (retention expired)');
    this.name = 'DossierLockedError';
    this.reason = reason;
  }
}

/**
 * Write locks set by plugins (e.g. an audit plugin whose server is
 * unreachable). They apply to every dossier, and to creating or deleting one,
 * until the plugin lifts them. Message shown to the user: the plugin's reason.
 */
interface PluginLockState {
  locks: Record<string, string>;
}

export const usePluginWriteLocks = create<PluginLockState>(() => ({ locks: {} }));

export function setPluginWriteLock(pluginId: string, reason: string | null): void {
  const locks = { ...usePluginWriteLocks.getState().locks };
  if (reason) locks[pluginId] = reason;
  else delete locks[pluginId];
  usePluginWriteLocks.setState({ locks });
}

/** First plugin lock reason, or null when no plugin holds a lock */
export function getPluginWriteLock(): string | null {
  const reasons = Object.values(usePluginWriteLocks.getState().locks);
  return reasons.length > 0 ? reasons[0] : null;
}

/** Throws when a plugin suspended writes (checked even outside an open dossier) */
export function assertNoPluginLock(): void {
  if (getPluginWriteLock() !== null) refuseWrite('plugin');
}

/** Set by dossierStore whenever the open dossier or its state changes */
export function setOpenDossierLock(reason: DossierLockReason | null): void {
  openLock = reason;
}

export function getOpenDossierLock(): DossierLockReason | null {
  return openLock;
}

/** Notify (at most every few seconds, a burst of refused writes shows one notice) and throw */
export function refuseWrite(reason: DossierLockReason): never {
  const now = Date.now();
  if (now - lastNoticeAt > 3000) {
    lastNoticeAt = now;
    toast.warning(reason === 'plugin'
      ? i18next.t('common:dossierLock.plugin', { reason: getPluginWriteLock() ?? '' })
      : i18next.t(reason === 'closed' ? 'common:dossierLock.closed' : 'common:dossierLock.retention'));
  }
  throw new DossierLockedError(reason);
}

/** Throws when the open dossier refuses writes */
export function assertDossierWritable(): void {
  assertNoPluginLock();
  if (openLock) refuseWrite(openLock);
}

type RetentionFields = Pick<Dossier, 'createdAt' | 'closedAt' | 'closureHistory' | 'retentionFrom'>;

/**
 * Start of the retention period: creation, or the FIRST closure when the
 * dossier counts from closure — reopening then closing again does not push the
 * deadline back. Null when the dossier was never closed: it cannot expire yet.
 */
export function retentionStart(dossier: RetentionFields): Date | null {
  if (dossier.retentionFrom !== 'closed') return new Date(dossier.createdAt);
  const first = dossier.closureHistory?.[0]?.closedAt ?? dossier.closedAt;
  return first ? new Date(first) : null;
}

/** Expiry date for a retention of `days`, or null when it cannot be computed yet */
export function retentionExpiresAt(
  dossier: RetentionFields,
  days: number | null | undefined,
): Date | null {
  if (days == null) return null;
  const start = retentionStart(dossier);
  return start ? new Date(start.getTime() + days * 86400000) : null;
}
