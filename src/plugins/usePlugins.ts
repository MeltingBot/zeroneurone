import { useCallback, useSyncExternalStore } from 'react';
import { getPlugins, subscribeToPlugins } from './pluginRegistry';
import type { PluginSlots } from '../types/plugins';

export function usePlugins<K extends keyof PluginSlots>(
  slot: K,
  options?: { includeDisabled?: boolean }
): Readonly<PluginSlots[K]> {
  const includeDisabled = options?.includeDisabled ?? false;
  const getSnapshot = useCallback(
    () => getPlugins(slot, includeDisabled ? { includeDisabled: true } : undefined),
    [slot, includeDisabled]
  );
  return useSyncExternalStore(subscribeToPlugins, getSnapshot, getSnapshot);
}
