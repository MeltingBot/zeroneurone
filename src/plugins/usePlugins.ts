import { useSyncExternalStore } from 'react';
import { getPlugins, subscribeToPlugins } from './pluginRegistry';
import type { PluginSlots } from '../types/plugins';

export function usePlugins<K extends keyof PluginSlots>(
  slot: K
): Readonly<PluginSlots[K]> {
  return useSyncExternalStore(
    subscribeToPlugins,
    () => getPlugins(slot),
    () => getPlugins(slot)
  );
}
