import { memo, useRef, useState, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Focus, Eye, EyeOff, Trash2, X, Route, Copy, CopyPlus, Scissors, Clipboard, Image, Group, Ungroup, BoxSelect, Lock, LockOpen, Layers, ArrowRight } from 'lucide-react';
import type { CanvasTab, TabId } from '../../types';

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
  // Position lock
  isPositionLocked: boolean;
  onToggleLock: () => void;
  // Tab assignment
  tabs: CanvasTab[];
  activeTabId: TabId | null;
  onAddToTab: (tabId: TabId) => void;
  onRemoveFromTab: () => void;
  isGhostElement: boolean;
  elementTabIds: TabId[];
  onGoToTab: (tabId: TabId) => void;
  onClose: () => void;
}

const focusDepthOptions = [
  { depth: 1, labelKey: 'investigation.contextMenu.focusNeighbors1' },
  { depth: 2, labelKey: 'investigation.contextMenu.focusNeighbors2' },
  { depth: 3, labelKey: 'investigation.contextMenu.focusNeighbors3' },
] as const;

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
  isPositionLocked,
  onToggleLock,
  tabs,
  activeTabId,
  onAddToTab,
  onRemoveFromTab,
  isGhostElement,
  elementTabIds,
  onGoToTab,
  onClose,
}: ContextMenuProps) {
  const { t } = useTranslation('pages');
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
              {t('investigation.contextMenu.preview')}
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
            {t('investigation.contextMenu.copy')}
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
            {t('investigation.contextMenu.cut')}
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
            {t('investigation.contextMenu.paste')}
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
            {t('investigation.contextMenu.duplicate')}
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
              {t('investigation.contextMenu.findPaths')}
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
                {t('investigation.contextMenu.groupSelection')}
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
                {t('investigation.contextMenu.dissolveGroup')}
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
                {t('investigation.contextMenu.removeFromGroup')}
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
              {t('investigation.contextMenu.exitFocus')}
            </button>
          ) : (
            <>
              <div className="px-3 py-1 text-xs text-text-tertiary">
                {t('investigation.contextMenu.focusMode')}
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
                  {t(option.labelKey)}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Go to source tab (ghost elements only) */}
        {isGhostElement && elementTabIds.length > 0 && (
          <div className="py-1 border-t border-border-default">
            {elementTabIds
              .filter((tid) => tid !== activeTabId)
              .map((tid) => {
                const tab = tabs.find((t) => t.id === tid);
                if (!tab) return null;
                return (
                  <button
                    key={tid}
                    onClick={() => {
                      onGoToTab(tid);
                      onClose();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
                  >
                    <ArrowRight size={14} />
                    <span className="truncate">{t('investigation.tabs.navigateTo', { name: tab.name })}</span>
                  </button>
                );
              })}
          </div>
        )}

        {/* Tab assignment */}
        {tabs.length > 0 && (
          <div className="py-1 border-t border-border-default">
            <div className="px-3 py-1 text-xs text-text-tertiary">
              {t('investigation.tabs.addToTab')}
            </div>
            {tabs.map((tab) => {
              const isInTab = elementTabIds.includes(tab.id);
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (!isInTab) onAddToTab(tab.id);
                    onClose();
                  }}
                  disabled={isInTab}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                    isInTab ? 'text-text-tertiary cursor-default' : 'text-text-primary hover:bg-bg-tertiary'
                  }`}
                >
                  <Layers size={14} />
                  <span className="truncate">{tab.name}</span>
                  {isInTab && <span className="ml-auto text-[10px] text-text-tertiary">&#10003;</span>}
                </button>
              );
            })}
            {/* Remove: ghost → dismiss, member in >1 tab → unassign */}
            {activeTabId && (isGhostElement || (elementTabIds.includes(activeTabId) && elementTabIds.length > 1)) && (
              <button
                onClick={() => {
                  onRemoveFromTab();
                  onClose();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
              >
                <X size={14} />
                {t('investigation.tabs.removeFromTab')}
              </button>
            )}
          </div>
        )}

        {/* Position Lock */}
        <div className="py-1 border-t border-border-default">
          <button
            onClick={() => {
              onToggleLock();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
          >
            {isPositionLocked ? <LockOpen size={14} /> : <Lock size={14} />}
            {isPositionLocked
              ? t('investigation.contextMenu.unlockPosition')
              : t('investigation.contextMenu.lockPosition')}
          </button>
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
              {t('investigation.contextMenu.showElement')}
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
              {hasMultipleSelected ? t('investigation.contextMenu.hideSelection') : t('investigation.contextMenu.hideElement')}
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
            {t('investigation.contextMenu.delete')}
          </button>
        </div>
      </div>
    </>
  );
}

export const ContextMenu = memo(ContextMenuComponent);
