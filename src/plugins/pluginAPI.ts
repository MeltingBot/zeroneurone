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
import { useDossierStore as _useDossierStore } from '../stores/dossierStore';

// Wrap useDossierStore to add legacy aliases for plugins (investigation → dossier)
const useDossierStore = Object.assign(
  (selector?: any) => {
    const state: any = selector ? _useDossierStore(selector) : _useDossierStore();
    if (!selector && state && typeof state === 'object') {
      return { ...state, currentInvestigation: state.currentDossier };
    }
    return state;
  },
  {
    getState: () => {
      const state: any = _useDossierStore.getState();
      return { ...state, currentInvestigation: state.currentDossier };
    },
    setState: _useDossierStore.setState,
    subscribe: _useDossierStore.subscribe,
    destroy: (_useDossierStore as any).destroy,
  }
) as any;
import { useSelectionStore } from '../stores/selectionStore';
import { useViewStore } from '../stores/viewStore';
import { useReportStore } from '../stores/reportStore';
import { useInsightsStore } from '../stores/insightsStore';
import { useTagSetStore } from '../stores/tagSetStore';
import { useTabStore } from '../stores/tabStore';
import { useUIStore } from '../stores/uiStore';

// ─── Repositories ──────────────────────────────────────────────
import { elementRepository } from '../db/repositories/elementRepository';
import { linkRepository } from '../db/repositories/linkRepository';
import { dossierRepository } from '../db/repositories/dossierRepository';

// ─── Services & utils ──────────────────────────────────────────
import { fileService } from '../services/fileService';
import { exportService } from '../services/exportService';
import { importService } from '../services/importService';
import { generateUUID } from '../utils';

// ─── Encryption ────────────────────────────────────────────────
import { useEncryptionStore } from '../stores/encryptionStore';
import { createEncryptionMiddlewareForDexie, decryptObject } from '../services/encryption/dexieEncryptionMiddleware';
import { encryptOpfsBuffer, decryptOpfsBuffer } from '../services/encryption/opfsEncryption';

// ─── Event bus ─────────────────────────────────────────────────
import { onPluginEvent } from './pluginEventBus';

// ─── Navigation ────────────────────────────────────────────────
// react-router navigate function is set at runtime by NavigateRef in App.tsx
type NavigateFn = (path: string) => void;
let _navigate: NavigateFn | null = null;

/** Called from App.tsx to inject the react-router navigate function. */
export function setPluginNavigate(fn: NavigateFn): void {
  _navigate = fn;
}

// ─── Before-disable callbacks ──────────────────────────────────
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

