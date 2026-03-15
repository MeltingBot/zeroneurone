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
  /** Show hide-media toggle (default true, hide for views without media) */
  showMediaToggle?: boolean;
  /** Show comment badges toggle (default true, hide for views without badges) */
  showCommentBadgesToggle?: boolean;
}

export function ViewToolbar({
  leftContent,
  centerContent,
  rightContent,
  showFontToggle = false,
  showMediaToggle = true,
  showCommentBadgesToggle = true,
}: ViewToolbarProps) {
  const { t } = useTranslation('pages');
  const { fontMode, toggleFontMode, hideMedia, toggleHideMedia, anonymousMode, toggleAnonymousMode, showCommentBadges, toggleShowCommentBadges } = useUIStore();
  const { canUndo, canRedo, undo, redo } = useHistoryStore();

  const canUndoNow = canUndo();
  const canRedoNow = canRedo();

  return (
    <div className="h-10 flex items-center justify-between px-4 border-b border-border-default bg-bg-primary shrink-0">
      {/* Left side */}
      <div className="flex items-center gap-4 shrink-0">
        {leftContent}
      </div>

      {/* Center */}
      {centerContent && (
        <div className="flex items-center gap-2">
          {centerContent}
        </div>
      )}

      {/* Right side - view-specific + common controls */}
      <div className="flex items-center gap-1 min-w-0 ml-2 justify-end overflow-x-auto scrollbar-none">
        {rightContent}

        {/* Separator if there's right content */}
        {rightContent && <div className="w-px h-4 bg-border-default mx-1 shrink-0" />}

        {/* Undo/Redo */}
        <button
          onClick={undo}
          disabled={!canUndoNow}
          className={`p-1.5 rounded transition-colors ${canUndoNow ? 'hover:bg-bg-tertiary text-text-secondary' : 'opacity-40 cursor-not-allowed text-text-tertiary'}`}
          title={t('dossier.viewToolbar.undo')}
        >
          <Undo2 size={16} />
        </button>
        <button
          onClick={redo}
          disabled={!canRedoNow}
          className={`p-1.5 rounded transition-colors ${canRedoNow ? 'hover:bg-bg-tertiary text-text-secondary' : 'opacity-40 cursor-not-allowed text-text-tertiary'}`}
          title={t('dossier.viewToolbar.redo')}
        >
          <Redo2 size={16} />
        </button>

        <div className="w-px h-4 bg-border-default mx-1" />

        {/* Font mode toggle */}
        {showFontToggle && (
          <button
            onClick={toggleFontMode}
            className={`p-1.5 rounded transition-colors ${fontMode === 'handwritten' ? 'bg-accent-light text-accent' : 'hover:bg-bg-tertiary text-text-secondary'}`}
            title={fontMode === 'handwritten' ? t('dossier.viewToolbar.readableFont') : t('dossier.viewToolbar.handwrittenFont')}
          >
            {fontMode === 'handwritten' ? <Type size={16} /> : <PenTool size={16} />}
          </button>
        )}

        {/* Hide media toggle */}
        {showMediaToggle && (
          <button
            onClick={toggleHideMedia}
            className={`p-1.5 rounded transition-colors ${hideMedia ? 'bg-accent-light text-accent' : 'hover:bg-bg-tertiary text-text-secondary'}`}
            title={hideMedia ? t('dossier.viewToolbar.showMedia') : t('dossier.viewToolbar.blurMedia')}
          >
            {hideMedia ? <ImageOff size={16} /> : <Image size={16} />}
          </button>
        )}

        {/* Anonymous mode toggle */}
        <button
          onClick={toggleAnonymousMode}
          className={`p-1.5 rounded transition-colors ${anonymousMode ? 'bg-accent-light text-accent' : 'hover:bg-bg-tertiary text-text-secondary'}`}
          title={anonymousMode ? t('dossier.viewToolbar.showNames') : t('dossier.viewToolbar.anonymousMode')}
        >
          {anonymousMode ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>

        {/* Comment badges toggle */}
        {showCommentBadgesToggle && (
          <button
            onClick={toggleShowCommentBadges}
            className={`p-1.5 rounded transition-colors ${showCommentBadges ? 'bg-accent-light text-accent' : 'hover:bg-bg-tertiary text-text-secondary'}`}
            title={showCommentBadges ? t('dossier.viewToolbar.hideCommentBadges') : t('dossier.viewToolbar.showCommentBadges')}
          >
            {showCommentBadges ? <MessageCircle size={16} /> : <MessageCircleOff size={16} />}
          </button>
        )}

      </div>
    </div>
  );
}
