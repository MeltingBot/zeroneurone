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
  (slots[slot] as any[]).push(extension);
  notifyListeners();
}

export function registerPlugins<K extends keyof PluginSlots>(
  slot: K,
  extensions: PluginSlots[K][number][]
): void {
  (slots[slot] as any[]).push(...extensions);
  notifyListeners();
}

export function getPlugins<K extends keyof PluginSlots>(
  slot: K
): Readonly<PluginSlots[K]> {
  return slots[slot];
}

export function clearAllPlugins(): void {
  for (const key of Object.keys(slots) as (keyof PluginSlots)[]) {
    (slots[key] as any[]).length = 0;
  }
  notifyListeners();
}

export function subscribeToPlugins(listener: SlotListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
