/**
 * Type definitions for ZeroNeurone external plugin API.
 *
 * Use this file to type the `api` parameter in your plugin's `register()` function:
 *
 *   import type { PluginAPI } from 'zeroneurone/types/plugin-api';
 *   export function register(api: PluginAPI) { ... }
 *
 * Or copy this file into your plugin project and reference it directly.
 */

import type React from 'react';
import type { icons } from 'lucide-react';
import type { i18n as I18nInstance } from 'i18next';
import type {
  Element,
  Link,
  Dossier,
  Asset,
  ElementId,
  LinkId,
  DossierId,
  Property,
  PropertyType,
  Confidence,
  EvaluationModel,
  EvaluationScale,
  Evaluation,
  LinkDirection,
  Position,
  GeoCoordinates,
  DateRange,
  Report,
  ReportSection,
  View,
  Comment,
  TagSet,
  TagSetId,
  SuggestedProperty,
  CanvasTab,
  TabId,
  Toast,
} from './index';
import type {
  PluginSlots,
  MenuContext,
  ContextMenuExtension,
  KeyboardShortcut,
  ExportHook,
  ImportHook,
  PanelPluginProps,
  PanelPluginRegistration,
  ReportToolbarPluginProps,
  ReportSectionPluginProps,
  HomeCardRegistration,
} from './plugins';

// ─── Re-export domain types for plugin consumers ──────────────

export type {
  Element,
  Link,
  Dossier,
  Asset,
  ElementId,
  LinkId,
  DossierId,
  Property,
  PropertyType,
  Confidence,
  EvaluationModel,
  EvaluationScale,
  Evaluation,
  LinkDirection,
  Position,
  GeoCoordinates,
  DateRange,
  Report,
  ReportSection,
  View,
  Comment,
  TagSet,
  TagSetId,
  SuggestedProperty,
  CanvasTab,
  TabId,
  Toast,
  PluginSlots,
  MenuContext,
  ContextMenuExtension,
  KeyboardShortcut,
  ExportHook,
  ImportHook,
  PanelPluginProps,
  PanelPluginRegistration,
  ReportToolbarPluginProps,
  ReportSectionPluginProps,
  HomeCardRegistration,
};

// ─── Store types ──────────────────────────────────────────────

/** Subset of useDossierStore relevant to plugins */
export interface DossierStoreAPI {
  // State
  currentDossier: Dossier | null;
  elements: Element[];
  links: Link[];
  assets: Asset[];
  comments: Comment[];
  dossiers: Dossier[];
  isLoading: boolean;

  // Actions
  loadDossier: (id: DossierId) => Promise<void>;
  createElement: (label: string, position: Position, options?: Partial<Element>) => Promise<Element>;
  updateElement: (id: ElementId, changes: Partial<Element>) => Promise<void>;
  deleteElement: (id: ElementId) => Promise<void>;
  updateElements: (ids: ElementId[], changes: Partial<Element>) => Promise<void>;
  createLink: (fromId: ElementId, toId: ElementId, options?: Partial<Link>) => Promise<Link>;
  updateLink: (id: LinkId, changes: Partial<Link>) => Promise<void>;
  deleteLink: (id: LinkId) => Promise<void>;
  addAsset: (elementId: ElementId, file: File) => Promise<void>;
}

/** Subset of useSelectionStore relevant to plugins */
export interface SelectionStoreAPI {
  selectedElementIds: Set<ElementId>;
  selectedLinkIds: Set<LinkId>;
  selectElements: (ids: ElementId[]) => void;
  clearSelection: () => void;
}

/** Subset of useViewStore relevant to plugins */
export interface ViewStoreAPI {
  dossierId: DossierId | null;
  viewport: { x: number; y: number; zoom: number };
}

/** Subset of useReportStore relevant to plugins */
export interface ReportStoreAPI {
  report: Report | null;
  sections: ReportSection[];
  loadReport: (dossierId: DossierId) => Promise<void>;
  addSection: (section: Partial<ReportSection>) => Promise<void>;
  updateSection: (id: string, changes: Partial<ReportSection>) => Promise<void>;
  deleteSection: (id: string) => Promise<void>;
}

/** Subset of useInsightsStore relevant to plugins */
export interface InsightsStoreAPI {
  clusters: Map<string, string[]> | null;
  bridges: string[];
  isolatedNodes: string[];
  degreeCentrality: Map<string, number> | null;
  betweennessCentrality: Map<string, number> | null;
}

