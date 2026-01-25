import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Undo2, Redo2, Image, ImageOff, Eye, EyeOff, Type, PenTool, MessageCircle, MessageCircleOff } from 'lucide-react';
import { useUIStore, useHistoryStore } from '../../stores';

interface ViewToolbarProps {
  /** Left side content (e.g., element count) */
  leftContent?: ReactNode;
  /** Center content (e.g., zoom presets) */
  centerContent?: ReactNode;
  /** Right side content before common controls (e.g., view-specific buttons) */
  rightContent?: ReactNode;
  /** Show font mode toggle (for views with text labels) */
  showFontToggle?: boolean;
}

export function ViewToolbar({
  leftContent,
  centerContent,
  rightContent,
  showFontToggle = false,
}: ViewToolbarProps) {
  const { t } = useTranslation('pages');
  const { fontMode, toggleFontMode, hideMedia, toggleHideMedia, anonymousMode, toggleAnonymousMode, showCommentBadges, toggleShowCommentBadges } = useUIStore();
  const { canUndo, canRedo, undo, redo } = useHistoryStore();

  const canUndoNow = canUndo();
  const canRedoNow = canRedo();

  return (
    <div className="h-10 flex items-center justify-between px-4 border-b border-border-default bg-bg-primary shrink-0">
      {/* Left side */}
      <div className="flex items-center gap-4">
        {leftContent}
      </div>

      {/* Center */}
      {centerContent && (
        <div className="flex items-center gap-2">
          {centerContent}
        </div>
      )}

      {/* Right side - view-specific + common controls */}
      <div className="flex items-center gap-1">
        {rightContent}

        {/* Separator if there's right content */}
        {rightContent && <div className="w-px h-4 bg-border-default mx-1" />}

        {/* Undo/Redo */}
        <button
          onClick={undo}
          disabled={!canUndoNow}
          className={`p-1.5 rounded transition-colors ${canUndoNow ? 'hover:bg-bg-tertiary text-text-secondary' : 'opacity-40 cursor-not-allowed text-text-tertiary'}`}
          title={t('investigation.viewToolbar.undo')}
        >
          <Undo2 size={16} />
        </button>
        <button
          onClick={redo}
          disabled={!canRedoNow}
          className={`p-1.5 rounded transition-colors ${canRedoNow ? 'hover:bg-bg-tertiary text-text-secondary' : 'opacity-40 cursor-not-allowed text-text-tertiary'}`}
          title={t('investigation.viewToolbar.redo')}
        >
          <Redo2 size={16} />
        </button>

        <div className="w-px h-4 bg-border-default mx-1" />

        {/* Font mode toggle */}
        {showFontToggle && (
          <button
            onClick={toggleFontMode}
            className={`p-1.5 rounded transition-colors ${fontMode === 'handwritten' ? 'bg-accent-light text-accent' : 'hover:bg-bg-tertiary text-text-secondary'}`}
            title={fontMode === 'handwritten' ? t('investigation.viewToolbar.readableFont') : t('investigation.viewToolbar.handwrittenFont')}
          >
            {fontMode === 'handwritten' ? <Type size={16} /> : <PenTool size={16} />}
          </button>
        )}

        {/* Hide media toggle */}
        <button
          onClick={toggleHideMedia}
          className={`p-1.5 rounded transition-colors ${hideMedia ? 'bg-accent-light text-accent' : 'hover:bg-bg-tertiary text-text-secondary'}`}
          title={hideMedia ? t('investigation.viewToolbar.showMedia') : t('investigation.viewToolbar.blurMedia')}
        >
          {hideMedia ? <ImageOff size={16} /> : <Image size={16} />}
        </button>

        {/* Anonymous mode toggle */}
        <button
          onClick={toggleAnonymousMode}
          className={`p-1.5 rounded transition-colors ${anonymousMode ? 'bg-accent-light text-accent' : 'hover:bg-bg-tertiary text-text-secondary'}`}
          title={anonymousMode ? t('investigation.viewToolbar.showNames') : t('investigation.viewToolbar.anonymousMode')}
        >
          {anonymousMode ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>

        {/* Comment badges toggle */}
        <button
          onClick={toggleShowCommentBadges}
          className={`p-1.5 rounded transition-colors ${showCommentBadges ? 'bg-accent-light text-accent' : 'hover:bg-bg-tertiary text-text-secondary'}`}
          title={showCommentBadges ? t('investigation.viewToolbar.hideCommentBadges') : t('investigation.viewToolbar.showCommentBadges')}
        >
          {showCommentBadges ? <MessageCircle size={16} /> : <MessageCircleOff size={16} />}
        </button>

      </div>
    </div>
  );
}
