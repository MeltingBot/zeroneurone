/**
 * Source link schemes registered by plugins (slot `source:scheme`).
 *
 * A registration is ignored when its scheme name is invalid or reserved
 * (http, https, asset, javascript…); for a scheme registered twice, the first
 * registration wins.
 */

import { useMemo } from 'react';
import { getPlugins } from './pluginRegistry';
import { usePlugins } from './usePlugins';
import { isValidPluginScheme } from '../utils/sourceLinks';
import type { SourceSchemeExtension, SourceSchemeLocation } from '../types/plugins';

export type SourceSchemeMap = ReadonlyMap<string, SourceSchemeExtension>;

function toSchemeMap(extensions: readonly SourceSchemeExtension[]): SourceSchemeMap {
  const map = new Map<string, SourceSchemeExtension>();
  for (const ext of extensions) {
    const scheme = typeof ext?.scheme === 'string' ? ext.scheme.toLowerCase() : '';
    if (!isValidPluginScheme(scheme) || map.has(scheme)) continue;
    if (typeof ext.resolve !== 'function' || typeof ext.open !== 'function') continue;
    map.set(scheme, ext);
  }
  return map;
}

/** Current schemes, for code outside React (exports, reports). */
export function getSourceSchemes(): SourceSchemeMap {
  return toSchemeMap(getPlugins('source:scheme'));
}

/** Scheme names, as the parser expects them. */
export function getSourceSchemeNames(): ReadonlySet<string> {
  return new Set(getSourceSchemes().keys());
}

/**
 * File (and PDF page) a plugin link points to, when its plugin tells it.
 * A failing or missing `locate` gives null: the link stays its label.
 */
export function locateSourceLink(scheme: string, value: string, dossierId: string): SourceSchemeLocation | null {
  const ext = getSourceSchemes().get(scheme);
  if (typeof ext?.locate !== 'function') return null;
  try {
    const found = ext.locate(value, { dossierId });
    if (!found || typeof found.assetId !== 'string') return null;
    const page = Number.isInteger(found.page) && (found.page as number) > 0 ? found.page as number : null;
    return { assetId: found.assetId, page };
  } catch (err) {
    console.warn(`source:scheme "${scheme}" locate failed:`, err);
    return null;
  }
}

/** Current schemes, re-rendering when plugins change. */
export function useSourceSchemes(): SourceSchemeMap {
  const extensions = usePlugins('source:scheme');
  return useMemo(() => toSchemeMap(extensions), [extensions]);
}
