/**
 * encryptionStore — État global du chiffrement
 *
 * Stocke la DEK en mémoire pour la durée de la session.
 * La DEK est effacée à la fermeture de l'app ou sur demande (verrouillage).
 *
 * Note : la DEK ne doit jamais être persistée en localStorage.
 * Elle est déchiffrée depuis `_encryptionMeta` (Dexie) à chaque démarrage.
 */

import { create } from 'zustand';

interface EncryptionStoreState {
  /** Chiffrement activé dans les paramètres */
  isEnabled: boolean;
  /** DEK en mémoire (32 bytes). Null si non déverrouillé ou chiffrement désactivé */
  dek: Uint8Array | null;
  /** Vrai si l'app attend la saisie du mot de passe */
  isLocked: boolean;
  /** Vrai pendant une opération de migration */
  isMigrating: boolean;
  /** Message d'erreur (mot de passe incorrect, etc.) */
  error: string | null;
  /**
   * Vrai quand il est sûr d'ouvrir Dexie :
   * - pas de chiffrement → true dès la vérification initiale
   * - chiffrement activé → true uniquement après déverrouillage (DEK chargée)
   * Permet de gater toute opération Dexie jusqu'à ce que le middleware
   * soit installé (ou confirmé absent).
   */
  isReady: boolean;

  // Actions
  setDek: (dek: Uint8Array) => void;
  setEnabled: (enabled: boolean) => void;
  setLocked: (locked: boolean) => void;
  setMigrating: (migrating: boolean) => void;
  setError: (error: string | null) => void;
  setReady: () => void;
  /** Efface la DEK de la mémoire (verrouillage de session) */
  lock: () => void;
}

export const useEncryptionStore = create<EncryptionStoreState>((set) => ({
  isEnabled: false,
  dek: null,
  isLocked: false,
  isMigrating: false,
  error: null,
  isReady: false,

  setDek: (dek) => set({ dek, isLocked: false, error: null }),
  setEnabled: (enabled) => set({ isEnabled: enabled }),
  setLocked: (locked) => set({ isLocked: locked }),
  setMigrating: (migrating) => set({ isMigrating: migrating }),
  setError: (error) => set({ error }),
  setReady: () => set({ isReady: true }),

  lock: () => set({ dek: null, isLocked: true }),
}));
