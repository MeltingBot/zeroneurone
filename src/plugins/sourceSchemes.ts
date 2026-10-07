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
import type { SourceSchemeExtension } from '../types/plugins';

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

/** Current schemes, re-rendering when plugins change. */
export function useSourceSchemes(): SourceSchemeMap {
  const extensions = usePlugins('source:scheme');
  return useMemo(() => toSchemeMap(extensions), [extensions]);
}
