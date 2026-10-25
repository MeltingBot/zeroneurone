import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { useTabStore, useDossierStore, useHistoryStore, MAX_TABS } from '../../stores';
import { ConfirmDeleteModal } from '../modals/ConfirmDeleteModal';
import { useProgressStore } from '../../stores/progressStore';
import type { TabId, DossierId } from '../../types';

interface TabBarProps {
  dossierId: DossierId;
}

export function TabBar({ dossierId }: TabBarProps) {
  const { t } = useTranslation('pages');
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const extraTabIds = useTabStore((s) => s.extraTabIds);
  const toggleCombinedTab = useTabStore((s) => s.toggleCombinedTab);
  const createTab = useTabStore((s) => s.createTab);
  const addMembers = useTabStore((s) => s.addMembers);
  const renameTab = useTabStore((s) => s.renameTab);
  const deleteTab = useTabStore((s) => s.deleteTab);
  const reorderTab = useTabStore((s) => s.reorderTab);
  const elements = useDossierStore((s) => s.elements);
  const pushAction = useHistoryStore((s) => s.pushAction);

  const [editingTabId, setEditingTabId] = useState<TabId | null>(null);
  const [editValue, setEditValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{ tabId: TabId; x: number; y: number } | null>(null);
  const [pendingDeleteTabId, setPendingDeleteTabId] = useState<TabId | null>(null);
  // Drag to reorder: the tab dragged and the one it would take the place of
  const [draggedTabId, setDraggedTabId] = useState<TabId | null>(null);
  const [dropTargetId, setDropTargetId] = useState<TabId | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Changing what the view shows can take a moment on a large dossier: show
  // the activity bar first, let it paint (two frames), then switch, and drop
  // the bar once the new view has painted.
  const withActivity = (change: () => void) => {
    const progress = useProgressStore.getState();
    progress.start('view', 'activity.view');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try {
        change();
      } finally {
        requestAnimationFrame(() => useProgressStore.getState().end('view'));
      }
    }));
  };

  // Switch tab: setActiveTab keeps each tab's zoom and centre
  const switchTab = (tabId: TabId) => {
    if (tabId === activeTabId && extraTabIds.length === 0) return;
    withActivity(() => setActiveTab(tabId));
  };

  // Ctrl/Cmd+click: show the tab together with the open one, or stop
  const handleTabClick = (e: React.MouseEvent, tabId: TabId) => {
    // From "All" there is nothing to combine with: open it (viewport restored)
    if ((e.ctrlKey || e.metaKey) && activeTabId !== null) {
      withActivity(() => toggleCombinedTab(tabId));
      return;
    }
    switchTab(tabId);
  };

  const switchToAll = () => {
    if (activeTabId === null) return;
    withActivity(() => setActiveTab(null));
  };

  const handleCreate = async () => {
    if (tabs.length >= MAX_TABS) return;
    const isFirst = tabs.length === 0;
    const name = isFirst
      ? t('dossier.tabs.initialName')
      : t('dossier.tabs.defaultName', { n: tabs.length + 1 });
    const tab = await createTab(dossierId, name);

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

  // Dropped on another tab: take its place (after it when moving right,
  // before it when moving left). Orders are renumbered 0..n-1; only the tabs
  // whose rank changes are written.
  const handleDrop = (targetId: TabId) => {
    const draggedId = draggedTabId;
    setDraggedTabId(null);
    setDropTargetId(null);
    if (!draggedId || draggedId === targetId) return;
    const from = tabs.findIndex((tab) => tab.id === draggedId);
    const to = tabs.findIndex((tab) => tab.id === targetId);
    if (from < 0 || to < 0) return;
    const next = tabs.filter((tab) => tab.id !== draggedId);
    next.splice(to, 0, tabs[from]);
    next.forEach((tab, rank) => {
      if (tab.order !== rank) reorderTab(tab.id, rank);
    });
  };

  const handleContextMenu = (e: React.MouseEvent, tabId: TabId) => {
    e.preventDefault();
    setContextMenu({ tabId, x: e.clientX, y: e.clientY });
  };

  const confirmDeleteTab = async (tabId: TabId) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (tab) {
      pushAction({
        type: 'delete-tab',
        undo: { snapshot: { ...tab } },
        redo: { snapshot: tab.id },
      });
    }
    deleteTab(tabId);
    setPendingDeleteTabId(null);
  };

  const handleDeleteFromContext = () => {
    if (contextMenu) {
      setPendingDeleteTabId(contextMenu.tabId);
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
          title={t('dossier.tabs.new')}
        >
          <Plus size={14} />
          <span>{t('dossier.tabs.new')}</span>
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
          {t('dossier.tabs.all')}
        </button>

        <div className="w-px h-4 bg-border-default shrink-0" />

        {/* Named tabs */}
        <div ref={scrollRef} className="flex items-center gap-0.5 overflow-x-auto scrollbar-none">
          {tabs.map((tab) => (
            <TabButton
              key={tab.id}
              label={tab.name}
              isActive={activeTabId === tab.id}
              isCombined={extraTabIds.includes(tab.id)}
              onClick={(e) => handleTabClick(e, tab.id)}
              onDoubleClick={() => handleDoubleClick(tab.id, tab.name)}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              isEditing={editingTabId === tab.id}
              editValue={editValue}
              onEditChange={setEditValue}
              onEditCommit={commitRename}
              editInputRef={editingTabId === tab.id ? editInputRef : undefined}
              onClose={tabs.length > 1 ? () => {
                setPendingDeleteTabId(tab.id);
              } : undefined}
              draggable={tabs.length > 1 && editingTabId === null}
              isDragged={draggedTabId === tab.id}
              isDropTarget={dropTargetId === tab.id && draggedTabId !== tab.id}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', tab.id);
                setDraggedTabId(tab.id);
              }}
              onDragOver={(e) => {
                if (!draggedTabId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dropTargetId !== tab.id) setDropTargetId(tab.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(tab.id);
              }}
              onDragEnd={() => {
                setDraggedTabId(null);
                setDropTargetId(null);
              }}
            />
          ))}
        </div>

        {/* Add tab button (hidden at max) */}
        {tabs.length < MAX_TABS && (
          <button
            onClick={handleCreate}
            className="flex items-center justify-center w-6 h-6 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors shrink-0"
            title={t('dossier.tabs.new')}
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
          combineLabel={
            activeTabId === null || contextMenu.tabId === activeTabId && extraTabIds.length === 0
              ? null
              : extraTabIds.includes(contextMenu.tabId) || contextMenu.tabId === activeTabId
                ? t('dossier.tabs.uncombine')
                : t('dossier.tabs.combine')
          }
          onCombine={() => {
            toggleCombinedTab(contextMenu.tabId);
            setContextMenu(null);
          }}
          onRename={handleRenameFromContext}
          onDelete={tabs.length > 1 ? handleDeleteFromContext : undefined}
          onClose={() => setContextMenu(null)}
          t={t}
        />
      )}

      {/* Delete confirmation modal */}
      {pendingDeleteTabId && (() => {
        const pendingTab = tabs.find((t) => t.id === pendingDeleteTabId);
        return (
          <ConfirmDeleteModal
            isOpen={true}
            onClose={() => setPendingDeleteTabId(null)}
            onConfirm={() => confirmDeleteTab(pendingDeleteTabId)}
            title={t('dossier.tabs.delete')}
            message={t('dossier.tabs.deleteConfirm', { name: pendingTab?.name ?? '' })}
          />
        );
      })()}
    </>
  );
}

