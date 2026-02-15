import React from 'react';
import { icons } from 'lucide-react';
import { registerPlugin, registerPlugins, isPluginDisabled } from './pluginRegistry';
import { db } from '../db/database';

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
