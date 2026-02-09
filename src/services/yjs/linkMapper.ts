/**
 * Link <-> Y.Map mapper for Yjs collaboration
 *
 * IMPORTANT: Yjs nested types (Y.Text, Y.Array, Y.Map) can only be read/written
 * AFTER they are added to a Y.Doc. For initial creation (migration), we use
 * primitive values. For updates to existing maps, we use Y types.
 */

import * as Y from 'yjs';
import type { Link, LinkVisual, Property } from '../../types';
import { DEFAULT_LINK_VISUAL } from '../../types';
import { dateToYjs, dateFromYjs } from '../../types/yjs';

// ============================================================================
// LINK -> Y.MAP (FOR MIGRATION - uses primitive values)
// ============================================================================

/**
 * Convert a Link to a Y.Map for initial insertion into Y.Doc.
 * Uses primitive values that can be set before the map is added to a document.
 */
export function linkToYMap(link: Link): Y.Map<any> {
  const map = new Y.Map();

  // Simple fields (primitives)
  map.set('id', link.id);
  map.set('investigationId', link.investigationId);
  map.set('fromId', link.fromId);
  map.set('toId', link.toId);
  map.set('sourceHandle', link.sourceHandle);
  map.set('targetHandle', link.targetHandle);
  map.set('label', link.label);
  map.set('directed', link.directed);
  map.set('direction', link.direction);
  map.set('confidence', link.confidence);
  map.set('source', link.source);
  map.set('date', dateToYjs(link.date));

  // Notes as plain string
  map.set('notes', link.notes || '');

  // Tags as plain array
  map.set('tags', link.tags);

  // Properties as plain array of objects
  map.set('properties', link.properties.map(prop => ({
    key: prop.key,
    value: serializePropertyValue(prop.value),
    type: prop.type || 'text',
  })));

  // DateRange as plain object or null
  map.set('dateRange', link.dateRange ? {
    start: dateToYjs(link.dateRange.start),
    end: dateToYjs(link.dateRange.end),
  } : null);

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
export function yMapToLink(ymap: Y.Map<any>): Link {
  const notesRaw = ymap.get('notes');
  const tagsRaw = ymap.get('tags');
  const propsRaw = ymap.get('properties');
  const dateRangeRaw = ymap.get('dateRange');
  const visualRaw = ymap.get('visual');
  const curveRaw = ymap.get('curveOffset');
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
    properties = propsRaw.toArray().map((item: any) => {
      if (item instanceof Y.Map) {
        return parsePropertyFromYMap(item);
      }
      return parsePropertyFromPlain(item);
    });
  } else if (Array.isArray(propsRaw)) {
    properties = propsRaw.map(parsePropertyFromPlain);
  }

  // Handle dateRange - can be Y.Map, plain object, or null
  let dateRange = null;
  if (dateRangeRaw instanceof Y.Map) {
    dateRange = {
      start: dateFromYjs(dateRangeRaw.get('start')),
      end: dateFromYjs(dateRangeRaw.get('end')),
    };
  } else if (dateRangeRaw && typeof dateRangeRaw === 'object') {
    dateRange = {
      start: dateFromYjs(dateRangeRaw.start),
      end: dateFromYjs(dateRangeRaw.end),
    };
  }

  // Handle visual - can be Y.Map or plain object
  let visual = { ...DEFAULT_LINK_VISUAL };
  if (visualRaw instanceof Y.Map) {
    visual = {
      color: visualRaw.get('color') ?? DEFAULT_LINK_VISUAL.color,
      style: visualRaw.get('style') ?? DEFAULT_LINK_VISUAL.style,
      thickness: visualRaw.get('thickness') ?? DEFAULT_LINK_VISUAL.thickness,
      fontSize: visualRaw.get('fontSize'),
    };
  } else if (visualRaw && typeof visualRaw === 'object') {
    visual = {
      color: visualRaw.color ?? DEFAULT_LINK_VISUAL.color,
      style: visualRaw.style ?? DEFAULT_LINK_VISUAL.style,
      thickness: visualRaw.thickness ?? DEFAULT_LINK_VISUAL.thickness,
      fontSize: visualRaw.fontSize,
    };
  }

  // Handle curveOffset - can be Y.Map or plain object
  let curveOffset = { x: 0, y: 0 };
  if (curveRaw instanceof Y.Map) {
    curveOffset = { x: curveRaw.get('x') ?? 0, y: curveRaw.get('y') ?? 0 };
  } else if (curveRaw && typeof curveRaw === 'object') {
    curveOffset = { x: curveRaw.x ?? 0, y: curveRaw.y ?? 0 };
  }

  // Handle metadata - can be Y.Map or plain object
  let createdAt = new Date();
  let updatedAt = new Date();
  if (metaRaw instanceof Y.Map) {
    createdAt = dateFromYjs(metaRaw.get('createdAt')) || new Date();
    updatedAt = dateFromYjs(metaRaw.get('updatedAt')) || new Date();
  } else if (metaRaw && typeof metaRaw === 'object') {
    createdAt = dateFromYjs(metaRaw.createdAt) || new Date();
    updatedAt = dateFromYjs(metaRaw.updatedAt) || new Date();
  }

  return {
    id: ymap.get('id') || '',
    investigationId: ymap.get('investigationId') || '',
    fromId: ymap.get('fromId') || '',
    toId: ymap.get('toId') || '',
    sourceHandle: ymap.get('sourceHandle') ?? null,
    targetHandle: ymap.get('targetHandle') ?? null,
    label: ymap.get('label') || '',
    notes,
    tags,
    properties,
    directed: ymap.get('directed') ?? false,
    direction: ymap.get('direction') ?? 'none',
    confidence: ymap.get('confidence') ?? null,
    source: ymap.get('source') || '',
    date: dateFromYjs(ymap.get('date')),
    dateRange,
    visual,
    curveOffset,
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
  ymap: Y.Map<any>,
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
      ymap.set('properties', changes.properties.map(prop => ({
        key: prop.key,
        value: serializePropertyValue(prop.value),
        type: prop.type || 'text',
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

    if (changes.source !== undefined) {
      ymap.set('source', changes.source);
    }

    if (changes.date !== undefined) {
      ymap.set('date', dateToYjs(changes.date));
    }

    if (changes.dateRange !== undefined) {
      ymap.set('dateRange', changes.dateRange ? {
        start: dateToYjs(changes.dateRange.start),
        end: dateToYjs(changes.dateRange.end),
      } : null);
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

function parsePropertyFromYMap(ymap: Y.Map<any>): Property {
  return {
    key: ymap.get('key') || '',
    value: deserializePropertyValue(ymap.get('value')),
    type: ymap.get('type') || 'text',
  };
}

function parsePropertyFromPlain(obj: any): Property {
  return {
    key: obj.key || '',
    value: deserializePropertyValue(obj.value),
    type: obj.type || 'text',
  };
}

function serializePropertyValue(value: Property['value']): any {
  if (value instanceof Date) {
    return { _type: 'date', value: value.toISOString() };
  }
  return value;
}

function deserializePropertyValue(value: any): Property['value'] {
  if (value && typeof value === 'object' && value._type === 'date') {
    return new Date(value.value);
  }
  return value;
}