// ── Tab Button ─────────────────────────────────────────

interface TabButtonProps {
  label: string;
  isActive: boolean;
  /** Shown together with the open tab (Ctrl+click) */
  isCombined?: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  isEditing?: boolean;
  editValue?: string;
  onEditChange?: (v: string) => void;
  onEditCommit?: () => void;
  editInputRef?: React.RefObject<HTMLInputElement | null>;
  onClose?: () => void;
  draggable?: boolean;
  isDragged?: boolean;
  isDropTarget?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}

function TabButton({
  label,
  isActive,
  isCombined,
  onClick,
  onDoubleClick,
  onContextMenu,
  isEditing,
  editValue,
  onEditChange,
  onEditCommit,
  editInputRef,
  onClose,
  draggable,
  isDragged,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
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
          : isCombined
            ? 'bg-bg-secondary text-text-primary border border-border-default'
            : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
      } ${isDragged ? 'opacity-50' : ''} ${isDropTarget ? 'outline outline-1 outline-accent' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
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
          <span className="truncate max-w-[120px]" title={label}>{label}</span>
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
  /** "Combine" / "Uncombine" with the open tab; null when not offered */
  combineLabel: string | null;
  onCombine: () => void;
  onRename: () => void;
  onDelete?: () => void;
  onClose: () => void;
  t: (key: string) => string;
}

function TabContextMenu({ x, y, combineLabel, onCombine, onRename, onDelete, onClose, t }: TabContextMenuProps) {
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
      {combineLabel && (
        <button
          onClick={onCombine}
          className="w-full px-3 py-1.5 text-xs text-left text-text-primary hover:bg-bg-tertiary"
        >
          {combineLabel}
        </button>
      )}
      <button
        onClick={onRename}
        className="w-full px-3 py-1.5 text-xs text-left text-text-primary hover:bg-bg-tertiary"
      >
        {t('dossier.tabs.rename')}
      </button>
      {onDelete && (
        <button
          onClick={onDelete}
          className="w-full px-3 py-1.5 text-xs text-left text-error hover:bg-bg-tertiary"
        >
          {t('dossier.tabs.delete')}
        </button>
      )}
    </div>
  );
}
