import i18next from 'i18next';
import { db } from '../db/database';
import { generateUUID } from '../utils';
import type {
  DossierId,
  Element,
  ElementId,
  Link,
  LinkId,
  Property,
  PropertyType,
  ElementSize,
  LinkStyle,
  LinkDirection,
  Confidence,
  ElementEvent,
} from '../types';
import { DEFAULT_ELEMENT_VISUAL, DEFAULT_LINK_VISUAL } from '../types';
import type { ImportResult } from './importService';

// ============================================================================
// i18n
// ============================================================================

const t = (key: string, options?: Record<string, unknown>) =>
  i18next.t(`importData:anx.${key}`, options) as string;

// ============================================================================
// FORMAT DETECTION
// ============================================================================

/** Detect i2 Analyst's Notebook XML format */
export function isANXFormat(content: string): boolean {
  return content.includes('<Chart') && content.includes('<ChartItemCollection');
}

// ============================================================================
// XML SANITIZATION
// ============================================================================

/** Fix common malformed XML in i2 ANX exports */
function sanitizeANXContent(content: string): string {
  // Remove BOM
  let s = content.replace(/^\uFEFF/, '');
  // Strip XML declaration (browser already decoded the string, avoids encoding mismatch)
  s = s.replace(/<\?xml[^?]*\?>\s*/, '');
  // Fix double-double-quotes in attributes: attr="value"" → attr="value"
  s = s.replace(/="([^"]*)""(\s|>|\/)/g, '="$1"$2');
  return s;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Windows COLORREF (BGR integer) → CSS hex (#RRGGBB) */
function colorrefToHex(colorref: number): string {
  const r = colorref & 0xFF;
  const g = (colorref >> 8) & 0xFF;
  const b = (colorref >> 16) & 0xFF;
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function darkenColor(hex: string): string {
  if (!hex.startsWith('#') || hex.length < 7) return '#737373';
  try {
    const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - 60);
    const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - 60);
    const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - 60);
    return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return '#737373';
  }
}

function mapEnlargementToSize(enlargement: string | null): ElementSize {
  switch (enlargement) {
    case 'ICEnlargeSingle': return 'small';
    case 'ICEnlargeDouble': return 'medium';
    case 'ICEnlargeTriple': return 'large';
    default: return 'small';
  }
}

function mapArrowDirection(arrowStyle: string | null): LinkDirection {
  switch (arrowStyle) {
    case 'ArrowOnHead': return 'forward';
    case 'ArrowOnTail': return 'backward';
    case 'ArrowOnBoth': return 'both';
    case 'ArrowNone':
    default: return 'none';
  }
}

function mapDotStyleToLinkStyle(dotStyle: string | null): LinkStyle {
  switch (dotStyle) {
    case 'DotStyleDashed': return 'dashed';
    case 'DotStyleDotted': return 'dotted';
    case 'DotStyleSolid':
    default: return 'solid';
  }
}

function mapGradeToConfidence(grade: number): Confidence | null {
  if (grade <= 0 || grade > 5) return null;
  return (grade * 20) as Confidence;
}

function mapDataType(dataType: string): PropertyType {
  switch (dataType) {
    case 'AttNumber': return 'number';
    case 'AttTime': return 'date';
    case 'AttFlag': return 'boolean';
    case 'AttText':
    default: return 'text';
  }
}

const ICON_MAP: Record<string, string> = {
  'person': 'user',
  'prisoff': 'user',
  'prisoff us': 'user',
  'person (faceless)': 'user',
  'woman': 'user',
  'car': 'car',
  'motor vehicle': 'car',
  'van': 'truck',
  'minibus': 'truck',
  'train': 'train-front',
  'terminal': 'plane',
  'place': 'map-pin',
};

function mapIconFile(iconFile: string | null): string | null {
  if (!iconFile) return null;
  return ICON_MAP[iconFile.toLowerCase().replace(/\.png$/i, '')] ?? null;
}

// ============================================================================
// LOOKUP BUILDERS
// ============================================================================

function buildStrengthLookup(doc: Document): Map<string, { name: string; dotStyle: string }> {
  const map = new Map<string, { name: string; dotStyle: string }>();
  for (const el of Array.from(doc.querySelectorAll('StrengthCollection > Strength'))) {
    const id = el.getAttribute('Id') || '';
    const name = el.getAttribute('Name') || '';
    const dotStyle = el.getAttribute('DotStyle') || 'DotStyleSolid';
    if (id) map.set(id, { name, dotStyle });
    if (name && name !== id) map.set(name, { name, dotStyle });
  }
  return map;
}

