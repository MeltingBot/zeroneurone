import { memo, useRef, useState, useLayoutEffect, useMemo } from 'react';
import { Plus, Clipboard, Group, StickyNote, Copy, Scissors, CopyPlus, Trash2, EyeOff, icons } from 'lucide-react';
import type { ContextMenuExtension, MenuContext } from '../../types/plugins';

interface CanvasContextMenuProps {
  x: number;
  y: number;
  // Create actions
  onCreateElement: () => void;
  onCreateGroup: () => void;
  onCreateAnnotation: () => void;
  onPaste: () => void;
  // Selection actions (when elements are selected)
  selectedCount?: number;
  onCopySelection?: () => void;
  onCutSelection?: () => void;
  onDuplicateSelection?: () => void;
  onDeleteSelection?: () => void;
  onHideSelection?: () => void;
  onGroupSelection?: () => void;
  onClose: () => void;
  pluginExtensions?: ContextMenuExtension[];
  menuContext?: MenuContext;
}

function CanvasContextMenuComponent({
  x,
  y,
  onCreateElement,
  onCreateGroup,
  onCreateAnnotation,
  onPaste,
  selectedCount = 0,
  onCopySelection,
  onCutSelection,
  onDuplicateSelection,
  onDeleteSelection,
  onHideSelection,
  onGroupSelection,
  onClose,
  pluginExtensions,
  menuContext,
}: CanvasContextMenuProps) {
  const hasSelection = selectedCount > 0;
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  const visibleExtensions = useMemo(() => {
    if (!pluginExtensions || !menuContext) return [];
    return pluginExtensions.filter(ext => !ext.visible || ext.visible(menuContext));
  }, [pluginExtensions, menuContext]);

  // Adjust position to keep menu within viewport
  useLayoutEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const padding = 8;
      let newX = x;
      let newY = y;

      // Check right edge
      if (x + rect.width > window.innerWidth - padding) {
        newX = window.innerWidth - rect.width - padding;
      }

      // Check bottom edge
      if (y + rect.height > window.innerHeight - padding) {
        newY = window.innerHeight - rect.height - padding;
      }

      // Check left edge
      if (newX < padding) {
        newX = padding;
      }

      // Check top edge
      if (newY < padding) {
        newY = padding;
      }

      if (newX !== x || newY !== y) {
        setPosition({ x: newX, y: newY });
      }
    }
  }, [x, y]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />

      {/* Menu */}
      <div
        ref={menuRef}
        className="fixed z-50 min-w-44 py-1 bg-bg-primary border border-border-default sketchy-border-soft panel-shadow"
        style={{ left: position.x, top: position.y }}
      >
        {/* Selection actions (when elements are selected) */}
        {hasSelection && (
          <>
            <div className="px-3 py-1.5 border-b border-border-default">
              <span className="text-xs text-text-secondary">
                {selectedCount} element{selectedCount > 1 ? 's' : ''} selectionne{selectedCount > 1 ? 's' : ''}
              </span>
            </div>
            <div className="py-1 border-b border-border-default">
              {onCopySelection && (
                <button
                  onClick={() => {
                    onCopySelection();
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
                >
                  <Copy size={14} />
                  Copier
                  <span className="ml-auto text-xs text-text-tertiary">Ctrl+C</span>
                </button>
              )}
              {onCutSelection && (
                <button
                  onClick={() => {
                    onCutSelection();
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
                >
                  <Scissors size={14} />
                  Couper
                  <span className="ml-auto text-xs text-text-tertiary">Ctrl+X</span>
                </button>
              )}
              {onDuplicateSelection && (
                <button
                  onClick={() => {
                    onDuplicateSelection();
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
                >
                  <CopyPlus size={14} />
                  Dupliquer
                  <span className="ml-auto text-xs text-text-tertiary">Ctrl+D</span>
                </button>
              )}
            </div>
            <div className="py-1 border-b border-border-default">
              {selectedCount > 1 && onGroupSelection && (
                <button
                  onClick={() => {
                    onGroupSelection();
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
                >
                  <Group size={14} />
                  Grouper
                </button>
              )}
              {onHideSelection && (
                <button
                  onClick={() => {
                    onHideSelection();
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
                >
                  <EyeOff size={14} />
                  Masquer
                </button>
              )}
              {onDeleteSelection && (
                <button
                  onClick={() => {
                    onDeleteSelection();
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-error hover:bg-pastel-pink transition-colors"
                >
                  <Trash2 size={14} />
                  Supprimer
                  <span className="ml-auto text-xs text-text-tertiary">Suppr</span>
                </button>
              )}
            </div>
          </>
        )}

        {/* Create new element */}
        <div className="py-1">
          <button
            onClick={() => {
              onCreateElement();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
          >
            <Plus size={14} />
            Nouvel element
            <span className="ml-auto text-xs text-text-tertiary">E</span>
          </button>
          <button
            onClick={() => {
              onCreateGroup();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
          >
            <Group size={14} />
            Nouveau groupe visuel
            <span className="ml-auto text-xs text-text-tertiary">G</span>
          </button>
          <button
            onClick={() => {
              onCreateAnnotation();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
          >
            <StickyNote size={14} />
            Nouvelle note
            <span className="ml-auto text-xs text-text-tertiary">N</span>
          </button>
        </div>

        {/* Paste */}
        <div className="py-1 border-t border-border-default">
          <button
            onClick={() => {
              onPaste();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
          >
            <Clipboard size={14} />
            Coller
            <span className="ml-auto text-xs text-text-tertiary">Ctrl+V</span>
          </button>
        </div>

        {/* Plugin extensions */}
        {visibleExtensions.length > 0 && (
          <div className="py-1 border-t border-border-default">
            {visibleExtensions.map((ext) => {
              const Icon = icons[ext.icon as keyof typeof icons];
              return (
                <button
                  key={ext.id}
                  onClick={() => {
                    if (menuContext) ext.action(menuContext);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
                >
                  {Icon && <Icon size={14} />}
                  {ext.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

export const CanvasContextMenu = memo(CanvasContextMenuComponent);
