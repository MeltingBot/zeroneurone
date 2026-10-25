/**
 * Importing part of an archive into an open dossier: the analyst picks the
 * tabs to bring in (and, or not, the elements in no tab). Pure functions over
 * the archive data, applied before anything is written.
 */
import type { ExportData } from './exportService';
import { parseSourceLinks } from '../utils/sourceLinks';

/** A tab of the archive, as offered in the choice */
export interface ZipTabSummary {
  id: string;
  name: string;
  /** Elements of the archive in this tab */
  count: number;
}

export interface ZipTabsOverview {
  tabs: ZipTabSummary[];
  /** Elements in no tab of the archive */
  unassignedCount: number;
  /** Sections in the archive report */
  reportSections: number;
}

/** What the analyst keeps: tabs by their archive id, and the elements in none */
export interface ZipTabSelection {
  tabIds: string[];
  includeUnassigned: boolean;
  /** Also the elements linked to a kept one (shown as ghosts in its tab) */
  includeLinked?: boolean;
  /** Recreate the chosen tabs in the dossier (default), or put everything in the open tab */
  recreateTabs?: boolean;
  /** Bring the archive report as well (its references to elements left out lead nowhere) */
  includeReport?: boolean;
}

/** A tab to fill in the target dossier: by name, with the new element ids */
export interface ImportedTabPlan {
  name: string;
  memberIds: string[];
}

/** The tabs of an archive, in their order, with what each holds */
export function zipTabsOverview(data: Pick<ExportData, 'elements' | 'tabs' | 'report'>): ZipTabsOverview {
  const ids = new Set(data.elements.map((el) => el.id));
  const inSomeTab = new Set<string>();
  const tabs = [...(data.tabs ?? [])]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((tab) => {
      const members = (tab.memberElementIds ?? []).filter((id) => ids.has(id));
      members.forEach((id) => inSomeTab.add(id));
      return { id: tab.id, name: tab.name || '', count: members.length };
    });
  return {
    tabs,
    unassignedCount: data.elements.filter((el) => !inSomeTab.has(el.id)).length,
    reportSections: data.report?.sections?.length ?? 0,
  };
}

const hasAssetSource = (source: unknown) =>
  typeof source === 'string' && source.includes('asset:') &&
  parseSourceLinks(source).some((s) => s.kind === 'link' && s.scheme === 'asset');

/**
 * The archive narrowed to the chosen tabs: their elements (with the elements
 * linked to them when asked, the groups
 * holding them and the children of the groups kept, so positions stay right),
 * the links between kept elements, the files they carry, and the chosen tabs.
 */
export function selectZipTabs<T extends Pick<ExportData, 'elements' | 'links' | 'tabs' | 'assets'>>(
  data: T,
  selection: ZipTabSelection,
): T {
  const chosen = new Set(selection.tabIds);
  const tabs = (data.tabs ?? []).filter((tab) => chosen.has(tab.id));
  const inSomeTab = new Set((data.tabs ?? []).flatMap((tab) => tab.memberElementIds ?? []));

  const keep = new Set<string>(tabs.flatMap((tab) => tab.memberElementIds ?? []));
  if (selection.includeUnassigned) {
    for (const el of data.elements) if (!inSomeTab.has(el.id)) keep.add(el.id);
  }

  // Linked elements, one link away, wherever they are filed
  if (selection.includeLinked) {
    const chosenSoFar = new Set(keep);
    for (const l of data.links) {
      if (chosenSoFar.has(l.fromId)) keep.add(l.toId);
      if (chosenSoFar.has(l.toId)) keep.add(l.fromId);
    }
  }

  // Groups: a kept child brings its group, a kept group brings its children
  const byId = new Map(data.elements.map((el) => [el.id, el]));
  const pending = [...keep];
  while (pending.length > 0) {
    const el = byId.get(pending.pop()!);
    if (!el) continue;
    for (const related of [el.parentGroupId, ...(el.childIds ?? [])]) {
      if (related && byId.has(related) && !keep.has(related)) {
        keep.add(related);
        pending.push(related);
      }
    }
  }

  const elements = data.elements.filter((el) => keep.has(el.id));
  const links = data.links.filter((l) => keep.has(l.fromId) && keep.has(l.toId));

  // Files: those the kept elements carry. A source pointing at a file names it
  // by its hash, unknown before import: then every file is kept.
  let assets = data.assets;
  if (assets && !elements.some((el) => hasAssetSource(el.source)) && !links.some((l) => hasAssetSource(l.source))) {
    const used = new Set(elements.flatMap((el) => el.assetIds ?? []));
    assets = assets.filter((a) => used.has(a.id));
  }

  return { ...data, elements, links, tabs, assets };
}
