/**
 * Yjs Types for zeroneurone collaboration
 *
 * Y.Doc structure:
 * - meta: Y.Map<string>           → Investigation metadata
 * - elements: Y.Map<Y.Map<any>>   → Elements by ID
 * - links: Y.Map<Y.Map<any>>      → Links by ID
 * - views: Y.Map<Y.Map<any>>      → Saved views
 * - assets: Y.Map<Y.Map<any>>     → Asset metadata (binaries stay in OPFS)
 */

import type * as Y from 'yjs';

// ============================================================================
// SYNC STATE
// ============================================================================

export type SyncMode = 'local' | 'shared';

export interface SyncState {
  /** Current sync mode */
  mode: SyncMode;
  /** Connected to signaling server */
  connected: boolean;
  /** Currently syncing with peers */
  syncing: boolean;
  /** Connection error message */
  error: string | null;
  /** Room ID when shared */
  roomId: string | null;
  /** Number of connected peers */
  peerCount: number;
}

export const DEFAULT_SYNC_STATE: SyncState = {
  mode: 'local',
  connected: false,
  syncing: false,
  error: null,
  roomId: null,
  peerCount: 0,
};

// ============================================================================
// Y.DOC STRUCTURE
// ============================================================================

/**
 * Typed interface for accessing Y.Doc maps
 */
export interface YInvestigation {
  meta: Y.Map<any>;
  elements: Y.Map<Y.Map<any>>;
  links: Y.Map<Y.Map<any>>;
  views: Y.Map<Y.Map<any>>;
  assets: Y.Map<Y.Map<any>>;
}

/**
 * Get typed maps from a Y.Doc
 */
export function getYMaps(ydoc: Y.Doc): YInvestigation {
  return {
    meta: ydoc.getMap('meta'),
    elements: ydoc.getMap('elements'),
    links: ydoc.getMap('links'),
    views: ydoc.getMap('views'),
    assets: ydoc.getMap('assets'),
  };
}

// ============================================================================
// USER PRESENCE (for awareness protocol)
// ============================================================================

export interface UserPresence {
  /** Unique user ID (generated per session) */
  odUserId: string;
  /** Display name */
  name: string;
  /** User color for cursor/avatar */
  color: string;
  /** Cursor position on canvas (null if not on canvas) */
  cursor: { x: number; y: number } | null;
  /** Currently selected element IDs */
  selection: string[];
  /** Currently selected link IDs */
  linkSelection: string[];
  /** Element IDs currently being dragged/moved */
  dragging: string[];
  /** Element ID currently being edited (label editing) */
  editing: string | null;
  /** Link ID currently being edited */
  editingLink: string | null;
  /** Current view mode */
  viewMode: 'canvas' | 'map' | 'timeline' | 'split';
}

export const USER_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

/**
 * Generate a random user color
 */
export function getRandomUserColor(): string {
  return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
}

/**
 * Generate a random user name (for anonymous collaboration)
 */
export function generateUserName(): string {
  const adjectives = ['Agile', 'Brave', 'Calm', 'Deft', 'Eager', 'Fair', 'Keen', 'Noble', 'Quick', 'Sharp'];
  const animals = ['Aigle', 'Loup', 'Renard', 'Ours', 'Lynx', 'Faucon', 'Hibou', 'Cerf', 'Puma', 'Tigre'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return `${adj} ${animal}`;
}

// ============================================================================
// SERIALIZATION HELPERS
// ============================================================================

/**
 * Convert Date to ISO string for Y.Map storage
 */
export function dateToYjs(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date instanceof Date ? date.toISOString() : date;
}

/**
 * Convert ISO string from Y.Map to Date
 */
export function dateFromYjs(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(value);
}
