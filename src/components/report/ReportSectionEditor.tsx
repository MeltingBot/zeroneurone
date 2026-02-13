import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Trash2, GripVertical } from 'lucide-react';
import type { ReportSection } from '../../types';
import { ReportMarkdownEditor } from './ReportMarkdownEditor';
import { usePlugins } from '../../plugins/usePlugins';
import { useInvestigationStore } from '../../stores';
import { Input, IconButton } from '../common';

// Debounce hook (inline implementation)
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

interface ReportSectionEditorProps {
  section: ReportSection;
  isActive: boolean;
  onActivate: () => void;
  onUpdate: (changes: Partial<Omit<ReportSection, 'id'>>) => void;
  onDelete: () => void;
  // Drag and drop props
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

export function ReportSectionEditor({
  section,
  isActive,
  onActivate,
  onUpdate,
  onDelete,
  isDragging,
  isDragOver,
  onDragStart,
  onDragEnter,
  onDragLeave,
  onDrop,
  onDragEnd,
}: ReportSectionEditorProps) {
  const { t } = useTranslation('panels');
  const sectionPlugins = usePlugins('report:sectionActions');
  const investigationId = useInvestigationStore((s) => s.currentInvestigation?.id || '');
  const [isExpanded, setIsExpanded] = useState(true);
  const [title, setTitle] = useState(section.title);
  const [content, setContent] = useState(section.content);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Track if user is currently editing content (set by child ReportMarkdownEditor)
  const [isEditingContent, setIsEditingContent] = useState(false);

  // Refs to track what we last synced to Yjs - used to detect our own echoes
  const lastSyncedTitleRef = useRef(section.title);
  const lastSyncedContentRef = useRef(section.content);
  // Sync from props when section changes from REMOTE
  // If the prop matches what we last synced, it's our own echo - ignore it
  // If the prop is different, it's a remote change - accept it
  useEffect(() => {
    // Our own echo - ignore
    if (section.title === lastSyncedTitleRef.current) {
      return;
    }
    // Remote change - accept and update ref
    setTitle(section.title);
    lastSyncedTitleRef.current = section.title;
  }, [section.title]);

  useEffect(() => {
    // Ignore if we're actively editing (lock is held)
    if (isEditingContent) {
      return;
    }
    // Our own echo - ignore
    if (section.content === lastSyncedContentRef.current) {
      return;
    }
    // Remote change - accept and update ref
    setContent(section.content);
    lastSyncedContentRef.current = section.content;
  }, [section.content, isEditingContent]);

  // Debounced title updates (title changes as user types)
  const debouncedTitle = useDebounce(title, 500);

  useEffect(() => {
    if (debouncedTitle !== section.title) {
      // Update the ref BEFORE syncing so we know this change is from us
      lastSyncedTitleRef.current = debouncedTitle;
      onUpdate({ title: debouncedTitle });
    }
  }, [debouncedTitle, section.title, onUpdate]);

  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
    if (!isExpanded) {
      onActivate();
    }
  }, [isExpanded, onActivate]);

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
  }, []);

  const handleContentChange = useCallback((value: string) => {
    // Update local state
    setContent(value);
    // Track what we sent to detect our own echo
    lastSyncedContentRef.current = value;
    // Sync to Yjs immediately (no debounce - only called on validation)
    onUpdate({ content: value });
  }, [onUpdate]);

  const handleEditingChange = useCallback((editing: boolean) => {
    setIsEditingContent(editing);
  }, []);

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete();
    },
    [onDelete]
  );

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        onDragEnter();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className={`
        transition-all
        ${isActive ? 'bg-bg-secondary' : ''}
        ${isDragging ? 'opacity-50' : ''}
        ${isDragOver ? 'border-t-2 border-accent' : ''}
      `}
      onClick={onActivate}
    >
      {/* Section header */}
      <div className="group flex items-center gap-1 px-2 py-2 cursor-pointer hover:bg-bg-secondary">
        {/* Drag handle - only this element is draggable */}
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', section.id);
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          className="text-text-tertiary cursor-grab active:cursor-grabbing p-0.5 -m-0.5 hover:bg-bg-tertiary rounded"
        >
          <GripVertical size={14} />
        </div>

        {/* Expand/collapse */}
        <button
          onClick={handleToggleExpand}
          className="p-0.5 text-text-secondary hover:text-text-primary"
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {/* Title input */}
        <Input
          ref={titleInputRef}
          value={title}
          onChange={handleTitleChange}
          placeholder={t('report.sectionTitle')}
          className="flex-1 border-transparent bg-transparent hover:border-border-default focus:border-border-default text-sm font-medium"
          onClick={(e) => e.stopPropagation()}
        />

        {/* Plugin section actions */}
        {sectionPlugins.map((PluginComponent, i) => (
          <PluginComponent key={`sp-${i}`} sectionId={section.id} investigationId={investigationId} />
        ))}

        {/* Delete button */}
        <IconButton
          onClick={handleDelete}
          title={t('report.deleteSection')}
          className="opacity-0 group-hover:opacity-100 hover:text-error"
        >
          <Trash2 size={14} />
        </IconButton>
      </div>

      {/* Section content */}
      {isExpanded && (
        <div className="px-3 pb-3">
          <ReportMarkdownEditor
            value={content}
            onChange={handleContentChange}
            onEditingChange={handleEditingChange}
            sectionId={section.id}
            placeholder={t('report.contentPlaceholder')}
          />
        </div>
      )}
    </div>
  );
}
