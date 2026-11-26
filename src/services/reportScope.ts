/**
 * The part of the dossier a synthesis covers: the whole dossier, one tab or the
 * selection. Pure function over the dossier data, applied before generation.
 */
import type { Asset, CanvasTab, Element, Link } from '../types';
import { referencedAssets } from '../utils/assetReferences';

export type ReportScope =
  | { kind: 'all' }
  | { kind: 'tab'; tab: Pick<CanvasTab, 'memberElementIds' | 'excludedElementIds'> }
  | { kind: 'selection'; elementIds: readonly string[]; linkIds: readonly string[] };

export interface ScopedReportData {
  elements: Element[];
  links: Link[];
  assets: Asset[];
}

/**
 * The elements of the scope (a selected link brings its two ends, a group its
 * children), with, when asked, the elements directly linked to them; the links
 * between kept elements (two linked elements are not joined to each other); the
 * files they still use.
 */
export function scopeReportData(
  data: ScopedReportData,
  scope: ReportScope,
  includeLinked = false,
): ScopedReportData {
  if (scope.kind === 'all') return data;

  const keep = new Set<string>();
  if (scope.kind === 'tab') {
    scope.tab.memberElementIds.forEach((id) => keep.add(id));
  } else {
    scope.elementIds.forEach((id) => keep.add(id));
    const linkIds = new Set(scope.linkIds);
    for (const link of data.links) {
      if (linkIds.has(link.id)) { keep.add(link.fromId); keep.add(link.toId); }
    }
  }

  // Children of kept groups, at any depth
  let grew = true;
  while (grew) {
    grew = false;
    for (const el of data.elements) {
      if (!keep.has(el.id) && el.parentGroupId && keep.has(el.parentGroupId)) { keep.add(el.id); grew = true; }
    }
  }

  const core = new Set(keep);
  if (includeLinked) {
    const excluded = new Set(scope.kind === 'tab' ? scope.tab.excludedElementIds ?? [] : []);
    for (const link of data.links) {
      if (core.has(link.fromId) && !excluded.has(link.toId)) keep.add(link.toId);
      if (core.has(link.toId) && !excluded.has(link.fromId)) keep.add(link.fromId);
    }
  }

  const elements = data.elements.filter((el) => keep.has(el.id));
  const links = data.links.filter((link) => keep.has(link.fromId) && keep.has(link.toId)
    && (core.has(link.fromId) || core.has(link.toId)));
  return { elements, links, assets: referencedAssets(data.assets, elements, links) };
}
