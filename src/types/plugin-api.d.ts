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
  Investigation,
  Asset,
  ElementId,
  LinkId,
  InvestigationId,
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
  Investigation,
  Asset,
  ElementId,
  LinkId,
  InvestigationId,
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

/** Subset of useInvestigationStore relevant to plugins */
export interface InvestigationStoreAPI {
  // State
  currentInvestigation: Investigation | null;
  elements: Element[];
  links: Link[];
  assets: Asset[];
  comments: Comment[];
  investigations: Investigation[];
  isLoading: boolean;

  // Actions
  loadInvestigation: (id: InvestigationId) => Promise<void>;
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
  investigationId: InvestigationId | null;
  viewport: { x: number; y: number; zoom: number };
}

/** Subset of useReportStore relevant to plugins */
export interface ReportStoreAPI {
  report: Report | null;
  sections: ReportSection[];
  loadReport: (investigationId: InvestigationId) => Promise<void>;
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
  getByInvestigation: (id: InvestigationId) => Promise<Element[]>;
  getById: (id: ElementId) => Promise<Element | undefined>;
  create: (element: Element) => Promise<void>;
  update: (id: ElementId, changes: Partial<Element>) => Promise<void>;
  remove: (id: ElementId) => Promise<void>;
}

export interface LinkRepositoryAPI {
  getByInvestigation: (id: InvestigationId) => Promise<Link[]>;
  getById: (id: LinkId) => Promise<Link | undefined>;
  create: (link: Link) => Promise<void>;
  update: (id: LinkId, changes: Partial<Link>) => Promise<void>;
  remove: (id: LinkId) => Promise<void>;
}

export interface InvestigationRepositoryAPI {
  getAll: () => Promise<Investigation[]>;
  getById: (id: InvestigationId) => Promise<Investigation | undefined>;
}

// ─── Plugin data ──────────────────────────────────────────────

export interface PluginDataAPI {
  get: (pluginId: string, investigationId: string, key: string) => Promise<any>;
  set: (pluginId: string, investigationId: string, key: string, value: any) => Promise<void>;
  remove: (pluginId: string, investigationId: string, key: string) => Promise<void>;
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
    useInvestigationStore: () => InvestigationStoreAPI;
    useSelectionStore: () => SelectionStoreAPI;
    useViewStore: () => ViewStoreAPI;
    useReportStore: () => ReportStoreAPI;
    useInsightsStore: () => InsightsStoreAPI;
  };

  // Database repositories
  repositories: {
    elementRepository: ElementRepositoryAPI;
    linkRepository: LinkRepositoryAPI;
    investigationRepository: InvestigationRepositoryAPI;
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
}
