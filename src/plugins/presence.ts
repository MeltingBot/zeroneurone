// Presence for plugins: who is in the shared dossier, read-only. Nothing a
// plugin does here is written to the dossier or sent to collaborators.
import { useSyncStore } from '../stores/syncStore';
import type { UserPresence } from '../types/yjs';

export interface CollabLocalUser {
  userId: string;
  name: string;
  color: string;
}

export interface CollabUser extends CollabLocalUser {
  /** Last heartbeat received (ms since epoch), null when unknown */
  lastSeen: number | null;
  /** Element ids selected */
  selection: string[];
  /** View open: canvas, map or timeline */
  viewMode: UserPresence['viewMode'];
}

export interface PresenceSnapshot {
  /** The open dossier is shared (collaboration on) */
  shared: boolean;
  localUser: CollabLocalUser;
  /** Other users connected, one per user (several tabs of one user count once); empty when not shared */
  remoteUsers: CollabUser[];
}

export function getLocalUser(): CollabLocalUser {
  const { id, name, color } = useSyncStore.getState().localUser;
  return { userId: id, name, color };
}

export function isShared(): boolean {
  return useSyncStore.getState().mode === 'shared';
}

export function getRemoteUsers(): CollabUser[] {
  const state = useSyncStore.getState();
  if (state.mode !== 'shared') return [];
  return state.remoteUsers.map((u) => ({
    userId: u.odUserId,
    name: u.name,
    color: u.color,
    lastSeen: u.lastSeen ?? null,
    selection: [...u.selection],
    viewMode: u.viewMode,
  }));
}

export function getPresence(): PresenceSnapshot {
  return { shared: isShared(), localUser: getLocalUser(), remoteUsers: getRemoteUsers() };
}

/** What a change is reported on: not the cursor nor the heartbeat, which move all the time */
function presenceKey(p: PresenceSnapshot): string {
  return JSON.stringify([
    p.shared,
    p.localUser,
    p.remoteUsers.map((u) => [u.userId, u.name, u.color, u.selection, u.viewMode]),
  ]);
}

/**
 * Call `cb` with the presence each time it changes: sharing on or off, a user
 * joining or leaving, a name, color, selection or view changing. Returns the
 * function that stops it.
 */
export function onPresenceChange(cb: (presence: PresenceSnapshot) => void): () => void {
  let lastKey = presenceKey(getPresence());
  return useSyncStore.subscribe(() => {
    const presence = getPresence();
    const key = presenceKey(presence);
    if (key === lastKey) return;
    lastKey = key;
    try {
      cb(presence);
    } catch (error) {
      console.warn('[Plugin] presence listener failed', error);
    }
  });
}
