/** Share links typed, pasted or scanned in the companion (desktop /join/ links included) */

import { navigate } from './router';

/** The /m/ sub-path (room, query, fragment) of a share link, or null */
export function companionPathOf(text: string): { sameOrigin: boolean; sub: string; url: URL } | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  const match = url.pathname.match(/\/(?:join|m)\/([^/]+)\/?$/);
  if (!match || !new URLSearchParams(url.hash.slice(1)).get('key')) return null;
  return { sameOrigin: url.origin === window.location.origin, sub: `${match[1]}${url.search}${url.hash}`, url };
}

export function openLink(text: string): boolean {
  const target = companionPathOf(text);
  if (!target) return false;
  if (target.sameOrigin) {
    navigate(target.sub);
  } else {
    // Another server's app: open its companion
    const base = target.url.pathname.replace(/\/(?:join|m)\/[^/]+\/?$/, '/');
    window.location.href = `${target.url.origin}${base}m/${target.sub}`;
  }
  return true;
}
