/**
 * Element <-> Y.Map mapper for Yjs collaboration
 *
 * IMPORTANT: Yjs nested types (Y.Text, Y.Array, Y.Map) can only be read/written
 * AFTER they are added to a Y.Doc. For initial creation (migration), we use
 * primitive values. For updates to existing maps, we use Y types.
 */

import * as Y from 'yjs';
import type { Element, ElementEvent, Property } from '../../types';
import { DEFAULT_ELEMENT_VISUAL } from '../../types';
import { dateToYjs, dateFromYjs } from '../../types/yjs';

// ============================================================================
// ELEMENT -> Y.MAP (FOR MIGRATION - uses primitive values)
// ============================================================================

/**
 * Convert an Element to a Y.Map for initial insertion into Y.Doc.
 * Uses primitive values that can be set before the map is added to a document.
 * After the map is in the document, nested Y types will be converted on first update.
 */
export function elementToYMap(element: Element): Y.Map<any> {
  const map = new Y.Map();

  // Simple fields (primitives)
  map.set('id', element.id);
  map.set('investigationId', element.investigationId);
  map.set('label', element.label);
  map.set('confidence', element.confidence);
  map.set('source', element.source);
  map.set('date', dateToYjs(element.date));
  map.set('parentGroupId', element.parentGroupId);
  map.set('isGroup', element.isGroup);

  // Notes as plain string (will be converted to Y.Text on first update)
  map.set('notes', element.notes || '');

  // Tags as plain array (will be converted to Y.Array on first update)
  map.set('tags', element.tags);

  // Properties as plain array of objects
  map.set('properties', element.properties.map(prop => ({
    key: prop.key,
    value: serializePropertyValue(prop.value),
    type: prop.type || 'text',
  })));

  // Position as plain object
  map.set('position', { x: element.position.x, y: element.position.y });

  // DateRange as plain object or null
  map.set('dateRange', element.dateRange ? {
    start: dateToYjs(element.dateRange.start),
    end: dateToYjs(element.dateRange.end),
  } : null);

  // Geo as plain object or null
  map.set('geo', element.geo ? {
    lat: element.geo.lat,
    lng: element.geo.lng,
  } : null);

  // Events as plain array of objects
  map.set('events', element.events.map(eventToPlainObject));

  // Visual as plain object
  map.set('visual', {
    color: element.visual.color,
    borderColor: element.visual.borderColor,
    shape: element.visual.shape,
    size: element.visual.size,
    icon: element.visual.icon,
    image: element.visual.image,
    customWidth: element.visual.customWidth,
    customHeight: element.visual.customHeight,
  });

  // AssetIds as plain array
  map.set('assetIds', element.assetIds);

  // ChildIds as plain array
  map.set('childIds', element.childIds);

  // Metadata
  map.set('_meta', {
    createdAt: dateToYjs(element.createdAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return map;
}

// ============================================================================
// Y.MAP -> ELEMENT
// ============================================================================

/**
 * Convert a Y.Map to an Element.
 * Handles both Y types and primitive values (for backward compatibility).
 */
export function yMapToElement(ymap: Y.Map<any>): Element {
  const notesRaw = ymap.get('notes');
  const tagsRaw = ymap.get('tags');
  const propsRaw = ymap.get('properties');
  const posRaw = ymap.get('position');
  const dateRangeRaw = ymap.get('dateRange');
  const geoRaw = ymap.get('geo');
  const eventsRaw = ymap.get('events');
  const visualRaw = ymap.get('visual');
  const assetIdsRaw = ymap.get('assetIds');
  const childIdsRaw = ymap.get('childIds');
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

  // Handle position - can be Y.Map or plain object
  let position = { x: 0, y: 0 };
  if (posRaw instanceof Y.Map) {
    position = { x: posRaw.get('x') ?? 0, y: posRaw.get('y') ?? 0 };
  } else if (posRaw && typeof posRaw === 'object') {
    position = { x: posRaw.x ?? 0, y: posRaw.y ?? 0 };
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

  // Handle geo - can be Y.Map, plain object, or null
  let geo = null;
  if (geoRaw instanceof Y.Map) {
    geo = { lat: geoRaw.get('lat') ?? 0, lng: geoRaw.get('lng') ?? 0 };
  } else if (geoRaw && typeof geoRaw === 'object') {
    geo = { lat: geoRaw.lat ?? 0, lng: geoRaw.lng ?? 0 };
  }

  // Handle events - can be Y.Array or plain array
  let events: ElementEvent[] = [];
  if (eventsRaw instanceof Y.Array) {
    events = eventsRaw.toArray().map((item: any) => {
      if (item instanceof Y.Map) {
        return yMapToEvent(item);
      }
      return plainObjectToEvent(item);
    });
  } else if (Array.isArray(eventsRaw)) {
    events = eventsRaw.map(plainObjectToEvent);
  }

  // Handle visual - can be Y.Map or plain object
  let visual = { ...DEFAULT_ELEMENT_VISUAL };
  if (visualRaw instanceof Y.Map) {
    visual = {
      color: visualRaw.get('color') ?? DEFAULT_ELEMENT_VISUAL.color,
      borderColor: visualRaw.get('borderColor') ?? DEFAULT_ELEMENT_VISUAL.borderColor,
      shape: visualRaw.get('shape') ?? DEFAULT_ELEMENT_VISUAL.shape,
      size: visualRaw.get('size') ?? DEFAULT_ELEMENT_VISUAL.size,
      icon: visualRaw.get('icon') ?? null,
      image: visualRaw.get('image') ?? null,
      customWidth: visualRaw.get('customWidth'),
      customHeight: visualRaw.get('customHeight'),
    };
  } else if (visualRaw && typeof visualRaw === 'object') {
    visual = {
      color: visualRaw.color ?? DEFAULT_ELEMENT_VISUAL.color,
      borderColor: visualRaw.borderColor ?? DEFAULT_ELEMENT_VISUAL.borderColor,
      shape: visualRaw.shape ?? DEFAULT_ELEMENT_VISUAL.shape,
      size: visualRaw.size ?? DEFAULT_ELEMENT_VISUAL.size,
      icon: visualRaw.icon ?? null,
      image: visualRaw.image ?? null,
      customWidth: visualRaw.customWidth,
      customHeight: visualRaw.customHeight,
    };
  }

  // Handle assetIds - can be Y.Array or plain array
  const assetIds = assetIdsRaw instanceof Y.Array
    ? assetIdsRaw.toArray()
    : (Array.isArray(assetIdsRaw) ? assetIdsRaw : []);

  // Handle childIds - can be Y.Array or plain array
  const childIds = childIdsRaw instanceof Y.Array
    ? childIdsRaw.toArray()
    : (Array.isArray(childIdsRaw) ? childIdsRaw : []);

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
    label: ymap.get('label') || '',
    notes,
    tags,
    properties,
    confidence: ymap.get('confidence') ?? null,
    source: ymap.get('source') || '',
    date: dateFromYjs(ymap.get('date')),
    dateRange,
    position,
    geo,
    events,
    visual,
    assetIds,
    parentGroupId: ymap.get('parentGroupId') ?? null,
    isGroup: ymap.get('isGroup') ?? false,
    childIds,
    createdAt,
    updatedAt,
  };
}

// ============================================================================
// PARTIAL UPDATE HELPERS
// ============================================================================

/**
 * Apply partial changes to an existing element Y.Map.
 * The map must already be part of a Y.Doc for this to work.
 */
export function updateElementYMap(
  ymap: Y.Map<any>,
  changes: Partial<Element>,
  ydoc: Y.Doc
): void {
  ydoc.transact(() => {
    if (changes.label !== undefined) {
      ymap.set('label', changes.label);
    }

    if (changes.notes !== undefined) {
      // Store as plain string - collaborative text editing would need different approach
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

    if (changes.position !== undefined) {
      ymap.set('position', { x: changes.position.x, y: changes.position.y });
    }

    if (changes.geo !== undefined) {
      ymap.set('geo', changes.geo ? {
        lat: changes.geo.lat,
        lng: changes.geo.lng,
      } : null);
    }

    if (changes.visual !== undefined) {
      const currentVisual = ymap.get('visual') || {};
      const newVisual = typeof currentVisual === 'object' && !(currentVisual instanceof Y.Map)
        ? { ...currentVisual, ...changes.visual }
        : { ...changes.visual };
      ymap.set('visual', newVisual);
    }

    if (changes.events !== undefined) {
      ymap.set('events', changes.events.map(eventToPlainObject));
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

    if (changes.assetIds !== undefined) {
      ymap.set('assetIds', changes.assetIds);
    }

    if (changes.parentGroupId !== undefined) {
      ymap.set('parentGroupId', changes.parentGroupId);
    }

    if (changes.isGroup !== undefined) {
      ymap.set('isGroup', changes.isGroup);
    }

    if (changes.childIds !== undefined) {
      ymap.set('childIds', changes.childIds);
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

function eventToPlainObject(event: ElementEvent): any {
  return {
    id: event.id,
    date: dateToYjs(event.date),
    dateEnd: dateToYjs(event.dateEnd),
    label: event.label,
    description: event.description || null,
    source: event.source || null,
    geo: event.geo ? { lat: event.geo.lat, lng: event.geo.lng } : null,
    properties: event.properties || null,
  };
}

function plainObjectToEvent(obj: any): ElementEvent {
  return {
    id: obj.id || '',
    date: dateFromYjs(obj.date) || new Date(),
    dateEnd: dateFromYjs(obj.dateEnd) || undefined,
    label: obj.label || '',
    description: obj.description || undefined,
    geo: obj.geo ? { lat: obj.geo.lat ?? 0, lng: obj.geo.lng ?? 0 } : undefined,
    properties: obj.properties || undefined,
    source: obj.source || undefined,
  };
}

function yMapToEvent(ymap: Y.Map<any>): ElementEvent {
  const geoMap = ymap.get('geo');
  let geo = undefined;
  if (geoMap instanceof Y.Map) {
    geo = { lat: geoMap.get('lat') ?? 0, lng: geoMap.get('lng') ?? 0 };
  } else if (geoMap && typeof geoMap === 'object') {
    geo = { lat: geoMap.lat ?? 0, lng: geoMap.lng ?? 0 };
  }

  return {
    id: ymap.get('id') || '',
    date: dateFromYjs(ymap.get('date')) || new Date(),
    dateEnd: dateFromYjs(ymap.get('dateEnd')) || undefined,
    label: ymap.get('label') || '',
    description: ymap.get('description') || undefined,
    geo,
    properties: ymap.get('properties') || undefined,
    source: ymap.get('source') || undefined,
  };
}

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
