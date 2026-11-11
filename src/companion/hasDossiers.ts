/**
 * Whether the companion keeps dossiers on this phone, read without opening
 * anything (for main.tsx, shared with the desktop entry: no crypto here).
 * Locked, the list is sealed: the lock itself says there is something.
 */
export const SESSIONS_KEY = 'zeroneurone-companion-sessions';
export const LOCK_KEY = 'zeroneurone-companion-lock';

export function hasCompanionDossiers(): boolean {
  try {
    if (localStorage.getItem(LOCK_KEY)) return true;
    const parsed: unknown = JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? '[]');
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}
