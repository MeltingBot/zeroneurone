import type { PluginSlots } from '../types/plugins';

/**
 * Plugin registry — Generic extension system for zeroneurone.
 *
 * Plugins register extensions into named slots.
 * ZN components consume slots via getPlugins().
 * Empty slots = nothing rendered, zero overhead.
 *
 * Plugins can be disabled by ID — disabled extensions are
 * filtered out of getPlugins() results (except with includeDisabled).
 */

// ─── Internal registry ──────────────────────────────────────

const slots: PluginSlots = {
  'header:right': [],
  'home:actions': [],
  'home:banner': [],
  'app:global': [],
  'home:card': [],
  'panel:right': [],
  'contextMenu:element': [],
  'contextMenu:link': [],
  'contextMenu:canvas': [],
  'report:toolbar': [],
  'report:sectionActions': [],
  'keyboard:shortcuts': [],
  'export:hooks': [],
  'import:hooks': [],
};

// ─── Plugin ID tracking ─────────────────────────────────────

// Maps each extension (object or function) to its pluginId
const extensionPluginId = new Map<any, string>();

function resolvePluginId(ext: any): string | undefined {
  // 1. Explicit tracking via registerPlugin(slot, ext, pluginId)
  const tracked = extensionPluginId.get(ext);
  if (tracked) return tracked;
  if (ext && typeof ext === 'object') {
    // 2. pluginId field on the extension object
    if (ext.pluginId) return ext.pluginId;
    // 3. home:card entries: id IS the pluginId
    if ('name' in ext && 'description' in ext && 'icon' in ext && ext.id) return ext.id;
  }
  return undefined;
}

// ─── Enabled plugins (opt-in: disabled by default) ─────────

const ENABLED_KEY = 'zeroneurone:enabled-plugins';
const enabledIds = new Set<string>(
  JSON.parse(localStorage.getItem(ENABLED_KEY) || '[]')
);

function persistEnabled() {
  localStorage.setItem(ENABLED_KEY, JSON.stringify([...enabledIds]));
}

export function disablePlugin(id: string): void {
  enabledIds.delete(id);
  persistEnabled();
  notifyListeners();
}

export function enablePlugin(id: string): void {
  enabledIds.add(id);
  persistEnabled();
  notifyListeners();
}

export function isPluginDisabled(id: string): boolean {
  return !enabledIds.has(id);
}

// ─── Listeners for reactivity ───────────────────────────────

type SlotListener = () => void;
const listeners = new Set<SlotListener>();

// Cache for filtered results — useSyncExternalStore requires stable references
let cacheVersion = 0;
const filteredCache = new Map<string, { version: number; result: any[] }>();

function notifyListeners() {
  cacheVersion++;
  listeners.forEach((fn) => fn());
}

// ─── Public API ─────────────────────────────────────────────

export function registerPlugin<K extends keyof PluginSlots>(
  slot: K,
  extension: PluginSlots[K][number],
  pluginId?: string
): void {
  if (pluginId) {
    extensionPluginId.set(extension, pluginId);
  }
  slots[slot] = [...slots[slot], extension] as PluginSlots[K];
  notifyListeners();
}

export function registerPlugins<K extends keyof PluginSlots>(
  slot: K,
  extensions: PluginSlots[K][number][],
  pluginId?: string
): void {
  if (pluginId) {
    for (const ext of extensions) {
      extensionPluginId.set(ext, pluginId);
    }
  }
  slots[slot] = [...slots[slot], ...extensions] as PluginSlots[K];
  notifyListeners();
}

export function unregisterPlugin<K extends keyof PluginSlots>(
  slot: K,
  predicate: (ext: any) => boolean
): void {
  const arr = slots[slot] as any[];
  const idx = arr.findIndex(predicate);
  if (idx !== -1) {
    slots[slot] = arr.filter((_: any, i: number) => i !== idx) as PluginSlots[K];
    notifyListeners();
  }
}

export function getPlugins<K extends keyof PluginSlots>(
  slot: K,
  options?: { includeDisabled?: boolean }
): Readonly<PluginSlots[K]> {
  const all = slots[slot];
  if (options?.includeDisabled) return all;
  // Return cached filtered result if still valid (same version)
  const cached = filteredCache.get(slot);
  if (cached && cached.version === cacheVersion) {
    return cached.result as PluginSlots[K];
  }
  const result = all.filter((ext: any) => {
    const pid = resolvePluginId(ext);
    // Extensions without a pluginId are always shown (core ZN)
    return !pid || enabledIds.has(pid);
  });
  filteredCache.set(slot, { version: cacheVersion, result });
  return result as PluginSlots[K];
}

export function clearAllPlugins(): void {
  for (const key of Object.keys(slots) as (keyof PluginSlots)[]) {
    slots[key] = [] as any;
  }
  extensionPluginId.clear();
  notifyListeners();
}

export function subscribeToPlugins(listener: SlotListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
