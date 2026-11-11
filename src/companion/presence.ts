/**
 * Identity and awareness of the companion. The desktop's syncStore cannot be
 * imported here (it pulls Dexie), so this mirrors the part of it that makes
 * the phone show up in the desktop's presence avatars: same localStorage
 * identity, same awareness fields, same 10 s heartbeat.
 */

import { syncService } from '../services/syncService';
import { generateUserName, getRandomUserColor } from '../types/yjs';

export interface CompanionUser {
  id: string;
  name: string;
  color: string;
}

const USER_KEY = 'zeroneurone-user';
/** Set once the person chose a name on this phone */
const NAMED_KEY = 'zeroneurone-companion-named';
const HEARTBEAT_MS = 10_000;

export function getLocalUser(): CompanionUser {
  try {
    const stored = localStorage.getItem(USER_KEY);
    if (stored) return JSON.parse(stored) as CompanionUser;
  } catch {
    // Invalid or unavailable: a new identity below
  }
  const user = { id: crypto.randomUUID(), name: generateUserName(), color: getRandomUserColor() };
  try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch { /* storage unavailable */ }
  return user;
}

export function hasChosenName(): boolean {
  try { return localStorage.getItem(NAMED_KEY) === '1'; } catch { return false; }
}

export function setLocalUserName(name: string): CompanionUser {
  const user = { ...getLocalUser(), name };
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.setItem(NAMED_KEY, '1');
  } catch { /* storage unavailable */ }
  const awareness = syncService.getAwareness();
  const state = awareness?.getLocalState();
  if (awareness && state) awareness.setLocalState({ ...state, name });
  return user;
}

/** Publishes the phone's presence while connected. Returns the cleanup. */
export function startPresence(): () => void {
  const publish = () => {
    const awareness = syncService.getAwareness();
    if (!awareness) return;
    const user = getLocalUser();
    awareness.setLocalState({
      userId: user.id,
      name: user.name,
      color: user.color,
      cursor: null,
      selection: [],
      linkSelection: [],
      dragging: [],
      editing: null,
      editingLink: null,
      editingReportSection: null,
      viewMode: 'canvas',
      lastSeen: Date.now(),
      reader: syncService.isReadOnly(),
    });
  };
  publish();
  const heartbeat = setInterval(() => {
    const awareness = syncService.getAwareness();
    const state = awareness?.getLocalState();
    if (awareness && state) awareness.setLocalState({ ...state, lastSeen: Date.now() });
    else publish();
  }, HEARTBEAT_MS);
  return () => clearInterval(heartbeat);
}
