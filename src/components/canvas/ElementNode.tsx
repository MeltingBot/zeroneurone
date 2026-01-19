import { useState, useEffect, useRef } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import { useShallow } from 'zustand/react/shallow';
import { Loader2 } from 'lucide-react';
import type { Element } from '../../types';
import { useUIStore, useSyncStore } from '../../stores';

// Redacted text component for anonymous mode
function RedactedText({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }) {
  // Create black rectangles roughly matching text length
  const charCount = Math.max(3, Math.min(text.length, 15));
  return (
    <span className={className} style={style}>
      <span
        className="inline-block bg-text-primary rounded-sm"
        style={{ width: `${charCount * 0.5}em`, height: '1em', verticalAlign: 'middle' }}
      />
    </span>
  );
}

// Remote user presence info for an element
export interface RemoteUserPresence {
  name: string;
  color: string;
  /** True if the user is actively dragging this element */
  isDragging?: boolean;
}

export interface ElementNodeData extends Record<string, unknown> {
  element: Element;
  isSelected: boolean;
  isDimmed: boolean;
  thumbnail: string | null;
  onResize?: (width: number, height: number) => void;
  isEditing?: boolean;
  onLabelChange?: (newLabel: string) => void;
  onStopEditing?: () => void;
  /** Remote users who have this element selected */
  remoteSelectors?: RemoteUserPresence[];
  /** Number of unresolved comments on this element */
  unresolvedCommentCount?: number;
  /** True if asset is expected but not yet loaded (for collaboration sync) */
  isLoadingAsset?: boolean;
}

// Minimum sizes for resizing
const MIN_WIDTH = 60;
const MIN_HEIGHT = 40;

