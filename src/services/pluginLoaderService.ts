import { pluginAPI } from '../plugins/pluginAPI';
import { getPlugins, registerPlugin } from '../plugins/pluginRegistry';

interface PluginManifestEntry {
  id: string;
  file: string;
  name?: string;
  description?: string;
}

interface PluginManifest {
  plugins: PluginManifestEntry[];
}

// ─── React shim Blob URLs ───────────────────────────────────
// Plugins loaded via Blob URL can't resolve bare specifiers like
// `import { useState } from 'react'`. We create Blob URL shims
// that re-export from the globals ZN sets in pluginAPI.ts, then
// rewrite the plugin source to use these URLs instead.

function createShimUrl(code: string): string {
  return URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
}

const reactShimUrl = createShimUrl(
  'const R=globalThis.React;export default R;export const{useState,useEffect,useCallback,useMemo,useRef,useReducer,useContext,createElement,Fragment,createContext,forwardRef,memo,Suspense,lazy,Children,cloneElement,isValidElement,useId,useSyncExternalStore,useTransition,useDeferredValue,startTransition,use}=R;'
);
const reactDomShimUrl = createShimUrl(
  'const RD=globalThis.ReactDOM;export default RD;export const{createPortal,flushSync,createRoot,hydrateRoot}=RD;'
);
const jsxRuntimeShimUrl = createShimUrl(
  'const JR=globalThis.__ZN_JSX_RUNTIME;export const{jsx,jsxs,Fragment}=JR;'
);
const dexieShimUrl = createShimUrl(
  'const D=globalThis.__ZN_DEXIE;export default D;export const{liveQuery}=D;'
);

/**
 * Rewrite bare specifiers in plugin source so they resolve to our
 * shim Blob URLs. Order matters: longer paths first.
 * Covers React, ReactDOM, JSX runtime, and Dexie.
 */
function rewriteBareImports(source: string): string {
  return source
    .replace(/from\s*["']react\/jsx-dev-runtime["']/g, `from "${jsxRuntimeShimUrl}"`)
    .replace(/from\s*["']react\/jsx-runtime["']/g, `from "${jsxRuntimeShimUrl}"`)
    .replace(/from\s*["']react-dom\/client["']/g, `from "${reactDomShimUrl}"`)
    .replace(/from\s*["']react-dom["']/g, `from "${reactDomShimUrl}"`)
    .replace(/from\s*["']react["']/g, `from "${reactShimUrl}"`)
    .replace(/from\s*["']dexie["']/g, `from "${dexieShimUrl}"`);
}

/**
 * Load external plugins from /plugins/manifest.json.
 *
 * Each plugin is an ES module exporting a `register(api)` function.
 * If no manifest exists (404), the app boots normally — zero overhead.
 * Plugin errors are caught individually and never crash the app.
 *
 * Bare imports (React, Dexie…) are automatically rewritten to Blob URL
 * shims, so plugins work without any special bundler config.
 *
 * Plugins that don't register a home:card get an auto-generated one
 * so they always appear in the Extensions section for enable/disable.
 */
export async function loadExternalPlugins(): Promise<void> {
  let manifest: PluginManifest;

  try {
    const res = await fetch('/plugins/manifest.json');
    if (!res.ok) return; // No manifest = no external plugins
    manifest = await res.json();
  } catch {
    return; // Network error or invalid JSON — skip silently
  }

  if (!Array.isArray(manifest?.plugins) || manifest.plugins.length === 0) {
    return;
  }

  let loaded = 0;

  for (const entry of manifest.plugins) {
    if (!entry.id || !entry.file) {
      console.warn(`[ZN] Plugin entry missing id or file, skipping:`, entry);
      continue;
    }

    try {
      const fileRes = await fetch(`/plugins/${entry.file}`);
      if (!fileRes.ok) {
        console.warn(`[ZN] Plugin "${entry.id}": ${entry.file} returned ${fileRes.status}`);
        continue;
      }
      const source = await fileRes.text();

      // Rewrite bare React imports → Blob URL shims
      const rewritten = rewriteBareImports(source);

      const blob = new Blob([rewritten], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);

      // Snapshot cards before register() to detect if plugin adds its own
      const cardsBefore = getPlugins('home:card', { includeDisabled: true }).length;

      const mod = await import(/* @vite-ignore */ blobUrl);
      URL.revokeObjectURL(blobUrl);

      if (typeof mod.register === 'function') {
        await mod.register(pluginAPI);
        loaded++;
        console.log(`[ZN] Plugin "${entry.id}" registered`);

        // Auto-register a basic home:card if the plugin didn't create one.
        // This ensures every external plugin is visible in the Extensions
        // section for the user to enable/disable.
        const cardsAfter = getPlugins('home:card', { includeDisabled: true }).length;
        if (cardsAfter === cardsBefore) {
          registerPlugin('home:card', {
            id: entry.id,
            name: entry.name || entry.id,
            description: entry.description || `Plugin: ${entry.id}`,
            icon: 'Puzzle',
          }, entry.id);
        }
      } else {
        console.warn(`[ZN] Plugin "${entry.id}" has no register() export, skipping`);
      }
    } catch (err) {
      console.warn(`[ZN] Failed to load plugin "${entry.id}":`, err);
    }
  }

  if (loaded > 0) {
    console.log(`[ZN] Loaded ${loaded} external plugin(s)`);
  }
}
