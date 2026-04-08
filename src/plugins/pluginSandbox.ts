/**
 * Plugin sandbox — builds a filtered API object based on declared permissions.
 *
 * Trusted plugins receive the full scoped API (no filtering).
 * Community plugins receive only the API members their permissions allow.
 * Undeclared members are simply absent from the object.
 */

import type { Permission, TrustLevel } from './pluginManifest';
import { SLOT_PERMISSION_MAP } from './pluginManifest';
import type { createScopedPluginAPI } from './pluginAPI';

type ScopedPluginAPI = ReturnType<typeof createScopedPluginAPI>;

// ─── Read-only store proxy ──────────────────────────────────

/**
 * Cache of no-op functions keyed by action name.
 * Ensures referential stability: useStore(s => s.deleteElement)
 * always returns the same blocked function, avoiding spurious re-renders.
 */
const blockedActionCache = new Map<string | symbol, (...args: any[]) => void>();

function makeReadOnly<T extends object>(state: T): T {
  return new Proxy(state, {
    get(target, prop) {
      const value = (target as any)[prop];
      if (typeof value === 'function') {
        if (!blockedActionCache.has(prop)) {
          blockedActionCache.set(prop, (..._args: any[]) => {
            console.error(
              `[ZN Sandbox] Write action "${String(prop)}" blocked (read-only store).`
            );
          });
        }
        return blockedActionCache.get(prop);
      }
      return value;
    },
  });
}

function buildReadOnlyStore(useStore: any): any {
  const wrapper = (selector?: (state: any) => any, equalityFn?: any) => {
    const wrappedSelector = selector
      ? (state: any) => selector(makeReadOnly(state))
      : (state: any) => makeReadOnly(state);
    return useStore(wrappedSelector, equalityFn);
  };

  // Copy static methods (getState, subscribe, etc.)
  if (useStore.getState) {
    wrapper.getState = () => makeReadOnly(useStore.getState());
  }
  if (useStore.subscribe) {
    wrapper.subscribe = useStore.subscribe;
  }

  return wrapper;
}

// ─── Read-only repositories ─────────────────────────────────

function buildReadOnlyRepositories(repos: ScopedPluginAPI['repositories']): ScopedPluginAPI['repositories'] {
  const readMethods = new Set(['getByDossier', 'getByInvestigation', 'getById', 'getAll']);

  function makeReadOnly(repo: any): any {
    const filtered: any = {};
    for (const key of Object.keys(repo)) {
      if (readMethods.has(key)) {
        filtered[key] = repo[key];
      } else {
        filtered[key] = (..._args: any[]) => {
          console.error(`[ZN Sandbox] Repository write "${key}" blocked (read-only).`);
          return Promise.resolve();
        };
      }
    }
    return filtered;
  }

  return {
    elementRepository: makeReadOnly(repos.elementRepository),
    linkRepository: makeReadOnly(repos.linkRepository),
    dossierRepository: repos.dossierRepository, // already read-only by nature
    investigationRepository: repos.dossierRepository, // legacy alias
  } as any;
}

// ─── Filtered slot registration ─────────────────────────────

function buildFilteredRegisterPlugin(
  original: ScopedPluginAPI['registerPlugin'],
  permissions: Permission[]
): ScopedPluginAPI['registerPlugin'] {
  return ((slot: string, extension: any, pluginId?: string) => {
    const required = SLOT_PERMISSION_MAP[slot];
    if (required && !permissions.includes(required)) {
      console.error(
        `[ZN Sandbox] Plugin tried to register in slot "${slot}" ` +
        `without permission "${required}". Call ignored.`
      );
      return;
    }
    return (original as any)(slot, extension, pluginId);
  }) as ScopedPluginAPI['registerPlugin'];
}

function buildFilteredRegisterPlugins(
  original: ScopedPluginAPI['registerPlugins'],
  permissions: Permission[]
): ScopedPluginAPI['registerPlugins'] {
  return ((slot: string, extensions: any[], pluginId?: string) => {
    const required = SLOT_PERMISSION_MAP[slot];
    if (required && !permissions.includes(required)) {
      console.error(
        `[ZN Sandbox] Plugin tried to register in slot "${slot}" ` +
        `without permission "${required}". Call ignored.`
      );
      return;
    }
    return (original as any)(slot, extensions, pluginId);
  }) as ScopedPluginAPI['registerPlugins'];
}

function buildFilteredUnregisterPlugin(
  original: ScopedPluginAPI['unregisterPlugin'],
  permissions: Permission[]
): ScopedPluginAPI['unregisterPlugin'] {
  return ((slot: string, predicate: (ext: any) => boolean) => {
    const required = SLOT_PERMISSION_MAP[slot];
    if (required && !permissions.includes(required)) {
      console.error(
        `[ZN Sandbox] Plugin tried to unregister from slot "${slot}" ` +
        `without permission "${required}". Call ignored.`
      );
      return;
    }
    return (original as any)(slot, predicate);
  }) as ScopedPluginAPI['unregisterPlugin'];
}