// ─── Global pluginData sentinel ────────────────────────────────
const GLOBAL_DOSSIER_ID = '__global__';

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
    useDossierStore,
    useInvestigationStore: useDossierStore, // legacy alias for plugins
    useSelectionStore,
    useViewStore,
    useReportStore,
    useInsightsStore,
    useTagSetStore,
    useTabStore,
    useUIStore,
  },

  // ─── Database repositories ──────────────────────────────────
  repositories: {
    elementRepository,
    linkRepository,
    dossierRepository,
    investigationRepository: dossierRepository, // legacy alias for plugins
  },

  // ─── Dexie database instance ────────────────────────────────
  db,

  // ─── File service (OPFS asset management) ───────────────────
  fileService,

  // ─── Utilities ──────────────────────────────────────────────
  generateUUID,

  // ─── Services (export, import, navigation) ──────────────────
  services: {
    /**
     * Produce a complete ZIP snapshot of a dossier (same as manual export).
     * Resolves all data from Dexie + OPFS, calls export:hooks plugins.
     */
    async exportDossier(dossierId: string): Promise<Blob> {
      const state = _useDossierStore.getState();
      const dossier = state.dossiers.find((d: any) => d.id === dossierId) ?? await dossierRepository.getById(dossierId);
      if (!dossier) throw new Error(`Dossier ${dossierId} not found`);

      const elements = await elementRepository.getByDossier(dossierId);
      const links = await linkRepository.getByDossier(dossierId);
      const assets = await db.assets.where({ dossierId }).toArray();
      const report = (await db.reports.where({ dossierId }).first()) ?? null;
      const tabs = await db.canvasTabs.where({ dossierId }).toArray();

      return exportService.exportToZip(dossier, elements, links, assets, report, tabs);
    },

    /**
     * Import a ZIP blob into a dossier.
     * @param blob  ZIP blob (same format as manual export)
     * @param options  Import options
     * @returns  Import result with counts and errors
     */
    async importDossier(
      blob: Blob,
      options?: { targetDossierId?: string; positionOffset?: { x: number; y: number }; suffix?: string },
    ): Promise<{
      success: boolean;
      elementsImported: number;
      linksImported: number;
      assetsImported: number;
      errors: string[];
      warnings: string[];
      dossierId: string;
    }> {
      // If no target, create a new dossier
      let dossierId = options?.targetDossierId;
      if (!dossierId) {
        const newDossier = await dossierRepository.create(
          `Import${options?.suffix ?? ''}`,
        );
        dossierId = newDossier.id;
      }
      const file = new File([blob], 'import.zip', { type: 'application/zip' });
      const result = await importService.importFromZip(file, dossierId, options?.positionOffset);
      return { ...result, dossierId };
    },

    /**
     * Navigate to a route within ZeroNeurone.
     * Common routes: '/' (home), '/dossier/:id' (open dossier).
     */
    navigateTo(path: string): void {
      if (_navigate) {
        _navigate(path);
      } else {
        window.location.href = path;
      }
    },
  },

  // ─── Event bus (subscribe to data changes) ──────────────────
  events: {
    /**
     * Subscribe to a plugin event. Returns an unsubscribe function.
     *
     * Available events:
     *   dossier:created, dossier:updated, dossier:deleted,
     *   dossier:opened, dossier:closed,
     *   element:created, element:updated, element:deleted,
     *   link:created, link:updated, link:deleted,
     *   asset:created, asset:deleted
     */
    on: onPluginEvent,
  },

  // ─── Toast / Notifications ──────────────────────────────────
  toast: {
    success(message: string, options?: { duration?: number; id?: string }): string {
      return useUIStore.getState().showToast('success', message, options?.duration);
    },
    error(message: string, options?: { duration?: number; id?: string }): string {
      return useUIStore.getState().showToast('error', message, options?.duration ?? 0);
    },
    warning(message: string, options?: { duration?: number; id?: string }): string {
      return useUIStore.getState().showToast('warning', message, options?.duration);
    },
    info(message: string, options?: { duration?: number; id?: string }): string {
      return useUIStore.getState().showToast('info', message, options?.duration);
    },
    dismiss(id: string): void {
      useUIStore.getState().dismissToast(id);
    },
  },

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

    /** Vrai si la DEK est déverrouillée (disponible en mémoire). */
    isUnlocked(): boolean {
      return useEncryptionStore.getState().dek !== null;
    },

    /**
     * Chiffre un ArrayBuffer avec la DEK de ZN (AES-256-GCM).
     * Format de sortie : [magic 0xE3E3] [iv 12 bytes] [ciphertext].
     * Rejette si la session est verrouillée.
     */
    async encrypt(plaintext: ArrayBuffer): Promise<ArrayBuffer> {
      const dek = useEncryptionStore.getState().dek;
      if (!dek) throw new Error('Encryption session is locked — DEK not available');
      return encryptOpfsBuffer(dek, plaintext);
    },

    /**
     * Déchiffre un ArrayBuffer produit par encrypt().
     * Rejette si la session est verrouillée.
     */
    async decrypt(ciphertext: ArrayBuffer): Promise<ArrayBuffer> {
      const dek = useEncryptionStore.getState().dek;
      if (!dek) throw new Error('Encryption session is locked — DEK not available');
      return decryptOpfsBuffer(dek, ciphertext);
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
    async get(pluginId: string, dossierId: string, key: string): Promise<any> {
      // PK uses investigationId (legacy), so query with it
      const row = await db.pluginData.get({ pluginId, investigationId: dossierId, key });
      return row?.value;
    },

    async set(pluginId: string, dossierId: string, key: string, value: any): Promise<void> {
      // Must include investigationId for compound PK + dossierId for index
      await db.pluginData.put({ pluginId, investigationId: dossierId, dossierId, key, value });
    },

    async remove(pluginId: string, dossierId: string, key: string): Promise<void> {
      await db.pluginData
        .where({ pluginId, investigationId: dossierId, key })
        .delete();
    },

    // ─── Global data (not tied to any dossier) ────────────────
    async getGlobal(pluginId: string, key: string): Promise<any> {
      const row = await db.pluginData.get({ pluginId, investigationId: GLOBAL_DOSSIER_ID, key });
      return row?.value;
    },

    async setGlobal(pluginId: string, key: string, value: any): Promise<void> {
      await db.pluginData.put({
        pluginId,
        investigationId: GLOBAL_DOSSIER_ID,
        dossierId: GLOBAL_DOSSIER_ID,
        key,
        value,
      });
    },

    async removeGlobal(pluginId: string, key: string): Promise<void> {
      await db.pluginData
        .where({ pluginId, investigationId: GLOBAL_DOSSIER_ID, key })
        .delete();
    },
  },
};
