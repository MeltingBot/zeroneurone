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
}

// ─── Keyboard shortcuts ─────────────────────────────────────

export interface KeyboardShortcut {
  keys: string;
  action: () => void;
  description: string;
  scope: 'global' | 'panel';
}

// ─── Export/Import hooks ────────────────────────────────────

export interface ExportHook {
  name: string;
  onExport: (zip: any, investigationId: string) => Promise<void>;
}

export interface ImportHook {
  name: string;
  onImport: (zip: any, investigationId: string) => Promise<void>;
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
}

// ─── The complete slot registry ─────────────────────────────

export interface PluginSlots {
  'header:right': ComponentType[];
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
