import { memo, useRef, useCallback, useMemo } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import * as LucideIcons from 'lucide-react';
import type { Element } from '../../types';
import { useUIStore, useTagSetStore } from '../../stores';

// Redacted text component for anonymous mode
function RedactedText({ text, className }: { text: string; className?: string }) {
  const charCount = Math.max(3, Math.min(text.length, 15));
  return (
    <span className={className}>
      <span
        className="inline-block bg-text-primary rounded-sm"
        style={{ width: `${charCount * 0.5}em`, height: '0.9em', verticalAlign: 'middle' }}
      />
    </span>
  );
}

export interface GroupNodeData extends Record<string, unknown> {
  element: Element;
  isSelected: boolean;
  isDimmed: boolean;
  onResize?: (width: number, height: number) => void;
  isEditing?: boolean;
  onLabelChange?: (newLabel: string) => void;
  onStopEditing?: () => void;
  themeMode?: 'light' | 'dark';
  unresolvedCommentCount?: number;
  showConfidenceIndicator?: boolean;
  displayedPropertyValues?: { key: string; value: string }[];
  tagDisplayMode?: 'none' | 'icons' | 'labels' | 'both';
  tagDisplaySize?: 'small' | 'medium' | 'large';
}

const MIN_WIDTH = 150;
const MIN_HEIGHT = 100;

