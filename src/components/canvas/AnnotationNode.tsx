import { memo, useRef, useCallback, useMemo, useState, useEffect } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import type { Element } from '../../types';
import { useUIStore } from '../../stores';

// Helper to determine if a color is light (for text contrast)
function isLightColor(color: string): boolean {
  if (color.startsWith('var(')) return true; // CSS variables assumed light
  const hex = color.replace('#', '');
  if (hex.length !== 6) return true;
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128;
}

export interface AnnotationNodeData extends Record<string, unknown> {
  element: Element;
  isSelected: boolean;
  isDimmed: boolean;
  isEditing?: boolean;
  onLabelChange?: (newContent: string) => void;
  onStopEditing?: () => void;
  onResize?: (width: number, height: number) => void;
}

const MIN_WIDTH = 80;
const MIN_HEIGHT = 40;

/** Basic markdown rendering: bold, italic, headings, lists */
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = formatInline(headingMatch[2]);
      const className = level === 1
        ? 'text-sm font-semibold text-text-primary'
        : level === 2
          ? 'text-[13px] font-semibold text-text-primary'
          : 'text-[13px] font-medium text-text-primary';
      return <div key={i} className={className}>{content}</div>;
    }

    if (line.match(/^[-*]\s+/)) {
      const content = formatInline(line.replace(/^[-*]\s+/, ''));
      return (
        <div key={i} className="flex gap-1">
          <span className="text-text-tertiary select-none">&bull;</span>
          <span>{content}</span>
        </div>
      );
    }

    if (line.trim() === '') {
      return <div key={i} className="h-1" />;
    }

    return <div key={i}>{formatInline(line)}</div>;
  });
}

/** Format inline bold and italic */
function formatInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/);

    const boldIndex = boldMatch ? remaining.indexOf(boldMatch[0]) : Infinity;
    const italicIndex = italicMatch ? remaining.indexOf(italicMatch[0]) : Infinity;

    if (boldIndex === Infinity && italicIndex === Infinity) {
      parts.push(remaining);
      break;
    }

    if (boldIndex <= italicIndex && boldMatch) {
      if (boldIndex > 0) parts.push(remaining.slice(0, boldIndex));
      parts.push(<strong key={key++}>{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldIndex + boldMatch[0].length);
    } else if (italicMatch) {
      if (italicIndex > 0) parts.push(remaining.slice(0, italicIndex));
      parts.push(<em key={key++}>{italicMatch[1]}</em>);
      remaining = remaining.slice(italicIndex + italicMatch[0].length);
    }
  }

  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : <>{parts}</>;
}

function AnnotationNodeComponent({ data }: NodeProps) {
  const nodeData = data as AnnotationNodeData;
  const { element, isSelected, isDimmed, onLabelChange, onStopEditing, onResize } = nodeData;
  const anonymousMode = useUIStore((state) => state.anonymousMode);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localEditing, setLocalEditing] = useState(false);
  const [editValue, setEditValue] = useState(element.notes || '');
  const wasSelectedRef = useRef(false);

  const isEditing = localEditing || nodeData.isEditing;

  // Reset editing when deselected
  useEffect(() => {
    if (!isSelected && localEditing) {
      // Save before exiting
      if (onLabelChange) onLabelChange(editValue);
      setLocalEditing(false);
      onStopEditing?.();
    }
  }, [isSelected, localEditing, editValue, onLabelChange, onStopEditing]);

  // Track selection state for click-to-edit
  useEffect(() => {
    wasSelectedRef.current = isSelected;
  });

  // Sync edit value when element.notes changes externally
  useEffect(() => {
    if (!isEditing) {
      setEditValue(element.notes || '');
    }
  }, [element.notes, isEditing]);

  // Auto-focus and auto-resize textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [isEditing]);

  const handleResizeEnd = useCallback(
    (_event: unknown, params: { width: number; height: number }) => {
      onResize?.(params.width, params.height);
    },
    [onResize]
  );

  const handleSave = useCallback(() => {
    if (onLabelChange) onLabelChange(editValue);
    setLocalEditing(false);
    onStopEditing?.();
  }, [editValue, onLabelChange, onStopEditing]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditValue(element.notes || '');
        setLocalEditing(false);
        onStopEditing?.();
      }
      e.stopPropagation();
    },
    [element.notes, onStopEditing]
  );

  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditValue(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  }, []);

  // Click on content: enter edit mode if already selected
  const handleContentClick = useCallback((e: React.MouseEvent) => {
    if (wasSelectedRef.current && !isEditing) {
      e.stopPropagation();
      setLocalEditing(true);
    }
  }, [isEditing]);

  // Double-click: always enter edit mode
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setLocalEditing(true);
  }, []);

  const borderStyle = element.visual.borderStyle || 'solid';
  const borderWidth = element.visual.borderWidth ?? 1;
  const borderColor = isSelected
    ? 'var(--color-accent)'
    : (element.visual.borderColor || 'var(--color-border-default)');

  const bgColor = element.visual.color || 'var(--color-bg-primary)';

  // Determine text color based on background brightness
  const textColor = useMemo(() => {
    if (!element.visual.color) return undefined; // Use CSS variable default
    return isLightColor(element.visual.color) ? '#374151' : '#f3f4f6';
  }, [element.visual.color]);

  const containerStyle = useMemo(() => ({
    width: '100%',
    opacity: isDimmed ? 0.3 : 1,
    borderRadius: 3,
    border: `${borderWidth}px ${borderStyle} ${borderColor}`,
    padding: '6px 8px',
    backgroundColor: bgColor,
  }), [isDimmed, borderWidth, borderStyle, borderColor, bgColor]);

  const renderedContent = useMemo(() => {
    const text = element.notes || '';
    if (!text || text === 'Note...') return <span className="text-text-tertiary italic text-[13px]">Note...</span>;
    if (anonymousMode) {
      // Show redacted blocks for each line
      const lines = text.split('\n').filter(l => l.trim());
      return lines.map((line, i) => (
        <div key={i} className="mb-0.5">
          <span
            className="inline-block bg-text-primary rounded-sm"
            style={{ width: `${Math.max(3, Math.min(line.length, 20)) * 0.4}em`, height: '0.9em', verticalAlign: 'middle' }}
          />
        </div>
      ));
    }
    return renderMarkdown(text);
  }, [element.notes, anonymousMode]);

  return (
    <>
      {isSelected && (
        <NodeResizer
          minWidth={MIN_WIDTH}
          minHeight={MIN_HEIGHT}
          onResizeEnd={handleResizeEnd}
          lineClassName="!border-transparent"
          handleClassName="!w-2 !h-2 !bg-gray-700 !border !border-white !rounded-sm"
        />
      )}

      <div
        style={containerStyle}
        onDoubleClick={handleDoubleClick}
        onClick={handleContentClick}
      >
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={editValue}
            onChange={handleTextareaChange}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className={`w-full bg-transparent border-none outline-none resize-none text-[13px] nodrag nowheel nopan ${!textColor ? 'text-text-secondary' : ''}`}
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: textColor }}
          />
        ) : (
          <div
            className={`text-[13px] ${!textColor ? 'text-text-secondary' : ''}`}
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: textColor }}
          >
            {renderedContent}
          </div>
        )}
      </div>
    </>
  );
}

export const AnnotationNode = memo(AnnotationNodeComponent);