function buildEntityTypeLookup(doc: Document): Map<string, { colour: number; iconFile: string }> {
  const map = new Map<string, { colour: number; iconFile: string }>();
  for (const el of Array.from(doc.querySelectorAll('EntityTypeCollection > EntityType'))) {
    const name = el.getAttribute('Name') || '';
    const colour = parseInt(el.getAttribute('Colour') || '0', 10);
    const iconFile = el.getAttribute('IconFile') || '';
    if (name) map.set(name, { colour, iconFile });
  }
  return map;
}

function buildLinkTypeLookup(doc: Document): Map<string, { colour: number }> {
  const map = new Map<string, { colour: number }>();
  for (const el of Array.from(doc.querySelectorAll('LinkTypeCollection > LinkType'))) {
    const name = el.getAttribute('Name') || '';
    const colour = parseInt(el.getAttribute('Colour') || '0', 10);
    if (name) map.set(name, { colour });
  }
  return map;
}

function buildDbPropertyTypeLookup(doc: Document): Map<string, { name: string; dataType: string }> {
  const map = new Map<string, { name: string; dataType: string }>();
  for (const el of Array.from(doc.querySelectorAll('DatabasePropertyType'))) {
    const id = el.getAttribute('Id') || '';
    const name = el.getAttribute('Name') || '';
    const dataType = el.getAttribute('DataType') || 'AttText';
    if (id) map.set(id, { name, dataType });
  }
  return map;
}

function buildAttributeClassLookup(doc: Document): Map<string, { name: string; type: string }> {
  const map = new Map<string, { name: string; type: string }>();
  for (const el of Array.from(doc.querySelectorAll('AttributeClassCollection > AttributeClass'))) {
    const id = el.getAttribute('Id') || '';
    const name = el.getAttribute('Name') || '';
    const type = el.getAttribute('Type') || 'AttText';
    if (id) map.set(id, { name, type });
  }
  return map;
}

/** Parse lcx:LibraryCatalogue type hierarchy → Map<TypeName, non-abstract ancestor names[]> */
function parseTypeHierarchy(doc: Document): Map<string, string[]> {
  interface TypeEntry {
    guid: string;
    name: string;
    parentGuid: string | null;
    isAbstract: boolean;
  }

  const types: TypeEntry[] = [];
  // lcx:Type elements live inside lcx:LibraryCatalogue
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    if (el.localName !== 'Type' || !el.getAttribute('tGUID')) continue;
    const guid = el.getAttribute('tGUID')!;
    const name = el.querySelector('TypeName')?.textContent?.trim() || '';
    const parentGuid = el.getAttribute('kindOf') || null;
    const isAbstract = el.getAttribute('abstract') === 'true';
    types.push({ guid, name, parentGuid, isAbstract });
  }

  if (types.length === 0) return new Map();

  const guidToEntry = new Map(types.map(te => [te.guid, te]));
  const result = new Map<string, string[]>();

  for (const entry of types) {
    if (entry.isAbstract) continue;
    const ancestors: string[] = [];
    let current = entry.parentGuid ? guidToEntry.get(entry.parentGuid) : undefined;
    while (current) {
      if (!current.isAbstract && current.name) {
        ancestors.push(current.name);
      }
      current = current.parentGuid ? guidToEntry.get(current.parentGuid) : undefined;
    }
    result.set(entry.name, ancestors);
  }
  return result;
}

// Fields to skip when importing DatabaseProperties
const SKIP_DB_PROPERTIES = new Set([
  'Icon', 'Grade', 'TextChart Source Reference', 'TextChart Source Type',
  'TextChart Source Link', 'TextChart Occurrences',
]);

// ============================================================================
// MAIN IMPORT
// ============================================================================

