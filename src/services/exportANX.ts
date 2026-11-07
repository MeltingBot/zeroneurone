/*
 * This project is not affiliated with IBM, i2 Group, N. Harris Computer
 * Corporation, or any other vendor. "i2", "i2 Analyst's Notebook", and "ANB"
 * are trademarks of their respective owners (nominative use).
 *
 * Ce projet n'est affilié ni à IBM, ni à i2 Group, ni à N. Harris Computer
 * Corporation, ni à aucun autre éditeur. « i2 », « i2 Analyst's Notebook » et
 * « ANB » sont des marques de leurs propriétaires respectifs (usage nominatif).
 */
/**
 * Export to i2 Analyst's Notebook Exchange format (.anx).
 *
 * The native .anb container is deliberately not a target: anbParser.ts reads the
 * chart items and links it needs and skips the palette, styles and print settings
 * it does not understand. Reading that way works because anything not understood
 * can be skipped; writing cannot.
 *
 * ## The rule that governs this emitter
 *
 * Every attribute emitted here appears verbatim in one of the reference files
 * that i2 is known to accept. Do not add plausible-looking attributes: the
 * schema is only partially public, and an invented attribute is how a chart
 * gets refused. When extending this file, grep a real .anx first.
 * Exceptions come from anxwritter (MIT, ANB 9+): ChartItem/@DateTime (without
 * it, i2 shows no date on the item), and the embedded images of elements,
 * CustomImageCollection > CustomImage and IconStyle/@OverrideTypeIcon,
 * @TypeIconName (see anxImages.ts).
 *
 * The template followed is a third-party-generated chart that i2 opens, so it
 * documents the *minimal sufficient* subset: no lcx:LibraryCatalogue, no
 * CIStyle, no Font, no ConnectionCollection, no PaletteCollection.
 *
 * ## Shape
 *
 *   Chart
 *     CustomImageCollection > CustomImage Id="ZN_<hash>,Screen,Icon"  (only when needed)
 *     StrengthCollection   > Strength   Id="IDSET*"
 *     LinkTypeCollection   > LinkType   Id="IDSET*"
 *     EntityTypeCollection > EntityType Id="IDENT*"
 *     AttributeClassCollection > AttributeClass Id="IDSET*"   (only when needed)
 *     ChartItemCollection  > ChartItem  Id="ID*"
 *                              End > Entity > Icon, CardCollection   (entities)
 *                              Link > CardCollection, LinkStyle      (links)
 *                              AttributeCollection                   (after End/Link)
 *
 * Child order is enforced by i2's schema validator: an AttributeCollection
 * before End/Link, or a CardCollection directly under ChartItem, makes i2
 * refuse the whole chart. The order above is the one a real i2 export uses.
 *
 * Ids share one namespace across the document, hence the disjoint prefixes.
 */

import type {
  DatePrecision, Dossier, Element, EvaluationModel, Link, Position, PropertyType, Property,
} from '../types';
import { getGeoCenter } from '../utils/geo';
import { EVALUATION_GRIDS, getEvaluationModel, getModelScale } from '../utils/evaluation';
import { effectivePrecision, parseDateValue, toLocalDateKey } from '../utils/dates';
import { flattenSourceLines, sourceToPlainText } from '../utils/sourceLinks';
import { getSourceSchemeNames } from '../plugins/sourceSchemes';
import { hexToRgb } from '../utils/themeColors';
import type { AnxImage } from './anxImages';
import { computeLinkRoutes, computeNodeLayout } from './svgExportService';
import { bundleLinks } from '../utils/linkBundles';

// ============================================================================
// TUNING — every unknown that only a real i2 can settle lives here, so that a
// test report turns into a one-line change.
// ============================================================================

/** Emit the iBase dialect (Entity/@EntityId, Link/@End1Id) alongside the
 *  standard one. Off: iBase ids belong with database keys and a proxy we do not
 *  produce, and the only third-party generator i2 is known to accept is
 *  standard-only. importANX falls back between both, so round-tripping is safe. */
const EMIT_IBASE_DIALECT = false;

/** i2 world units per canvas pixel.
 *  At 1, charts opened in i2 with tiny icons far apart. Two measures agree:
 *  - an i2 icon is about 32 units (label at TextY=16 under its centre, XSD
 *    default), a medium ZN element 56 px: 0.57;
 *  - neighbour spacing (median) is 144 to 174 units in hand-laid i2 charts
 *    (doc_perso/fixtures/anb), 317 to 438 in ZN exports: 0.33 to 0.55.
 *  Fixed rather than fitted to each dossier: re-exporting onto an existing
 *  chart (i2 merges by Identity) must not move the items already there. */
export const ANX_COORD_SCALE = 0.5;

