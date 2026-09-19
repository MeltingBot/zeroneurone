/**
 * Export to i2 Analyst's Notebook Exchange format (.anx).
 *
 * The native .anb container is deliberately not a target: importANB.ts reads it
 * by scanning bytes for GUID patterns and *infers* the serialisation markers
 * rather than reading the class registry that declares them. Reading that way
 * works because anything not understood can be skipped; writing cannot.
 *
 * ## The rule that governs this emitter
 *
 * Every attribute emitted here appears verbatim in one of the reference files
 * that i2 is known to accept. Do not add plausible-looking attributes: the
 * schema is only partially public, and an invented attribute is how a chart
 * gets refused. When extending this file, grep a real .anx first.
 *
 * The template followed is a third-party-generated chart that i2 opens, so it
 * documents the *minimal sufficient* subset: no lcx:LibraryCatalogue, no
 * CIStyle, no Font, no ConnectionCollection, no PaletteCollection.
 *
 * ## Shape
 *
 *   Chart
 *     StrengthCollection   > Strength   Id="IDSET*"
 *     LinkTypeCollection   > LinkType   Id="IDSET*"
 *     EntityTypeCollection > EntityType Id="IDENT*"
 *     AttributeClassCollection > AttributeClass Id="IDSET*"   (only when needed)
 *     ChartItemCollection  > ChartItem  Id="ID*"
 *                              End > Entity > Icon > IconStyle   (entities)
 *                              Link > LinkStyle                  (links)
 *
 * Ids share one namespace across the document, hence the disjoint prefixes.
 */

import type {
  Dossier, Element, Link, Position, PropertyType, Property,
} from '../types';
import { getGeoCenter } from '../utils/geo';

// ============================================================================
// TUNING — every unknown that only a real i2 can settle lives here, so that a
// test report turns into a one-line change.
// ============================================================================

/** Emit the iBase dialect (Entity/@EntityId, Link/@End1Id) alongside the
 *  standard one. Off: iBase ids belong with database keys and a proxy we do not
 *  produce, and the only third-party generator i2 is known to accept is
 *  standard-only. importANX falls back between both, so round-tripping is safe. */
const EMIT_IBASE_DIALECT = false;

/** Canvas units per i2 unit. The reference chart's coordinates look like screen
 *  pixels, but nothing proves i2's unit is one. */
const COORD_SCALE = 1;

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

// ============================================================================
// COLOUR
// ============================================================================

