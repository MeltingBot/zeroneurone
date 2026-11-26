import type { Asset, Element, Link } from '../types';

type ElementRefs = Pick<Element, 'assetIds' | 'visual' | 'source'> & { events?: { source?: string }[] };
type LinkRefs = Pick<Link, 'assetIds' | 'source'>;

const citesHash = (source: string | undefined, hash: string | undefined) =>
  !!hash && typeof source === 'string' && source.includes(`asset:${hash}`);

/**
 * Whether a file is still used in the dossier: attached to an element or a link,
 * used as an element's image, or cited by a source (`asset:<hash>`). A file is
 * stored once per dossier (by its hash), so the same one can sit on several
 * elements and links at once.
 */
export function isAssetReferenced(
  asset: Pick<Asset, 'id'> & Partial<Pick<Asset, 'hash'>>,
  elements: readonly ElementRefs[],
  links: readonly LinkRefs[],
): boolean {
  return elements.some((el) => el.visual?.image === asset.id
    || (el.assetIds ?? []).includes(asset.id)
    || citesHash(el.source, asset.hash)
    || (el.events ?? []).some((ev) => citesHash(ev.source, asset.hash)))
    || links.some((lk) => (lk.assetIds ?? []).includes(asset.id) || citesHash(lk.source, asset.hash));
}

/** The files something in the dossier still uses (those left behind by a deletion are not) */
export function referencedAssets<A extends Pick<Asset, 'id'> & Partial<Pick<Asset, 'hash'>>>(
  assets: readonly A[],
  elements: readonly ElementRefs[],
  links: readonly LinkRefs[],
): A[] {
  return assets.filter((asset) => isAssetReferenced(asset, elements, links));
}

/**
 * Whether undo or redo entries still hold this file: a deleted element or link
 * (its snapshot keeps its assetIds), a merge, an earlier state of an element.
 * Erasing the file then would bring them back without it. Adding a file is left
 * out: its redo attaches the file again from the copy it keeps.
 */
export function isAssetInHistory(assetId: string, actions: readonly { type: string }[]): boolean {
  const seen = new WeakSet<object>();
  const holds = (value: unknown, depth: number): boolean => {
    if (value === assetId) return true;
    if (!value || typeof value !== 'object' || depth > 12) return false;
    if (seen.has(value) || value instanceof Blob || value instanceof Date) return false;
    seen.add(value);
    const items = Array.isArray(value)
      ? value
      : value instanceof Map || value instanceof Set ? [...value.values()] : Object.values(value);
    return items.some((item) => holds(item, depth + 1));
  };
  return actions.some((action) => action.type !== 'add-asset' && holds(action, 0));
}
