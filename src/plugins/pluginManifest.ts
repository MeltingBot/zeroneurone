/**
 * Plugin manifest v2 types — trust levels and permission system.
 */

// ─── Permission catalogue ────────────────────────────────────

export type Permission =
  // Stores (read)
  | 'stores:dossier:read'
  | 'stores:selection:read'
  | 'stores:view:read'
  | 'stores:report:read'
  | 'stores:insights:read'
  | 'stores:tagSet:read'
  | 'stores:tab:read'
  | 'stores:ui:read'
  // Stores (write)
  | 'stores:dossier:write'
  | 'stores:report:write'
  | 'stores:tagSet:write'
  | 'stores:tab:write'
  | 'stores:ui:write'
  // Repositories
  | 'repositories:read'
  | 'repositories:write'
  // Plugin data
  | 'pluginData:readwrite'
  // Events & notifications
  | 'events:subscribe'
  | 'toast'
  // Services
  | 'services:export'
  | 'services:import'
  | 'services:navigate'
  // Advanced access
  | 'db:direct'
  | 'fileService'
  | 'encryption'
  | 'network:fetch'
  // Slots
  | 'slots:ui'
  | 'slots:contextMenu'
  | 'slots:keyboard'
  | 'slots:exportImport';

export type TrustLevel = 'trusted' | 'community';

// ─── Manifest types ──────────────────────────────────────────

export interface PluginManifestV2 {
  /** Manifest format version. Absent = v1 (implicit). */
  manifestVersion?: '2';
  plugins: PluginEntry[];
}

export interface PluginEntry {
  /** Unique plugin identifier. */
  id: string;
  /** Relative path to the JS file. */
  file: string;
  /** Display name (for auto-generated home:card). */
  name?: string;
  /** Description (for auto-generated home:card). */
  description?: string;
  /** SHA-256 hex hash for integrity verification. Optional for backward compat. */
  integrity?: string;
  /**
   * Trust level.
   * - "trusted": YPSI-signed plugin, full API access.
   * - "community": third-party plugin, API filtered by permissions.
   * Absent = "community" (secure by default).
   */
  trust?: TrustLevel;
  /**
   * Requested permissions. Only relevant for trust=community.
   * Trusted plugins implicitly have all permissions.
   */
  permissions?: Permission[];
}

// ─── Default permissions for community plugins ───────────────

export const DEFAULT_COMMUNITY_PERMISSIONS: Permission[] = [
  'stores:dossier:read',
  'stores:selection:read',
  'stores:view:read',
  'stores:ui:write',
  'pluginData:readwrite',
  'events:subscribe',
  'toast',
  'slots:ui',
  'slots:contextMenu',
];

// ─── Slot → permission mapping ───────────────────────────────

export const SLOT_PERMISSION_MAP: Record<string, Permission> = {
  'home:card': 'slots:ui',
  'home:actions': 'slots:ui',
  'home:banner': 'slots:ui',
  'header:right': 'slots:ui',
  'app:global': 'slots:ui',
  'panel:right': 'slots:ui',
  'report:toolbar': 'slots:ui',
  'report:sectionActions': 'slots:ui',
  'contextMenu:element': 'slots:contextMenu',
  'contextMenu:link': 'slots:contextMenu',
  'contextMenu:canvas': 'slots:contextMenu',
  'keyboard:shortcuts': 'slots:keyboard',
  'export:hooks': 'slots:exportImport',
  'import:hooks': 'slots:exportImport',
};