/** Subset of useQueryStore relevant to plugins: the query filter applied on the canvas */
export interface QueryStoreAPI {
  /** True when a query result is applied as a filter on the canvas */
  isFilterActive: boolean;
  /** Elements found, plus the ends of the links found */
  matchingElementIds: Set<string>;
  /** Links found */
  matchingLinkIds: Set<string>;
}

/** Subset of useTagSetStore relevant to plugins */
export interface TagSetStoreAPI {
  tagSets: Map<TagSetId, TagSet>;
  getByName: (name: string) => TagSet | undefined;
  getAll: () => TagSet[];
  create: (data: Omit<TagSet, 'id' | 'createdAt' | 'updatedAt'>) => Promise<TagSet>;
  update: (id: TagSetId, changes: Partial<Omit<TagSet, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
  getSuggestedProperties: (tagName: string) => SuggestedProperty[];
}

/** Subset of useTabStore relevant to plugins */
export interface TabStoreAPI {
  tabs: CanvasTab[];
  activeTabId: TabId | null;
  loadTabs: (dossierId: DossierId) => Promise<void>;
  createTab: (dossierId: DossierId, name: string) => Promise<CanvasTab>;
  renameTab: (tabId: TabId, name: string) => Promise<void>;
  deleteTab: (tabId: TabId) => Promise<void>;
  setActiveTab: (tabId: TabId | null) => void;
  addMembers: (tabId: TabId, elementIds: ElementId[]) => Promise<void>;
  removeMembers: (tabId: TabId, elementIds: ElementId[]) => Promise<void>;
}

/** Subset of useUIStore relevant to plugins */
export interface UIStoreAPI {
  /** @deprecated Always empty: toasts live in the toast store; use `showToast`. */
  toasts: Toast[];
  showToast: (type: Toast['type'], message: string, duration?: number) => string;
  dismissToast: (id: string) => void;
  /** @deprecated No effect: ZeroNeurone renders no modal from this state. Render your own in the `app:global` slot. */
  openModal: (type: string, data?: unknown) => void;
  /** @deprecated No effect, see `openModal`. */
  closeModal: () => void;
  /** Opens the side panel on a tab: a native one or a plugin tab id (`panel:right`). */
  setSidePanelTab: (tab: string) => void;
  closeSidePanel: () => void;
}

// ─── Repository types ─────────────────────────────────────────

export interface ElementRepositoryAPI {
  getByDossier: (id: DossierId) => Promise<Element[]>;
  getById: (id: ElementId) => Promise<Element | undefined>;
  create: (element: Element) => Promise<void>;
  update: (id: ElementId, changes: Partial<Element>) => Promise<void>;
  remove: (id: ElementId) => Promise<void>;
}

export interface LinkRepositoryAPI {
  getByDossier: (id: DossierId) => Promise<Link[]>;
  getById: (id: LinkId) => Promise<Link | undefined>;
  create: (link: Link) => Promise<void>;
  update: (id: LinkId, changes: Partial<Link>) => Promise<void>;
  remove: (id: LinkId) => Promise<void>;
}

export interface DossierRepositoryAPI {
  getAll: () => Promise<Dossier[]>;
  getById: (id: DossierId) => Promise<Dossier | undefined>;
}

// ─── Plugin data ──────────────────────────────────────────────

/** Raw pluginData API (requires explicit pluginId — internal use). */
export interface PluginDataAPI {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- public plugin API: plugins read the value as their own type
  get: (pluginId: string, dossierId: string, key: string) => Promise<any>;
  set: (pluginId: string, dossierId: string, key: string, value: unknown) => Promise<void>;
  remove: (pluginId: string, dossierId: string, key: string) => Promise<void>;

  /** Get global plugin data (not tied to any dossier). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- public plugin API: plugins read the value as their own type
  getGlobal: (pluginId: string, key: string) => Promise<any>;
  /** Set global plugin data (not tied to any dossier). */
  setGlobal: (pluginId: string, key: string, value: unknown) => Promise<void>;
  /** Remove global plugin data (not tied to any dossier). */
  removeGlobal: (pluginId: string, key: string) => Promise<void>;

