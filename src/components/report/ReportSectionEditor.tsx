import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Trash2, GripVertical } from 'lucide-react';
import type { ReportSection } from '../../types';
import { ReportMarkdownEditor } from './ReportMarkdownEditor';
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
  const [isExpanded, setIsExpanded] = useState(true);
  const [title, setTitle] = useState(section.title);
  const [content, setContent] = useState(section.content);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Sync from props when section changes
  useEffect(() => {
    setTitle(section.title);
    setContent(section.content);
  }, [section.title, section.content]);

  // Debounced updates
  const debouncedTitle = useDebounce(title, 500);
  const debouncedContent = useDebounce(content, 500);

  useEffect(() => {
    if (debouncedTitle !== section.title) {
      onUpdate({ title: debouncedTitle });
    }
  }, [debouncedTitle, section.title, onUpdate]);

  useEffect(() => {
    if (debouncedContent !== section.content) {
      onUpdate({ content: debouncedContent });
    }
  }, [debouncedContent, section.content, onUpdate]);

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
    setContent(value);
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
            placeholder={t('report.contentPlaceholder')}
          />
        </div>
      )}
    </div>
  );
}
