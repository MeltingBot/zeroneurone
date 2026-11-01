/**
 * CanvasTab <-> Y.Map mapper for Yjs collaboration
 *
 * Synced fields: id, dossierId, name, order, memberElementIds, excludedElementIds, createdAt, updatedAt
 * NOT synced: viewport (each user has their own camera position per tab)
 */

import * as Y from 'yjs';
import type { CanvasTab } from '../../types';
import { dateToYjs, dateFromYjs, yFields, type YStored } from '../../types/yjs';

type YTab = YStored<CanvasTab>;

// ============================================================================
// TAB -> Y.MAP (FOR MIGRATION - uses primitive values)
// ============================================================================

/**
 * Convert a CanvasTab to a Y.Map for initial insertion into Y.Doc.
 * Uses primitive values that can be set before the map is added to a document.
 * Viewport is NOT included — it stays local per user.
 */
export function tabToYMap(tab: CanvasTab): Y.Map<unknown> {
  const map = new Y.Map();

  map.set('id', tab.id);
  map.set('dossierId', tab.dossierId);
  map.set('name', tab.name);
  map.set('order', tab.order);
  map.set('memberElementIds', tab.memberElementIds);
  map.set('excludedElementIds', tab.excludedElementIds);
  map.set('createdAt', dateToYjs(tab.createdAt) || new Date().toISOString());
  map.set('updatedAt', new Date().toISOString());

  return map;
}

// ============================================================================
// Y.MAP -> TAB
// ============================================================================

/**
 * Convert a Y.Map to a CanvasTab.
 * Handles both Y types and primitive values (for backward compatibility).
 * Viewport defaults to {x:0, y:0, zoom:1} since it's not synced.
 */
export function yMapToTab(ymap: Y.Map<unknown>): CanvasTab {
  const memberRaw = ymap.get('memberElementIds');
  const excludedRaw = ymap.get('excludedElementIds');

  const memberElementIds = Array.isArray(memberRaw)
    ? memberRaw
    : memberRaw instanceof Y.Array
      ? memberRaw.toArray()
      : [];

  const excludedElementIds = Array.isArray(excludedRaw)
    ? excludedRaw
    : excludedRaw instanceof Y.Array
      ? excludedRaw.toArray()
      : [];

  const fields = yFields<YTab>(ymap);
  return {
    id: fields.get('id') || '',
    dossierId: fields.get('dossierId') || '',
    name: fields.get('name') || '',
    order: fields.get('order') ?? 0,
    memberElementIds,
    excludedElementIds,
    viewport: { x: 0, y: 0, zoom: 1 }, // Local only — not synced
    createdAt: dateFromYjs(fields.get('createdAt')) || new Date(),
    updatedAt: dateFromYjs(fields.get('updatedAt')) || new Date(),
  };
}
