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
