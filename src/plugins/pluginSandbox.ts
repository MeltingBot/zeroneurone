/**
 * Plugin sandbox — builds a filtered API object based on declared permissions.
 *
 * Trusted plugins receive the full scoped API (no filtering).
 * Community plugins receive only the API members their permissions allow.
 * Undeclared members are simply absent from the object.
 *
 * NOT A SECURITY BOUNDARY. This shapes the API object handed to a plugin; it
 * does not confine the code. pluginLoaderService imports the plugin from a blob
 * URL, and an ES module imported that way runs in the importer's realm — there
 * is no Worker, no iframe, no ShadowRealm anywhere on that path. A plugin with
 * zero permissions still reaches globalThis, indexedDB, navigator.storage,
 * fetch and useEncryptionStore.getState().dek directly.
 *
 * Treat an installed plugin as fully trusted code, on a par with the app
 * itself. The only real control is deciding which code gets loaded, which is
 * what pluginIntegrity enforces. Tightening the permission catalogue below
 * improves ergonomics and intent, never containment.
 */

import type { Permission, TrustLevel } from './pluginManifest';
import { SLOT_PERMISSION_MAP } from './pluginManifest';
import type { createScopedPluginAPI } from './pluginAPI';
import type { PluginSlots } from '../types/plugins';

type ScopedPluginAPI = ReturnType<typeof createScopedPluginAPI>;

/** A zustand hook as the sandbox wraps it: called with a selector, plus its static methods */
interface StoreHook {
  (selector: (state: object) => unknown, equalityFn?: unknown): unknown;
  getState?: () => object;
  subscribe?: unknown;
}

// ─── Read-only store proxy ──────────────────────────────────

/**
 * Cache of no-op functions keyed by action name.
 * Ensures referential stability: useStore(s => s.deleteElement)
 * always returns the same blocked function, avoiding spurious re-renders.
 */
const blockedActionCache = new Map<string | symbol, () => void>();

