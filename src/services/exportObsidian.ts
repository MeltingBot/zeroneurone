/**
 * Export a dossier as an Obsidian vault (ZIP root = vault root).
 *
 * Obsidian has no typed links, so relations are written three ways:
 *   - a `## Relations` section in each note (wikilinks: graph view + backlinks,
 *     with the link metadata readable inline),
 *   - frontmatter properties `<relation label>: ["[[Target]]"]` for outgoing
 *     relations (indexed by Obsidian >= 1.4, queryable with Dataview / Bases),
 *   - one JSON Canvas file per canvas tab, the only place where the relation
 *     label stays visible on the graph.
 *
 * Wikilinks use the bare basename, never a folder path, so they keep resolving
 * if the vault is dropped into a sub-folder of an existing vault. Canvas `file`
 * paths are vault-absolute: those only resolve when the ZIP is opened as a vault.
 *
 * This module is pure: binary assets are copied by the caller to `assetPaths`.
 */

import type {
  Asset, AssetId, CanvasTab, Dossier, Element, ElementEvent, Link, Position, Property, Report,
} from '../types';
import { formatEvaluation } from '../utils/evaluation';
import { getGeoCenter } from '../utils/geo';
import { computeElementDimensions } from '../utils/elementDimensions';
import { resolveAbsolutePosition } from './svgExportService';
import { dateInputKeys, isDayOnly, parseDateValue, parsePropertyDate, toLocalDateKey, toLocalTimeKey } from '../utils/dates';
import { joinSourceLines, sourceToMarkdown } from '../utils/sourceLinks';
import { getSourceSchemeNames } from '../plugins/sourceSchemes';

/** Translated strings used in the generated notes (provided by the caller). */
export interface ObsidianLabels {
  elementsFolder: string;
  canvasFolder: string;
  reportFolder: string;
  relations: string;
  events: string;
  members: string;
  attachments: string;
  canvases: string;
  elements: string;
  report: string;
  related: string;
  untitled: string;
}

export interface ObsidianVaultInput {
  dossier: Dossier;
  elements: Element[];
  links: Link[];
  tabs?: CanvasTab[];
  report?: Report | null;
  assets?: Asset[];
  labels: ObsidianLabels;
}

export interface ObsidianVaultOutput {
  /** Text files (notes and canvases), path relative to the vault root */
  files: { path: string; content: string }[];
  /** Where each asset's bytes must be written */
  assetPaths: Map<AssetId, string>;
}

const ATTACHMENTS_FOLDER = 'attachments';
const MAX_BASENAME = 100;
/**
 * Canvas cards share one size: Obsidian renders the whole note inside, so ZN
 * node sizes (tiny labels, large image squares) would make it unreadable.
 * Positions are spread out so the cards keep the ZN layout without overlapping.
 */
