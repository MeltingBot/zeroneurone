import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Trash2, Send } from 'lucide-react';
import { useInvestigationStore, useSyncStore } from '../../stores';
import type { Comment, CommentTargetType } from '../../types';

interface CommentsSectionProps {
  targetId: string;
  targetType: CommentTargetType;
}

export function CommentsSection({ targetId, targetType }: CommentsSectionProps) {
  const { t, i18n } = useTranslation('panels');
  const { comments, createComment, resolveComment, unresolveComment, deleteComment } = useInvestigationStore();
  const localUser = useSyncStore(state => state.localUser);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter comments for this target
  const targetComments = comments
    .filter(c => c.targetId === targetId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const unresolvedCount = targetComments.filter(c => !c.resolved).length;

  // Get current user name for resolving
  const getCurrentUserName = useCallback(() => {
    return localUser.name;
  }, [localUser.name]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await createComment(targetId, targetType, newComment.trim());
      setNewComment('');
    } catch (error) {
      console.error('Failed to create comment:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [newComment, isSubmitting, createComment, targetId, targetType]);

  const handleResolve = useCallback(async (comment: Comment) => {
    try {
      if (comment.resolved) {
        await unresolveComment(comment.id);
      } else {
        await resolveComment(comment.id, getCurrentUserName());
      }
    } catch (error) {
      console.error('Failed to toggle comment resolution:', error);
    }
  }, [resolveComment, unresolveComment, getCurrentUserName]);

  const handleDelete = useCallback(async (commentId: string) => {
    try {
      await deleteComment(commentId);
    } catch (error) {
      console.error('Failed to delete comment:', error);
    }
  }, [deleteComment]);

  const formatDate = useCallback((date: Date) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('detail.comments.time.justNow');
    if (diffMins < 60) return t('detail.comments.time.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('detail.comments.time.hoursAgo', { count: diffHours });
    if (diffDays < 7) return t('detail.comments.time.daysAgo', { count: diffDays });
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }, [t]);

  return (
    <div className="space-y-3">
      {/* New comment form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={t('detail.comments.addPlaceholder')}
          className="flex-1 px-2 py-1.5 text-sm border border-[var(--color-border)] rounded bg-[var(--color-bg-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          disabled={isSubmitting}
        />
        <button
          type="submit"
          disabled={!newComment.trim() || isSubmitting}
          className="px-2 py-1.5 text-sm bg-[var(--color-accent)] text-white rounded hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send size={14} />
        </button>
      </form>

      {/* Comments list */}
      {targetComments.length === 0 ? (
        <p className="text-xs text-[var(--color-text-tertiary)] italic">
          {t('detail.comments.noComments')}
        </p>
      ) : (
        <div className="space-y-2">
          {/* Unresolved first, then resolved */}
          {targetComments
            .sort((a, b) => {
              if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
              return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            })
            .map((comment) => (
              <div
                key={comment.id}
                className={`p-2 rounded border text-sm ${
                  comment.resolved
                    ? 'bg-[var(--color-bg-tertiary)] border-[var(--color-border)] opacity-60'
                    : 'bg-[var(--color-bg-secondary)] border-[var(--color-border)]'
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: comment.authorColor }}
                    />
                    <span className="text-xs font-medium truncate">
                      {comment.authorName}
                    </span>
                    <span
                      className="text-xs text-[var(--color-text-tertiary)]"
                      title={new Date(comment.createdAt).toLocaleString(i18n.language.startsWith('fr') ? 'fr-FR' : 'en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    >
                      {formatDate(comment.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleResolve(comment)}
                      className={`p-1 rounded hover:bg-[var(--color-bg-tertiary)] ${
                        comment.resolved ? 'text-green-600' : 'text-[var(--color-text-tertiary)]'
                      }`}
                      title={comment.resolved ? t('detail.comments.markUnresolved') : t('detail.comments.markResolved')}
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] hover:text-red-600"
                      title={t('detail.comments.delete')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <p className={`text-sm ${comment.resolved ? 'line-through' : ''}`}>
                  {comment.content}
                </p>

                {/* Resolution info */}
                {comment.resolved && comment.resolvedBy && (
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                    {t('detail.comments.resolvedBy', { name: comment.resolvedBy })}
                  </p>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