  /** Entries of a dossier whose key starts with `prefix`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- public plugin API: plugins read the value as their own type
  list: (pluginId: string, dossierId: string, prefix: string) => Promise<{ key: string; value: any }[]>;
  /** Declares key prefixes shared with collaborators through the dossier's Y.Doc (JSON values). ZN 2.63+ (`features.sharedPluginData`). */
  shareKeys: (pluginId: string, prefixes: string[]) => void;
  /** Called when a collaborator changed a shared key; Dexie is already updated. Returns an unsubscribe function. */
  onRemoteChange: (pluginId: string, cb: (change: PluginDataRemoteChange) => void) => () => void;
}

/** A shared pluginData key changed by a collaborator. */
export interface PluginDataRemoteChange {
  dossierId: string;
  key: string;
  deleted: boolean;
}

/**
 * Scoped pluginData API — pluginId is injected automatically.
 * This is what external plugins receive via `register(api)`.
 */
export interface ScopedPluginDataAPI {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- public plugin API: plugins read the value as their own type
  get: (dossierId: string, key: string) => Promise<any>;
  set: (dossierId: string, key: string, value: unknown) => Promise<void>;
  remove: (dossierId: string, key: string) => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- public plugin API: plugins read the value as their own type
  getGlobal: (key: string) => Promise<any>;
  setGlobal: (key: string, value: unknown) => Promise<void>;
  removeGlobal: (key: string) => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- public plugin API: plugins read the value as their own type
  list: (dossierId: string, prefix: string) => Promise<{ key: string; value: any }[]>;
  shareKeys: (prefixes: string[]) => void;
  onRemoteChange: (cb: (change: PluginDataRemoteChange) => void) => () => void;
}

// ─── Event bus ────────────────────────────────────────────────

/**
 * Core events. Each device emits the actions done on it: changes received
 * from a collaborator emit nothing (they were emitted on their device).
 * Deliberately not emitted: element moves, asset reordering, display
 * settings, selection, filters.
 */
export type PluginEventType =
  | 'dossier:created'
  /** `meta.fields` = changed fields; `meta.changes` = { field: { from, to } } for retention and closure fields */
  | 'dossier:updated'
  | 'dossier:deleted'
  /** After a dossier is deleted: `meta.receipt` lists each storage checked and what is left */
  | 'dossier:purged'
  /** The user closed the dossier (read-only until reopened), or reopened it */
  | 'dossier:caseClosed'
  | 'dossier:caseReopened'
  /** Loaded / unloaded in this window (not the case closure) */
  | 'dossier:opened'
  | 'dossier:closed'
  /** Import finished: `meta` = { format, into, elements, links, assets } */
  | 'dossier:imported'
  /** Something left the app: `meta.format` (zip, json, csv, png, report-md, print, clipboard-mermaid, asset, backup…) */
  | 'dossier:exported'
  /** Collaboration: shared from this device, or joined from a link */
  | 'dossier:shared'
  | 'dossier:joined'
  /** `meta.via`: 'paste' when created by a paste; `meta.group`: true for a group */
  | 'element:created'
  /** `meta.fields` = changed fields (bulk edits emit one event per element) */
  | 'element:updated'
  | 'element:deleted'
  | 'element:tagAdded'
  | 'element:tagRemoved'
  /** `entityId` = kept element, `meta.mergedIds` = elements merged into it */
  | 'element:merged'
  | 'link:created'
  | 'link:updated'
  | 'link:deleted'
  | 'asset:created'
  | 'asset:deleted'
  /** `entityId` = comment id, `meta.targetId` = element or link */
  | 'comment:created'
  | 'comment:resolved'
  | 'comment:unresolved'
  | 'comment:deleted'
  /** `meta` = { from, to, elements, links } */
  | 'tag:renamed'
  /** Report edits, coalesced per section: `meta` = { action, sectionId? } */
  | 'report:updated'
  /** A query run by the user (not automatic re-runs). `meta.text` may contain names: log it or not */
  | 'query:executed';

/** Events emitted by a plugin: always `<pluginId>:<name>` */
export type PluginCustomEventType = `${string}:${string}`;

/** 'undo': replayed by undo/redo */
export type PluginEventOrigin = 'local' | 'undo';

export interface PluginEvent {
  type: PluginEventType | PluginCustomEventType;
  dossierId: string;
  entityId?: string;
  timestamp: number;
  origin: PluginEventOrigin;
  /** Event details: `tagName` on tag events, `receipt` on dossier:purged… */
  meta?: Record<string, unknown>;
}

export type PluginEventCallback = (event: PluginEvent) => void;

export interface EventsAPI {
  /** Subscribe to one event type (core or plugin). Returns an unsubscribe function. */
  on: (eventType: PluginEventType | PluginCustomEventType, cb: PluginEventCallback) => () => void;
  /** Subscribe to every event, core and plugin ones (audit trail). Returns an unsubscribe function. */
  onAny: (cb: PluginEventCallback) => () => void;
  /**
   * Emit an event of this plugin. `type` must be `<pluginId>:<name>`;
   * anything else is refused (warning in the console, nothing emitted).
   */
  emit: (type: PluginCustomEventType, dossierId: string, meta?: Record<string, unknown>, entityId?: string) => void;
}

// ─── Toast API ────────────────────────────────────────────────

// ─── Write lock API ───────────────────────────────────────────

/**
 * Suspend every write (all dossiers, creation and deletion included) until the
 * plugin lifts it — e.g. an audit plugin whose server is unreachable. The user
 * sees the reason. Needs the `writeLock` permission (trusted plugins have it).
 */
export interface WriteLockAPI {
  /** Suspend writes, with the reason shown to the user */
  set: (reason: string) => void;
  /** Lift this plugin's lock */
  clear: () => void;
  /** Reason of the current lock (any plugin), or null */
  current: () => string | null;
}

export interface ToastAPI {
  success: (message: string, options?: { duration?: number; id?: string }) => string;
  error: (message: string, options?: { duration?: number; id?: string }) => string;
  warning: (message: string, options?: { duration?: number; id?: string }) => string;
  info: (message: string, options?: { duration?: number; id?: string }) => string;
  dismiss: (id: string) => void;
}

// ─── UI API ───────────────────────────────────────────────────

export interface UiAPI {
  /**
   * Opens ZN's map picker. Map tiles and address search are ZN's own
   * network calls. `options.query` pre-fills the search field; the search
   * still waits for the user. Resolves with the chosen point, or null when cancelled.
   */
  openGeoPicker: (
    initial?: { lat: number; lng: number },
    options?: { query?: string },
  ) => Promise<{ lat: number; lng: number } | null>;
}

// ─── Services API ─────────────────────────────────────────────

export interface ServicesAPI {
  /**
   * Produce a complete ZIP snapshot of a dossier (same as manual export).
   */
  exportDossier: (dossierId: string) => Promise<Blob>;

