/**
 * Dossiers this phone joined, kept in localStorage so the companion reopens
 * them without the link. Holds the share key: "Forget" removes it.
 */

export interface CompanionSession {
  dossierId: string;
  roomId: string;
  encryptionKey: string;
  server: string;
  name: string;
  joinedAt: string;
}

const STORAGE_KEY = 'zeroneurone-companion-sessions';

export function listSessions(): CompanionSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as CompanionSession[]) : [];
  } catch {
    return [];
  }
}

function write(sessions: CompanionSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // Storage unavailable (private mode): the session lasts until the tab closes
  }
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
