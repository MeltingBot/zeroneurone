/**
 * Plugin event bus — pub/sub system for plugin background services.
 *
 * Core emits events from Zustand actions; plugins subscribe via api.events.on()
 * or, to receive everything (an audit trail), api.events.onAny(). Plugins emit
 * their own events under their id prefix (`<pluginId>:<name>`).
 * Callbacks are always wrapped in try/catch — a failing plugin never crashes ZN.
 *
 * Each device emits the actions done on it: changes received from a
 * collaborator emit nothing here (they were emitted on their device).
 *
 * Deliberately not emitted: element moves (updateElementPosition(s)), asset
 * reordering, display settings (setTag*, setLink*, toggles), selection, filters.
 */

// ─── Types ──────────────────────────────────────────────────

export type PluginEventType =
  | 'dossier:created'
  | 'dossier:updated'
  | 'dossier:deleted'
  /** After deleteDossier: `meta.receipt` is the PurgeReceipt (what is left, if anything) */
  | 'dossier:purged'
  /** The user closed the dossier (read-only until reopened) */
  | 'dossier:caseClosed'
  | 'dossier:caseReopened'
  /** Loaded / unloaded in this window (not the case closure) */
  | 'dossier:opened'
  | 'dossier:closed'
  /** Import finished: `meta` = { format, into, elements, links, assets } */
  | 'dossier:imported'
  /** Something left the app: `meta.format` (zip, json, csv, png, report-md, print, clipboard-mermaid, asset…) */
  | 'dossier:exported'
  /** Collaboration: the dossier was shared from here, or joined from a link */
  | 'dossier:shared'
  | 'dossier:joined'
  | 'element:created'
  | 'element:updated'
  | 'element:deleted'
  | 'element:tagAdded'
  | 'element:tagRemoved'
  /** `entityId` = kept element, `meta.mergedIds` = the elements merged into it */
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
  /** A query run by the user (not the automatic re-runs): `meta.text` may contain names */
  | 'query:executed';

/** Events a plugin emits itself: always `<pluginId>:<name>` */
export type PluginCustomEventType = `${string}:${string}`;

/** Where the action came from: done by the user, or replayed by undo/redo */
export type PluginEventOrigin = 'local' | 'undo';

export interface PluginEvent {
  type: PluginEventType | PluginCustomEventType;
  dossierId: string;
  entityId?: string;
  timestamp: number;
  origin: PluginEventOrigin;
  /** Extra payload for specific events (e.g. tagName for element:tagAdded/tagRemoved). */
  meta?: Record<string, unknown>;
}

export type PluginEventCallback = (event: PluginEvent) => void;

// ─── Internal state ─────────────────────────────────────────

const listeners = new Map<string, Set<PluginEventCallback>>();
const anyListeners = new Set<PluginEventCallback>();
let undoDepth = 0;

// ─── Public API ─────────────────────────────────────────────

/**
 * Subscribe to a plugin event. Returns an unsubscribe function.
 */
export function onPluginEvent(
  eventType: PluginEventType | PluginCustomEventType,
  cb: PluginEventCallback,
): () => void {
  if (!listeners.has(eventType)) {
    listeners.set(eventType, new Set());
  }
  listeners.get(eventType)!.add(cb);
  return () => {
    listeners.get(eventType)?.delete(cb);
  };
}

/** Subscribe to every event, core and plugin ones. Returns an unsubscribe function. */
export function onAnyPluginEvent(cb: PluginEventCallback): () => void {
  anyListeners.add(cb);
  return () => {
    anyListeners.delete(cb);
  };
}

function deliver(cb: PluginEventCallback, event: PluginEvent): void {
  try {
    cb(event);
  } catch (err) {
    console.warn(`[Plugin event bus] Error in listener for ${event.type}:`, err);
  }
}

/**
 * Emit a plugin event. Called from ZN core (stores, repositories).
 * Each callback is individually wrapped in try/catch.
 */
export function emitPluginEvent(event: Omit<PluginEvent, 'origin'> & { origin?: PluginEventOrigin }): void {
  const full: PluginEvent = { ...event, origin: event.origin ?? (undoDepth > 0 ? 'undo' : 'local') };
  for (const cb of listeners.get(full.type) ?? []) deliver(cb, full);
  for (const cb of anyListeners) deliver(cb, full);
}

/**
 * Convenience: emit from just type + dossierId + optional entityId.
 */
export function emit(
  type: PluginEventType,
  dossierId: string,
  entityId?: string,
  meta?: Record<string, unknown>,
): void {
  emitPluginEvent({ type, dossierId, entityId, timestamp: Date.now(), meta });
}

/**
 * Emit for a plugin: only under its own prefix (`<pluginId>:<name>`), so a
 * plugin cannot pass itself off as the core or as another plugin.
 */
export function emitFromPlugin(
  pluginId: string,
  type: string,
  dossierId: string,
  meta?: Record<string, unknown>,
  entityId?: string,
): void {
  if (!type.startsWith(`${pluginId}:`) || type.length <= pluginId.length + 1) {
    console.warn(`[Plugin event bus] ${pluginId} may only emit "${pluginId}:<name>" events, not "${type}"`);
    return;
  }
  emitPluginEvent({ type: type as PluginCustomEventType, dossierId, entityId, timestamp: Date.now(), meta });
}

/**
 * Mark everything emitted while `run` is in progress as replayed by undo/redo.
 * The steps of an undo are awaited one after the other; an unrelated action
 * started during those few milliseconds would be marked too.
 */
export async function asUndo<T>(run: () => Promise<T>): Promise<T> {
  undoDepth++;
  try {
    return await run();
  } finally {
    undoDepth--;
  }
}

/** The dossier open in this window, for events emitted outside dossierStore */
let currentDossierIdGetter: () => string | null = () => null;
export function setCurrentDossierIdGetter(getter: () => string | null): void {
  currentDossierIdGetter = getter;
}

/** An import finished: `into` is true when it went into an existing dossier */
export function emitImported(
  dossierId: string,
  format: string,
  into: boolean,
  counts: { elements: number; links: number; assets?: number },
  via?: string,
): void {
  emit('dossier:imported', dossierId, undefined, { format, into, ...counts, ...(via ? { via } : {}) });
}

/** File extension used as the import format ('zip', 'anb', 'csv'…) */
export function importFormatOf(fileName: string | undefined): string {
  const match = fileName?.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : 'unknown';
}

/** Something left the app (file, print, clipboard). Emit after it succeeded. */
export function emitExport(format: string, meta?: Record<string, unknown>, dossierId?: string): void {
  const id = dossierId ?? currentDossierIdGetter();
  if (!id) return;
  emit('dossier:exported', id, undefined, { format, ...meta });
}