const CANVAS_SCALE = 3;
const CARD_WIDTH = 300;
const CARD_HEIGHT = 160;
const GROUP_PADDING = 40;
const RESERVED_KEYS = new Set([
  'zn_id', 'aliases', 'tags', 'confidence', 'evaluation', 'source',
  'date', 'date_start', 'date_end', 'location', 'group',
]);
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
const REPORT_REF = /\[\[([^\]|]+)\|([a-fA-F0-9-]+)\]\]|\[([^\]]+)\]\(#element:([a-fA-F0-9-]+)\)/g;

// ============================================================================
// NAMES
// ============================================================================

/** Strip characters Obsidian refuses in file names or that break wikilinks. */
export function toVaultBasename(label: string, fallback: string): string {
  const cleaned = label
    .replace(/[\\/:*?"<>|#^[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, MAX_BASENAME)
    .trim();
  return cleaned || fallback;
}

/** Allocates names unique within a scope, case-insensitively ("x", "x (2)", ...). */
class NameAllocator {
  private used = new Set<string>();

  allocate(base: string, ext = ''): string {
    let name = base;
    for (let i = 2; this.used.has((name + ext).toLowerCase()); i++) name = `${base} (${i})`;
    this.used.add((name + ext).toLowerCase());
    return name;
  }
}

function wikilink(basename: string, display?: string): string {
  const alias = display?.replace(/[[\]|]/g, ' ').replace(/\s+/g, ' ').trim();
  return alias && alias !== basename ? `[[${basename}|${alias}]]` : `[[${basename}]]`;
}

// ============================================================================
// VALUES
// ============================================================================

/**
 * Calendar date, plus local time when there is one: the same reading as the
 * app (a value entered without a time is stored at local midnight).
 */
export function formatDate(value: unknown): string {
  const d = parseDateValue(value);
  if (!d) return '';
  return isDayOnly(d) ? toLocalDateKey(d) : `${toLocalDateKey(d)}T${toLocalTimeKey(d)}`;
}

/**
 * Source-zone wall clock appended to a date typed in another zone:
 * "2024-04-20T02:12 (03:12 Asia/Beirut)", with the source day when it differs.
 */
function withSourceTime(text: string, value: unknown, timeZone: string | undefined): string {
  const d = parseDateValue(value);
  if (!text || !d || !timeZone) return text;
  const src = dateInputKeys(d, timeZone);
  const local = dateInputKeys(d);
  if (src.date === local.date && src.time === local.time) return text;
  const at = src.date === local.date ? src.time : `${src.date} ${src.time}`;
  return `${text} (${at} ${timeZone})`;
}

function formatPeriod(start: unknown, end: unknown, timeZone?: string): string {
  const s = withSourceTime(formatDate(start), start, timeZone);
  const e = withSourceTime(formatDate(end), end, timeZone);
  if (s && e) return `${s} → ${e}`;
  return s || (e ? `→ ${e}` : '');
}

/** Obsidian tags cannot contain spaces nor start with '#'. */
function toTag(tag: string): string {
  return tag.trim().replace(/^#+/, '').replace(/\s+/g, '-');
}

// ============================================================================
// YAML
// ============================================================================

type YamlScalar = string | number | boolean;
type YamlValue = YamlScalar | YamlScalar[];

/** JSON strings are valid YAML double-quoted scalars. */
function yamlScalar(value: YamlScalar): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

function yamlKey(key: string): string {
  return /^[\p{L}\p{N}_][\p{L}\p{N}_ ().'-]*$/u.test(key) && key.trim() === key ? key : JSON.stringify(key);
}

export function toFrontmatter(entries: [string, YamlValue][]): string {
  if (entries.length === 0) return '';
  const lines = ['---'];
  for (const [key, value] of entries) {
    if (Array.isArray(value)) {
      lines.push(`${yamlKey(key)}:`);
      for (const v of value) lines.push(`  - ${yamlScalar(v)}`);
    } else {
      lines.push(`${yamlKey(key)}: ${yamlScalar(value)}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

function propertyValue(prop: Property): YamlScalar | null {
  const { value } = prop;
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date || prop.type === 'date' || prop.type === 'datetime') {
    const d = parsePropertyDate(value);
    return (d && formatDate(d)) || String(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

// ============================================================================
// RELATIONS
// ============================================================================

interface RelationView {
  link: Link;
  otherId: string;
  arrow: '→' | '←' | '↔' | '—';
  /** True when the relation is written into this element's frontmatter */
  outgoing: boolean;
}

/** `direction` with a fallback on the deprecated `directed` flag. */
function linkDirection(link: Link): Link['direction'] {
  return link.direction ?? (link.directed ? 'forward' : 'none');
}

/** How a link reads from one of its ends. */
function viewFrom(link: Link, selfId: string): RelationView {
  const isFrom = link.fromId === selfId;
  const otherId = isFrom ? link.toId : link.fromId;
  switch (linkDirection(link)) {
    case 'both': return { link, otherId, arrow: '↔', outgoing: true };
    case 'none': return { link, otherId, arrow: '—', outgoing: true };
    case 'backward': return { link, otherId, arrow: isFrom ? '←' : '→', outgoing: !isFrom };
    default: return { link, otherId, arrow: isFrom ? '→' : '←', outgoing: isFrom };
  }
}

// ============================================================================
// BUILDER
// ============================================================================

export function buildObsidianVault(input: ObsidianVaultInput): ObsidianVaultOutput {
  const { dossier, elements, links, tabs = [], report, assets = [], labels } = input;
  const files: { path: string; content: string }[] = [];
  const elementsMap = new Map(elements.map((e) => [e.id, e]));
  const linkIds = new Set(links.map((l) => l.id));

  // --- Names: basenames are unique across the whole vault ---
  const names = new NameAllocator();
  const indexName = names.allocate(toVaultBasename(dossier.name, labels.untitled));
  const noteElements = elements.filter((e) => !e.isAnnotation);
  const basenames = new Map<string, string>();
  for (const el of noteElements) {
    basenames.set(el.id, names.allocate(toVaultBasename(el.label, labels.untitled)));
  }
  const reportName = report && report.sections.length > 0
    ? names.allocate(toVaultBasename(report.title || labels.report, labels.report))
    : null;
  const canvasNames = new NameAllocator();

  // --- Attachments ---
  const attachmentNames = new NameAllocator();
  const assetPaths = new Map<AssetId, string>();
  for (const asset of assets) {
    const dot = asset.filename.lastIndexOf('.');
    const ext = dot > 0 ? asset.filename.slice(dot).replace(/[^\w.]/g, '') : '';
    const stem = toVaultBasename(dot > 0 ? asset.filename.slice(0, dot) : asset.filename, asset.id);
    assetPaths.set(asset.id, `${ATTACHMENTS_FOLDER}/${attachmentNames.allocate(stem, ext)}${ext}`);
  }
  const embed = (path: string) => (IMAGE_EXT.test(path) ? `![[${path}]]` : `[[${path}]]`);

  // --- Relations indexed by element ---
  const relationsByElement = new Map<string, RelationView[]>();
  for (const link of links) {
    const ends = link.fromId === link.toId ? [link.fromId] : [link.fromId, link.toId];
    for (const id of ends) {
      if (!basenames.has(id)) continue;
      const view = viewFrom(link, id);
      if (!basenames.has(view.otherId)) continue;
      const list = relationsByElement.get(id) ?? [];
      list.push(view);
      relationsByElement.set(id, list);
    }
  }

  // --- Element notes ---
  for (const el of noteElements) {
    const basename = basenames.get(el.id)!;
    const fm: [string, YamlValue][] = [];
    if (basename !== el.label) fm.push(['aliases', [el.label]]);
    const tags = el.tags.map(toTag).filter(Boolean);
    if (tags.length) fm.push(['tags', tags]);
    if (el.confidence !== null && el.confidence !== undefined) fm.push(['confidence', el.confidence]);
    const evaluation = formatEvaluation(el.evaluation);
    if (evaluation) fm.push(['evaluation', evaluation]);
    if (el.source) fm.push(['source', sourceToMarkdown(el.source, getSourceSchemeNames())]);
    const date = formatDate(el.date);
    if (date) fm.push(['date', date]);
    const start = formatDate(el.dateRange?.start);
    const end = formatDate(el.dateRange?.end);
    if (start) fm.push(['date_start', start]);
    if (end) fm.push(['date_end', end]);
    if (el.geo) {
      const { lat, lng } = getGeoCenter(el.geo);
      fm.push(['location', [lat, lng]]);
    }
    const parentName = el.parentGroupId ? basenames.get(el.parentGroupId) : undefined;
    if (parentName) fm.push(['group', wikilink(parentName)]);

    // Element properties (repeated keys become lists)
    const props = new Map<string, YamlScalar[]>();
    for (const prop of el.properties) {
      const value = propertyValue(prop);
      const key = prop.key?.trim();
      if (value === null || !key) continue;
      const finalKey = RESERVED_KEYS.has(key) ? `${key} (zn)` : key;
      props.set(finalKey, [...(props.get(finalKey) ?? []), value]);
    }
    for (const [key, values] of props) fm.push([key, values.length === 1 ? values[0] : values]);

    // Outgoing relations as typed properties
    const relations = relationsByElement.get(el.id) ?? [];
    const relProps = new Map<string, string[]>();
    for (const rel of relations) {
      if (!rel.outgoing) continue;
      let key = rel.link.label.trim() || labels.related;
      if (RESERVED_KEYS.has(key) || props.has(key)) key = `${key} (relation)`;
      const target = wikilink(basenames.get(rel.otherId)!);
      const list = relProps.get(key) ?? [];
      if (!list.includes(target)) list.push(target);
      relProps.set(key, list);
    }
    for (const [key, values] of relProps) fm.push([key, values]);
    // Technical id last: it is the first thing shown otherwise (also in canvas cards)
    fm.push(['zn_id', el.id]);

    // No H1: Obsidian shows the file name as the title (the exact label is in `aliases`)
    const body: string[] = [];
    const image = el.visual.image ? assetPaths.get(el.visual.image) : undefined;
    if (image) body.push(embed(image), '');
    if (el.notes?.trim()) body.push(el.notes.trim(), '');

    if (relations.length) {
      body.push(`## ${labels.relations}`, '');
      for (const rel of relations) {
        const l = rel.link;
        const meta = [
          formatDate(l.date) || formatPeriod(l.dateRange?.start, l.dateRange?.end, l.dateRange?.timeZone),
          l.confidence !== null && l.confidence !== undefined ? `${l.confidence} %` : '',
          formatEvaluation(l.evaluation),
          l.source ? joinSourceLines(sourceToMarkdown(l.source, getSourceSchemeNames())) : '',
        ].filter(Boolean);
        const label = l.label.trim() ? `${l.label.trim()} ` : '';
        const other = elementsMap.get(rel.otherId)!;
        body.push(`- ${rel.arrow} ${label}${wikilink(basenames.get(rel.otherId)!, other.label)}${meta.length ? ` · ${meta.join(' · ')}` : ''}`);
        for (const line of (l.notes ?? '').trim().split('\n').filter(Boolean)) body.push(`  > ${line}`);
      }
      body.push('');
    }

    if (el.isGroup) {
      const children = elements.filter((c) => c.parentGroupId === el.id && basenames.has(c.id));
      if (children.length) {
        body.push(`## ${labels.members}`, '');
        for (const c of children) body.push(`- ${wikilink(basenames.get(c.id)!, c.label)}`);
        body.push('');
      }
    }

    if (el.events?.length) {
      body.push(`## ${labels.events}`, '');
      const sorted = [...el.events].sort((a, b) => (parseDateValue(a.date)?.getTime() ?? 0) - (parseDateValue(b.date)?.getTime() ?? 0));
      for (const ev of sorted) body.push(...eventLines(ev));
      body.push('');
    }

    const attached = el.assetIds
      .filter((id) => id !== el.visual.image)
      .map((id) => assetPaths.get(id))
      .filter((p): p is string => !!p);
    if (attached.length) {
      body.push(`## ${labels.attachments}`, '');
      // Images as blocks (an embed inside a list item leaves an empty bullet), other files as a list
      for (const path of attached.filter((p) => IMAGE_EXT.test(p))) body.push(embed(path), '');
      for (const path of attached.filter((p) => !IMAGE_EXT.test(p))) body.push(`- ${embed(path)}`);
      body.push('');
    }

    files.push({
      path: `${labels.elementsFolder}/${basename}.md`,
      content: toFrontmatter(fm) + body.join('\n'),
    });
  }

  // --- Canvases ---
  const canvasTabs = tabs.length > 0
    ? [...tabs].sort((a, b) => a.order - b.order).map((t) => ({ name: t.name, ids: t.memberElementIds }))
    : [{ name: dossier.name, ids: elements.map((e) => e.id) }];
  const canvasFiles: string[] = [];
  for (const tab of canvasTabs) {
    const canvasName = canvasNames.allocate(toVaultBasename(tab.name, labels.untitled), '.canvas');
    const content = buildCanvas(
      tab.ids.map((id) => elementsMap.get(id)).filter((e): e is Element => !!e),
      links, elementsMap, basenames, labels,
    );
    canvasFiles.push(`${canvasName}.canvas`);
    files.push({ path: `${labels.canvasFolder}/${canvasName}.canvas`, content });
  }

  // --- Report ---
  if (report && reportName) {
    const md: string[] = [];
    for (const section of [...report.sections].sort((a, b) => a.order - b.order)) {
      if (section.title) md.push(`## ${section.title}`, '');
      const content = convertReportRefs(section.content || '', basenames, linkIds);
      if (content.trim()) md.push(content.trimEnd(), '');
    }
    files.push({ path: `${labels.reportFolder}/${reportName}.md`, content: md.join('\n') });
  }

  // --- Index ---
  const index: string[] = [];
  const indexFm: [string, YamlValue][] = [];
  const dossierTags = (dossier.tags ?? []).map(toTag).filter(Boolean);
  if (dossierTags.length) indexFm.push(['tags', dossierTags]);
  indexFm.push(['zn_id', dossier.id]);
  if (dossier.description?.trim()) index.push(dossier.description.trim(), '');
  index.push(`## ${labels.canvases}`, '', ...canvasFiles.map((f) => `- [[${f}]]`), '');
  if (reportName) index.push(`## ${labels.report}`, '', `- ${wikilink(reportName)}`, '');
  const sortedNotes = [...noteElements].sort((a, b) => a.label.localeCompare(b.label));
  if (sortedNotes.length) {
    index.push(`## ${labels.elements}`, '', ...sortedNotes.map((e) => `- ${wikilink(basenames.get(e.id)!, e.label)}`), '');
  }
  files.push({ path: `${indexName}.md`, content: toFrontmatter(indexFm) + index.join('\n') });

  return { files, assetPaths };
}

function eventLines(ev: ElementEvent): string[] {
  const head = [formatPeriod(ev.date, ev.dateEnd, ev.timeZone), ev.label].filter(Boolean).join(' — ');
  const extra: string[] = [];
  if (ev.geo) {
    const { lat, lng } = getGeoCenter(ev.geo);
    extra.push(`${lat}, ${lng}`);
  }
  if (ev.source) extra.push(joinSourceLines(sourceToMarkdown(ev.source, getSourceSchemeNames())));
  const lines = [`- **${head}**${extra.length ? ` · ${extra.join(' · ')}` : ''}`];
  for (const line of (ev.description ?? '').trim().split('\n').filter(Boolean)) lines.push(`  ${line}`);
  return lines;
}

/** `[[Label|uuid]]` and legacy `[Label](#element:uuid)` → vault wikilinks. */
export function convertReportRefs(content: string, basenames: Map<string, string>, linkIds: Set<string>): string {
  return content.replace(REPORT_REF, (_m, l1: string, id1: string, l2: string, id2: string) => {
    const label = l1 ?? l2;
    const id = id1 ?? id2;
    const basename = basenames.get(id);
    if (basename) return wikilink(basename, label);
    if (linkIds.has(id)) return label;
    return `~~${label}~~`;
  });
}

// ============================================================================
// JSON CANVAS
// ============================================================================

interface CanvasNode {
  id: string;
  type: 'file' | 'text' | 'group';
  x: number;
  y: number;
  width: number;
  height: number;
  file?: string;
  text?: string;
  label?: string;
  color?: string;
}

interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromEnd: 'none' | 'arrow';
  toEnd: 'none' | 'arrow';
  label?: string;
  color?: string;
}

/** JSON Canvas accepts hex colours; CSS variables and the default fill are dropped. */
function canvasColor(color: string | null | undefined): string | undefined {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return undefined;
  return color.toLowerCase() === '#f5f5f4' || color.toLowerCase() === '#ffffff' ? undefined : color;
}

function isInside(el: Element, groupId: string, map: Map<string, Element>): boolean {
  let d = 0;
  for (let p = el.parentGroupId; p && d < 50; p = map.get(p)?.parentGroupId ?? null, d++) {
    if (p === groupId) return true;
  }
  return false;
}

function depth(el: Element, map: Map<string, Element>): number {
  let d = 0;
  for (let p = el.parentGroupId; p && map.has(p) && d < 50; p = map.get(p)!.parentGroupId) d++;
  return d;
}

export function buildCanvas(
  members: Element[],
  links: Link[],
  elementsMap: Map<string, Element>,
  basenames: Map<string, string>,
  labels: Pick<ObsidianLabels, 'elementsFolder' | 'untitled'>,
): string {
  // Cards: one size, centred on the ZN node centre
  const cards = new Map<string, CanvasNode>();
  for (const el of members) {
    if (el.isGroup) continue;
    const pos: Position = resolveAbsolutePosition(el, elementsMap);
    const dims = computeElementDimensions(el.visual, el.label, !!el.visual.image && !el.visual.hideMedia);
    const color = canvasColor(el.visual.color);
    const base = {
      id: el.id,
      x: Math.round((pos.x + dims.width / 2) * CANVAS_SCALE - CARD_WIDTH / 2),
      y: Math.round((pos.y + dims.height / 2) * CANVAS_SCALE - CARD_HEIGHT / 2),
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      ...(color ? { color } : {}),
    };
    cards.set(el.id, el.isAnnotation || !basenames.has(el.id)
      ? { ...base, type: 'text', text: el.notes?.trim() || el.label || '' }
      : { ...base, type: 'file', file: `${labels.elementsFolder}/${basenames.get(el.id)}.md` });
  }

  // Groups: the scaled ZN frame, grown to wrap the cards (and sub-groups) inside.
  // Innermost first, so an outer group sees its sub-groups' final bounds.
  const groups = members.filter((e) => e.isGroup)
    .sort((a, b) => depth(b, elementsMap) - depth(a, elementsMap));
  const groupNodes = new Map<string, CanvasNode>();
  for (const g of groups) {
    const pos = resolveAbsolutePosition(g, elementsMap);
    const dims = computeElementDimensions(g.visual, g.label, false);
    let x1 = pos.x * CANVAS_SCALE;
    let y1 = pos.y * CANVAS_SCALE;
    let x2 = x1 + dims.width * CANVAS_SCALE;
    let y2 = y1 + dims.height * CANVAS_SCALE;
    for (const el of members) {
      if (el.id === g.id || !isInside(el, g.id, elementsMap)) continue;
      const inner = cards.get(el.id) ?? groupNodes.get(el.id);
      if (!inner) continue;
      x1 = Math.min(x1, inner.x - GROUP_PADDING);
      y1 = Math.min(y1, inner.y - GROUP_PADDING);
      x2 = Math.max(x2, inner.x + inner.width + GROUP_PADDING);
      y2 = Math.max(y2, inner.y + inner.height + GROUP_PADDING);
    }
    const color = canvasColor(g.visual.color);
    groupNodes.set(g.id, {
      id: g.id, type: 'group', label: g.label || labels.untitled,
      x: Math.round(x1), y: Math.round(y1), width: Math.round(x2 - x1), height: Math.round(y2 - y1),
      ...(color ? { color } : {}),
    });
  }

  // Outermost groups first so they sit behind their content
  const nodes: CanvasNode[] = [...[...groupNodes.values()].reverse(), ...cards.values()];

  const memberIds = new Set(members.map((e) => e.id));
  const edges: CanvasEdge[] = [];
  for (const link of links) {
    if (!memberIds.has(link.fromId) || !memberIds.has(link.toId)) continue;
    const dir = linkDirection(link);
    const color = canvasColor(link.visual?.color);
    edges.push({
      id: link.id,
      fromNode: link.fromId,
      toNode: link.toId,
      fromEnd: dir === 'backward' || dir === 'both' ? 'arrow' : 'none',
      toEnd: dir === 'forward' || dir === 'both' ? 'arrow' : 'none',
      ...(link.label.trim() ? { label: link.label.trim() } : {}),
      ...(color ? { color } : {}),
    });
  }

  return JSON.stringify({ nodes, edges }, null, '\t');
}
