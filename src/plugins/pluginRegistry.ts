import type { PluginSlots } from '../types/plugins';

/**
 * Plugin registry — Generic extension system for zeroneurone.
 *
 * Plugins register extensions into named slots.
 * ZN components consume slots via getPlugins().
 * Empty slots = nothing rendered, zero overhead.
 */

// ─── Internal registry ──────────────────────────────────────

const slots: PluginSlots = {
  'header:right': [],
  'home:actions': [],
  'home:banner': [],
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

// ─── Listeners for reactivity ───────────────────────────────

type SlotListener = () => void;
const listeners = new Set<SlotListener>();

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

// ─── Public API ─────────────────────────────────────────────

export function registerPlugin<K extends keyof PluginSlots>(
  slot: K,
  extension: PluginSlots[K][number]
): void {
  slots[slot] = [...slots[slot], extension] as PluginSlots[K];
  notifyListeners();
}

export function registerPlugins<K extends keyof PluginSlots>(
  slot: K,
  extensions: PluginSlots[K][number][]
): void {
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
  slot: K
): Readonly<PluginSlots[K]> {
  return slots[slot];
}

export function clearAllPlugins(): void {
  for (const key of Object.keys(slots) as (keyof PluginSlots)[]) {
    slots[key] = [] as any;
  }
  notifyListeners();
}

export function subscribeToPlugins(listener: SlotListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
