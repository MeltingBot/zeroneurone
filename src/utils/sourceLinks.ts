/**
 * Markdown links in Source fields.
 *
 * A source stays a plain string; `[label](target)` inside it is read as a link
 * when the target uses an allowed scheme:
 *   - http(s)://…  → opens in a new tab
 *   - asset:<hash> → opens the dossier asset whose SHA-256 starts with <hash>
 *                    (full hash or a prefix of at least 8 hex digits)
 *   - a scheme a plugin registered (slot `source:scheme`), passed in as
 *     `pluginSchemes` → opened by that plugin
 * Anything else (javascript:, data:, file:, unknown schemes…) stays text.
 *
 * Joining the text segments and the `raw` form of the link segments gives the
 * input back unchanged.
 */

export type SourceLinkScheme = 'http' | 'https' | 'asset';

/** Scheme names of plugin links (lowercase) */
export type PluginSchemes = ReadonlySet<string>;

/** Schemes a plugin can never claim: ZN's own, and the dangerous ones */
const RESERVED_SCHEMES = new Set([
  'http', 'https', 'asset', 'javascript', 'vbscript', 'data', 'file', 'blob', 'about', 'mailto', 'tel',
]);
const SCHEME_NAME = /^[a-z][a-z0-9+.-]*$/;

/** Whether a plugin may register this scheme name */
export function isValidPluginScheme(scheme: string): boolean {
  return SCHEME_NAME.test(scheme) && !RESERVED_SCHEMES.has(scheme);
}

export type SourceSegment =
  | { kind: 'text'; text: string }
  | {
      kind: 'link';
      /** Label with `\]`-style escapes resolved */
      label: string;
      target: string;
      /** 'http' | 'https' | 'asset', or a plugin scheme */
      scheme: string;
      /** Exact source text of the link */
      raw: string;
    };

const LINK_PATTERN = /\[((?:[^\]\\]|\\.)+)\]\(([^()\s]+)\)/g;
const ASSET_HASH = /^[0-9a-f]{8,64}$/i;

function linkScheme(target: string, pluginSchemes?: PluginSchemes): string | null {
  const colon = target.indexOf(':');
  if (colon <= 0) return null;
  const scheme = target.slice(0, colon).toLowerCase();
  if (pluginSchemes?.has(scheme) && isValidPluginScheme(scheme)) {
    return colon < target.length - 1 ? scheme : null;
  }
  if (scheme === 'asset') {
    return ASSET_HASH.test(target.slice(colon + 1)) ? 'asset' : null;
  }
  if (scheme === 'http' || scheme === 'https') {
    try {
      const url = new URL(target);
      return url.protocol === 'http:' || url.protocol === 'https:' ? scheme : null;
    } catch {
      return null;
    }
  }
  return null;
}

function unescapeLabel(label: string): string {
  return label.replace(/\\(.)/g, '$1');
}

export function parseSourceLinks(source: string, pluginSchemes?: PluginSchemes): SourceSegment[] {
  const segments: SourceSegment[] = [];
  let text = '';
  let last = 0;
  for (const match of source.matchAll(LINK_PATTERN)) {
    const [raw, label, target] = match;
    const start = match.index ?? 0;
    text += source.slice(last, start);
    last = start + raw.length;
    const scheme = linkScheme(target, pluginSchemes);
    if (!scheme) {
      text += raw;
      continue;
    }
    if (text) segments.push({ kind: 'text', text });
    text = '';
    segments.push({ kind: 'link', label: unescapeLabel(label), target, scheme, raw });
  }
  text += source.slice(last);
  if (text) segments.push({ kind: 'text', text });
  return segments;
}

export function hasSourceLinks(source: string | null | undefined, pluginSchemes?: PluginSchemes): boolean {
  return !!source && parseSourceLinks(source, pluginSchemes).some(s => s.kind === 'link');
}

/** Source with each link replaced by its label (matrix, ANX, plain reports). */
export function sourceToPlainText(source: string, pluginSchemes?: PluginSchemes): string {
  return parseSourceLinks(source, pluginSchemes)
    .map(s => (s.kind === 'link' ? s.label : s.text))
    .join('');
}

/** Source for Markdown outputs: web links kept, asset and plugin links reduced to their label. */
export function sourceToMarkdown(source: string, pluginSchemes?: PluginSchemes): string {
  return parseSourceLinks(source, pluginSchemes)
    .map(s => (s.kind === 'text' ? s.text : isWebScheme(s.scheme) ? s.raw : s.label))
    .join('');
}

export type SourceLink = Extract<SourceSegment, { kind: 'link' }>;

export function isWebScheme(scheme: string): boolean {
  return scheme === 'http' || scheme === 'https';
}

/** Web links of a source, in order, one per target. */
export function sourceWebLinks(source: string): SourceLink[] {
  const seen = new Set<string>();
  return parseSourceLinks(source).filter((s): s is SourceLink => {
    if (s.kind !== 'link' || !isWebScheme(s.scheme) || seen.has(s.target)) return false;
    seen.add(s.target);
    return true;
  });
}

/** Text after the scheme of a target (`asset:3fa1` → `3fa1`). */
export function targetValue(target: string): string {
  return target.slice(target.indexOf(':') + 1);
}

/** Hash part of an `asset:` target. */
export function assetHashOf(target: string): string {
  return targetValue(target).toLowerCase();
}

/** First asset whose SHA-256 starts with the given hash (or prefix). */
export function findAssetByHash<T extends { hash: string }>(assets: readonly T[], hash: string): T | undefined {
  const prefix = hash.toLowerCase();
  return assets.find(a => a.hash.toLowerCase().startsWith(prefix));
}
