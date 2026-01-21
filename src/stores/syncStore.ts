/**
 * SyncStore - Zustand store for sync state
 *
 * Provides reactive access to sync state and actions for collaboration
 */

import { create } from 'zustand';
import { syncService } from '../services/syncService';
import type { SyncState, UserPresence } from '../types/yjs';
import { DEFAULT_SYNC_STATE, getRandomUserColor, generateUserName } from '../types/yjs';

// ============================================================================
// LOCAL USER
// ============================================================================

interface LocalUser {
  id: string;
  name: string;
  color: string;
}

function getOrCreateLocalUser(): LocalUser {
  const storageKey = 'zeroneurone-user';
  const stored = localStorage.getItem(storageKey);

  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // Invalid JSON, create new
    }
  }

  const user: LocalUser = {
    id: crypto.randomUUID(),
    name: generateUserName(),
    color: getRandomUserColor(),
  };

  localStorage.setItem(storageKey, JSON.stringify(user));
  return user;
}

// ============================================================================
// STORE INTERFACE
// ============================================================================

/** Media sync progress tracking */
export interface MediaSyncProgress {
  /** Total number of assets to sync */
  total: number;
  /** Number of assets completed */
  completed: number;
  /** Total size in bytes */
  totalSize: number;
  /** Completed size in bytes */
  completedSize: number;
  /** Currently syncing asset filename */
  currentAsset: string | null;
}

interface SyncStoreState extends SyncState {
  /** Local user info */
  localUser: LocalUser;

  /** Other connected users (from awareness) */
  remoteUsers: UserPresence[];

  /** Current encryption key (if sharing) */
  encryptionKey: string | null;

  /** Media sync progress (null when not syncing media) */
  mediaSyncProgress: MediaSyncProgress | null;

  /** Actions */
  share: (investigationName?: string) => Promise<{ shareUrl: string; encryptionKey: string }>;
  unshare: () => Promise<void>;
  updateLocalUserName: (name: string) => void;
  updateLocalUserColor: (color: string) => void;

  /** Cursor/selection/dragging updates for awareness */
  updateCursor: (position: { x: number; y: number } | null) => void;
  updateSelection: (elementIds: string[]) => void;
  updateLinkSelection: (linkIds: string[]) => void;
  updateDragging: (elementIds: string[]) => void;
  updateEditing: (elementId: string | null) => void;
  updateEditingLink: (linkId: string | null) => void;

  /** Media sync progress updates */
  startMediaSync: (total: number, totalSize: number) => void;
  updateMediaSyncProgress: (completed: number, completedSize: number, currentAsset: string | null) => void;
  completeMediaSync: () => void;

