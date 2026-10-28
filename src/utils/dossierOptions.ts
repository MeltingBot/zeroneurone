import type { Dossier, DossierOptions, Link } from '../types';
import { LABEL_WRAP_MAX, LABEL_WRAP_MIN } from './wrapLabel';

/** A dossier options object as read from the Y.Doc meta map (untrusted shape). */
export function isDossierOptions(value: unknown): value is DossierOptions {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const isFlag = (k: string) => v[k] === undefined || typeof v[k] === 'boolean';
  const wrap = v.linkLabelWrap;
  const isWrap = wrap === undefined
    || (typeof wrap === 'number' && Number.isInteger(wrap) && wrap >= LABEL_WRAP_MIN && wrap <= LABEL_WRAP_MAX);
  return isFlag('linkArrowByDefault') && isFlag('blurMediaOnOpen') && isWrap;
}

/**
 * Fields the dossier options add to a link the user draws (drag on the canvas,
 * linked element), unless a direction is already given. Links created by the
 * tool itself (suggestions, imports, plugins) don't go through this.
 */
export function withDossierLinkDefaults(dossier: Pick<Dossier, 'options'> | null | undefined, options: Partial<Link> = {}): Partial<Link> {
  if (options.direction !== undefined || !dossier?.options?.linkArrowByDefault) return options;
  return { ...options, directed: true, direction: 'forward' };
}
