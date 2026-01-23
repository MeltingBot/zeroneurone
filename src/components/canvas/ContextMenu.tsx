import { memo, useRef, useState, useLayoutEffect } from 'react';
import { Focus, Eye, EyeOff, Trash2, X, Route, Copy, CopyPlus, Scissors, Clipboard, Image, Group, Ungroup, BoxSelect } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  elementId: string;
  elementLabel: string;
  isFocused: boolean;
  isHidden: boolean;
  hasCopiedElements: boolean;
  hasPreviewableAsset: boolean;
  // For path finding when 2 elements are selected
  otherSelectedId?: string;
  otherSelectedLabel?: string;
  onFocus: (depth: number) => void;
  onClearFocus: () => void;
  onHide: () => void;
  onShow: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onPreview?: () => void;
  onFindPaths?: (fromId: string, toId: string) => void;
  // Group actions
  isGroup: boolean;
  isInGroup: boolean;
  hasMultipleSelected: boolean;
  onGroupSelection: () => void;
  onDissolveGroup: () => void;
  onRemoveFromGroup: () => void;
  onClose: () => void;
}

const focusDepthOptions = [
  { depth: 1, label: 'Voisins directs' },
  { depth: 2, label: 'Voisins à 2 liens' },
  { depth: 3, label: 'Voisins à 3 liens' },
];

function ContextMenuComponent({
  x,
  y,
  elementId,
  elementLabel,
  isFocused,
  isHidden,
  hasCopiedElements,
  hasPreviewableAsset,
  otherSelectedId,
  otherSelectedLabel,
  onFocus,
  onClearFocus,
  onHide,
  onShow,
  onDelete,
  onCopy,
  onCut,
  onPaste,
  onDuplicate,
  onPreview,
  onFindPaths,
  isGroup,
  isInGroup,
  hasMultipleSelected,
  onGroupSelection,
  onDissolveGroup,
  onRemoveFromGroup,
  onClose,
}: ContextMenuProps) {
  const hasTwoSelected = !!otherSelectedId && !!otherSelectedLabel;
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

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
        className="fixed z-50 min-w-48 py-1 bg-bg-primary border border-border-default sketchy-border-soft panel-shadow"
        style={{ left: position.x, top: position.y }}
      >
        {/* Header */}
        <div className="px-3 py-2 border-b border-border-default">
          <span className="text-xs font-medium text-text-primary truncate block max-w-40">
            {hasTwoSelected ? `${elementLabel} ↔ ${otherSelectedLabel}` : elementLabel}
          </span>
        </div>

        {/* Preview (if element has previewable assets) */}
        {hasPreviewableAsset && onPreview && (
          <div className="py-1 border-b border-border-default">
            <button
              onClick={() => {
                onPreview();
                onClose();
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
            >
              <Image size={14} />
              Aperçu
            </button>
          </div>
        )}

        {/* Copy/Cut/Paste */}
        <div className="py-1 border-b border-border-default">
          <button
            onClick={() => {
              onCopy();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
          >
            <Copy size={14} />
            Copier
            <span className="ml-auto text-xs text-text-tertiary">Ctrl+C</span>
          </button>
          <button
            onClick={() => {
              onCut();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
          >
            <Scissors size={14} />
            Couper
            <span className="ml-auto text-xs text-text-tertiary">Ctrl+X</span>
          </button>
          <button
            onClick={() => {
              onPaste();
              onClose();
            }}
            disabled={!hasCopiedElements}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
              hasCopiedElements
                ? 'text-text-primary hover:bg-bg-tertiary'
                : 'text-text-tertiary cursor-not-allowed'
            }`}
          >
            <Clipboard size={14} />
            Coller
            <span className="ml-auto text-xs text-text-tertiary">Ctrl+V</span>
          </button>
          <button
            onClick={() => {
              onDuplicate();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
          >
            <CopyPlus size={14} />
            Dupliquer
            <span className="ml-auto text-xs text-text-tertiary">Ctrl+D</span>
          </button>
        </div>

        {/* Path finding (when 2 elements selected) */}
        {hasTwoSelected && onFindPaths && (
          <div className="py-1 border-b border-border-default">
            <button
              onClick={() => {
                onFindPaths(elementId, otherSelectedId);
                onClose();
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
            >
              <Route size={14} />
              Trouver les chemins
            </button>
          </div>
        )}

        {/* Group actions */}
        {(hasMultipleSelected || isGroup || isInGroup) && (
          <div className="py-1 border-b border-border-default">
            {hasMultipleSelected && !isGroup && (
              <button
                onClick={() => {
                  onGroupSelection();
                  onClose();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
              >
                <Group size={14} />
                Grouper la sélection
              </button>
            )}
            {isGroup && (
              <button
                onClick={() => {
                  onDissolveGroup();
                  onClose();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
              >
                <Ungroup size={14} />
                Dissoudre le groupe
              </button>
            )}
            {isInGroup && (
              <button
                onClick={() => {
                  onRemoveFromGroup();
                  onClose();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
              >
                <BoxSelect size={14} />
                Retirer du groupe
              </button>
            )}
          </div>
        )}

        {/* Focus options */}
        <div className="py-1">
          {isFocused ? (
            <button
              onClick={() => {
                onClearFocus();
                onClose();
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
            >
              <X size={14} />
              Quitter le mode focus
            </button>
          ) : (
            <>
              <div className="px-3 py-1 text-xs text-text-tertiary">
                Mode focus
              </div>
              {focusDepthOptions.map((option) => (
                <button
                  key={option.depth}
                  onClick={() => {
                    onFocus(option.depth);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
                >
                  <Focus size={14} />
                  {option.label}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Visibility */}
        <div className="py-1 border-t border-border-default">
          {isHidden ? (
            <button
              onClick={() => {
                onShow();
                onClose();
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
            >
              <Eye size={14} />
              Afficher l'élément
            </button>
          ) : (
            <button
              onClick={() => {
                onHide();
                onClose();
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
            >
              <EyeOff size={14} />
              Masquer l'élément
            </button>
          )}
        </div>

        {/* Delete */}
        <div className="py-1 border-t border-border-default">
          <button
            onClick={() => {
              onDelete();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-error hover:bg-pastel-pink transition-colors"
          >
            <Trash2 size={14} />
            Supprimer
          </button>
        </div>
      </div>
    </>
  );
}

export const ContextMenu = memo(ContextMenuComponent);
