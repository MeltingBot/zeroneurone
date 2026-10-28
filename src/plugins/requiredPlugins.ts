/**
 * Plugins marked `required: true` in the manifest: always enabled (no switch
 * in the Extensions list), and the app does not start without them — a
 * required plugin that is missing, fails its integrity check or fails to
 * register blocks the app with a notice instead of being skipped silently.
 *
 * The manifest is served by whoever hosts the app: it decides what is
 * required, not the user.
 */

export interface RequiredPluginFailure {
  id: string;
  name: string;
  /** missing file, bad integrity, no register(), error while registering */
  reason: 'missing' | 'integrity' | 'invalid' | 'error';
}

const requiredIds = new Set<string>();
const failures = new Map<string, RequiredPluginFailure>();

export function markPluginRequired(id: string): void {
  requiredIds.add(id);
}

export function isPluginRequired(id: string): boolean {
  return requiredIds.has(id);
}

export function reportRequiredPluginFailure(failure: RequiredPluginFailure): void {
  failures.set(failure.id, failure);
}

/** Required plugins that could not be loaded: when not empty, the app must not start */
export function getRequiredPluginFailures(): RequiredPluginFailure[] {
  return [...failures.values()];
}

/** Tests only */
export function resetRequiredPlugins(): void {
  requiredIds.clear();
  failures.clear();
}
