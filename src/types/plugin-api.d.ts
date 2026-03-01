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
  LinkDirection,
  Position,
  GeoCoordinates,
  DateRange,
  Report,
  ReportSection,
  View,
  Comment,
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
  LinkDirection,
  Position,
  GeoCoordinates,
  DateRange,
  Report,
  ReportSection,
  View,
  Comment,
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

export interface PluginDataAPI {
  get: (pluginId: string, dossierId: string, key: string) => Promise<any>;
  set: (pluginId: string, dossierId: string, key: string, value: any) => Promise<void>;
  remove: (pluginId: string, dossierId: string, key: string) => Promise<void>;
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
  };

  // Database repositories
  repositories: {
    elementRepository: ElementRepositoryAPI;
    linkRepository: LinkRepositoryAPI;
    dossierRepository: DossierRepositoryAPI;
  };

  // Dexie database instance
  db: any;

  // File service
  fileService: {
    getAssetFile: (hash: string) => Promise<File | null>;
    getAssetUrl: (hash: string) => Promise<string | null>;
    extractAssetText: (asset: Asset) => Promise<string>;
  };

  // Utilities
  generateUUID: () => string;

  // Plugin data persistence
  pluginData: PluginDataAPI;

  // At-rest encryption sharing
  encryption: EncryptionPluginAPI;
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

  /**
   * S'abonne à l'événement "désactivation imminente du chiffrement".
   * Appelé (et awaité) par ZN avant window.location.reload().
   * Le plugin doit déchiffrer ses données dans ce callback.
   * @returns Fonction de désinscription
   */
  onBeforeDisable(cb: (decryptRecord: (record: unknown) => unknown) => Promise<void>): () => void;
}
