/**
 * Yjs Types for zeroneurone collaboration
 *
 * Y.Doc structure:
 * - meta: Y.Map<string>           → Dossier metadata
 * - elements: Y.Map<Y.Map<any>>   → Elements by ID
 * - links: Y.Map<Y.Map<any>>      → Links by ID
 * - comments: Y.Map<Y.Map<any>>   → Comments by ID
 * - views: Y.Map<Y.Map<any>>      → Saved views
 * - assets: Y.Map<Y.Map<any>>     → Asset metadata (binaries stay in OPFS)
 * - reports: Y.Map<Y.Map<any>>    → Reports by ID (one per dossier)
 * - pluginData: Y.Map<entry>       → Plugin data keys declared shared (services/yjs/pluginDataSync.ts)
 */

import type * as Y from 'yjs';
import type { DatePrecision, DateRange } from './index';

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
  /** Attempting to reconnect after disconnect */
  reconnecting: boolean;
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
  reconnecting: false,
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
export interface YDossier {
  meta: Y.Map<any>;
  elements: Y.Map<Y.Map<any>>;
  links: Y.Map<Y.Map<any>>;
  comments: Y.Map<Y.Map<any>>;
  views: Y.Map<Y.Map<any>>;
  assets: Y.Map<Y.Map<any>>;
  reports: Y.Map<Y.Map<any>>;
  tabs: Y.Map<Y.Map<any>>;
}

/**
 * Get typed maps from a Y.Doc
 */
export function getYMaps(ydoc: Y.Doc): YDossier {
  return {
    meta: ydoc.getMap('meta'),
    elements: ydoc.getMap('elements'),
    links: ydoc.getMap('links'),
    comments: ydoc.getMap('comments'),
    views: ydoc.getMap('views'),
    assets: ydoc.getMap('assets'),
    reports: ydoc.getMap('reports'),
    tabs: ydoc.getMap('tabs'),
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
  /** Report section ID currently being edited */
  editingReportSection: string | null;
  /** Current view mode */
  viewMode: 'canvas' | 'map' | 'timeline';
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

/**
 * DateRange as stored in Y.js: plain object, precision kept. Optional fields
 * are only written when set, so older peers see the same shape as before.
 */
export function dateRangeToYjs(range: DateRange | null | undefined): Record<string, unknown> | null {
  if (!range) return null;
  return {
    start: dateToYjs(range.start),
    end: dateToYjs(range.end),
    ...(range.precision ? { precision: range.precision } : {}),
    ...(range.approximate ? { approximate: true } : {}),
    ...(range.timeZone ? { timeZone: range.timeZone } : {}),
  };
}

/** DateRange from Y.js: a plain object, or a Y.Map written by an older peer. */
export function dateRangeFromYjs(raw: unknown): DateRange | null {
  if (!raw || typeof raw !== 'object') return null;
  const read = (key: string) =>
    typeof (raw as { get?: unknown }).get === 'function'
      ? (raw as Y.Map<unknown>).get(key)
      : (raw as Record<string, unknown>)[key];
  const precision = read('precision');
  return {
    start: dateFromYjs(read('start') as string | null),
    end: dateFromYjs(read('end') as string | null),
    ...(isDatePrecision(precision) ? { precision } : {}),
    ...(read('approximate') === true ? { approximate: true } : {}),
    ...(typeof read('timeZone') === 'string' && read('timeZone') ? { timeZone: read('timeZone') as string } : {}),
  };
}

export function isDatePrecision(value: unknown): value is DatePrecision {
  return value === 'year' || value === 'month' || value === 'day' || value === 'minute';
}
