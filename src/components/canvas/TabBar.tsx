import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { useTabStore, useViewStore, useInvestigationStore, useHistoryStore } from '../../stores';
import type { TabId, InvestigationId } from '../../types';

interface TabBarProps {
  investigationId: InvestigationId;
}

export function TabBar({ investigationId }: TabBarProps) {
  const { t } = useTranslation('pages');
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const createTab = useTabStore((s) => s.createTab);
  const addMembers = useTabStore((s) => s.addMembers);
  const renameTab = useTabStore((s) => s.renameTab);
  const deleteTab = useTabStore((s) => s.deleteTab);
  const saveTabViewport = useTabStore((s) => s.saveTabViewport);
  const viewport = useViewStore((s) => s.viewport);
  const requestViewportChange = useViewStore((s) => s.requestViewportChange);
  const elements = useInvestigationStore((s) => s.elements);
  const pushAction = useHistoryStore((s) => s.pushAction);

  const [editingTabId, setEditingTabId] = useState<TabId | null>(null);
  const [editValue, setEditValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{ tabId: TabId; x: number; y: number } | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Switch tab with viewport save/restore
  const switchTab = (tabId: TabId) => {
    if (tabId === activeTabId) return;
    // Save current viewport for the tab we're leaving
    if (activeTabId !== null) {
      saveTabViewport(activeTabId, viewport);
    }
    // Switch
    setActiveTab(tabId);
    // Restore viewport for the new tab
    const tab = tabs.find((t) => t.id === tabId);
    if (tab && (tab.viewport.x !== 0 || tab.viewport.y !== 0 || tab.viewport.zoom !== 1)) {
      requestViewportChange(tab.viewport);
    }
  };

  const MAX_TABS = 10;

  const switchToAll = () => {
    if (activeTabId === null) return;
    // Save current viewport before switching
    if (activeTabId !== null) {
      saveTabViewport(activeTabId, viewport);
    }
    setActiveTab(null);
  };

  const handleCreate = async () => {
    if (tabs.length >= MAX_TABS) return;
    const isFirst = tabs.length === 0;
    const name = isFirst
      ? t('investigation.tabs.initialName')
      : t('investigation.tabs.defaultName', { n: tabs.length + 1 });
    const tab = await createTab(investigationId, name);

    // First tab: auto-populate with all existing elements
    if (isFirst && elements.length > 0) {
      await addMembers(tab.id, elements.map((el) => el.id));
    }

    switchTab(tab.id);
    // Auto-rename on creation
    setEditingTabId(tab.id);
    setEditValue(name);
  };

  const handleDoubleClick = (tabId: TabId, currentName: string) => {
    setEditingTabId(tabId);
    setEditValue(currentName);
  };

  const commitRename = () => {
    if (editingTabId && editValue.trim()) {
      renameTab(editingTabId, editValue.trim());
    }
    setEditingTabId(null);
  };

  const handleContextMenu = (e: React.MouseEvent, tabId: TabId) => {
    e.preventDefault();
    setContextMenu({ tabId, x: e.clientX, y: e.clientY });
  };

  const handleDeleteFromContext = () => {
    if (contextMenu) {
      const tab = tabs.find((t) => t.id === contextMenu.tabId);
      if (tab) {
        pushAction({
          type: 'delete-tab',
          undo: { snapshot: { ...tab } },
          redo: { snapshot: tab.id },
        });
      }
      deleteTab(contextMenu.tabId);
    }
    setContextMenu(null);
  };

  const handleRenameFromContext = () => {
    if (contextMenu) {
      const tab = tabs.find((t) => t.id === contextMenu.tabId);
      if (tab) {
        setEditingTabId(tab.id);
        setEditValue(tab.name);
      }
    }
    setContextMenu(null);
  };

  // No tabs: show minimal bar with just the "+" button
  if (tabs.length === 0) {
    return (
      <div className="flex items-center h-8 bg-bg-primary border-b border-border-default px-1 shrink-0">
        <button
          onClick={handleCreate}
          className="flex items-center gap-1 px-2 h-6 rounded text-xs text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
          title={t('investigation.tabs.new')}
        >
          <Plus size={14} />
          <span>{t('investigation.tabs.new')}</span>
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center h-8 bg-bg-primary border-b border-border-default px-1 gap-0.5 shrink-0 overflow-hidden">
        {/* "All" view button */}
        <button
          onClick={switchToAll}
          className={`px-2 h-6 text-xs rounded cursor-pointer select-none shrink-0 transition-colors ${
            activeTabId === null
              ? 'bg-bg-secondary text-text-primary font-medium border border-border-default'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
          }`}
        >
          {t('investigation.tabs.all')}
        </button>

        <div className="w-px h-4 bg-border-default shrink-0" />

        {/* Named tabs */}
        <div ref={scrollRef} className="flex items-center gap-0.5 overflow-x-auto scrollbar-none">
          {tabs.map((tab) => (
            <TabButton
              key={tab.id}
              label={tab.name}
              isActive={activeTabId === tab.id}
              onClick={() => switchTab(tab.id)}
              onDoubleClick={() => handleDoubleClick(tab.id, tab.name)}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              isEditing={editingTabId === tab.id}
              editValue={editValue}
              onEditChange={setEditValue}
              onEditCommit={commitRename}
              editInputRef={editingTabId === tab.id ? editInputRef : undefined}
              onClose={tabs.length > 1 ? () => {
                pushAction({
                  type: 'delete-tab',
                  undo: { snapshot: { ...tab } },
                  redo: { snapshot: tab.id },
                });
                deleteTab(tab.id);
              } : undefined}
            />
          ))}
        </div>

        {/* Add tab button (hidden at max) */}
        {tabs.length < MAX_TABS && (
          <button
            onClick={handleCreate}
            className="flex items-center justify-center w-6 h-6 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors shrink-0"
            title={t('investigation.tabs.new')}
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <TabContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onRename={handleRenameFromContext}
          onDelete={tabs.length > 1 ? handleDeleteFromContext : undefined}
          onClose={() => setContextMenu(null)}
          t={t}
        />
      )}
    </>
  );
}

// ── Tab Button ─────────────────────────────────────────

interface TabButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  isEditing?: boolean;
  editValue?: string;
  onEditChange?: (v: string) => void;
  onEditCommit?: () => void;
  editInputRef?: React.RefObject<HTMLInputElement | null>;
  onClose?: () => void;
}

function TabButton({
  label,
  isActive,
  onClick,
  onDoubleClick,
  onContextMenu,
  isEditing,
  editValue,
  onEditChange,
  onEditCommit,
  editInputRef,
  onClose,
}: TabButtonProps) {
  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && editInputRef?.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditing, editInputRef]);

  return (
    <div
      className={`group flex items-center gap-1 px-2 h-6 text-xs rounded cursor-pointer select-none shrink-0 transition-colors ${
        isActive
          ? 'bg-bg-secondary text-text-primary font-medium border border-border-default'
          : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
      }`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {isEditing ? (
        <input
          ref={editInputRef}
          value={editValue}
          onChange={(e) => onEditChange?.(e.target.value)}
          onBlur={onEditCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEditCommit?.();
            if (e.key === 'Escape') onEditCommit?.();
          }}
          className="w-24 px-0.5 text-xs bg-transparent border-b border-accent outline-none text-text-primary"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          <span className="truncate max-w-[120px]">{label}</span>
        </>
      )}
      {/* Close button (visible on hover or when active, only if closable) */}
      {onClose && !isEditing && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className={`flex items-center justify-center w-3.5 h-3.5 rounded-sm transition-opacity ${
            isActive
              ? 'text-text-tertiary hover:text-text-primary opacity-100'
              : 'opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-text-primary'
          }`}
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}

// ── Context Menu ───────────────────────────────────────

interface TabContextMenuProps {
  x: number;
  y: number;
  onRename: () => void;
  onDelete?: () => void;
  onClose: () => void;
  t: (key: string) => string;
}

function TabContextMenu({ x, y, onRename, onDelete, onClose, t }: TabContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[140px] py-1 bg-bg-primary border border-border-default rounded shadow-md"
      style={{ left: x, top: y }}
    >
      <button
        onClick={onRename}
        className="w-full px-3 py-1.5 text-xs text-left text-text-primary hover:bg-bg-tertiary"
      >
        {t('investigation.tabs.rename')}
      </button>
      {onDelete && (
        <button
          onClick={onDelete}
          className="w-full px-3 py-1.5 text-xs text-left text-error hover:bg-bg-tertiary"
        >
          {t('investigation.tabs.delete')}
        </button>
      )}
    </div>
  );
}
