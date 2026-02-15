import React from 'react';
import ReactDOM from 'react-dom';
import * as jsxRuntime from 'react/jsx-runtime';
import { icons } from 'lucide-react';
import { registerPlugin, registerPlugins, isPluginDisabled } from './pluginRegistry';
import { db } from '../db/database';
import i18n from '../i18n';

// Expose React, ReactDOM, and JSX runtime globally for pre-compiled external plugins.
// Plugins loaded via Blob URL can't resolve bare specifiers like
// `import { useState } from 'react'`. Setting globals lets plugin
// bundlers use `external: ['react', 'react-dom']` with a globals shim.
(globalThis as any).React = React;
(globalThis as any).ReactDOM = ReactDOM;
(globalThis as any).__ZN_JSX_RUNTIME = jsxRuntime;

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