/** i2's Y axis direction is unverified. If charts open mirrored, flip this. */
const NEGATE_Y = false;

// ============================================================================
// TEXT
// ============================================================================

/**
 * Strip control characters that XML 1.0 forbids outright.
 *
 * Notes carry whatever a paste or an earlier import left in them, and a single
 * C0 character makes the whole document unparsable — a failure that would only
 * show up in i2, far from here.
 */
function stripControlChars(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

/**
 * Escape a string for an XML *attribute*.
 *
 * ANX puts everything in attributes — Label, Description, Card/@Text,
 * Attribute/@Value — and XML attribute-value normalisation silently turns a
 * literal newline into a space. ZN notes are multi-line by nature, so the
 * whitespace entities are not optional here. A real i2 export confirms the
 * convention: Label="543WER&#xA;Honda Accord LX".
 */
function escapeAttr(value: unknown): string {
  return stripControlChars(String(value ?? ''))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/\n/g, '&#xA;')
    .replace(/\r/g, '&#xD;')
    .replace(/\t/g, '&#x9;');
}

/**
 * i2 rejects newlines in SourceReference ("Source reference must not contain
 * newlines") and, in Rigorous mode, drops the rest of the chart — links
 * included. A ZN source often lists several URLs, one per line: join them.
 */
function escapeSourceRef(source: string | undefined): string {
  return escapeAttr(flattenSourceLines(sourceToPlainText(source ?? '', getSourceSchemeNames())));
}

// ============================================================================
// COLOUR
// ============================================================================

/**
 * Hex to Windows COLORREF, the exact inverse of importANX's colorrefToHex.
 *
 * COLORREF is BGR, not RGB: #ff0000 is 255, #0000ff is 16711680. Getting this
 * backwards produces a chart whose colours are all wrong and nothing else
 * fails, which is why the test suite asserts both sentinels.
 *
 * Pure black is clamped to #010101: importANX reads Colour="0" as "unset", so
 * an explicit black would be lost on the way back. The shift is invisible.
 *
 * Link colours default to a CSS variable ('var(--color-text-tertiary)'), not a
 * hex string — hexToRgb's grey fallback is what catches that.
 */
function hexToColorref(hex: string | null | undefined): number {
  const { r, g, b } = hexToRgb(hex);
  const colorref = (b << 16) | (g << 8) | r;
  return colorref === 0 ? (1 << 16) | (1 << 8) | 1 : colorref;
}

// ============================================================================
// DATES
// ============================================================================

/**
 * i2 local date-time: no zone suffix, milliseconds kept. The chart declares
 * UseLocalTimeZone, so this is the local wall clock (not the UTC one), which
 * is also how the ANX importer reads it back.
 */
