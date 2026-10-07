import type { ComponentType } from 'react';

// ─── Context passed to menu extensions ──────────────────────

export interface MenuContext {
  elementIds: string[];
  linkIds: string[];
  canvasPosition?: { x: number; y: number };
  hasTextAssets: boolean;
  dossierId: string;
}

// ─── Context menu extensions ────────────────────────────────

export interface ContextMenuChild {
  id: string;
  label: string;
  icon?: string;
  action: () => void | Promise<void>;
}

export interface ContextMenuExtension {
  id: string;
  label: string;
  icon: string;
  separator?: boolean;
  action: (context: MenuContext) => void | Promise<void>;
  visible?: (context: MenuContext) => boolean | Promise<boolean>;
  children?: (context: MenuContext) => Promise<ContextMenuChild[]>;
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
  onExport: (zip: any, dossierId: string) => Promise<void>;
  pluginId?: string;
}

export interface ImportHook {
  name: string;
  onImport: (zip: any, dossierId: string) => Promise<void>;
  pluginId?: string;
}

// ─── Panel plugin props ─────────────────────────────────────

export interface PanelPluginProps {
  dossierId: string;
}

// ─── Report plugin props ────────────────────────────────────

export interface ReportToolbarPluginProps {
  dossierId: string;
}

export interface ReportSectionPluginProps {
  sectionId: string;
  dossierId: string;
}

// ─── Plugin panel registration ──────────────────────────────

export interface PanelPluginRegistration {
  id: string;
  label: string;
  icon: string;
  component: ComponentType<PanelPluginProps>;
  pluginId?: string;
}

// ─── Home actions props ────────────────────────────────────

export interface HomeActionsProps {
  context: 'landing' | 'dossiers';
}

// ─── Home card registration ────────────────────────────────

export interface CardAction {
  label: string;
  icon: string;
  onClick: () => void;
}

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
  actions?: CardAction[];
  /** Trust level from manifest v2. Used to display a verified badge. */
  trust?: 'trusted' | 'community';
}

// ─── The complete slot registry ─────────────────────────────

// ─── Source link schemes ────────────────────────────────────

/** Context passed to a source scheme resolver */
export interface SourceSchemeContext {
  dossierId: string;
}

/**
 * Lets a plugin make `[label](scheme:value)` links clickable in Source fields.
 * `value` is the text after `scheme:`. Without a registration for the scheme,
 * the link stays plain text.
 */
export interface SourceSchemeExtension {
  /** Lowercase scheme name, e.g. 'mn' for `[PV p.3](mn:1a2b3c4d)` */
  scheme: string;
  /** false → target not found: the label is shown greyed out, not clickable */
  resolve: (value: string, ctx: SourceSchemeContext) => boolean;
  /** Called when the user clicks the link */
  open: (value: string, ctx: SourceSchemeContext) => void | Promise<void>;
  pluginId?: string;
}

export interface PluginSlots {
  'header:right': ComponentType[];
  'home:actions': ComponentType<HomeActionsProps>[];
  'home:banner': ComponentType[];
  'app:global': ComponentType[];
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
  'source:scheme': SourceSchemeExtension[];
}
