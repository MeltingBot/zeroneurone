/**
 * Plugin event bus — pub/sub system for plugin background services.
 *
 * Core emits events from Zustand actions; plugins subscribe via api.events.on().
 * Callbacks are always wrapped in try/catch — a failing plugin never crashes ZN.
 */

// ─── Types ──────────────────────────────────────────────────

export type PluginEventType =
  | 'dossier:created'
  | 'dossier:updated'
  | 'dossier:deleted'
  | 'dossier:opened'
  | 'dossier:closed'
  | 'element:created'
  | 'element:updated'
  | 'element:deleted'
  | 'link:created'
  | 'link:updated'
  | 'link:deleted'
  | 'asset:created'
  | 'asset:deleted';

export interface PluginEvent {
  type: PluginEventType;
  dossierId: string;
  entityId?: string;
  timestamp: number;
}

export type PluginEventCallback = (event: PluginEvent) => void;

// ─── Internal state ─────────────────────────────────────────

const listeners = new Map<PluginEventType, Set<PluginEventCallback>>();

// ─── Public API ─────────────────────────────────────────────

/**
 * Subscribe to a plugin event. Returns an unsubscribe function.
 */
export function onPluginEvent(
  eventType: PluginEventType,
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

/**
 * Emit a plugin event. Called from ZN core (stores, repositories).
 * Each callback is individually wrapped in try/catch.
 */
export function emitPluginEvent(event: PluginEvent): void {
  const cbs = listeners.get(event.type);
  if (!cbs || cbs.size === 0) return;
  for (const cb of cbs) {
    try {
      cb(event);
    } catch (err) {
      console.warn(`[Plugin event bus] Error in listener for ${event.type}:`, err);
    }
  }
}

/**
 * Convenience: emit from just type + dossierId + optional entityId.
 */
export function emit(
  type: PluginEventType,
  dossierId: string,
  entityId?: string,
): void {
  emitPluginEvent({ type, dossierId, entityId, timestamp: Date.now() });
}