  /**
   * Import a ZIP blob into a dossier.
   */
  importDossier: (
    blob: Blob,
    options?: {
      targetDossierId?: string;
      positionOffset?: { x: number; y: number };
      suffix?: string;
      /** Clear all existing content before importing. Keeps the dossier shell (same ID). */
      replace?: boolean;
    },
  ) => Promise<{
    success: boolean;
    elementsImported: number;
    linksImported: number;
    assetsImported: number;
    errors: string[];
    warnings: string[];
    dossierId: string;
  }>;

  /**
   * Navigate to a route within ZeroNeurone.
   * Common routes: '/' (home), '/dossier/:id' (open dossier).
   */
  navigateTo: (path: string) => void;
}

// ─── Services between plugins ─────────────────────────────────

/** Returned by `provide`. */
export interface ServiceHandle {
  /** Withdraws the service. */
  revoke(): void;
  /** Tells consumers that what the service offers changed (e.g. a license). */
  changed(): void;
}

/**
 * Services a plugin offers to the others (ZN 2.64+, `features.pluginServices`).
 * Requires the `pluginServices` permission for community plugins.
 */
export interface PluginServicesAPI {
  /** Raw form: `provide(owner, name, impl)`. `name` must start with "<owner>:". */
  provide: (owner: string, name: string, impl: { version: number }) => ServiceHandle;
  /** The service, or undefined when it is not provided or its plugin is disabled. */
  get: <T>(name: string) => T | undefined;
  subscribe: (cb: () => void) => () => void;
  getVersion: () => number;
  /** React hook: re-renders when a service is provided, withdrawn or changed. */
  use: <T>(name: string) => T | undefined;
}

/** Scoped form: the provider is the calling plugin. */
export interface ScopedPluginServicesAPI extends Omit<PluginServicesAPI, 'provide'> {
  /** `name` must start with "<pluginId>:". */
  provide: (name: string, impl: { version: number }) => ServiceHandle;
}

/** Capabilities a plugin can test before relying on them. */
export interface PluginFeatures {
  /** Source fields render `[label](https://…)` and `[label](asset:…)` as links (2.62+) */
  sourceLinks?: boolean;
  /** Slot `source:scheme` (2.62+) */
  sourceSchemes?: boolean;
  /** `locate` of a `source:scheme` registration, used by the Obsidian export (2.89+) */
  sourceSchemeLocate?: boolean;
  /** pluginData.shareKeys / list / onRemoteChange (2.63+) */
  sharedPluginData?: boolean;
  /** pluginServices (2.64+) */
  pluginServices?: boolean;
  /** filterOutcome() (2.71+) */
  filterOutcome?: boolean;
  /** query.parse / evaluate / vocabulary (2.88.2+) */
  queryEngine?: boolean;
  /** collab.getLocalUser / getRemoteUsers / isShared / getPresence / onPresenceChange (2.90+) */
  presence?: boolean;
}

/** The user of this browser, as collaborators see them */
export interface CollabLocalUser {
  userId: string;
  name: string;
  color: string;
}

/** Another user connected to the shared dossier */
export interface CollabUser extends CollabLocalUser {
  /** Last heartbeat received (ms since epoch), null when unknown */
  lastSeen: number | null;
  /** Element ids selected */
  selection: string[];
  /** View open */
  viewMode: 'canvas' | 'map' | 'timeline';
}

export interface PresenceSnapshot {
  /** The open dossier is shared (collaboration on) */
  shared: boolean;
  localUser: CollabLocalUser;
  /** One entry per user (several tabs of one user count once); empty when not shared */
  remoteUsers: CollabUser[];
}

/** Who is in the shared dossier, read-only: nothing is written to the dossier nor sent to collaborators */
export interface CollabAPI {
  getLocalUser(): CollabLocalUser;
  /** Empty when the dossier is not shared */
  getRemoteUsers(): CollabUser[];
  isShared(): boolean;
  getPresence(): PresenceSnapshot;
  /**
   * Called on each change: sharing on or off, a user joining or leaving, a name, color,
   * selection or view changing (not cursor moves nor heartbeats). Returns the unsubscribe function.
   */
  onPresenceChange(cb: (presence: PresenceSnapshot) => void): () => void;
}

/** Where a ZNQuery text fails to parse */
export interface QueryEngineError {
  message: string;
  /** Character offset in the text given */
  position: number;
  /** Token the parser expected, when known */
  expected?: string;
}

/** ZNQuery on the open dossier, without touching the query panel, the canvas, the history or `query:executed` */
export interface QueryEngineAPI {
  /** Parse a ZNQuery text. No side effect. */
  parse(text: string): { ok: true } | { ok: false; error: QueryEngineError };
  /**
   * Evaluate a ZNQuery text on the open dossier (elements and links of useDossierStore),
   * as the query panel does. `within` keeps those elements and the links between two of
   * them; conditions that follow links (WITHIN, from.*, to.*) still see the whole dossier.
   */
  evaluate(
    text: string,
    options?: { within?: Iterable<string> },
  ): { elementIds: string[]; linkIds: string[] } | { error: QueryEngineError };
  /** Reserved fields and recognized operators */
  vocabulary(): { fields: string[]; operators: string[] };
}

/** What the views show, kept by the filters panel and the query applied on the canvas */
export interface FilterOutcomeAPI {
  /** Elements not hidden by hand */
  total: number;
  /** Elements the views show; fewer than `total` when something narrows them */
  shownIds: string[];
  /** Elements kept by the filters alone */
  filterCount: number;
  /** Elements kept by the query alone (link ends included); null without a query filter */
  queryCount: number | null;
}

// ─── Main API type ────────────────────────────────────────────

export interface PluginAPI {
  // Plugin registration
  registerPlugin: <K extends keyof PluginSlots>(
    slot: K,
    extension: PluginSlots[K][number],
    pluginId?: string
  ) => void;
  registerPlugins: <K extends keyof PluginSlots>(
    slot: K,
    extensions: PluginSlots[K][number][],
    pluginId?: string
  ) => void;
  isPluginDisabled: (id: string) => boolean;