function ElementNodeComponent({ data }: NodeProps) {
  const nodeData = data as ElementNodeData;
  const { element, isSelected, isDimmed, thumbnail, onResize, isEditing, onLabelChange, onStopEditing, unresolvedCommentCount, isLoadingAsset } = nodeData;

  // Get sync state for this element
  const { remoteUsers, mode: syncMode } = useSyncStore(
    useShallow((state) => ({
      remoteUsers: state.remoteUsers,
      mode: state.mode,
    }))
  );

  // Compute remote selectors for this element
  const remoteSelectors: RemoteUserPresence[] = [];
  for (const user of remoteUsers) {
    const dragging = user.dragging || [];
    const selections = user.selection || [];

    const isDraggingThis = dragging.includes(element.id);
    const isSelectingThis = selections.includes(element.id);

    if (isDraggingThis || isSelectingThis) {
      remoteSelectors.push({
        name: user.name,
        color: user.color,
        isDragging: isDraggingThis,
      });
    }
  }

  const [isHovered, setIsHovered] = useState(false);
  const [editValue, setEditValue] = useState(element.label || '');
  const inputRef = useRef<HTMLInputElement>(null);
  const fontMode = useUIStore((state) => state.fontMode);
  const themeMode = useUIStore((state) => state.themeMode);
  const hideMedia = useUIStore((state) => state.hideMedia);
  const anonymousMode = useUIStore((state) => state.anonymousMode);
  const showCommentBadges = useUIStore((state) => state.showCommentBadges);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      setEditValue(element.label || '');
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing, element.label]);

  // Handle input key events
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      onLabelChange?.(editValue);
      onStopEditing?.();
    } else if (e.key === 'Escape') {
      setEditValue(element.label || '');
      onStopEditing?.();
    }
  };

  // Handle input blur
  const handleInputBlur = () => {
    onLabelChange?.(editValue);
    onStopEditing?.();
  };

  // Use custom dimensions if set, otherwise calculate from base size
  const sizeMap = {
    small: 40,
    medium: 56,
    large: 72,
  };
  const baseSize =
    typeof element.visual.size === 'number'
      ? element.visual.size
      : sizeMap[element.visual.size];

  // Calculate default dimensions
  // Note: hasThumbnail doesn't depend on hideMedia - we still show thumbnail but blur it
  const hasThumbnail = Boolean(thumbnail);

  const getDefaultDimensions = () => {
    if (element.visual.customWidth && element.visual.customHeight) {
      return {
        width: element.visual.customWidth,
        height: element.visual.customHeight,
      };
    }
    if (hasThumbnail) {
      return {
        width: Math.max(baseSize * 1.2, 96),
        height: Math.max(baseSize * 1.2, 96),
      };
    }

    // Calculate size based on label
    const label = element.label || 'Sans nom';
    const labelLength = label.length;

    // Estimate text width (average 7px per character + padding)
    const estimatedTextWidth = labelLength * 7 + 24;

    const shape = element.visual.shape;

    if (shape === 'rectangle') {
      // Rectangle: expand horizontally to fit text
      const width = Math.max(estimatedTextWidth, baseSize, 80);
      const height = Math.max(baseSize * 0.6, 36);
      return { width: Math.min(width, 250), height };
    }

    if (shape === 'circle' || shape === 'hexagon') {
      // Circle/Hexagon: need to be big enough to contain text
      // Diameter should accommodate text width with some margin
      const size = Math.max(estimatedTextWidth * 0.8, baseSize, 50);
      return { width: Math.min(size, 150), height: Math.min(size, 150) };
    }

    if (shape === 'diamond') {
      // Diamond: rotated 45°, needs more space
      const size = Math.max(estimatedTextWidth * 0.9, baseSize, 60);
      return { width: Math.min(size, 150), height: Math.min(size, 150) };
    }

    // Square or default
    const size = Math.max(estimatedTextWidth * 0.7, baseSize, 50);
    return { width: Math.min(size, 150), height: Math.min(size, 150) };
  };

  const defaultDimensions = getDefaultDimensions();

  // Local state for live resize preview
  const [dimensions, setDimensions] = useState(defaultDimensions);

  // Sync with element data when it changes (e.g., after save)
  useEffect(() => {
    setDimensions(getDefaultDimensions());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element.visual.customWidth, element.visual.customHeight, element.visual.shape, element.label, baseSize, hasThumbnail]);

  // Shape styles with sketchy borders
  const shapeStyles: Record<string, string> = {
    circle: 'sketchy-circle',
    square: 'sketchy-border',
    diamond: 'sketchy-border rotate-45',
    rectangle: 'sketchy-border',
    hexagon: '', // Hexagon uses clip-path instead
  };

  // Clip-path for hexagon shape
  const hexagonClipPath = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';

  // Handle visibility: show when hovered or selected
  const handleOpacity = isHovered || isSelected ? 'opacity-100' : 'opacity-0';

  // Live resize handler - updates visual preview
  const handleResize = (_event: unknown, params: { width: number; height: number }) => {
    setDimensions({ width: params.width, height: params.height });
  };

  // Final resize handler - persists to database
  const handleResizeEnd = (_event: unknown, params: { width: number; height: number }) => {
    if (onResize) {
      onResize(params.width, params.height);
    }
  };

  const { width, height } = dimensions;

  return (
    <div
      className={`relative transition-opacity cursor-pointer ${isDimmed ? 'opacity-30' : 'opacity-100'}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ width, height }}
    >
      {/* Remote user selection/dragging indicators - circles with initials */}
      {remoteSelectors && remoteSelectors.length > 0 && (
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex items-center gap-1 z-20">
          {remoteSelectors.slice(0, 3).map((user, idx) => {
            const initials = user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
            return (
              <div
                key={idx}
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-md ${user.isDragging ? 'animate-pulse' : ''}`}
                style={{ backgroundColor: user.color }}
                title={user.isDragging ? `${user.name} déplace` : user.name}
              >
                {initials}
              </div>
            );
          })}
          {remoteSelectors.length > 3 && (
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium text-text-secondary bg-bg-tertiary border border-border-default"
              title={remoteSelectors.slice(3).map(u => u.name).join(', ')}
            >
              +{remoteSelectors.length - 3}
            </div>
          )}
        </div>
      )}

      {/* Node Resizer - only visible when selected */}
      <NodeResizer
        minWidth={MIN_WIDTH}
        minHeight={MIN_HEIGHT}
        isVisible={isSelected}
        lineClassName="!border-accent"
        handleClassName="!w-3 !h-3 !bg-accent !border-2 !border-white !rounded"
        onResize={handleResize}
        onResizeEnd={handleResizeEnd}
      />

      {/* 4 handles for free-form connections in all directions */}
      <Handle
        type="source"
        position={Position.Top}
        id="top"
        className={`!w-2 !h-2 !bg-accent !border !border-white transition-opacity ${handleOpacity}`}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className={`!w-2 !h-2 !bg-accent !border !border-white transition-opacity ${handleOpacity}`}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left"
        className={`!w-2 !h-2 !bg-accent !border !border-white transition-opacity ${handleOpacity}`}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className={`!w-2 !h-2 !bg-accent !border !border-white transition-opacity ${handleOpacity}`}
      />

      {/* Comment indicator - shows when element has unresolved comments */}
      {showCommentBadges && unresolvedCommentCount !== undefined && unresolvedCommentCount > 0 && (
        <div
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center shadow-sm z-10"
          title={`${unresolvedCommentCount} commentaire${unresolvedCommentCount > 1 ? 's' : ''} non résolu${unresolvedCommentCount > 1 ? 's' : ''}`}
        >
          {unresolvedCommentCount > 9 ? '9+' : unresolvedCommentCount}
        </div>
      )}

      {/* Node body */}
      <div
        className={`
          w-full h-full
          flex flex-col items-center justify-center overflow-hidden
          border-2 transition-all
          ${hasThumbnail ? 'sketchy-border-soft' : shapeStyles[element.visual.shape]}
          ${isSelected ? 'selection-ring' : 'node-shadow hover:node-shadow-hover'}
        `}
        style={{
          backgroundColor: hasThumbnail
            ? 'var(--color-bg-primary)'
            : getThemeAwareColor(element.visual.color, themeMode === 'dark'),
          borderColor: themeMode === 'dark' && !hasThumbnail
            ? getThemeAwareColor(element.visual.borderColor, true)
            : element.visual.borderColor,
          clipPath: element.visual.shape === 'hexagon' && !hasThumbnail ? hexagonClipPath : undefined,
          // Remote user selection/dragging ring - more prominent when dragging
          boxShadow: (() => {
            if (!remoteSelectors || remoteSelectors.length === 0) return undefined;
            const draggingUser = remoteSelectors.find(u => u.isDragging);
            if (draggingUser) {
              // Dragging: thicker ring with animation effect
              return `0 0 0 3px ${draggingUser.color}, 0 0 12px ${draggingUser.color}80`;
            }
            // Selection: subtle ring
            return `0 0 0 2px ${remoteSelectors[0].color}60, 0 0 0 4px ${remoteSelectors[0].color}`;
          })(),
        }}
      >
        {isLoadingAsset ? (
          /* Loading state - asset expected but not yet loaded */
          <>
            <div className="flex-1 w-full flex items-center justify-center bg-bg-secondary">
              <Loader2 size={24} className="animate-spin text-text-tertiary" />
            </div>
            <div className="w-full px-1 py-0.5 bg-bg-secondary border-t border-border-default flex-shrink-0">
              <span
                className={`text-[10px] text-text-tertiary block text-center ${fontMode === 'handwritten' ? 'canvas-handwritten-text' : ''}`}
              >
                {element.label || 'Chargement...'}
              </span>
            </div>
          </>
        ) : hasThumbnail ? (
          <>
            {/* Thumbnail preview - using contain to show full image, blur if hideMedia */}
            <div
              className="flex-1 w-full bg-contain bg-center bg-no-repeat"
              style={{
                backgroundImage: `url(${thumbnail})`,
                backgroundColor: 'var(--color-bg-secondary)',
                filter: hideMedia ? 'blur(12px)' : undefined,
              }}
            />
            {/* Filename label */}
            <div className="w-full px-1 py-0.5 bg-bg-secondary border-t border-border-default flex-shrink-0">
              {isEditing ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  onBlur={handleInputBlur}
                  className="w-full text-[10px] text-text-primary text-center bg-transparent border-none outline-none focus:ring-1 focus:ring-accent rounded"
                  style={{ fontFamily: fontMode === 'handwritten' ? '"Caveat", cursive' : undefined }}
                />
              ) : anonymousMode ? (
                <RedactedText
                  text={element.label || 'Sans nom'}
                  className={`text-[10px] block text-center ${fontMode === 'handwritten' ? 'canvas-handwritten-text' : ''}`}
                />
              ) : (
                <span
                  className={`text-[10px] text-text-primary block text-center ${fontMode === 'handwritten' ? 'canvas-handwritten-text' : ''}`}
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: width > 120 ? 'normal' : 'nowrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {element.label || 'Sans nom'}
                </span>
              )}
            </div>
          </>
        ) : (
          /* Diamond shape content needs to be counter-rotated */
          <div
            className={`
              text-center px-2 overflow-hidden w-full
              ${element.visual.shape === 'diamond' ? '-rotate-45' : ''}
            `}
          >
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleInputKeyDown}
                onBlur={handleInputBlur}
                className="w-full text-xs font-medium text-center bg-transparent border-none outline-none focus:ring-1 focus:ring-accent rounded"
                style={{
                  color: isLightColor(getThemeAwareColor(element.visual.color, themeMode === 'dark'))
                    ? '#111827'
                    : '#ffffff',
                  fontFamily: fontMode === 'handwritten' ? '"Caveat", cursive' : undefined,
                }}
              />
            ) : anonymousMode ? (
              <RedactedText
                text={element.label || 'Sans nom'}
                className={`text-xs font-medium leading-tight block ${fontMode === 'handwritten' ? 'canvas-handwritten-text' : ''}`}
              />
            ) : (
              <span
                className={`text-xs font-medium leading-tight block ${fontMode === 'handwritten' ? 'canvas-handwritten-text' : ''}`}
                style={{
                  color: isLightColor(getThemeAwareColor(element.visual.color, themeMode === 'dark'))
                    ? '#111827'
                    : '#ffffff',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: Math.max(1, Math.floor(height / 16)),
                  WebkitBoxOrient: 'vertical',
                  wordBreak: 'break-word',
                }}
              >
                {element.label || 'Sans nom'}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper to determine if a color is light
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

// Helper to get color brightness (0-255)
function getColorBrightness(color: string): number {
  if (color.startsWith('var(')) return 200; // CSS variables assumed light
  const hex = color.replace('#', '');
  if (hex.length !== 6) return 200;
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

// Darken a color for dark mode
function darkenColor(color: string, amount: number = 0.6): string {
  if (color.startsWith('var(')) return '#3a3532'; // fallback dark color for CSS vars
  const hex = color.replace('#', '');
  if (hex.length !== 6) return '#3a3532';
  const r = Math.round(parseInt(hex.substr(0, 2), 16) * amount);
  const g = Math.round(parseInt(hex.substr(2, 2), 16) * amount);
  const b = Math.round(parseInt(hex.substr(4, 2), 16) * amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Get theme-aware background color
function getThemeAwareColor(color: string, isDarkMode: boolean): string {
  if (!isDarkMode) return color;
  // In dark mode, darken very light colors
  const brightness = getColorBrightness(color);
  if (brightness > 200) {
    // Very light color (white, cream, light gray) -> use dark variant
    return darkenColor(color, 0.25);
  } else if (brightness > 150) {
    // Light color -> moderate darkening
    return darkenColor(color, 0.4);
  }
  // Already a medium/dark color, keep it
  return color;
}

// Note: Not using memo here to allow Zustand store updates to trigger re-renders
// React Flow has its own optimization layer
export const ElementNode = ElementNodeComponent;