// ─── Helper ─────────────────────────────────────────────────

function has(permissions: Permission[], p: Permission): boolean {
  return permissions.includes(p);
}

// ─── Main sandbox builder ───────────────────────────────────

/**
 * Build a sandboxed API object for a plugin based on its trust level and permissions.
 *
 * - Trusted plugins receive the full scoped API unchanged.
 * - Community plugins receive only the API members allowed by their permissions.
 *
 * @param scopedAPI  The scoped API (pluginData already scoped by createScopedPluginAPI)
 * @param trust      Trust level from manifest
 * @param permissions  Effective permissions (all for trusted, declared/default for community)
 */
export function buildSandboxedAPI(
  scopedAPI: ScopedPluginAPI,
  trust: TrustLevel,
  permissions: Permission[]
): ScopedPluginAPI {
  // Trusted = full access
  if (trust === 'trusted') return scopedAPI;

  const api: any = {};

  // --- Always available ---
  api.pluginId = scopedAPI.pluginId;
  api.registerPlugin = buildFilteredRegisterPlugin(scopedAPI.registerPlugin, permissions);
  api.registerPlugins = buildFilteredRegisterPlugins(scopedAPI.registerPlugins, permissions);
  api.unregisterPlugin = buildFilteredUnregisterPlugin(scopedAPI.unregisterPlugin, permissions);
  api.isPluginDisabled = scopedAPI.isPluginDisabled;
  api.React = scopedAPI.React;
  api.icons = scopedAPI.icons;
  api.i18n = scopedAPI.i18n;
  api.generateUUID = scopedAPI.generateUUID;

  // --- Stores ---
  const stores: any = {};
  let hasStores = false;

  function addStore(
    key: string,
    readPerm: Permission,
    writePerm?: Permission,
    legacyAlias?: string
  ) {
    if (has(permissions, writePerm ?? readPerm) || has(permissions, readPerm)) {
      hasStores = true;
      const store = (scopedAPI.stores as any)[key];
      if (!store) return;
      stores[key] = (writePerm && has(permissions, writePerm))
        ? store
        : buildReadOnlyStore(store);
      if (legacyAlias) {
        stores[legacyAlias] = stores[key];
      }
    }
  }

  addStore('useDossierStore', 'stores:dossier:read', 'stores:dossier:write', 'useInvestigationStore');
  addStore('useSelectionStore', 'stores:selection:read');
  addStore('useViewStore', 'stores:view:read');
  addStore('useReportStore', 'stores:report:read', 'stores:report:write');
  addStore('useInsightsStore', 'stores:insights:read');
  addStore('useTagSetStore', 'stores:tagSet:read', 'stores:tagSet:write');
  addStore('useTabStore', 'stores:tab:read', 'stores:tab:write');
  addStore('useUIStore', 'stores:ui:read', 'stores:ui:write');

  if (hasStores) api.stores = stores;

  // --- Repositories ---
  if (has(permissions, 'repositories:read') || has(permissions, 'repositories:write')) {
    api.repositories = has(permissions, 'repositories:write')
      ? scopedAPI.repositories
      : buildReadOnlyRepositories(scopedAPI.repositories);
  }

  // --- Plugin data (already scoped by createScopedPluginAPI) ---
  if (has(permissions, 'pluginData:readwrite')) {
    api.pluginData = scopedAPI.pluginData;
  }

  // --- Event bus ---
  if (has(permissions, 'events:subscribe')) {
    api.events = scopedAPI.events;
  }

  // --- Toast ---
  if (has(permissions, 'toast')) {
    api.toast = scopedAPI.toast;
  }

  // --- Services (granular) ---
  if (has(permissions, 'services:export') ||
      has(permissions, 'services:import') ||
      has(permissions, 'services:navigate')) {
    const services: any = {};
    if (has(permissions, 'services:export')) {
      services.exportDossier = scopedAPI.services.exportDossier;
    }
    if (has(permissions, 'services:import')) {
      services.importDossier = scopedAPI.services.importDossier;
      if ((scopedAPI.services as any).importJSON) {
        services.importJSON = (scopedAPI.services as any).importJSON;
      }
    }
    if (has(permissions, 'services:navigate')) {
      services.navigateTo = scopedAPI.services.navigateTo;
    }
    api.services = services;
  }

  // --- Direct DB access (dangerous) ---
  if (has(permissions, 'db:direct')) {
    api.db = scopedAPI.db;
  }

  // --- File service ---
  if (has(permissions, 'fileService')) {
    api.fileService = scopedAPI.fileService;
  }

  // --- Encryption ---
  if (has(permissions, 'encryption')) {
    api.encryption = scopedAPI.encryption;
  }

  return api;
}