  // React & UI
  React: typeof React;
  icons: typeof icons;
  i18n: I18nInstance;

  // Zustand stores
  stores: {
    useDossierStore: () => DossierStoreAPI;
    useSelectionStore: () => SelectionStoreAPI;
    useViewStore: () => ViewStoreAPI;
    useReportStore: () => ReportStoreAPI;
    useInsightsStore: () => InsightsStoreAPI;
    useQueryStore: () => QueryStoreAPI;
    useTagSetStore: () => TagSetStoreAPI;
    useTabStore: () => TabStoreAPI;
    useUIStore: () => UIStoreAPI;
  };

  // Database repositories
  repositories: {
    elementRepository: ElementRepositoryAPI;
    linkRepository: LinkRepositoryAPI;
    dossierRepository: DossierRepositoryAPI;
  };

  // Dexie database instance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- public plugin API: plugins reach their tables untyped
  db: any;

  // File service
  fileService: {
    getAssetFile: (hash: string) => Promise<File | null>;
    getAssetUrl: (hash: string) => Promise<string | null>;
    extractAssetText: (asset: Asset) => Promise<string>;
  };

  // Utilities
  generateUUID: () => string;

  /** ZeroNeurone version (semver) */
  version: string;
  /** Path the app is served under ('/' or e.g. '/Zeroneurone/'), with trailing slash.
   *  Prefix it to any URL of the app's own files (plugins/, ...). Absent before ZN 2.66.2. */
  basePath?: string;
  /** Capabilities of this ZeroNeurone */
  features: PluginFeatures;