  /** Internal: called by syncService state changes */
  _syncStateChanged: (state: SyncState) => void;
}

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useSyncStore = create<SyncStoreState>((set, get) => {
  // Initialize local user
  const localUser = getOrCreateLocalUser();

  // Subscribe to sync service state changes (delayed to avoid get() being undefined during init)
  queueMicrotask(() => {
    syncService.onStateChange((state) => {
      get()._syncStateChanged(state);
    });
  });

  // Subscribe to awareness changes when connected
  let awarenessUnsubscribe: (() => void) | null = null;

  // Track if awareness is already set up to avoid duplicate setup
  let awarenessSetUp = false;

  // Heartbeat interval for presence detection
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  const HEARTBEAT_INTERVAL_MS = 10000; // 10 seconds
  const STALE_THRESHOLD_MS = 20000; // Consider user stale after 20 seconds without heartbeat

  const setupAwarenessListener = () => {
    const awareness = syncService.getAwareness();
    if (!awareness) {
      return;
    }

    // Clean up previous listener if any
    if (awarenessUnsubscribe) {
      awarenessUnsubscribe();
      awarenessUnsubscribe = null;
    }

    // Clear any existing heartbeat
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }

    // Set local user state with initial lastSeen
    const { localUser } = get();

    awareness.setLocalState({
      userId: localUser.id,
      name: localUser.name,
      color: localUser.color,
      cursor: null,
      selection: [],
      linkSelection: [],
      dragging: [],
      editing: null,
      editingLink: null,
      viewMode: 'canvas',
      lastSeen: Date.now(),
    });

    // Start heartbeat to update lastSeen periodically
    heartbeatInterval = setInterval(() => {
      const awareness = syncService.getAwareness();
      if (awareness) {
        const state = awareness.getLocalState();
        if (state) {
          awareness.setLocalState({ ...state, lastSeen: Date.now() });
        }
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Listen for changes
    const updateRemoteUsers = () => {
      const awareness = syncService.getAwareness();
      if (!awareness) {
        return;
      }

      // Use Map to deduplicate by userId (same user may have multiple clientIds)
      const usersByUserId = new Map<string, UserPresence>();
      const localClientId = awareness.clientID;
      const allStates = awareness.getStates();
      const now = Date.now();

      allStates.forEach((state, clientId) => {
        if (clientId !== localClientId && state.userId) {
          // Check if user is stale (no heartbeat for too long)
          const lastSeen = state.lastSeen || 0;
          const isStale = now - lastSeen > STALE_THRESHOLD_MS;

          // Only include non-stale users
          if (!isStale) {
            const userId = state.userId as string;
            const existing = usersByUserId.get(userId);

            // Keep the most recent entry for this userId
            if (!existing || (existing && lastSeen > (existing.cursor ? Date.now() : 0))) {
              usersByUserId.set(userId, {
                odUserId: userId,
                name: state.name || 'Anonyme',
                color: state.color || '#888888',
                cursor: state.cursor || null,
                selection: state.selection || [],
                linkSelection: state.linkSelection || [],
                dragging: state.dragging || [],
                editing: state.editing || null,
                editingLink: state.editingLink || null,
                viewMode: state.viewMode || 'canvas',
              });
            }
          }
        }
      });

      set({ remoteUsers: Array.from(usersByUserId.values()) });
    };

    awareness.on('change', updateRemoteUsers);
    // Also listen to 'update' event which fires more frequently
    awareness.on('update', updateRemoteUsers);
    updateRemoteUsers();

    // Also run periodic check to remove stale users
    // (in case we don't receive awareness updates when they disconnect abruptly)
    const staleCheckInterval = setInterval(updateRemoteUsers, 5000);

    // Trigger a re-broadcast of local state after a delay
    // This helps with relay servers that don't implement full awareness protocol
    setTimeout(() => {
      const awareness = syncService.getAwareness();
      if (awareness) {
        const state = awareness.getLocalState();
        if (state) {
          // Touch the state to trigger a broadcast
          awareness.setLocalState({ ...state, lastSeen: Date.now() });
        }
      }
    }, 500);

    awarenessSetUp = true;
    awarenessUnsubscribe = () => {
      awareness.off('change', updateRemoteUsers);
      awareness.off('update', updateRemoteUsers);
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      clearInterval(staleCheckInterval);
      awarenessSetUp = false;
    };
  };

  return {
    // Initial state from sync service
    ...DEFAULT_SYNC_STATE,
    localUser,
    remoteUsers: [],
    encryptionKey: null,
    mediaSyncProgress: null,

    // Share the current investigation
    // Uses the investigation UUID as room ID and generates a new encryption key
    share: async (investigationName?: string) => {
      const investigationId = syncService.getInvestigationId();
      if (!investigationId) {
        throw new Error('No investigation open');
      }

      // share() now generates an encryption key and uses investigation UUID as roomId
      const encryptionKey = await syncService.share();

      // Build the share URL with encryption key in fragment
      const shareUrl = syncService.buildShareUrl(investigationId, encryptionKey, investigationName);

      set({ encryptionKey });

      return { shareUrl, encryptionKey };
    },

    // Stop sharing
    unshare: async () => {
      if (awarenessUnsubscribe) {
        awarenessUnsubscribe();
        awarenessUnsubscribe = null;
      }
      awarenessSetUp = false;
      await syncService.unshare();
      set({ remoteUsers: [], encryptionKey: null });
    },

    // Update local user name
    updateLocalUserName: (name: string) => {
      const { localUser } = get();
      const updated = { ...localUser, name };
      localStorage.setItem('zeroneurone-user', JSON.stringify(updated));
      set({ localUser: updated });

      // Update awareness if connected
      const awareness = syncService.getAwareness();
      if (awareness) {
        const state = awareness.getLocalState() || {};
        awareness.setLocalState({ ...state, name });
      }
    },

    // Update local user color
    updateLocalUserColor: (color: string) => {
      const { localUser } = get();
      const updated = { ...localUser, color };
      localStorage.setItem('zeroneurone-user', JSON.stringify(updated));
      set({ localUser: updated });

      // Update awareness if connected
      const awareness = syncService.getAwareness();
      if (awareness) {
        const state = awareness.getLocalState() || {};
        awareness.setLocalState({ ...state, color });
      }
    },

    // Update cursor position (call on mouse move when on canvas)
    updateCursor: (position) => {
      const awareness = syncService.getAwareness();
      if (!awareness) return;

      const state = awareness.getLocalState() || {};
      awareness.setLocalState({ ...state, cursor: position });
    },

    // Update current selection
    updateSelection: (elementIds) => {
      const awareness = syncService.getAwareness();
      if (!awareness) return;

      const currentState = awareness.getLocalState() || {};
      awareness.setLocalState({ ...currentState, selection: elementIds });
    },

    // Update elements being dragged
    updateDragging: (elementIds) => {
      const awareness = syncService.getAwareness();
      if (!awareness) return;

      const state = awareness.getLocalState() || {};
      awareness.setLocalState({ ...state, dragging: elementIds });
    },

    // Update element being edited
    updateEditing: (elementId) => {
      const awareness = syncService.getAwareness();
      if (!awareness) return;

      const state = awareness.getLocalState() || {};
      awareness.setLocalState({ ...state, editing: elementId });
    },

    // Update current link selection
    updateLinkSelection: (linkIds) => {
      const awareness = syncService.getAwareness();
      if (!awareness) return;

      const state = awareness.getLocalState() || {};
      awareness.setLocalState({ ...state, linkSelection: linkIds });
    },

    // Update link being edited
    updateEditingLink: (linkId) => {
      const awareness = syncService.getAwareness();
      if (!awareness) return;

      const state = awareness.getLocalState() || {};
      awareness.setLocalState({ ...state, editingLink: linkId });
    },

    // Start tracking media sync progress
    startMediaSync: (total, totalSize) => {
      set({
        mediaSyncProgress: {
          total,
          completed: 0,
          totalSize,
          completedSize: 0,
          currentAsset: null,
        },
      });
    },

    // Update media sync progress
    updateMediaSyncProgress: (completed, completedSize, currentAsset) => {
      set((state) => ({
        mediaSyncProgress: state.mediaSyncProgress
          ? {
              ...state.mediaSyncProgress,
              completed,
              completedSize,
              currentAsset,
            }
          : null,
      }));
    },

    // Complete media sync (clear progress)
    completeMediaSync: () => {
      set({ mediaSyncProgress: null });
    },

    // Internal: handle sync state changes from service
    _syncStateChanged: (state) => {
      set({
        mode: state.mode,
        connected: state.connected,
        syncing: state.syncing,
        reconnecting: state.reconnecting,
        error: state.error,
        roomId: state.roomId,
        peerCount: state.peerCount,
      });

      // Reset awareness when disconnected or leaving shared mode
      const shouldSetupAwareness = state.connected && state.mode === 'shared';

      if (!shouldSetupAwareness) {
        // Clean up awareness listener when disconnecting or leaving shared mode
        if (awarenessUnsubscribe) {
          awarenessUnsubscribe();
          awarenessUnsubscribe = null;
        }
        awarenessSetUp = false;
        // Clear remote users when not in shared mode
        if (state.mode !== 'shared' || !state.connected) {
          set({ remoteUsers: [] });
        }
      } else if (!awarenessSetUp) {
        // Setup awareness listener when becoming connected in shared mode
        setupAwarenessListener();
      }
    },
  };
});
