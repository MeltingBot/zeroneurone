import React from 'react';
import ReactDOM from 'react-dom';
import * as jsxRuntime from 'react/jsx-runtime';
import Dexie from 'dexie';
import { icons } from 'lucide-react';
import { registerPlugin, registerPlugins, unregisterPlugin, isPluginDisabled } from './pluginRegistry';
import { db } from '../db/database';
import i18n from '../i18n';

// Expose React, ReactDOM, JSX runtime, and Dexie globally for pre-compiled
// external plugins. Plugins loaded via Blob URL can't resolve bare specifiers
// like `import { useState } from 'react'`. Setting globals lets plugin
// bundlers use `external: ['react', 'react-dom', 'dexie']` with a globals shim.
(globalThis as any).React = React;
(globalThis as any).ReactDOM = ReactDOM;
(globalThis as any).__ZN_JSX_RUNTIME = jsxRuntime;
(globalThis as any).__ZN_DEXIE = Dexie;

// Shim process.env for plugins that reference process.env.NODE_ENV
// (common in bundles that didn't inline this at build time)
if (!(globalThis as any).process) {
  (globalThis as any).process = { env: { NODE_ENV: 'production' } };
}

// ─── Stores ────────────────────────────────────────────────────
import { useInvestigationStore } from '../stores/investigationStore';
import { useSelectionStore } from '../stores/selectionStore';
import { useViewStore } from '../stores/viewStore';
import { useReportStore } from '../stores/reportStore';
import { useInsightsStore } from '../stores/insightsStore';

// ─── Repositories ──────────────────────────────────────────────
import { elementRepository } from '../db/repositories/elementRepository';
import { linkRepository } from '../db/repositories/linkRepository';
import { investigationRepository } from '../db/repositories/investigationRepository';

// ─── Services & utils ──────────────────────────────────────────
import { fileService } from '../services/fileService';
import { generateUUID } from '../utils';

// ─── Encryption ────────────────────────────────────────────────
import { useEncryptionStore } from '../stores/encryptionStore';
import { createEncryptionMiddlewareForDexie, decryptObject } from '../services/encryption/dexieEncryptionMiddleware';

// Registre des callbacks "avant désactivation du chiffrement".
// Fermé — non exposé dans pluginAPI, consommé uniquement par migrationService.
const _beforeDisableCallbacks = new Set<(dek: Uint8Array | null) => Promise<void>>();

/**
 * Exécute tous les hooks onBeforeDisable enregistrés par les plugins.
 * Appelé par disableEncryption() avant window.location.reload().
 * La DEK est passée explicitement pour éviter une race condition avec le store.
 * Promise.allSettled garantit qu'un plugin qui plante ne bloque pas les autres.
 */
export async function runBeforeDisableHooks(dek: Uint8Array | null): Promise<void> {
  await Promise.allSettled([..._beforeDisableCallbacks].map(cb => cb(dek)));
}

/**
 * API surface exposed to external plugins loaded from /plugins/.
 *
 * External plugins are ES modules that export a `register(api)` function.
 * The `api` argument is this object — it provides everything a plugin
 * needs without importing from ZN source code.
 */
