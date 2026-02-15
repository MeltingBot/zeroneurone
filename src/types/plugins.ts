import type { ComponentType } from 'react';

// ─── Context passed to menu extensions ──────────────────────

export interface MenuContext {
  elementIds: string[];
  linkIds: string[];
  canvasPosition?: { x: number; y: number };
  hasTextAssets: boolean;
  investigationId: string;
}

// ─── Context menu extensions ────────────────────────────────

export interface ContextMenuExtension {
  id: string;
  label: string;
  icon: string;
  separator?: boolean;
  action: (context: MenuContext) => void;
  visible?: (context: MenuContext) => boolean;
  pluginId?: string;
}

// ─── Keyboard shortcuts ─────────────────────────────────────

export interface KeyboardShortcut {
  keys: string;
  action: () => void;
  description: string;
  scope: 'global' | 'panel';
  pluginId?: string;
}

// ─── Export/Import hooks ────────────────────────────────────

export interface ExportHook {
  name: string;
  onExport: (zip: any, investigationId: string) => Promise<void>;
  pluginId?: string;
}

export interface ImportHook {
  name: string;
  onImport: (zip: any, investigationId: string) => Promise<void>;
  pluginId?: string;
}

// ─── Panel plugin props ─────────────────────────────────────

export interface PanelPluginProps {
  investigationId: string;
}

// ─── Report plugin props ────────────────────────────────────

export interface ReportToolbarPluginProps {
  investigationId: string;
}

export interface ReportSectionPluginProps {
  sectionId: string;
  investigationId: string;
}

// ─── Plugin panel registration ──────────────────────────────

export interface PanelPluginRegistration {
  id: string;
  label: string;
  icon: string;
  component: ComponentType<PanelPluginProps>;
  pluginId?: string;
}

// ─── Home card registration ────────────────────────────────

export interface HomeCardRegistration {
  id: string;
  name: string;
  description: string;
  icon: string;
  version?: string;
  license?: string;
  docUrl?: string;
  features?: string[];
  onConfigure?: () => void;
}

// ─── The complete slot registry ─────────────────────────────

export interface PluginSlots {
  'header:right': ComponentType[];
  'home:actions': ComponentType[];
  'home:banner': ComponentType[];
  'home:card': HomeCardRegistration[];
  'panel:right': PanelPluginRegistration[];
  'contextMenu:element': ContextMenuExtension[];
  'contextMenu:link': ContextMenuExtension[];
  'contextMenu:canvas': ContextMenuExtension[];
  'report:toolbar': ComponentType<ReportToolbarPluginProps>[];
  'report:sectionActions': ComponentType<ReportSectionPluginProps>[];
  'keyboard:shortcuts': KeyboardShortcut[];
  'export:hooks': ExportHook[];
  'import:hooks': ImportHook[];
}
