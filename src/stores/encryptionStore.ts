/**
 * encryptionStore — global encryption state
 *
 * Keeps the DEK in memory for the duration of the session.
 * The DEK is wiped when the app closes or on demand (lock).
 *
 * Note: the DEK must never be persisted in localStorage.
 * It is decrypted from `_encryptionMeta` (Dexie) at every startup.
 */

import { create } from 'zustand';

interface EncryptionStoreState {
  /** Encryption enabled in the settings */
  isEnabled: boolean;
  /** In-memory DEK (32 bytes). Null when locked or when encryption is disabled */
  dek: Uint8Array | null;
  /** True while the app waits for the password */
  isLocked: boolean;
  /** Error message (wrong password, etc.) */
  error: string | null;
  /**
   * True when it is safe to open Dexie:
   * - no encryption → true as soon as the initial check is done
   * - encryption enabled → true only after unlocking (DEK loaded)
   * Gates every Dexie operation until the middleware
   * is installed (or confirmed absent).
   */
  isReady: boolean;

  // Actions
  setDek: (dek: Uint8Array) => void;
  setEnabled: (enabled: boolean) => void;
  setLocked: (locked: boolean) => void;
  setError: (error: string | null) => void;
  setReady: () => void;
  /** Auto-lock delay in minutes (null = disabled) */
  autoLockMinutes: number | null;
  setAutoLockMinutes: (minutes: number | null) => void;
  /** Wipes the DEK from memory (session lock) */
  lock: () => void;
}

export const useEncryptionStore = create<EncryptionStoreState>((set) => ({
  isEnabled: false,
  dek: null,
  isLocked: false,
  error: null,
  isReady: false,
  autoLockMinutes: null,

  setDek: (dek) => set({ dek, isLocked: false, error: null }),
  setEnabled: (enabled) => set({ isEnabled: enabled }),
  setLocked: (locked) => set({ isLocked: locked }),
  setError: (error) => set({ error }),
  setReady: () => set({ isReady: true }),

  setAutoLockMinutes: (minutes) => set({ autoLockMinutes: minutes }),
  lock: () => set({ dek: null, isLocked: true }),
}));