export const pluginAPI = {
  // ─── Plugin registration ────────────────────────────────────
  registerPlugin,
  registerPlugins,
  unregisterPlugin,
  isPluginDisabled,

  // ─── React (same instance as the app — hooks work) ──────────
  React,

  // ─── Icons (full lucide-react icon set) ─────────────────────
  icons,

  // ─── i18n (add resource bundles, translate) ─────────────────
  i18n,

  // ─── Zustand stores ─────────────────────────────────────────
  stores: {
    useInvestigationStore,
    useSelectionStore,
    useViewStore,
    useReportStore,
    useInsightsStore,
  },

  // ─── Database repositories ──────────────────────────────────
  repositories: {
    elementRepository,
    linkRepository,
    investigationRepository,
  },

  // ─── Dexie database instance ────────────────────────────────
  db,

  // ─── File service (OPFS asset management) ───────────────────
  fileService,

  // ─── Utilities ──────────────────────────────────────────────
  generateUUID,

  // ─── Chiffrement at-rest (partage de la DEK avec les plugins) ──
  encryption: {
    /**
     * Applique le middleware de chiffrement ZN sur une instance Dexie externe.
     * Si le chiffrement n'est pas actif ou la DEK absente (session verrouillée),
     * l'appel est un no-op.
     *
     * La DEK ne transite pas : elle est encapsulée dans la closure du middleware.
     *
     * @param dexieInstance  Instance Dexie du plugin
     * @param tables         Noms des tables à chiffrer
     */
    applyToDatabase(dexieInstance: Dexie, tables: string[]): void {
      const dek = useEncryptionStore.getState().dek;
      if (!dek) return;
      dexieInstance.close({ disableAutoOpen: false });
      dexieInstance.use(createEncryptionMiddlewareForDexie(dek, new Set(tables)));
    },

    /**
     * S'abonne à l'événement "chiffrement prêt" (DEK disponible après unlock,
     * ou démarrage sans chiffrement).
     * Le callback est appelé immédiatement si la DEK est déjà disponible.
     *
     * @returns  Fonction de désinscription
     */
    onReady(cb: () => void): () => void {
      const state = useEncryptionStore.getState();
      // Déjà prêt : DEK présente ou chiffrement désactivé
      if (state.dek !== null || !state.isEnabled) {
        cb();
      }
      let prevDek = state.dek;
      let prevEnabled = state.isEnabled;
      return useEncryptionStore.subscribe((s) => {
        // Transition vers "prêt" : DEK vient d'être définie, ou chiffrement désactivé
        const nowReady = s.dek !== null || !s.isEnabled;
        const wasReady = prevDek !== null || !prevEnabled;
        if (nowReady && !wasReady) cb();
        prevDek = s.dek;
        prevEnabled = s.isEnabled;
      });
    },

    /**
     * S'abonne à l'événement "session verrouillée" (DEK effacée).
     *
     * @returns  Fonction de désinscription
     */
    onLock(cb: () => void): () => void {
      let prevDek = useEncryptionStore.getState().dek;
      return useEncryptionStore.subscribe((s) => {
        if (prevDek !== null && s.dek === null) cb();
        prevDek = s.dek;
      });
    },

    /** Vrai si le chiffrement at-rest est activé dans ZeroNeurone. */
    isEnabled(): boolean {
      return useEncryptionStore.getState().isEnabled;
    },

    /**
     * S'abonne à l'événement "désactivation imminente du chiffrement".
     * Le callback est awaité par ZN avant window.location.reload().
     * Permet aux plugins de déchiffrer leurs données avant redémarrage.
     *
     * @param cb  Callback async — doit se terminer raisonnablement vite
     * @returns   Fonction de désinscription
     */
    onBeforeDisable(cb: (decryptRecord: (record: unknown) => unknown) => Promise<void>): () => void {
      const wrappedCb = async (dek: Uint8Array | null) => {
        const decryptFn = dek
          ? (record: unknown) => decryptObject(record as Record<string, unknown>, dek)
          : (record: unknown) => record;
        await cb(decryptFn);
      };
      _beforeDisableCallbacks.add(wrappedCb);
      return () => { _beforeDisableCallbacks.delete(wrappedCb); };
    },
  },

  // ─── Plugin data persistence (IndexedDB) ────────────────────
  pluginData: {
    async get(pluginId: string, investigationId: string, key: string): Promise<any> {
      const row = await db.pluginData.get({ pluginId, investigationId, key });
      return row?.value;
    },

    async set(pluginId: string, investigationId: string, key: string, value: any): Promise<void> {
      await db.pluginData.put({ pluginId, investigationId, key, value });
    },

    async remove(pluginId: string, investigationId: string, key: string): Promise<void> {
      await db.pluginData
        .where({ pluginId, investigationId, key })
        .delete();
    },
  },
};
