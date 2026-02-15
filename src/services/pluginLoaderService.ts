import { pluginAPI } from '../plugins/pluginAPI';

interface PluginManifestEntry {
  id: string;
  file: string;
}

interface PluginManifest {
  plugins: PluginManifestEntry[];
}

/**
 * Load external plugins from /plugins/manifest.json.
 *
 * Each plugin is an ES module exporting a `register(api)` function.
 * If no manifest exists (404), the app boots normally — zero overhead.
 * Plugin errors are caught individually and never crash the app.
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
      // Fetch the plugin source and import it via Blob URL.
      // This works in both Vite dev mode (where public/ files can't
      // be imported directly) and production builds.
      const fileRes = await fetch(`/plugins/${entry.file}`);
      if (!fileRes.ok) {
        console.warn(`[ZN] Plugin "${entry.id}": ${entry.file} returned ${fileRes.status}`);
        continue;
      }
      const source = await fileRes.text();
      const blob = new Blob([source], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      const mod = await import(/* @vite-ignore */ blobUrl);
      URL.revokeObjectURL(blobUrl);

      if (typeof mod.register === 'function') {
        mod.register(pluginAPI);
        loaded++;
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
