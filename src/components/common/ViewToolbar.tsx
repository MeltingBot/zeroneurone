import type { ReactNode } from 'react';
import { Undo2, Redo2, Sun, Moon, Image, ImageOff, Eye, EyeOff, Type, PenTool } from 'lucide-react';
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
  const { fontMode, toggleFontMode, themeMode, toggleThemeMode, hideMedia, toggleHideMedia, anonymousMode, toggleAnonymousMode } = useUIStore();
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
          title="Annuler (Ctrl+Z)"
        >
          <Undo2 size={16} />
        </button>
        <button
          onClick={redo}
          disabled={!canRedoNow}
          className={`p-1.5 rounded transition-colors ${canRedoNow ? 'hover:bg-bg-tertiary text-text-secondary' : 'opacity-40 cursor-not-allowed text-text-tertiary'}`}
          title="Refaire (Ctrl+Shift+Z)"
        >
          <Redo2 size={16} />
        </button>

        <div className="w-px h-4 bg-border-default mx-1" />

        {/* Font mode toggle */}
        {showFontToggle && (
          <button
            onClick={toggleFontMode}
            className={`p-1.5 rounded transition-colors ${fontMode === 'handwritten' ? 'bg-accent-light text-accent' : 'hover:bg-bg-tertiary text-text-secondary'}`}
            title={fontMode === 'handwritten' ? 'Police lisible' : 'Police manuscrite'}
          >
            {fontMode === 'handwritten' ? <Type size={16} /> : <PenTool size={16} />}
          </button>
        )}

        {/* Theme toggle */}
        <button
          onClick={toggleThemeMode}
          className="p-1.5 hover:bg-bg-tertiary rounded transition-colors"
          title={themeMode === 'light' ? 'Mode sombre' : 'Mode clair'}
        >
          {themeMode === 'light' ? <Moon size={16} className="text-text-secondary" /> : <Sun size={16} className="text-text-secondary" />}
        </button>

        {/* Hide media toggle */}
        <button
          onClick={toggleHideMedia}
          className={`p-1.5 rounded transition-colors ${hideMedia ? 'bg-accent-light text-accent' : 'hover:bg-bg-tertiary text-text-secondary'}`}
          title={hideMedia ? 'Afficher les medias' : 'Flouter les medias'}
        >
          {hideMedia ? <ImageOff size={16} /> : <Image size={16} />}
        </button>

        {/* Anonymous mode toggle */}
        <button
          onClick={toggleAnonymousMode}
          className={`p-1.5 rounded transition-colors ${anonymousMode ? 'bg-accent-light text-accent' : 'hover:bg-bg-tertiary text-text-secondary'}`}
          title={anonymousMode ? 'Afficher les noms' : 'Mode anonyme (caviardage)'}
        >
          {anonymousMode ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}
