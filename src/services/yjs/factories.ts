/**
 * Defaults of a new element or comment, shared by the desktop store and the
 * mobile companion so both write the same shape into the Y.Doc.
 *
 * Pure: no store, no Dexie. What depends on local settings (the first tag's
 * TagSet visual) stays with the caller.
 */

import type { Comment, CommentTargetType, DossierId, Element, ElementId, Link, LinkId, Position } from '../../types';

export function buildNewElement(
  dossierId: DossierId,
  label: string,
  position: Position,
  options?: Partial<Element>,
): Element {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    dossierId,
    label,
    notes: '',
    tags: [],
    properties: [],
    confidence: null,
    source: '',
    date: null,
    dateRange: null,
    position,
    isPositionLocked: false,
    geo: null,
    events: [],
    visual: {
      color: '#ffffff',
      borderColor: '#e5e7eb',
      shape: 'rectangle',
      size: 'medium',
      icon: null,
      image: null,
    },
    assetIds: [],
    parentGroupId: null,
    isGroup: false,
    isAnnotation: false,
    childIds: [],
    createdAt: now,
    updatedAt: now,
    ...options,
  };
}

export function buildNewLink(dossierId: DossierId, fromId: ElementId, toId: ElementId, options?: Partial<Link>): Link {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    dossierId,
    fromId,
    toId,
    sourceHandle: null,
    targetHandle: null,
    label: '',
    notes: '',
    tags: [],
    properties: [],
    directed: false,
    direction: 'none',
    confidence: null,
    source: '',
    date: null,
    dateRange: null,
    visual: {
      color: '#9ca3af',
      style: 'solid',
      thickness: 2,
    },
    curveOffset: { x: 0, y: 0 },
    createdAt: now,
    updatedAt: now,
    ...options,
  };
}

export function buildComment(
  dossierId: DossierId,
  targetId: ElementId | LinkId,
  targetType: CommentTargetType,
  content: string,
  author: { name: string; color: string },
): Comment {
  return {
    id: crypto.randomUUID(),
    dossierId,
    targetId,
    targetType,
    authorName: author.name,
    authorColor: author.color,
    content,
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
    createdAt: new Date(),
  };
}
