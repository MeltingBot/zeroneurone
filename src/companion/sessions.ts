/**
 * Dossiers this phone joined, kept in localStorage so the companion reopens
 * them without the link. Holds the share key: "Forget" removes it. With the
 * lock on, the list is sealed with the data key (lockState.ts).
 */

import type { WriteAccess } from '../services/writeAccess';
import { lockEnabled, readLock, seal, unlockedKey, unseal, writeLock } from './lockState';
import { SESSIONS_KEY } from './hasDossiers';

export interface CompanionSession {
  dossierId: string;
  roomId: string;
  encryptionKey: string;
  server: string;
  name: string;
  joinedAt: string;
  /** Write key of a signed room (read-only sharing); without seed: read only */
  access?: WriteAccess;
}

const STORAGE_KEY = SESSIONS_KEY;

/** Sessions when the lock is on: sealed with the data key, none while locked */
const SEALED_KEY = 'zeroneurone-companion-sessions-sealed';

export function listSessions(): CompanionSession[] {
  try {
    let raw: string | null;
    if (lockEnabled()) {
      const key = unlockedKey();
      const sealed = localStorage.getItem(SEALED_KEY);
      raw = key && sealed ? unseal(sealed, key) : null;
    } else {
      raw = localStorage.getItem(STORAGE_KEY);
    }
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as CompanionSession[]) : [];
  } catch {
    return [];
  }
}

function write(sessions: CompanionSession[]): void {
  try {
    const lock = readLock();
    if (lock) {
      const key = unlockedKey();
      if (!key) return;
      localStorage.setItem(SEALED_KEY, seal(JSON.stringify(sessions), key));
      // The ids stay readable: "Forget everything" without the passkey. Ids of
      // forgotten dossiers go once their copy is erased (pending deletions).
      const ids = sessions.map((s) => s.dossierId);
      writeLock({ ...lock, dossierIds: [...new Set([...ids, ...lock.dossierIds])] });
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    }
  } catch {
    // Storage unavailable (private mode): the session lasts until the tab closes
  }
}

/**
 * Moves the session list between plain and sealed storage, when the lock is
 * turned on (`key` given) or off (null). Checked before the old copy goes.
 */
export function moveSessions(sessions: CompanionSession[], key: Uint8Array | null): void {
  if (key) {
    const sealed = seal(JSON.stringify(sessions), key);
    if (unseal(sealed, key) === null) throw new Error('Sealed sessions do not read back');
    localStorage.setItem(SEALED_KEY, sealed);
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    localStorage.removeItem(SEALED_KEY);
  }
}

/** Plain sessions (lock off, or a lock being turned on) */
export function plainSessions(): CompanionSession[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as CompanionSession[]) : [];
  } catch {
    return [];
  }
}

/** Every trace of the sessions, sealed or not ("Forget everything") */
export function dropAllSessions(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SEALED_KEY);
}

export function getSession(dossierId: string): CompanionSession | null {
  return listSessions().find((s) => s.dossierId === dossierId) ?? null;
}

export function saveSession(session: CompanionSession): void {
  write([session, ...listSessions().filter((s) => s.dossierId !== session.dossierId)]);
}

export function renameSession(dossierId: string, name: string): void {
  const sessions = listSessions();
  const session = sessions.find((s) => s.dossierId === dossierId);
  if (!session || session.name === name) return;
  session.name = name;
  write(sessions);
}

export function removeSession(dossierId: string): void {
  write(listSessions().filter((s) => s.dossierId !== dossierId));
}

// ----------------------------------------------------------------------------
// Local copies still to erase: "Forget" could not delete them (database held
// by another connection). Retried until done, and shown meanwhile: the copy
// is not encrypted on the phone.
// ----------------------------------------------------------------------------

const PENDING_DELETE_KEY = 'zeroneurone-companion-pending-delete';

export function pendingDeletions(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PENDING_DELETE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writePendingDeletions(ids: string[]): void {
  try {
    if (ids.length > 0) localStorage.setItem(PENDING_DELETE_KEY, JSON.stringify(ids));
    else localStorage.removeItem(PENDING_DELETE_KEY);
  } catch { /* storage unavailable */ }
}

export function addPendingDeletion(dossierId: string): void {
  const ids = pendingDeletions();
  if (!ids.includes(dossierId)) writePendingDeletions([...ids, dossierId]);
}

export function removePendingDeletion(dossierId: string): void {
  writePendingDeletions(pendingDeletions().filter((id) => id !== dossierId));
}
