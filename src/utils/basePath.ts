/**
 * Base path helpers for deployments under a sub-directory.
 *
 * The app is normally served at the root of its domain, but some hosts only
 * offer a sub-directory (e.g. https://host.example/Zeroneurone/). The build
 * then sets VITE_BASE, which Vite exposes as import.meta.env.BASE_URL (always
 * with a leading and trailing slash). Any URL the app builds by hand for its
 * own files or routes must go through these helpers, or it points at the
 * domain root and 404s.
 */

/** Join a base path ('/' or '/sub/') with an app-relative path. */
export function joinBase(base: string, path: string): string {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return prefix + path.replace(/^\/+/, '');
}

/** URL of a file or route of the app, relative to the domain root. */
export function appPath(path: string): string {
  return joinBase(import.meta.env.BASE_URL, path);
}

/** Absolute URL (origin included) of a file or route of the app. */
export function appUrl(path: string): string {
  return window.location.origin + appPath(path);
}
