/**
 * Comment <-> Y.Map mapper for Yjs collaboration
 */

import * as Y from 'yjs';
import type { Comment, CommentTargetType } from '../../types';
import { dateToYjs, dateFromYjs } from '../../types/yjs';

// ============================================================================
// COMMENT -> Y.MAP
// ============================================================================

/**
 * Convert a Comment to a Y.Map for insertion into Y.Doc.
 */
export function commentToYMap(comment: Comment): Y.Map<any> {
  const map = new Y.Map();

  map.set('id', comment.id);
  map.set('investigationId', comment.investigationId);
  map.set('targetId', comment.targetId);
  map.set('targetType', comment.targetType);
  map.set('authorName', comment.authorName);
  map.set('authorColor', comment.authorColor);
  map.set('content', comment.content);
  map.set('resolved', comment.resolved);
  map.set('resolvedBy', comment.resolvedBy);
  map.set('resolvedAt', dateToYjs(comment.resolvedAt));
  map.set('createdAt', dateToYjs(comment.createdAt) || new Date().toISOString());

  return map;
}

// ============================================================================
// Y.MAP -> COMMENT
// ============================================================================

/**
 * Convert a Y.Map to a Comment.
 */
export function yMapToComment(ymap: Y.Map<any>): Comment {
  return {
    id: ymap.get('id') || '',
    investigationId: ymap.get('investigationId') || '',
    targetId: ymap.get('targetId') || '',
    targetType: (ymap.get('targetType') as CommentTargetType) || 'element',
    authorName: ymap.get('authorName') || '',
    authorColor: ymap.get('authorColor') || '#6b7280',
    content: ymap.get('content') || '',
    resolved: ymap.get('resolved') ?? false,
    resolvedBy: ymap.get('resolvedBy') ?? null,
    resolvedAt: dateFromYjs(ymap.get('resolvedAt')),
    createdAt: dateFromYjs(ymap.get('createdAt')) || new Date(),
  };
}

// ============================================================================
// PARTIAL UPDATE HELPERS
// ============================================================================

/**
 * Apply partial changes to an existing comment Y.Map.
 */
export function updateCommentYMap(
  ymap: Y.Map<any>,
  changes: Partial<Comment>,
  ydoc: Y.Doc
): void {
  ydoc.transact(() => {
    if (changes.content !== undefined) {
      ymap.set('content', changes.content);
    }

    if (changes.resolved !== undefined) {
      ymap.set('resolved', changes.resolved);
    }

    if (changes.resolvedBy !== undefined) {
      ymap.set('resolvedBy', changes.resolvedBy);
    }

    if (changes.resolvedAt !== undefined) {
      ymap.set('resolvedAt', dateToYjs(changes.resolvedAt));
    }
  });
}
