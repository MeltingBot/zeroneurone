/**
 * Plugin services — what one plugin offers to the others
 *
 * A plugin provides a named service (an object with a `version`); another one
 * gets it if it is there, and falls back to its own behavior otherwise. ZN
 * only keeps the registry: it never calls a service itself.
 *
 * Names are prefixed with the provider's id (`mark-neurone:anchors`). The first
 * provider of a name keeps it. A service whose plugin is disabled is not
 * returned, and consumers are notified when a plugin is enabled or disabled.
 */

import { useSyncExternalStore } from 'react';
import { isPluginDisabled, subscribeToPlugins } from './pluginRegistry';

export interface ServiceHandle {
  /** Withdraws the service. */
  revoke(): void;
  /** Tells consumers that what the service offers changed (e.g. a license). */
  changed(): void;
}

interface Entry {
  impl: { version: number };
  owner: string;
}

const services = new Map<string, Entry>();
const listeners = new Set<() => void>();
let version = 0;

function notify(): void {
  version++;
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (err) {
      console.warn('[pluginServices] listener failed:', err);
    }
  });
}

// A plugin enabled or disabled changes which services can be reached.
subscribeToPlugins(notify);

const NO_HANDLE: ServiceHandle = { revoke: () => {}, changed: () => {} };

/** Offers `impl` under `name`, which must start with "<owner>:". */
export function provideService(owner: string, name: string, impl: { version: number }): ServiceHandle {
  if (typeof name !== 'string' || !name.startsWith(`${owner}:`) || name.length <= owner.length + 1) {
    console.warn(`[pluginServices] "${owner}" cannot provide "${name}": the name must start with "${owner}:"`);
    return NO_HANDLE;
  }
  if (!impl || typeof impl !== 'object' || typeof impl.version !== 'number') {
    console.warn(`[pluginServices] "${name}": a service is an object with a numeric version`);
    return NO_HANDLE;
  }
  const existing = services.get(name);
  if (existing && existing.impl !== impl) {
    console.warn(`[pluginServices] "${name}" is already provided`);
    return NO_HANDLE;
  }
  const entry: Entry = { impl, owner };
  services.set(name, entry);
  notify();
  return {
    revoke: () => {
      if (services.get(name) !== entry) return;
      services.delete(name);
      notify();
    },
    changed: () => {
      if (services.get(name) === entry) notify();
    },
  };
}

/** The service, or undefined when it is not provided or its plugin is disabled. */
export function getService<T>(name: string): T | undefined {
  const entry = services.get(name);
  if (!entry || isPluginDisabled(entry.owner)) return undefined;
  return entry.impl as unknown as T;
}

export function subscribeToServices(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getServicesVersion(): number {
  return version;
}

/** React hook: the service, re-rendering when services change (provided, withdrawn, `changed()`). */
export function useService<T>(name: string): T | undefined {
  useSyncExternalStore(subscribeToServices, getServicesVersion, getServicesVersion);
  return getService<T>(name);
}

/** The registry as a plugin sees it: what it provides is always its own. */
export function scopedPluginServices(pluginId: string) {
  return {
    // provide: new(name, impl) or raw(owner, name, impl); the owner is always this plugin
    provide(...args: any[]): ServiceHandle {
      const [name, impl] = args.length >= 3 ? [args[1], args[2]] : [args[0], args[1]];
      return provideService(pluginId, name, impl);
    },
    get: getService,
    subscribe: subscribeToServices,
    getVersion: getServicesVersion,
    use: useService,
  };
}

/** Clears the registry (tests). */
export function resetPluginServices(): void {
  services.clear();
  notify();
}
