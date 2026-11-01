/**
 * Link <-> Y.Map mapper for Yjs collaboration
 *
 * IMPORTANT: Yjs nested types (Y.Text, Y.Array, Y.Map) can only be read/written
 * AFTER they are added to a Y.Doc. For initial creation (migration), we use
 * primitive values. For updates to existing maps, we use Y types.
 */

import * as Y from 'yjs';
import type { Link, LinkVisual, Position, Property } from '../../types';
import { DEFAULT_LINK_VISUAL } from '../../types';
import { dateToYjs, dateFromYjs, dateRangeToYjs, dateRangeFromYjs, yFields, type YMeta, type YStored } from '../../types/yjs';
import { sanitizeEvaluation } from '../../utils/evaluation';

// ============================================================================
// LINK -> Y.MAP (FOR MIGRATION - uses primitive values)
// ============================================================================

/**
 * Convert a Link to a Y.Map for initial insertion into Y.Doc.
 * Uses primitive values that can be set before the map is added to a document.
 */
export function linkToYMap(link: Link): Y.Map<unknown> {
  const map = new Y.Map();

  // Simple fields (primitives)
  map.set('id', link.id);
  map.set('dossierId', link.dossierId);
  map.set('fromId', link.fromId);
  map.set('toId', link.toId);
  map.set('sourceHandle', link.sourceHandle);
  map.set('targetHandle', link.targetHandle);
  map.set('anchorMode', link.anchorMode ?? null);
  map.set('label', link.label);
  map.set('directed', link.directed);
  map.set('direction', link.direction);
  map.set('confidence', link.confidence);
  map.set('evaluation', link.evaluation ?? null);
  map.set('source', link.source);
  map.set('date', dateToYjs(link.date));

  // Notes as plain string
  map.set('notes', link.notes || '');

  // Tags as plain array
  map.set('tags', Array.isArray(link.tags) ? link.tags : []);

  // Properties as plain array of objects
  const props = Array.isArray(link.properties) ? link.properties : [];
  map.set('properties', props.map(prop => ({
    key: prop.key,
    value: serializePropertyValue(prop.value),
    type: prop.type || 'text',
    ...(prop.timeZone ? { timeZone: prop.timeZone } : {}),
  })));

  // DateRange as plain object or null
  map.set('dateRange', dateRangeToYjs(link.dateRange));

  // Visual as plain object
  map.set('visual', {
    color: link.visual.color,
    style: link.visual.style,
    thickness: link.visual.thickness,
    fontSize: link.visual.fontSize,
  });

  // CurveOffset as plain object
  map.set('curveOffset', {
    x: link.curveOffset.x,
    y: link.curveOffset.y,
  });
  map.set('orthogonalOffset', link.orthogonalOffset
    ? { x: link.orthogonalOffset.x, y: link.orthogonalOffset.y }
    : null);

  // Metadata
  map.set('_meta', {
    createdAt: dateToYjs(link.createdAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return map;
}

// ============================================================================
// Y.MAP -> LINK
// ============================================================================

/**
 * Convert a Y.Map to a Link.
 * Handles both Y types and primitive values (for backward compatibility).
 */
export function yMapToLink(ymap: Y.Map<unknown>): Link {
  const notesRaw = ymap.get('notes');
  const tagsRaw = ymap.get('tags');
  const propsRaw = ymap.get('properties');
  const dateRangeRaw = ymap.get('dateRange');
  const visualRaw = ymap.get('visual');
  const curveRaw = ymap.get('curveOffset');
  const orthogonalRaw = ymap.get('orthogonalOffset');
  const metaRaw = ymap.get('_meta');

  // Handle notes - can be Y.Text, plain string, or undefined
  const notes = notesRaw instanceof Y.Text
    ? notesRaw.toString()
    : (typeof notesRaw === 'string' ? notesRaw : '');

  // Handle tags - can be Y.Array or plain array
  const tags = tagsRaw instanceof Y.Array
    ? tagsRaw.toArray()
    : (Array.isArray(tagsRaw) ? tagsRaw : []);

  // Handle properties - can be Y.Array of Y.Map or plain array
  let properties: Property[] = [];
  if (propsRaw instanceof Y.Array) {
    properties = propsRaw.toArray().map((item) => {
      if (item instanceof Y.Map) {
        return parsePropertyFromYMap(item);
      }
      return parsePropertyFromPlain(item);
    });
  } else if (Array.isArray(propsRaw)) {
    properties = propsRaw.map(parsePropertyFromPlain);
  }

  // Handle dateRange - can be Y.Map, plain object, or null
  const dateRange = dateRangeFromYjs(dateRangeRaw);

  // Handle visual - can be Y.Map or plain object
  let visual = { ...DEFAULT_LINK_VISUAL };
  if (visualRaw instanceof Y.Map) {
    const v = yFields<LinkVisual>(visualRaw);
    visual = {
      color: v.get('color') ?? DEFAULT_LINK_VISUAL.color,
      style: v.get('style') ?? DEFAULT_LINK_VISUAL.style,
      thickness: v.get('thickness') ?? DEFAULT_LINK_VISUAL.thickness,
      fontSize: v.get('fontSize'),
    };
  } else if (visualRaw && typeof visualRaw === 'object') {
    const v = visualRaw as Partial<LinkVisual>;
    visual = {
      color: v.color ?? DEFAULT_LINK_VISUAL.color,
      style: v.style ?? DEFAULT_LINK_VISUAL.style,
      thickness: v.thickness ?? DEFAULT_LINK_VISUAL.thickness,
      fontSize: v.fontSize,
    };
  }

  // Handle curveOffset - can be Y.Map or plain object
  let curveOffset = { x: 0, y: 0 };
  if (curveRaw instanceof Y.Map) {
    const c = yFields<Position>(curveRaw);
    curveOffset = { x: c.get('x') ?? 0, y: c.get('y') ?? 0 };
  } else if (curveRaw && typeof curveRaw === 'object') {
    const c = curveRaw as Partial<Position>;
    curveOffset = { x: c.x ?? 0, y: c.y ?? 0 };
  }

  // Handle orthogonalOffset - plain object, null or absent (older links)
  const orthogonalOffset = orthogonalRaw && typeof orthogonalRaw === 'object'
    ? { x: (orthogonalRaw as Partial<Position>).x ?? 0, y: (orthogonalRaw as Partial<Position>).y ?? 0 }
    : undefined;

  // Handle metadata - can be Y.Map or plain object
  let createdAt = new Date();
  let updatedAt = new Date();
  if (metaRaw instanceof Y.Map) {
    const m = yFields<YMeta>(metaRaw);
    createdAt = dateFromYjs(m.get('createdAt')) || new Date();
    updatedAt = dateFromYjs(m.get('updatedAt')) || new Date();
  } else if (metaRaw && typeof metaRaw === 'object') {
    const m = metaRaw as Partial<YMeta>;
    createdAt = dateFromYjs(m.createdAt) || new Date();
    updatedAt = dateFromYjs(m.updatedAt) || new Date();
  }

  const fields = yFields<YStored<Link>>(ymap);
  return {
    id: fields.get('id') || '',
    dossierId: fields.get('dossierId') || '',
    fromId: fields.get('fromId') || '',
    toId: fields.get('toId') || '',
    sourceHandle: fields.get('sourceHandle') ?? null,
    targetHandle: fields.get('targetHandle') ?? null,
    anchorMode: fields.get('anchorMode') ?? undefined,
    label: fields.get('label') || '',
    notes,
    tags,
    properties,
    directed: fields.get('directed') ?? false,
    direction: fields.get('direction') ?? 'none',
    confidence: fields.get('confidence') ?? null,
    evaluation: readEvaluation(fields.get('evaluation')),
    source: fields.get('source') || '',
    date: dateFromYjs(fields.get('date')),
    dateRange,
    visual,
    curveOffset,
    orthogonalOffset,
    createdAt,
    updatedAt,
  };
}

// ============================================================================
// PARTIAL UPDATE HELPERS
// ============================================================================

/**
 * Apply partial changes to an existing link Y.Map.
 * The map must already be part of a Y.Doc for this to work.
 */
export function updateLinkYMap(
  ymap: Y.Map<unknown>,
  changes: Omit<Partial<Link>, 'visual'> & { visual?: Partial<LinkVisual> },
  ydoc: Y.Doc
): void {
  ydoc.transact(() => {
    if (changes.fromId !== undefined) {
      ymap.set('fromId', changes.fromId);
    }

    if (changes.toId !== undefined) {
      ymap.set('toId', changes.toId);
    }

    if (changes.sourceHandle !== undefined) {
      ymap.set('sourceHandle', changes.sourceHandle);
    }

    if (changes.targetHandle !== undefined) {
      ymap.set('targetHandle', changes.targetHandle);
    }

    if (changes.anchorMode !== undefined) {
      ymap.set('anchorMode', changes.anchorMode);
    }

    if (changes.label !== undefined) {
      ymap.set('label', changes.label);
    }

    if (changes.notes !== undefined) {
      // Store as plain string
      ymap.set('notes', changes.notes);
    }

    if (changes.tags !== undefined) {
      ymap.set('tags', changes.tags);
    }

    if (changes.properties !== undefined) {
      const cp = Array.isArray(changes.properties) ? changes.properties : [];
      ymap.set('properties', cp.map(prop => ({
        key: prop.key,
        value: serializePropertyValue(prop.value),
        type: prop.type || 'text',
        ...(prop.timeZone ? { timeZone: prop.timeZone } : {}),
      })));
    }

    if (changes.directed !== undefined) {
      ymap.set('directed', changes.directed);
    }

    if (changes.direction !== undefined) {
      ymap.set('direction', changes.direction);
    }

    if (changes.confidence !== undefined) {
      ymap.set('confidence', changes.confidence);
    }

    if (changes.evaluation !== undefined) {
      ymap.set('evaluation', changes.evaluation ?? null);
    }

    if (changes.source !== undefined) {
      ymap.set('source', changes.source);
    }

    if (changes.date !== undefined) {
      ymap.set('date', dateToYjs(changes.date));
    }

    if (changes.dateRange !== undefined) {
      ymap.set('dateRange', dateRangeToYjs(changes.dateRange));
    }

    if (changes.visual !== undefined) {
      const currentVisual = ymap.get('visual') || {};
      const newVisual = typeof currentVisual === 'object' && !(currentVisual instanceof Y.Map)
        ? { ...currentVisual, ...changes.visual }
        : { ...changes.visual };
      ymap.set('visual', newVisual);
    }

    if (changes.curveOffset !== undefined) {
      ymap.set('curveOffset', {
        x: changes.curveOffset.x,
        y: changes.curveOffset.y,
      });
    }

    if (changes.orthogonalOffset !== undefined) {
      ymap.set('orthogonalOffset', changes.orthogonalOffset
        ? { x: changes.orthogonalOffset.x, y: changes.orthogonalOffset.y }
        : null);
    }

    // Always update updatedAt
    const currentMeta = ymap.get('_meta') || {};
    const newMeta = typeof currentMeta === 'object' && !(currentMeta instanceof Y.Map)
      ? { ...currentMeta, updatedAt: new Date().toISOString() }
      : { updatedAt: new Date().toISOString() };
    ymap.set('_meta', newMeta);
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** A property as stored: value serialized (dates as { _type: 'date', value }) */
interface YProperty {
  key: string;
  value: unknown;
  type: Property['type'];
  timeZone?: string;
}

function parsePropertyFromYMap(map: Y.Map<unknown>): Property {
  const ymap = yFields<YProperty>(map);
  return {
    key: ymap.get('key') || '',
    value: deserializePropertyValue(ymap.get('value')),
    type: ymap.get('type') || 'text',
    ...propertyTimeZone(ymap.get('timeZone')),
  };
}

function parsePropertyFromPlain(raw: unknown): Property {
  const obj = raw as Partial<YProperty>;
  return {
    key: obj.key || '',
    value: deserializePropertyValue(obj.value),
    type: obj.type || 'text',
    ...propertyTimeZone(obj.timeZone),
  };
}

/** Source zone of a property, only written when set so older peers see the same shape */
function propertyTimeZone(raw: unknown): Pick<Property, 'timeZone'> {
  return typeof raw === 'string' && raw ? { timeZone: raw } : {};
}

function serializePropertyValue(value: Property['value']): unknown {
  if (value instanceof Date) {
    return { _type: 'date', value: value.toISOString() };
  }
  return value;
}

function deserializePropertyValue(value: unknown): Property['value'] {
  if (value && typeof value === 'object' && (value as { _type?: unknown })._type === 'date') {
    return new Date((value as { value: string }).value);
  }
  return value as Property['value'];
}

/** Evaluation stored as a plain object (or a Y.Map, should a peer write one) */
function readEvaluation(raw: unknown) {
  return sanitizeEvaluation(raw instanceof Y.Map ? raw.toJSON() : raw);
}