function makeReadOnly<T extends object>(state: T): T {
  return new Proxy(state, {
    get(target, prop) {
      const value = (target as Record<string | symbol, unknown>)[prop];
      if (typeof value === 'function') {
        if (!blockedActionCache.has(prop)) {
          blockedActionCache.set(prop, () => {
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

function buildReadOnlyStore(useStore: StoreHook): StoreHook {
  // A hook itself: plugin components call it like the store they asked for
  const useReadOnlyStore = (selector?: (state: object) => unknown, equalityFn?: unknown) => {
    const wrappedSelector = selector
      ? (state: object) => selector(makeReadOnly(state))
      : (state: object) => makeReadOnly(state);
    return useStore(wrappedSelector, equalityFn);
  };

  // Copy static methods (getState, subscribe, etc.)
  const getState = useStore.getState;
  if (getState) {
    useReadOnlyStore.getState = () => makeReadOnly(getState());
  }
  if (useStore.subscribe) {
    useReadOnlyStore.subscribe = useStore.subscribe;
  }

  return useReadOnlyStore;
}

// ─── Read-only repositories ─────────────────────────────────

function buildReadOnlyRepositories(repos: ScopedPluginAPI['repositories']): ScopedPluginAPI['repositories'] {
  const readMethods = new Set(['getByDossier', 'getByInvestigation', 'getById', 'getAll']);

  function makeReadOnly<T extends object>(repo: T): T {
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(repo)) {
      if (readMethods.has(key)) {
        filtered[key] = value;
      } else {
        filtered[key] = () => {
          console.error(`[ZN Sandbox] Repository write "${key}" blocked (read-only).`);
          return Promise.resolve();
        };
      }
    }
    return filtered as T;
  }

  return {
    elementRepository: makeReadOnly(repos.elementRepository),
    linkRepository: makeReadOnly(repos.linkRepository),
    dossierRepository: repos.dossierRepository, // already read-only by nature
    investigationRepository: repos.dossierRepository, // legacy alias
  };
}

// ─── Filtered slot registration ─────────────────────────────

function buildFilteredRegisterPlugin(
  original: ScopedPluginAPI['registerPlugin'],
  permissions: Permission[]
): ScopedPluginAPI['registerPlugin'] {
  return (<K extends keyof PluginSlots>(slot: K, extension: PluginSlots[K][number], pluginId?: string) => {
    const required = SLOT_PERMISSION_MAP[slot];
    if (required && !permissions.includes(required)) {
      console.error(
        `[ZN Sandbox] Plugin tried to register in slot "${slot}" ` +
        `without permission "${required}". Call ignored.`
      );
      return;
    }
    return original(slot, extension, pluginId);
  });
}

function buildFilteredRegisterPlugins(
  original: ScopedPluginAPI['registerPlugins'],
  permissions: Permission[]
): ScopedPluginAPI['registerPlugins'] {
  return (<K extends keyof PluginSlots>(slot: K, extensions: PluginSlots[K][number][], pluginId?: string) => {
    const required = SLOT_PERMISSION_MAP[slot];
    if (required && !permissions.includes(required)) {
      console.error(
        `[ZN Sandbox] Plugin tried to register in slot "${slot}" ` +
        `without permission "${required}". Call ignored.`
      );
      return;
    }
    return original(slot, extensions, pluginId);
  });
}

function buildFilteredUnregisterPlugin(
  original: ScopedPluginAPI['unregisterPlugin'],
  permissions: Permission[]
): ScopedPluginAPI['unregisterPlugin'] {
  return (<K extends keyof PluginSlots>(slot: K, predicate: (ext: PluginSlots[K][number]) => boolean) => {
    const required = SLOT_PERMISSION_MAP[slot];
    if (required && !permissions.includes(required)) {
      console.error(
        `[ZN Sandbox] Plugin tried to unregister from slot "${slot}" ` +
        `without permission "${required}". Call ignored.`
      );
      return;
    }
    return original(slot, predicate);
  });
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

  // Only the members allowed by the permissions are set: the others stay absent
  const api: Partial<ScopedPluginAPI> = {};

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
  // What the host can do: a plugin tests it before relying on a capability.
  api.version = scopedAPI.version;
  api.basePath = scopedAPI.basePath;
  api.features = scopedAPI.features;

  // --- Stores ---
  const stores: Record<string, StoreHook> = {};
  let hasStores = false;

  function addStore(
    key: string,
    readPerm: Permission,
    writePerm?: Permission,
    legacyAlias?: string
  ) {
    if (has(permissions, writePerm ?? readPerm) || has(permissions, readPerm)) {
      hasStores = true;
      const store = (scopedAPI.stores as Record<string, StoreHook | undefined>)[key];
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
  addStore('useQueryStore', 'stores:query:read');
  // What the views show: read-only, like the view store
  if (has(permissions, 'stores:view:read')) api.filterOutcome = scopedAPI.filterOutcome;
  // ZNQuery on the open dossier: reveals no more than the dossier store
  if (has(permissions, 'stores:dossier:read') || has(permissions, 'stores:dossier:write')) api.query = scopedAPI.query;
  // Who is in the shared dossier: personal data, asked for on its own
  if (has(permissions, 'collab:read')) api.collab = scopedAPI.collab;
  addStore('useTagSetStore', 'stores:tagSet:read', 'stores:tagSet:write');
  addStore('useTabStore', 'stores:tab:read', 'stores:tab:write');
  addStore('useUIStore', 'stores:ui:read', 'stores:ui:write');

  if (hasStores) api.stores = stores as ScopedPluginAPI['stores'];

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

  // --- Services between plugins (already scoped by createScopedPluginAPI) ---
  if (has(permissions, 'pluginServices')) {
    api.pluginServices = scopedAPI.pluginServices;
  }

  // --- Write lock ---
  if (has(permissions, 'writeLock')) {
    api.writeLock = scopedAPI.writeLock;
  }

  // --- Event bus ---
  if (has(permissions, 'events:subscribe')) {
    api.events = scopedAPI.events;
  }

  // --- Toast ---
  if (has(permissions, 'toast')) {
    api.toast = scopedAPI.toast;
  }

  // --- ZN components (map picker...) ---
  if (has(permissions, 'ui')) {
    api.ui = scopedAPI.ui;
  }

  // --- Services (granular) ---
  if (has(permissions, 'services:export') ||
      has(permissions, 'services:import') ||
      has(permissions, 'services:navigate')) {
    const services: Partial<ScopedPluginAPI['services']> = {};
    if (has(permissions, 'services:export')) {
      services.exportDossier = scopedAPI.services.exportDossier;
    }
    if (has(permissions, 'services:import')) {
      services.importDossier = scopedAPI.services.importDossier;
      if (scopedAPI.services.importJSON) {
        services.importJSON = scopedAPI.services.importJSON;
      }
    }
    if (has(permissions, 'services:navigate')) {
      services.navigateTo = scopedAPI.services.navigateTo;
    }
    api.services = services as ScopedPluginAPI['services'];
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

  return api as ScopedPluginAPI;
}
