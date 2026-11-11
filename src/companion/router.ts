/** Minimal history routing of the companion (no react-router in its chunk) */

import { appPath } from '../utils/basePath';

export type Route =
  | { kind: 'home' }
  /** Settings of the companion itself */
  | { kind: 'app' }
  | { kind: 'join'; roomId: string }
  | { kind: 'dossier'; dossierId: string };

/** Path relative to the companion root, e.g. '' or 'd/123' */
function companionSubPath(): string {
  const root = appPath('m/');
  const path = window.location.pathname;
  if (path.startsWith(root)) return path.slice(root.length).replace(/\/+$/, '');
  return '';
}

export function currentRoute(): Route {
  const sub = companionSubPath();
  if (!sub) return { kind: 'home' };
  if (sub === 'app') return { kind: 'app' };
  const parts = sub.split('/');
  if (parts[0] === 'd' && parts[1]) return { kind: 'dossier', dossierId: decodeURIComponent(parts[1]) };
  return { kind: 'join', roomId: decodeURIComponent(parts[0]) };
}

export function navigate(sub: string, replace = false, state: Record<string, unknown> | null = null): void {
  const url = appPath(`m/${sub}`);
  if (replace) window.history.replaceState(state, '', url);
  else window.history.pushState(state, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