export async function importANX(
  content: string,
  targetDossierId: DossierId,
): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    elementsImported: 0,
    linksImported: 0,
    assetsImported: 0,
    reportImported: false,
    errors: [],
    warnings: [],
  };

  try {
    const parser = new DOMParser();
    const sanitized = sanitizeANXContent(content);
    const doc = parser.parseFromString(sanitized, 'application/xml');

    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      result.errors.push(t('errors.parseError'));
      return result;
    }

    const chart = doc.documentElement;
    if (!chart || chart.localName !== 'Chart') {
      result.errors.push(t('errors.invalidChart'));
      return result;
    }

    // Build lookup tables
    const strengthLookup = buildStrengthLookup(doc);
    const entityTypeLookup = buildEntityTypeLookup(doc);
    const linkTypeLookup = buildLinkTypeLookup(doc);
    const dbPropTypeLookup = buildDbPropertyTypeLookup(doc);
    const attrClassLookup = buildAttributeClassLookup(doc);
    const typeHierarchy = parseTypeHierarchy(doc);

    // EntityId → ElementId mapping
    const entityIdMap = new Map<string, ElementId>();

    const chartItems = Array.from(doc.querySelectorAll('ChartItemCollection > ChartItem'));

    // ================================================================
    // PASS 1: ENTITIES
    // ================================================================
    for (const ci of chartItems) {
      const endEl = ci.querySelector('End');
      const entityEl = endEl?.querySelector('Entity');
      if (!endEl || !entityEl) continue;

      const entityId = entityEl.getAttribute('EntityId');
      if (!entityId) {
        result.warnings.push(t('warnings.entityNoId'));
        continue;
      }

      const newId = generateUUID() as ElementId;
      entityIdMap.set(entityId, newId);

      // ── Label ──
      const labelIsIdentity = entityEl.getAttribute('LabelIsIdentity') === 'true';
      const identity = entityEl.getAttribute('Identity') || '';
      const chartLabel = ci.getAttribute('Label') || '';
      const label = (labelIsIdentity && identity ? identity : chartLabel) || identity || chartLabel || `Entity ${entityId}`;

      // ── Notes (Description + Card[0].Text) ──
      const description = ci.getAttribute('Description') || '';
      const cards = Array.from(entityEl.querySelectorAll('CardCollection > Card'));
      const card0Text = cards.length > 0 ? (cards[0].getAttribute('Text') || '') : '';
      const notes = [description, card0Text].filter(Boolean).join('\n').trim();

      // ── Position ──
      const x = parseFloat(endEl.getAttribute('X') || '0');
      const y = parseFloat(endEl.getAttribute('Y') || '0');

      // ── IconStyle ──
      const iconStyle = entityEl.querySelector('IconStyle');
      const enlargement = iconStyle?.getAttribute('Enlargement') || null;
      const typeName = iconStyle?.getAttribute('Type') || '';

      // ── EntityType lookup ──
      const entityType = entityTypeLookup.get(typeName);
      const iconFile = entityType?.iconFile ?? '';

      // ── Color ──
      let color = DEFAULT_ELEMENT_VISUAL.color;
      if (entityType && entityType.colour !== 0) {
        color = colorrefToHex(entityType.colour);
      }

      // ── Border color (FrameStyle) ──
      const frameStyle = iconStyle?.querySelector('FrameStyle');
      let borderColor = darkenColor(color);
      if (frameStyle) {
        const frameColour = parseInt(frameStyle.getAttribute('Colour') || '0', 10);
        if (frameColour !== 0) {
          borderColor = colorrefToHex(frameColour);
        }
      }

      // ── Tags ──
      const tags: string[] = ['i2'];
      if (typeName) tags.push(typeName);
      const ancestors = typeHierarchy.get(typeName);
      if (ancestors) {
        for (const a of ancestors) {
          if (!tags.includes(a)) tags.push(a);
        }
      }

      // ── Confidence ──
      const gradeOne = parseInt(ci.getAttribute('GradeOneIndex') || '0', 10);
      const confidence = mapGradeToConfidence(gradeOne);

      // ── Properties ──
      const properties: Property[] = [];

      // Grade 2 & 3
      const gradeTwo = parseInt(ci.getAttribute('GradeTwoIndex') || '0', 10);
      const gradeThree = parseInt(ci.getAttribute('GradeThreeIndex') || '0', 10);
      if (gradeTwo > 0) properties.push({ key: 'i2_info_reliability', value: gradeTwo, type: 'number' });
      if (gradeThree > 0) properties.push({ key: 'i2_handling_code', value: gradeThree, type: 'number' });

      // DatabaseProperties
      for (const dbProp of Array.from(entityEl.querySelectorAll('DatabaseProperty'))) {
        const refId = dbProp.getAttribute('DatabasePropertyTypeReference') || '';
        const propName = dbProp.getAttribute('DatabasePropertyType') || '';
        const value = dbProp.getAttribute('Value') || '';
        if (!value) continue;

        const dbDef = dbPropTypeLookup.get(refId);
        const key = propName || dbDef?.name || refId;
        if (SKIP_DB_PROPERTIES.has(key)) continue;

        const propType = mapDataType(dbDef?.dataType || 'AttText');
        properties.push({ key, value, type: propType });
      }

      // AttributeCollection
      for (const attr of Array.from(ci.querySelectorAll('AttributeCollection > Attribute'))) {
        const refId = attr.getAttribute('AttributeClassReference') || '';
        const className = attr.getAttribute('AttributeClass') || '';
        const value = attr.getAttribute('Value') || '';
        if (!value) continue;

        const acDef = attrClassLookup.get(refId);
        const key = className || acDef?.name || refId;
        const propType = mapDataType(acDef?.type || 'AttText');
        properties.push({ key, value, type: propType });
      }

      // i2 entity ID for traceability
      properties.push({ key: 'i2_entity_id', value: entityId, type: 'text' });

      // ── Source & Date from Card[0] ──
      let source = 'i2 ANB';
      let date: Date | null = null;
      if (cards.length > 0) {
        const card0 = cards[0];
        const dateStr = card0.getAttribute('DateTime');
        if (dateStr && card0.getAttribute('DateSet') === 'true') {
          const parsed = new Date(dateStr);
          if (!isNaN(parsed.getTime())) date = parsed;
        }
        const srcRef = card0.getAttribute('SourceReference') || '';
        const srcType = card0.getAttribute('SourceType') || '';
        if (srcRef || srcType) {
          source = [srcType, srcRef].filter(Boolean).join(' — ');
        }
      }

      // Also check ChartItem-level source
      const ciSrcRef = ci.getAttribute('SourceReference') || '';
      const ciSrcType = ci.getAttribute('SourceType') || '';
      if (source === 'i2 ANB' && (ciSrcRef || ciSrcType)) {
        source = [ciSrcType, ciSrcRef].filter(Boolean).join(' — ');
      }

      // ── Events from all Cards ──
      const events: ElementEvent[] = [];
      for (let c = 0; c < cards.length; c++) {
        const card = cards[c];
        const eDateStr = card.getAttribute('DateTime');
        if (!eDateStr) continue;
        const eDate = new Date(eDateStr);
        if (isNaN(eDate.getTime())) continue;

        const eSrcRef = card.getAttribute('SourceReference') || '';
        const eSrcType = card.getAttribute('SourceType') || '';

        events.push({
          id: generateUUID(),
          date: eDate,
          label: card.getAttribute('Summary') || `Event ${c}`,
          description: card.getAttribute('Text') || undefined,
          source: [eSrcType, eSrcRef].filter(Boolean).join(' — ') || undefined,
        });
      }

      // ── Build Element ──
      const element: Element = {
        id: newId,
        dossierId: targetDossierId,
        label,
        notes,
        tags,
        properties,
        confidence,
        source,
        date,
        dateRange: null,
        position: { x: isNaN(x) ? 0 : x, y: isNaN(y) ? 0 : y },
        isPositionLocked: false,
        geo: null,
        events,
        visual: {
          ...DEFAULT_ELEMENT_VISUAL,
          color,
          borderColor,
          size: mapEnlargementToSize(enlargement),
          icon: mapIconFile(iconFile),
        },
        assetIds: [],
        parentGroupId: null,
        isGroup: false,
        isAnnotation: false,
        childIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.elements.add(element);
      result.elementsImported++;
    }

    // ================================================================
    // PASS 2: LINKS
    // ================================================================
    for (const ci of chartItems) {
      const linkEl = ci.querySelector('Link');
      if (!linkEl) continue;

      const end1Id = linkEl.getAttribute('End1Id');
      const end2Id = linkEl.getAttribute('End2Id');
      if (!end1Id || !end2Id) {
        result.warnings.push(t('warnings.linkNoEndpoints'));
        continue;
      }

      const fromId = entityIdMap.get(end1Id);
      const toId = entityIdMap.get(end2Id);
      if (!fromId || !toId) {
        result.warnings.push(t('warnings.linkMissingEntity'));
        continue;
      }

      const linkLabel = ci.getAttribute('Label') || '';
      const linkNotes = ci.getAttribute('Description') || '';

      // ── LinkStyle ──
      const linkStyleEl = linkEl.querySelector('LinkStyle');
      const arrowStyle = linkStyleEl?.getAttribute('ArrowStyle') || 'ArrowNone';
      const lineWidth = parseInt(linkStyleEl?.getAttribute('LineWidth') || '1', 10);
      const strengthName = linkStyleEl?.getAttribute('Strength') || '';
      const typeName = linkStyleEl?.getAttribute('Type') || '';

      const direction = mapArrowDirection(arrowStyle);

      // ── Color: LineColour > LinkType.Colour ──
      let linkColor = DEFAULT_LINK_VISUAL.color;
      const lineColourAttr = linkStyleEl?.getAttribute('LineColour');
      if (lineColourAttr != null) {
        const lineColour = parseInt(lineColourAttr, 10);
        if (lineColour !== 0) linkColor = colorrefToHex(lineColour);
      }
      if (linkColor === DEFAULT_LINK_VISUAL.color && typeName) {
        const lt = linkTypeLookup.get(typeName);
        if (lt && lt.colour !== 0) linkColor = colorrefToHex(lt.colour);
      }

      // ── Style from Strength ──
      let style: LinkStyle = 'solid';
      if (strengthName) {
        const strength = strengthLookup.get(strengthName);
        if (strength) style = mapDotStyleToLinkStyle(strength.dotStyle);
      }

      // ── Tags ──
      const linkTags: string[] = ['i2'];
      if (typeName) linkTags.push(typeName);
      if (strengthName) linkTags.push(strengthName);

      // ── Confidence ──
      const gradeOne = parseInt(ci.getAttribute('GradeOneIndex') || '0', 10);

      // ── Link properties ──
      const linkProperties: Property[] = [];
      for (const dbProp of Array.from(linkEl.querySelectorAll('DatabaseProperty'))) {
        const refId = dbProp.getAttribute('DatabasePropertyTypeReference') || '';
        const propName = dbProp.getAttribute('DatabasePropertyType') || '';
        const value = dbProp.getAttribute('Value') || '';
        if (!value) continue;

        const dbDef = dbPropTypeLookup.get(refId);
        const key = propName || dbDef?.name || refId;
        if (SKIP_DB_PROPERTIES.has(key)) continue;

        linkProperties.push({ key, value, type: mapDataType(dbDef?.dataType || 'AttText') });
      }

      // ── Source & Date from Card[0] ──
      let linkSource = 'i2 ANB';
      let linkDate: Date | null = null;
      const linkCards = Array.from(linkEl.querySelectorAll('CardCollection > Card'));
      if (linkCards.length > 0) {
        const card0 = linkCards[0];
        const dateStr = card0.getAttribute('DateTime');
        if (dateStr && card0.getAttribute('DateSet') === 'true') {
          const parsed = new Date(dateStr);
          if (!isNaN(parsed.getTime())) linkDate = parsed;
        }
        const srcRef = card0.getAttribute('SourceReference') || '';
        const srcType = card0.getAttribute('SourceType') || '';
        if (srcRef || srcType) linkSource = [srcType, srcRef].filter(Boolean).join(' — ');
      }

      // ── Build Link ──
      const link: Link = {
        id: generateUUID() as LinkId,
        dossierId: targetDossierId,
        fromId,
        toId,
        sourceHandle: null,
        targetHandle: null,
        label: linkLabel,
        notes: linkNotes,
        tags: linkTags,
        properties: linkProperties,
        confidence: mapGradeToConfidence(gradeOne),
        source: linkSource,
        date: linkDate,
        dateRange: null,
        directed: direction !== 'none',
        direction,
        visual: {
          ...DEFAULT_LINK_VISUAL,
          color: linkColor,
          style,
          thickness: Math.max(1, Math.min(10, lineWidth)),
        },
        curveOffset: { x: 0, y: 0 },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.links.add(link);
      result.linksImported++;
    }

    // ── Dossier metadata ──
    const defaultDate = chart.getAttribute('DefaultDate');
    if (defaultDate) {
      const dossier = await db.dossiers.get(targetDossierId);
      if (dossier) {
        const metaText = `[i2 ANB] Default date: ${defaultDate}`;
        const existing = dossier.description?.trim();
        await db.dossiers.update(targetDossierId, {
          description: existing ? `${existing}\n${metaText}` : metaText,
          updatedAt: new Date(),
        });
      }
    }

    await db.dossiers.update(targetDossierId, { updatedAt: new Date() });
    result.success = result.elementsImported > 0;
  } catch (error) {
    result.errors.push(t('errors.importError', {
      message: error instanceof Error ? error.message : t('errors.unknownError'),
    }));
  }

  return result;
}