function formatI2Date(date: Date | string | number | null | undefined): string | null {
  const d = parseDateValue(date);
  if (!d) return null;
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${toLocalDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/**
 * Date attributes of a ChartItem. i2 shows an item's Date & Time (label,
 * properties, timeline) from ChartItem/@DateTime, not from its cards: a
 * DateSet="true" without DateTime leaves the item undated in ANB. Same
 * attributes as anxwritter, which targets ANB 9+. TimeSet stays false for a
 * day-only date, otherwise i2 would print 00:00.
 */
function chartItemDateAttrs(value: unknown, precision?: DatePrecision): string {
  const d = parseDateValue(value as Date | string | number | null | undefined);
  if (!d) return 'DateSet="false" TimeSet="false"';
  const timeSet = effectivePrecision(d, precision) === 'minute';
  return `DateTime="${formatI2Date(d)}" DateSet="true" TimeSet="${timeSet ? 'true' : 'false'}"`;
}

// ============================================================================
// GEOMETRY
// ============================================================================

/** Children of a group hold positions relative to their parent. */
function resolveAbsolutePosition(element: Element, byId: Map<string, Element>): Position {
  if (!element.parentGroupId) return element.position;
  const parent = byId.get(element.parentGroupId);
  if (!parent) return element.position;
  const parentPos = resolveAbsolutePosition(parent, byId);
  return { x: parentPos.x + element.position.x, y: parentPos.y + element.position.y };
}

// ============================================================================
// ENUMERATION INVERSES (see importANX.ts for the forward direction)
// ============================================================================

/**
 * ZN size to i2 enlargement, shifted one step down: 'medium' is ZN's default,
 * and i2's default is Single. Mapping medium to Double enlarged every icon and
 * pushed its label onto it, since TextY stays at the reference value.
 * Numeric sizes are pixels (small 40, medium 56, large 72).
 */
function sizeToEnlargement(size: unknown): string {
  if (typeof size === 'number') {
    if (size <= 56) return 'ICEnlargeSingle';
    if (size <= 90) return 'ICEnlargeDouble';
    return 'ICEnlargeTriple';
  }
  if (size === 'large') return 'ICEnlargeDouble';
  return 'ICEnlargeSingle';
}

function directionToArrowStyle(link: Link): string {
  const direction = link.direction ?? (link.directed ? 'forward' : 'none');
  switch (direction) {
    case 'forward': return 'ArrowOnHead';
    case 'backward': return 'ArrowOnTail';
    case 'both': return 'ArrowOnBoth';
    default: return 'ArrowNone';
  }
}

function styleToDotStyle(style: string | undefined): string {
  switch (style) {
    case 'dashed': return 'DotStyleDashed';
    case 'dotted': return 'DotStyleDotted';
    default: return 'DotStyleSolid';
  }
}

/** Strength names stay neutral: importANX turns them back into tags, and a
 *  fabricated "Confirmed" would read as a confidence rating it never was. */
function styleToStrengthName(style: string | undefined): string {
  switch (style) {
    case 'dashed': return 'Dashed';
    case 'dotted': return 'Dotted';
    default: return 'Solid';
  }
}

function propertyTypeToAttType(type: PropertyType | undefined): string {
  switch (type) {
    case 'number': return 'AttNumber';
    case 'date':
    case 'datetime': return 'AttTime';
    case 'boolean': return 'AttFlag';
    // choice, geo, country, link have no i2 counterpart and degrade to text.
    default: return 'AttText';
  }
}

/**
 * Lucide icon to an i2 IconFile.
 *
 * Inverse of importANX's ICON_MAP, which is many-to-one (person, prisoff and
 * woman all map to 'user'), so each Lucide name gets one canonical i2 name.
 * Everything else, custom icons included, falls back to 'anon' — a name the
 * reference chart uses, therefore one i2 is known to resolve.
 */
const LUCIDE_TO_I2: Record<string, string> = {
  user: 'person',
  car: 'car',
  truck: 'van',
  'train-front': 'train',
  plane: 'terminal',
  'map-pin': 'place',
};
const DEFAULT_ICON_FILE = 'anon';

function iconToIconFile(icon: string | null | undefined): string {
  if (!icon) return DEFAULT_ICON_FILE;
  return LUCIDE_TO_I2[icon] ?? DEFAULT_ICON_FILE;
}

/** i2 renders an icon or a box; ZN's other shapes have no counterpart. */
function shapeToRepresentation(shape: string | undefined): string {
  return shape === 'rectangle' || shape === 'square' ? 'RepresentAsBox' : 'RepresentAsIcon';
}

function confidenceToGrade(confidence: number | null | undefined): number {
  if (confidence === null || confidence === undefined) return 0;
  return Math.min(5, Math.max(1, Math.round(confidence / 20)));
}

/**
 * i2 grades of an item: GradeOne/GradeTwo carry the source reliability and the
 * information accuracy in the grading models (1-based position in the grid,
 * 0 when not graded in the dossier's scale), the 1-5 confidence otherwise.
 * No grade collection is emitted, so i2 shows the indices with its own labels.
 */
function itemGrades(item: Element | Link, model: EvaluationModel): { one: number; two: number } {
  const scale = getModelScale(model);
  if (!scale) return { one: confidenceToGrade(item.confidence), two: 0 };
  const evaluation = item.evaluation;
  if (!evaluation || evaluation.scale !== scale) return { one: 0, two: 0 };
  const grid = EVALUATION_GRIDS[scale];
  return {
    one: evaluation.source ? grid.sources.indexOf(evaluation.source) + 1 : 0,
    two: evaluation.info ? grid.infos.indexOf(evaluation.info) + 1 : 0,
  };
}

function serialiseValue(value: Property['value']): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatI2Date(value) ?? '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

// ============================================================================
// DEFINITION COLLECTIONS
// ============================================================================

interface EntityTypeDef { id: string; name: string; iconFile: string; colour: number; representation: string }
interface SimpleDef { id: string; name: string }
interface AttributeClassDef {
  id: string; name: string; attType: string;
  /** Shown on the canvas in ZN (Views panel): shown on the chart in i2 */
  shown: boolean;
  /** Most decimals among the numbers, so that i2 does not round them */
  decimals: number;
  /** A date among the values has a time of day */
  hasTime: boolean;
}

/**
 * An AttributeClass with its display settings. Every attribute and value here
 * appears verbatim in an i2/iBase export (sample.anx): "Show on chart" is
 * Visible, then the value and the class name, as i2 shows "Brand Audi A6".
 * Merged texts are joined with a space, as i2 proposes by default.
 */
function attributeClassXml(a: AttributeClassDef): string {
  const shown = String(a.shown);
  const isTime = a.attType === 'AttTime';
  return `    <AttributeClass Id="${a.id}" Name="${escapeAttr(a.name)}" Type="${a.attType}"`
    + ' IsUser="true" UserCanAdd="true" UserCanRemove="true" IconFile="" Prefix="" Suffix=""'
    + ` ShowClassName="${shown}" ShowSymbol="false" ShowPrefix="false" ShowSuffix="false" ShowValue="${shown}"`
    + ` ShowDate="${a.shown && isTime}" ShowTime="${a.shown && isTime && a.hasTime}" ShowSeconds="false"`
    + ` DecimalPlaces="${a.decimals}" Visible="${shown}" ShowIfSet="false"`
    + ` MergeBehaviour="${mergeBehaviourOf(a.attType)}" PasteBehaviour="AttMergeAssign" />`;
}

/**
 * What i2 does with two values when merging items. Each type has its own
 * list in the ANB 7 schema, and AttMergeAssign is in none of them: i2 warns
 * "Invalid merge behaviour for classes of this type". Numbers are summed, as
 * i2 does by default (its own Latitude and Longitude classes included), dates
 * keep the latest, flags are ORed. PasteBehaviour accepts AttMergeAssign.
 */
function mergeBehaviourOf(attType: string): string {
  switch (attType) {
    case 'AttNumber': return 'AttMergeAdd';
    case 'AttTime': return 'AttMergeMax';
    case 'AttFlag': return 'AttMergeOR';
    default: return 'AttMergeAddWithSpace';
  }
}

/** Decimals of a number as written: 70.941 → 3 (at most 6) */
function decimalsOf(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const text = String(value);
  if (text.includes('e')) return 6;
  return Math.min(6, text.split('.')[1]?.length ?? 0);
}

/** Whether a date value has a time of day (not midnight) */
function hasTimeOfDay(value: unknown): boolean {
  const d = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
  return !!d && !Number.isNaN(d.getTime()) && (d.getHours() !== 0 || d.getMinutes() !== 0);
}

/** Synthetic attribute keys used to carry ZN concepts i2 has no slot for. */
const ATTR_TAG = 'Tag';
const ATTR_GROUP = 'Group';
const ATTR_LAT = 'Latitude';
const ATTR_LON = 'Longitude';
const ATTR_DATE_START = 'Date start';
const ATTR_DATE_END = 'Date end';

// ============================================================================
// EMITTER
// ============================================================================

/** Choices of the ANX export (Export window) */
export interface ANXExportOptions {
  /** Embed the image of each element as the icon of its entity (default: yes) */
  images?: boolean;
  /** Tick "Show on chart" for the properties shown on the canvas (default: yes) */
  shownProperties?: boolean;
  /** Corners of the links drawn by hand (default: yes) */
  routes?: boolean;
}

/**
 * @param images image of an element, ready to embed (see anxImages.ts):
 *   shown as the icon of its entity
 */
/**
 * Corners of the links drawn by hand, as the canvas draws them, in canvas coordinates: the bend
 * points of a straight line, the corners of a right-angle route. i2 keeps a corner where it is
 * when entities move: an automatic route is left out (a straight link i2 lays out freely), and so
 * are curves (i2 draws straight segments only).
 */
function linkCorners(dossier: Dossier, links: Link[], layout: ReturnType<typeof computeNodeLayout>): Map<string, Position[]> {
  const linkCurveMode = dossier.settings?.linkCurveMode ?? 'curved';
  const corners = new Map<string, Position[]>();
  if (linkCurveMode === 'curved') return corners;
  const routes = computeLinkRoutes(links, layout, {
    linkAnchorMode: dossier.settings?.linkAnchorMode ?? 'manual',
    linkCurveMode,
    linkMultiplicity: dossier.settings?.linkMultiplicity,
  });
  for (const { link, route } of routes) {
    const points = linkCurveMode === 'orthogonal'
      ? (link.orthogonalRoute ? route.orthogonal?.points : undefined)
      : link.bendPoints?.length ? route.free?.points : undefined;
    if (points && points.length > 2) corners.set(link.id, points.slice(1, -1));
  }
  return corners;
}

export function buildANXExport(
  dossier: Dossier, elements: Element[], links: Link[],
  images?: ReadonlyMap<string, AnxImage>, options: Pick<ANXExportOptions, 'shownProperties' | 'routes'> = {},
): string {
  const byId = new Map(elements.map((el) => [el.id, el]));
  const model = getEvaluationModel(dossier);

  // Groups and annotations have no counterpart in the subset we emit. Their
  // children are emitted at absolute positions instead.
  const emitted = elements.filter((el) => !el.isGroup && !el.isAnnotation);

  const idMap = new Map<string, string>();
  emitted.forEach((el, i) => idMap.set(el.id, `ID${i + 1}`));

  // A link pointing at a skipped element would reference a ChartItem that does
  // not exist, which i2 rejects or silently drops.
  const emittedLinks = links.filter((l) => idMap.has(l.fromId) && idMap.has(l.toId));

  // i2 draws an entity centred on its position and its links from there: the
  // centres of the nodes, and the corners of the links as the canvas draws them
  const layout = computeNodeLayout(elements);
  const toChart = (p: Position) => ({
    x: Math.round(p.x * ANX_COORD_SCALE),
    y: Math.round(p.y * ANX_COORD_SCALE) * (NEGATE_Y ? -1 : 1),
  });
  // Several links between two elements merged on the canvas: an i2 connection per pair, with the
  // same multiplicity, so Analyst's Notebook draws them alike (the links stay apart)
  const multiplicity = dossier.settings?.linkMultiplicity ?? 'multiple';
  const connectionOf = new Map<string, string>();
  const connections: string[] = [];
  if (multiplicity !== 'multiple') {
    const { bundles } = bundleLinks(emittedLinks, 'single');
    const style = multiplicity === 'single' ? 'MultiplicitySingle' : 'MultiplicityDirected';
    for (const bundle of bundles.values()) {
      const id = `CONN${connections.length + 1}`;
      connections.push(`    <Connection Id="${id}">`, `      <ConnectionStyle Multiplicity="${style}" />`, '    </Connection>');
      for (const l of bundle.links) connectionOf.set(l.id, id);
    }
  }

  const cornersOf = options.routes === false ? new Map<string, Position[]>() : linkCorners(dossier, emittedLinks, layout);

  // ── Collect definitions ───────────────────────────────────────────────────
  let defCounter = 0;
  const nextDefId = () => `IDSET${++defCounter}`;

  const entityTypes = new Map<string, EntityTypeDef>();
  const usedTypeNames = new Set<string>();
  let entCounter = 0;

  // Fallback type, present in the reference chart.
  entityTypes.set('\u0000other', {
    id: `IDENT${entCounter++}`,
    name: 'Other',
    iconFile: 'diagreen',
    colour: 0,
    representation: 'RepresentAsIcon',
  });
  usedTypeNames.add('Other');

  const entityTypeOf = new Map<string, EntityTypeDef>();
  for (const el of emitted) {
    const tag = el.tags?.[0];
    if (!tag) {
      entityTypeOf.set(el.id, entityTypes.get('\u0000other')!);
      continue;
    }
    // i2 carries colour on the type, ZN on the item: the pair is the key.
    const colour = hexToColorref(el.visual?.color);
    const key = `${tag}\u0000${colour}`;
    let def = entityTypes.get(key);
    if (!def) {
      // Names must stay unique: importANX matches types by name.
      let name = tag;
      let suffix = 2;
      while (usedTypeNames.has(name)) name = `${tag} (${suffix++})`;
      usedTypeNames.add(name);
      def = {
        id: `IDENT${entCounter++}`,
        name,
        iconFile: iconToIconFile(el.visual?.icon),
        colour,
        representation: shapeToRepresentation(el.visual?.shape),
      };
      entityTypes.set(key, def);
    }
    entityTypeOf.set(el.id, def);
  }

  const strengths = new Map<string, SimpleDef>();
  const strengthOf = new Map<string, SimpleDef>();
  const linkTypes = new Map<string, SimpleDef>();
  const linkTypeOf = new Map<string, SimpleDef>();

  // The reference chart always carries a Strength and a LinkType, even unused.
  strengths.set('Solid', { id: nextDefId(), name: 'Solid' });
  linkTypes.set('Link', { id: nextDefId(), name: 'Link' });

  for (const link of emittedLinks) {
    const strengthName = styleToStrengthName(link.visual?.style);
    let strength = strengths.get(strengthName);
    if (!strength) {
      strength = { id: nextDefId(), name: strengthName };
      strengths.set(strengthName, strength);
    }
    strengthOf.set(link.id, strength);

    const typeName = link.tags?.[0] || 'Link';
    let linkType = linkTypes.get(typeName);
    if (!linkType) {
      linkType = { id: nextDefId(), name: typeName };
      linkTypes.set(typeName, linkType);
    }
    linkTypeOf.set(link.id, linkType);
  }

  // Attribute classes: first declared type wins, later values degrade to text.
  // Those of the properties shown on the canvas are shown on the chart.
  const displayed = new Set(options.shownProperties === false ? [] : (dossier.settings?.displayedProperties ?? []).map((k) => k.trim()));
  const attributeClasses = new Map<string, AttributeClassDef>();
  const declareAttr = (rawName: string, type: PropertyType | undefined, value?: unknown): AttributeClassDef => {
    // Keys imported from CRLF files can keep a trailing "\r" ("telephone\r").
    const name = rawName.trim();
    let def = attributeClasses.get(name);
    if (!def) {
      def = { id: nextDefId(), name, attType: propertyTypeToAttType(type), shown: displayed.has(name), decimals: 0, hasTime: false };
      attributeClasses.set(name, def);
    }
    if (def.attType === 'AttNumber') def.decimals = Math.max(def.decimals, decimalsOf(value));
    if (def.attType === 'AttTime' && !def.hasTime && hasTimeOfDay(value)) def.hasTime = true;
    return def;
  };

  /** Attributes carried by one item, declaring their classes along the way. */
  const attributesFor = (
    item: Element | Link,
    extra: Array<{ key: string; value: string; type?: PropertyType }>,
  ): string[] => {
    const out: string[] = [];
    for (const prop of item.properties ?? []) {
      const value = serialiseValue(prop.value);
      if (!value) continue; // importANX ignores empty values anyway
      const def = declareAttr(prop.key, prop.type, prop.value);
      out.push(
        `        <Attribute AttributeClass="${escapeAttr(def.name)}" Value="${escapeAttr(value)}" AttributeClassReference="${def.id}" />`,
      );
    }
    for (const { key, value, type } of extra) {
      if (!value) continue;
      const def = declareAttr(key, type);
      out.push(
        `        <Attribute AttributeClass="${escapeAttr(def.name)}" Value="${escapeAttr(value)}" AttributeClassReference="${def.id}" />`,
      );
    }
    return out;
  };

  // Embedded images: one per distinct image, under the name its content
  // gives it (never an i2 icon name, never another image's)
  const embedded = new Map<string, AnxImage>();
  const embedImage = (image: AnxImage): string => {
    if (!embedded.has(image.name)) embedded.set(image.name, image);
    return image.name;
  };

  // ── Chart items ───────────────────────────────────────────────────────────
  const items: string[] = [];
  const dates: Date[] = [];
  const collectDate = (d: unknown) => {
    if (d instanceof Date && !Number.isNaN(d.getTime())) dates.push(d);
    else if (typeof d === 'string' || typeof d === 'number') {
      const parsed = new Date(d);
      if (!Number.isNaN(parsed.getTime())) dates.push(parsed);
    }
  };

  // i2 merges the entities that share an Identity: two namesakes would become
  // one person, with the links of both. The label is the Identity unless
  // another entity already took it; then a suffix keeps it apart (" (2)"),
  // and the label shown stays the ZN one (LabelIsIdentity="false").
  const takenIdentities = new Set<string>();
  const identityOf = (label: string): string => {
    const base = label.trim();
    let identity = base;
    for (let i = 2; !identity || takenIdentities.has(identity.toLowerCase()); i++) {
      identity = base ? `${base} (${i})` : `(${i - 1})`;
    }
    takenIdentities.add(identity.toLowerCase());
    return identity;
  };

  for (const el of emitted) {
    const chartId = idMap.get(el.id)!;
    const identity = identityOf(el.label ?? '');
    const type = entityTypeOf.get(el.id)!;
    const pos = resolveAbsolutePosition(el, byId);
    const dims = layout.dimensions.get(el.id) ?? { width: 0, height: 0 };
    const { x, y } = toChart({ x: pos.x + dims.width / 2, y: pos.y + dims.height / 2 });

    collectDate(el.date);

    const extra: Array<{ key: string; value: string; type?: PropertyType }> = [];
    for (const tag of (el.tags ?? []).slice(1)) extra.push({ key: ATTR_TAG, value: tag });
    if (el.parentGroupId) {
      const parent = byId.get(el.parentGroupId);
      if (parent) extra.push({ key: ATTR_GROUP, value: parent.label });
    }
    if (el.geo) {
      const centre = getGeoCenter(el.geo);
      if (centre) {
        extra.push({ key: ATTR_LAT, value: String(centre.lat), type: 'number' });
        extra.push({ key: ATTR_LON, value: String(centre.lng), type: 'number' });
      }
    }
    if (el.dateRange?.start) {
      extra.push({ key: ATTR_DATE_START, value: formatI2Date(el.dateRange.start) ?? '', type: 'date' });
    }
    if (el.dateRange?.end) {
      extra.push({ key: ATTR_DATE_END, value: formatI2Date(el.dateRange.end) ?? '', type: 'date' });
    }

    const attributes = attributesFor(el, extra);

    // Cards carry the element date and each event.
    const cards: string[] = [];
    const mainDate = formatI2Date(el.date);
    if (mainDate) {
      cards.push(
        `        <Card Summary="${escapeAttr(el.label)}" Text="" DateTime="${mainDate}" DateSet="true" TimeSet="true" SourceReference="${escapeSourceRef(el.source)}" SourceType="ZeroNeurone" />`,
      );
    }
    for (const ev of el.events ?? []) {
      collectDate(ev.date);
      const evDate = formatI2Date(ev.date);
      cards.push(
        `        <Card Summary="${escapeAttr(ev.label)}" Text="${escapeAttr(ev.description ?? '')}"${evDate ? ` DateTime="${evDate}" DateSet="true" TimeSet="true"` : ''} SourceReference="${escapeSourceRef(ev.source)}" SourceType="ZeroNeurone" />`,
      );
    }

    const frameColour = hexToColorref(el.visual?.borderColor);
    // Its image, embedded: shown instead of the entity type's icon
    const image = images?.get(el.id);
    const iconOverride = image ? ` OverrideTypeIcon="true" TypeIconName="${embedImage(image)}"` : '';
    const entityAttrs = EMIT_IBASE_DIALECT ? ` EntityId="${escapeAttr(chartId)}"` : '';

    items.push(
      `    <ChartItem Id="${chartId}" Label="${escapeAttr(el.label)}" Shown="true" DateTimeDescription="" Description="${escapeAttr(el.notes)}" ${chartItemDateAttrs(el.date)} GradeOneIndex="${itemGrades(el, model).one}" GradeTwoIndex="${itemGrades(el, model).two}" GradeThreeIndex="0" Ordered="false" SourceReference="${escapeSourceRef(el.source)}" SourceType="ZeroNeurone" XPosition="${x}">`,
      `      <End X="${x}" Y="${y}" Z="0">`,
      `        <Entity${entityAttrs} Identity="${escapeAttr(identity)}" LabelIsIdentity="${identity === el.label ? 'true' : 'false'}">`,
      '          <Icon TextX="0" TextY="16">',
      `            <IconStyle Enlargement="${sizeToEnlargement(el.visual?.size)}" Type="${escapeAttr(type.name)}" EntityTypeReference="${type.id}"${iconOverride}>`,
      `              <FrameStyle Colour="${frameColour}" />`,
      '            </IconStyle>',
      '          </Icon>',
      ...(cards.length ? ['          <CardCollection>', ...cards.map((c) => `    ${c}`), '          </CardCollection>'] : []),
      '        </Entity>',
      '      </End>',
      ...(attributes.length ? ['      <AttributeCollection>', ...attributes, '      </AttributeCollection>'] : []),
      '    </ChartItem>',
    );
  }

  let linkChartCounter = idMap.size;
  for (const link of emittedLinks) {
    const chartId = `ID${++linkChartCounter}`;
    const strength = strengthOf.get(link.id)!;
    const linkType = linkTypeOf.get(link.id)!;
    const end1 = idMap.get(link.fromId)!;
    const end2 = idMap.get(link.toId)!;

    // Dates entered in ZN live in dateRange; `date` only comes from older imports
    const linkWhen = link.date ?? link.dateRange?.start ?? null;
    collectDate(linkWhen);

    const extra: Array<{ key: string; value: string; type?: PropertyType }> =
      (link.tags ?? []).slice(1).map((t) => ({ key: ATTR_TAG, value: t }));
    // i2 has one date per item: the end of a period goes in an attribute
    const linkEnd = parseDateValue(link.dateRange?.end ?? null);
    const linkStart = parseDateValue(linkWhen);
    if (linkEnd && (!linkStart || linkEnd.getTime() !== linkStart.getTime())) {
      extra.push({ key: ATTR_DATE_END, value: formatI2Date(linkEnd) ?? '', type: 'date' });
    }
    const attributes = attributesFor(link, extra);

    const cards: string[] = [];
    const linkDate = formatI2Date(linkWhen);
    if (linkDate) {
      cards.push(
        `        <Card Summary="${escapeAttr(link.label)}" Text="" DateTime="${linkDate}" DateSet="true" TimeSet="true" SourceReference="${escapeSourceRef(link.source)}" SourceType="ZeroNeurone" />`,
      );
    }

    const width = Math.min(10, Math.max(1, Math.round(link.visual?.thickness ?? 1)));
    const ends = EMIT_IBASE_DIALECT
      ? ` End1Id="${end1}" End2Id="${end2}" End1Reference="${end1}" End2Reference="${end2}"`
      : ` End1Reference="${end1}" End2Reference="${end2}"`;

    // Corners of the line as drawn; the label on its middle segment, as on the canvas
    const corners = (cornersOf.get(link.id) ?? []).map(toChart);
    const labelSegment = Math.floor((corners.length + 1) / 2);

    items.push(
      `    <ChartItem Id="${chartId}" Label="${escapeAttr(link.label)}" Shown="true" DateTimeDescription="" Description="${escapeAttr(link.notes)}" ${chartItemDateAttrs(linkWhen, link.dateRange?.precision)} GradeOneIndex="${itemGrades(link, model).one}" GradeTwoIndex="${itemGrades(link, model).two}" GradeThreeIndex="0" Ordered="false" SourceReference="${escapeSourceRef(link.source)}" SourceType="ZeroNeurone" XPosition="0">`,
      `      <Link LabelPos="50" LabelSegment="${labelSegment}" Offset="0"${connectionOf.has(link.id) ? ` ConnectionReference="${connectionOf.get(link.id)}"` : ''}${ends}>`,
      ...(cards.length ? ['        <CardCollection>', ...cards.map((c) => `  ${c}`), '        </CardCollection>'] : []),
      ...(corners.length ? ['        <CornerCollection>', ...corners.map((c) => `          <Corner X="${c.x}" Y="${c.y}" Z="0" />`), '        </CornerCollection>'] : []),
      `        <LinkStyle ArrowStyle="${directionToArrowStyle(link)}" LineWidth="${width}" LineColour="${hexToColorref(link.visual?.color)}" Strength="${escapeAttr(strength.name)}" Type="${escapeAttr(linkType.name)}" LinkTypeReference="${linkType.id}" StrengthReference="${strength.id}" />`,
      '      </Link>',
      ...(attributes.length ? ['      <AttributeCollection>', ...attributes, '      </AttributeCollection>'] : []),
      '    </ChartItem>',
    );
  }

  // ── Assemble ──────────────────────────────────────────────────────────────
  const defaultDate = dates.length
    ? formatI2Date(new Date(Math.min(...dates.map((d) => d.getTime()))))
    : formatI2Date(new Date(new Date().getFullYear(), 0, 1));

  const chartAttrs = [
    'BackColour="16777215"',
    'BlankLinkLabels="false"',
    `DefaultDate="${defaultDate}"`,
    `DefaultDateTimeForNewChart="${defaultDate}"`,
    'DefaultTickRate="1"',
    'GridHeightSize="0.295275590551181"',
    'GridVisibleOnAllViews="true"',
    'GridWidthSize="0.295275590551181"',
    'HideMatchingTimeZoneFormat="false"',
    'ShowAllFlag="false"',
    'ShowPages="false"',
    'SnapToGrid="false"',
    'Rigorous="true"',
    `IdReferenceLinking="${EMIT_IBASE_DIALECT ? 'false' : 'true'}"`,
    'LabelRule="LabelRuleMerge"',
    'LabelSumNumericLinks="false"',
    'UseLocalTimeZone="true"',
    'UseWiringHeightForThemeIcon="true"',
    'WiringDistanceFar="0.393700787401575"',
    'WiringDistanceNear="0.078740157480315"',
    'WiringHeight="0.196850393700787"',
    'WiringSpacing="0.196850393700787"',
    'TimeBarVisible="false"',
  ].join(' ');

  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<Chart ${chartAttrs}>`,
    // Before StrengthCollection, as anxwritter writes it
    ...(embedded.size > 0 ? [
      '  <CustomImageCollection>',
      ...[...embedded.values()].map((image) => `    <CustomImage Id="${image.name},Screen,Icon" DataLength="${image.length}" Data="${image.data}" />`),
      '  </CustomImageCollection>',
    ] : []),
    '  <StrengthCollection>',
    ...[...strengths.values()].map(
      (s) => `    <Strength Id="${s.id}" Name="${escapeAttr(s.name)}" DotStyle="${styleToDotStyle(s.name.toLowerCase())}" />`,
    ),
    '  </StrengthCollection>',
    '  <LinkTypeCollection>',
    ...[...linkTypes.values()].map(
      (t) => `    <LinkType Id="${t.id}" Name="${escapeAttr(t.name)}" Colour="0" />`,
    ),
    '  </LinkTypeCollection>',
    '  <EntityTypeCollection>',
    ...[...entityTypes.values()].map(
      (t) => `    <EntityType Id="${t.id}" Name="${escapeAttr(t.name)}" PreferredRepresentation="${t.representation}" IconFile="${escapeAttr(t.iconFile)}" Colour="${t.colour}" />`,
    ),
    '  </EntityTypeCollection>',
  ];

  // Only emitted when something uses it: the reference chart has no such
  // collection, and an empty one is a gratuitous risk.
  if (attributeClasses.size > 0) {
    out.push(
      '  <AttributeClassCollection>',
      ...[...attributeClasses.values()].map(attributeClassXml),
      '  </AttributeClassCollection>',
    );
  }

  out.push('  <ChartItemCollection>', ...items, '  </ChartItemCollection>');
  if (connections.length > 0) out.push('  <ConnectionCollection>', ...connections, '  </ConnectionCollection>');
  out.push('</Chart>');

  void dossier; // the emitted subset has no slot for the dossier name
  return out.join('\n');
}