function GroupNodeComponent({ data }: NodeProps) {
  const nodeData = data as GroupNodeData;
  const {
    element, isSelected, isDimmed, onResize, isEditing, onLabelChange, onStopEditing,
    unresolvedCommentCount, showConfidenceIndicator, displayedPropertyValues,
    tagDisplayMode, tagDisplaySize,
  } = nodeData;
  const inputRef = useRef<HTMLInputElement>(null);
  const showCommentBadges = useUIStore((state) => state.showCommentBadges);
  const anonymousMode = useUIStore((state) => state.anonymousMode);
  const tagSetsMap = useTagSetStore((state) => state.tagSets);

  const handleResizeEnd = useCallback(
    (_event: unknown, params: { width: number; height: number }) => {
      onResize?.(params.width, params.height);
    },
    [onResize]
  );

  const handleLabelSubmit = useCallback(() => {
    if (inputRef.current && onLabelChange) {
      onLabelChange(inputRef.current.value);
    }
    onStopEditing?.();
  }, [onLabelChange, onStopEditing]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleLabelSubmit();
      } else if (e.key === 'Escape') {
        onStopEditing?.();
      }
    },
    [handleLabelSubmit, onStopEditing]
  );

  const containerStyle = useMemo(() => {
    const defaultBorderColor = element.visual.borderColor || '#e5e7eb';
    const borderColor = isSelected ? '#2563eb' : defaultBorderColor;
    const borderStyle = element.visual.borderStyle || 'dashed';
    const borderWidth = element.visual.borderWidth ?? 1;
    const bgColor = element.visual.color && element.visual.color !== '#ffffff'
      ? element.visual.color + '12'
      : 'rgba(243,244,246,0.2)';

    return {
      width: '100%' as const,
      height: '100%' as const,
      borderColor,
      borderStyle,
      borderWidth,
      backgroundColor: bgColor,
      opacity: isDimmed ? 0.3 : 1,
      borderRadius: 4,
    };
  }, [element.visual.borderColor, element.visual.borderStyle, element.visual.borderWidth, element.visual.color, isDimmed, isSelected]);

  // Tags with icons (same logic as ElementNode)
  const tagsToDisplay = useMemo(() => {
    if (tagDisplayMode === 'none' || !element.tags || element.tags.length === 0) return [];
    const tags: { name: string; iconName: string | null }[] = [];
    for (const tagName of element.tags) {
      let iconName: string | null = null;
      for (const ts of tagSetsMap.values()) {
        if (ts.name === tagName) {
          iconName = ts.defaultVisual.icon;
          break;
        }
      }
      tags.push({ name: tagName, iconName });
    }
    return tags;
  }, [tagDisplayMode, element.tags, tagSetsMap]);

  const tagSizeConfig = useMemo(() => {
    switch (tagDisplaySize) {
      case 'large': return { iconSize: 18, fontSize: 'text-sm', padding: 'px-2 py-1', boxSize: 'w-7 h-7' };
      case 'medium': return { iconSize: 16, fontSize: 'text-xs', padding: 'px-1.5 py-0.5', boxSize: 'w-6 h-6' };
      default: return { iconSize: 14, fontSize: 'text-[11px]', padding: 'px-1.5 py-0.5', boxSize: 'w-5 h-5' };
    }
  }, [tagDisplaySize]);

  return (
    <div
      onPointerDown={(e) => {
        // Prevent canvas panning when element is position-locked
        if (element.isPositionLocked && e.button === 0) {
          e.stopPropagation();
        }
      }}
    >
      {isSelected && (
        <NodeResizer
          minWidth={MIN_WIDTH}
          minHeight={MIN_HEIGHT}
          onResizeEnd={handleResizeEnd}
          lineClassName="!border-transparent"
          handleClassName="!w-2 !h-2 !bg-gray-700 !border !border-white !rounded-sm"
        />
      )}

      <div style={containerStyle}>
        {/* Label - top left */}
        <div className="absolute top-2.5 left-2.5 px-1 max-w-[70%] z-10">
          {isEditing ? (
            <input
              ref={inputRef}
              autoFocus
              defaultValue={element.label}
              onBlur={handleLabelSubmit}
              onKeyDown={handleKeyDown}
              className="text-xs font-medium bg-transparent border-b border-accent outline-none w-full text-text-primary"
            />
          ) : anonymousMode ? (
            <RedactedText text={element.label || 'Groupe'} className="text-xs font-medium truncate block" />
          ) : (
            <span className="text-xs font-medium text-text-secondary truncate block">
              {element.label || 'Groupe'}
            </span>
          )}
        </div>

        {/* Comment badge - top right */}
        {showCommentBadges && unresolvedCommentCount !== undefined && unresolvedCommentCount > 0 && (
          <div
            className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center z-10"
            title={`${unresolvedCommentCount} commentaire${unresolvedCommentCount > 1 ? 's' : ''} non résolu${unresolvedCommentCount > 1 ? 's' : ''}`}
          >
            {unresolvedCommentCount > 9 ? '9+' : unresolvedCommentCount}
          </div>
        )}

        {/* Confidence - top center */}
        {showConfidenceIndicator && element.confidence !== null && (
          <div
            className="absolute top-1.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-bg-secondary border border-border-default rounded text-xs flex items-center gap-1 z-10"
            title={`Confiance: ${element.confidence}%`}
          >
            <span className="text-[10px]">🤝</span>
            <span className="text-text-secondary font-medium text-[10px]">{element.confidence}%</span>
          </div>
        )}

        {/* Tags - bottom right (same style as ElementNode) */}
        {tagsToDisplay.length > 0 && (
          <div className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 z-10">
            {tagsToDisplay.slice(0, 4).map(({ name, iconName }) => {
              const IconComponent = iconName
                ? (LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number; className?: string }>>)[iconName]
                : null;
              const showIcon = (tagDisplayMode === 'icons' || tagDisplayMode === 'both') && IconComponent;
              const showLabel = tagDisplayMode === 'labels' || tagDisplayMode === 'both';

              if (tagDisplayMode === 'icons') {
                if (!IconComponent) return null;
                return (
                  <div
                    key={name}
                    className={`${tagSizeConfig.boxSize} rounded bg-bg-secondary border border-border-default flex items-center justify-center`}
                    title={name}
                  >
                    <IconComponent size={tagSizeConfig.iconSize} className="text-text-secondary" />
                  </div>
                );
              }

              return (
                <div
                  key={name}
                  className={`${tagSizeConfig.padding} rounded bg-bg-secondary border border-border-default flex items-center gap-0.5`}
                  title={name}
                >
                  {showIcon && <IconComponent size={tagSizeConfig.iconSize} className="text-text-secondary" />}
                  {showLabel && <span className={`${tagSizeConfig.fontSize} text-text-secondary whitespace-nowrap`}>{name}</span>}
                </div>
              );
            })}
            {tagsToDisplay.length > 4 && (
              <div
                className={`${tagSizeConfig.boxSize} rounded bg-bg-secondary border border-border-default flex items-center justify-center ${tagSizeConfig.fontSize} text-text-tertiary`}
                title={tagsToDisplay.slice(4).map(t => t.name).join(', ')}
              >
                +{tagsToDisplay.length - 4}
              </div>
            )}
          </div>
        )}

        {/* Displayed properties - bottom center (hidden in anonymous mode) */}
        {displayedPropertyValues && displayedPropertyValues.length > 0 && !anonymousMode && (
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5 z-10">
            {displayedPropertyValues.slice(0, 3).map(({ key, value }) => {
              const displayValue = value.length > 20 ? value.slice(0, 20) + '...' : value;
              return (
                <div
                  key={key}
                  className="px-1.5 py-0.5 bg-bg-tertiary border border-border-default rounded whitespace-nowrap"
                  title={`${key}: ${value}`}
                >
                  <span className="text-[10px] text-text-tertiary">{key}:</span>{' '}
                  <span className="text-[11px] text-text-secondary">{displayValue}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Handles for connections - offset from center to avoid NodeResizer handles */}
      <Handle type="source" position={Position.Top} id="source-top" style={{ left: '30%' }} className="!w-2 !h-2 !bg-border-default !border-0 opacity-0 hover:opacity-100 !z-10" />
      <Handle type="source" position={Position.Bottom} id="source-bottom" style={{ left: '30%' }} className="!w-2 !h-2 !bg-border-default !border-0 opacity-0 hover:opacity-100 !z-10" />
      <Handle type="source" position={Position.Left} id="source-left" style={{ top: '30%' }} className="!w-2 !h-2 !bg-border-default !border-0 opacity-0 hover:opacity-100 !z-10" />
      <Handle type="source" position={Position.Right} id="source-right" style={{ top: '30%' }} className="!w-2 !h-2 !bg-border-default !border-0 opacity-0 hover:opacity-100 !z-10" />
      <Handle type="target" position={Position.Top} id="target-top" style={{ left: '70%' }} className="!w-2 !h-2 !bg-border-default !border-0 opacity-0 hover:opacity-100 !z-10" />
      <Handle type="target" position={Position.Bottom} id="target-bottom" style={{ left: '70%' }} className="!w-2 !h-2 !bg-border-default !border-0 opacity-0 hover:opacity-100 !z-10" />
      <Handle type="target" position={Position.Left} id="target-left" style={{ top: '70%' }} className="!w-2 !h-2 !bg-border-default !border-0 opacity-0 hover:opacity-100 !z-10" />
      <Handle type="target" position={Position.Right} id="target-right" style={{ top: '70%' }} className="!w-2 !h-2 !bg-border-default !border-0 opacity-0 hover:opacity-100 !z-10" />
    </div>
  );
}

export const GroupNode = memo(GroupNodeComponent);