  /** What the views show (filters + query), counted as the filters panel does (2.71+, `features.filterOutcome`) */
  filterOutcome?: () => FilterOutcomeAPI;

  /** ZNQuery engine (2.88.2+, `features.queryEngine`); community plugins need `stores:dossier:read` */
  query?: QueryEngineAPI;

  /** Presence in the shared dossier (2.90+, `features.presence`); community plugins need `collab:read` */
  collab?: CollabAPI;

  // Services (export, import, navigation)
  services: ServicesAPI;

  // Services between plugins (raw — the provider's id comes first)
  pluginServices: PluginServicesAPI;

  // Event bus (subscribe to data changes)
  events: EventsAPI;
  /** ZN 2.84+ */
  writeLock?: WriteLockAPI;

  // Toast / Notifications
  toast: ToastAPI;

  // ZN components opened by plugins (requires the 'ui' permission)
  ui: UiAPI;

  // Plugin data persistence (raw — requires pluginId in each call)
  pluginData: PluginDataAPI;

  // At-rest encryption sharing
  encryption: EncryptionPluginAPI;
}

/**
 * Scoped version of PluginAPI passed to external plugins.
 * pluginData methods auto-inject the plugin's ID, preventing
 * cross-plugin data access.
 */
export interface ScopedPluginAPI extends Omit<PluginAPI, 'pluginData' | 'pluginServices'> {
  /** The ID of this plugin (from manifest). */
  pluginId: string;
  /** Scoped data API — pluginId is injected automatically. */
  pluginData: ScopedPluginDataAPI;
  /** Scoped services API — the provider is this plugin. */
  pluginServices: ScopedPluginServicesAPI;
}

/**
 * API de chiffrement exposée aux plugins.
 * Permet à un plugin d'appliquer le même chiffrement at-rest que ZeroNeurone
 * sur sa propre base Dexie, sans accéder à la DEK brute.
 */
export interface EncryptionPluginAPI {
  /**
   * Applique le middleware de chiffrement ZN sur une instance Dexie externe.
   * No-op si le chiffrement est inactif ou la session verrouillée.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- plugin's own Dexie, possibly another copy of the library
  applyToDatabase(dexieInstance: any, tables: string[]): void;

  /**
   * S'abonne à l'événement "prêt" (DEK disponible ou chiffrement absent).
   * Appelé immédiatement si déjà prêt.
   * @returns Fonction de désinscription
   */
  onReady(cb: () => void): () => void;

  /**
   * S'abonne à l'événement "verrouillé" (DEK effacée).
   * @returns Fonction de désinscription
   */
  onLock(cb: () => void): () => void;

  /** Vrai si le chiffrement at-rest est activé dans ZeroNeurone. */
  isEnabled(): boolean;

  /** Vrai si la DEK est déverrouillée (disponible en mémoire). */
  isUnlocked(): boolean;

  /**
   * Chiffre un ArrayBuffer avec la DEK de ZN (AES-256-GCM).
   * Rejette si la session est verrouillée.
   */
  encrypt(plaintext: ArrayBuffer): Promise<ArrayBuffer>;

  /**
   * Déchiffre un ArrayBuffer produit par encrypt().
   * Rejette si la session est verrouillée.
   */
  decrypt(ciphertext: ArrayBuffer): Promise<ArrayBuffer>;

  /**
   * S'abonne à l'événement "désactivation imminente du chiffrement".
   * Appelé (et awaité) par ZN avant window.location.reload().
   * Le plugin doit déchiffrer ses données dans ce callback.
   * @returns Fonction de désinscription
   */
  onBeforeDisable(cb: (decryptRecord: (record: unknown) => unknown) => Promise<void>): () => void;
}