/** Hex (#RGB or #RRGGBB) to 0-255 components, grey on anything else. */
function hexToRgb(hex: string | null | undefined): { r: number; g: number; b: number } {
  const fallback = { r: 153, g: 153, b: 153 };
  if (!hex || typeof hex !== 'string') return fallback;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return fallback;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

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

/** i2 local date-time: no zone suffix, milliseconds kept. */
function formatI2Date(date: Date | string | number | null | undefined): string | null {
  if (date === null || date === undefined || date === '') return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace('Z', '').slice(0, 23);
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

function sizeToEnlargement(size: unknown): string {
  if (typeof size === 'number') {
    if (size <= 14) return 'ICEnlargeSingle';
    if (size <= 24) return 'ICEnlargeDouble';
    return 'ICEnlargeTriple';
  }
  if (size === 'medium') return 'ICEnlargeDouble';
  if (size === 'large') return 'ICEnlargeTriple';
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
interface AttributeClassDef { id: string; name: string; attType: string }

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

export function buildANXExport(dossier: Dossier, elements: Element[], links: Link[]): string {
  const byId = new Map(elements.map((el) => [el.id, el]));

  // Groups and annotations have no counterpart in the subset we emit. Their
  // children are emitted at absolute positions instead.
  const emitted = elements.filter((el) => !el.isGroup && !el.isAnnotation);

  const idMap = new Map<string, string>();
  emitted.forEach((el, i) => idMap.set(el.id, `ID${i + 1}`));

  // A link pointing at a skipped element would reference a ChartItem that does
  // not exist, which i2 rejects or silently drops.
  const emittedLinks = links.filter((l) => idMap.has(l.fromId) && idMap.has(l.toId));

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
  const attributeClasses = new Map<string, AttributeClassDef>();
  const declareAttr = (name: string, type: PropertyType | undefined): AttributeClassDef => {
    let def = attributeClasses.get(name);
    if (!def) {
      def = { id: nextDefId(), name, attType: propertyTypeToAttType(type) };
      attributeClasses.set(name, def);
    }
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
      const def = declareAttr(prop.key, prop.type);
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

  for (const el of emitted) {
    const chartId = idMap.get(el.id)!;
    const type = entityTypeOf.get(el.id)!;
    const pos = resolveAbsolutePosition(el, byId);
    const x = Math.round(pos.x * COORD_SCALE);
    const y = Math.round(pos.y * COORD_SCALE) * (NEGATE_Y ? -1 : 1);

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
        `        <Card Summary="${escapeAttr(el.label)}" Text="" DateTime="${mainDate}" DateSet="true" TimeSet="true" SourceReference="${escapeAttr(el.source)}" SourceType="ZeroNeurone" />`,
      );
    }
    for (const ev of el.events ?? []) {
      collectDate(ev.date);
      const evDate = formatI2Date(ev.date);
      cards.push(
        `        <Card Summary="${escapeAttr(ev.label)}" Text="${escapeAttr(ev.description ?? '')}"${evDate ? ` DateTime="${evDate}" DateSet="true" TimeSet="true"` : ''} SourceReference="${escapeAttr(ev.source ?? '')}" SourceType="ZeroNeurone" />`,
      );
    }

    const frameColour = hexToColorref(el.visual?.borderColor);
    const entityAttrs = EMIT_IBASE_DIALECT ? ` EntityId="${escapeAttr(chartId)}"` : '';

    items.push(
      `    <ChartItem Id="${chartId}" Label="${escapeAttr(el.label)}" Shown="true" DateTimeDescription="" Description="${escapeAttr(el.notes)}" DateSet="${mainDate ? 'true' : 'false'}" TimeSet="${mainDate ? 'true' : 'false'}" GradeOneIndex="${confidenceToGrade(el.confidence)}" GradeTwoIndex="0" GradeThreeIndex="0" Ordered="false" SourceReference="${escapeAttr(el.source)}" SourceType="ZeroNeurone" XPosition="${x}">`,
      ...(attributes.length ? ['      <AttributeCollection>', ...attributes, '      </AttributeCollection>'] : []),
      ...(cards.length ? ['      <CardCollection>', ...cards, '      </CardCollection>'] : []),
      `      <End X="${x}" Y="${y}" Z="0">`,
      `        <Entity${entityAttrs} Identity="${escapeAttr(el.label)}" LabelIsIdentity="true">`,
      '          <Icon TextX="0" TextY="16">',
      `            <IconStyle Enlargement="${sizeToEnlargement(el.visual?.size)}" Type="${escapeAttr(type.name)}" EntityTypeReference="${type.id}">`,
      `              <FrameStyle Colour="${frameColour}" />`,
      '            </IconStyle>',
      '          </Icon>',
      '        </Entity>',
      '      </End>',
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

    collectDate(link.date);

    const attributes = attributesFor(link, (link.tags ?? []).slice(1).map((t) => ({ key: ATTR_TAG, value: t })));

    const cards: string[] = [];
    const linkDate = formatI2Date(link.date);
    if (linkDate) {
      cards.push(
        `        <Card Summary="${escapeAttr(link.label)}" Text="" DateTime="${linkDate}" DateSet="true" TimeSet="true" SourceReference="${escapeAttr(link.source)}" SourceType="ZeroNeurone" />`,
      );
    }

    const width = Math.min(10, Math.max(1, Math.round(link.visual?.thickness ?? 1)));
    const ends = EMIT_IBASE_DIALECT
      ? ` End1Id="${end1}" End2Id="${end2}" End1Reference="${end1}" End2Reference="${end2}"`
      : ` End1Reference="${end1}" End2Reference="${end2}"`;

    items.push(
      `    <ChartItem Id="${chartId}" Label="${escapeAttr(link.label)}" Shown="true" DateTimeDescription="" Description="${escapeAttr(link.notes)}" DateSet="${linkDate ? 'true' : 'false'}" TimeSet="${linkDate ? 'true' : 'false'}" GradeOneIndex="${confidenceToGrade(link.confidence)}" GradeTwoIndex="0" GradeThreeIndex="0" Ordered="false" SourceReference="${escapeAttr(link.source)}" SourceType="ZeroNeurone" XPosition="0">`,
      ...(attributes.length ? ['      <AttributeCollection>', ...attributes, '      </AttributeCollection>'] : []),
      ...(cards.length ? ['      <CardCollection>', ...cards, '      </CardCollection>'] : []),
      `      <Link LabelPos="50" LabelSegment="0" Offset="0"${ends}>`,
      `        <LinkStyle ArrowStyle="${directionToArrowStyle(link)}" LineWidth="${width}" LineColour="${hexToColorref(link.visual?.color)}" Strength="${escapeAttr(strength.name)}" Type="${escapeAttr(linkType.name)}" LinkTypeReference="${linkType.id}" StrengthReference="${strength.id}" />`,
      '      </Link>',
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
      ...[...attributeClasses.values()].map(
        (a) => `    <AttributeClass Id="${a.id}" Name="${escapeAttr(a.name)}" Type="${a.attType}" />`,
      ),
      '  </AttributeClassCollection>',
    );
  }

  out.push('  <ChartItemCollection>', ...items, '  </ChartItemCollection>', '</Chart>');

  void dossier; // the emitted subset has no slot for the dossier name
  return out.join('\n');
}
