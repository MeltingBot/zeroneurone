import { useState, useEffect, useRef, memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import { Loader2 } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import type { Element } from '../../types';
import { FONT_SIZE_PX } from '../../types';
import { useUIStore, useTagSetStore } from '../../stores';
import { useHdImage } from '../../hooks/useHdImage';

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
  onResize?: (width: number, height: number, position?: { x: number; y: number }) => void;
  isEditing?: boolean;
  onLabelChange?: (newLabel: string) => void;
  onStopEditing?: () => void;
  /** Remote users who have this element selected */
  remoteSelectors?: RemoteUserPresence[];
  /** Number of unresolved comments on this element */
  unresolvedCommentCount?: number;
  /** True if asset is expected but not yet loaded (for collaboration sync) */
  isLoadingAsset?: boolean;
  /** Property to display as badge (value and type for country flag) */
  badgeProperty?: { value: string; type: string } | null;
  /** Show confidence indicator (🤝 + %) */
  showConfidenceIndicator?: boolean;
  /** Properties to display below the element */
  displayedPropertyValues?: { key: string; value: string }[];
  /** Tag display mode: none, icons, labels, or both */
  tagDisplayMode?: 'none' | 'icons' | 'labels' | 'both';
  /** Tag display size */
  tagDisplaySize?: 'small' | 'medium' | 'large';
  /** Theme mode for color adjustments */
  themeMode?: 'light' | 'dark';
}

// Minimum sizes for resizing
const MIN_WIDTH = 60;
const MIN_HEIGHT = 40;

// Convert country code to flag emoji (e.g., "FR" → "🇫🇷")
function countryCodeToFlag(countryCode: string): string {
  const code = countryCode.toUpperCase();
  if (code.length !== 2) return countryCode;
  // Check if both characters are letters A-Z
  if (!/^[A-Z]{2}$/.test(code)) return countryCode;
  const offset = 127397; // Regional indicator symbol letter A starts at U+1F1E6
  return String.fromCodePoint(code.charCodeAt(0) + offset, code.charCodeAt(1) + offset);
}

// Check if a value looks like a country code (2 uppercase letters)
function isLikelyCountryCode(value: string): boolean {
  return /^[A-Z]{2}$/i.test(value.trim());
}

function ElementNodeComponent({ data }: NodeProps) {
  const { t } = useTranslation('common');
  const nodeData = data as ElementNodeData;
  const { element, isSelected, isDimmed, thumbnail, onResize, isEditing, onLabelChange, onStopEditing, remoteSelectors, unresolvedCommentCount, isLoadingAsset, badgeProperty, showConfidenceIndicator, displayedPropertyValues, tagDisplayMode, tagDisplaySize } = nodeData;

  const [isHovered, setIsHovered] = useState(false);
  const [editValue, setEditValue] = useState(element.label || '');
  const inputRef = useRef<HTMLInputElement>(null);
  const fontMode = useUIStore((state) => state.fontMode);
  // Get themeMode from data (passed from Canvas) for proper memo comparison
  const themeMode = data.themeMode ?? 'light';
  const hideMedia = useUIStore((state) => state.hideMedia);
  const anonymousMode = useUIStore((state) => state.anonymousMode);
  const showCommentBadges = useUIStore((state) => state.showCommentBadges);

  // Font size from visual properties (default: 'sm' = 12px, same as text-xs)
  const labelFontSize = FONT_SIZE_PX[element.visual.fontSize || 'sm'];

  // Get tag data from TagSets
  const tagSetsMap = useTagSetStore((state) => state.tagSets);
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

  // Tag size configuration
  const tagSizeConfig = useMemo(() => {
    switch (tagDisplaySize) {
      case 'large': return { iconSize: 18, fontSize: 'text-sm', padding: 'px-2 py-1', boxSize: 'w-7 h-7' };
      case 'medium': return { iconSize: 16, fontSize: 'text-xs', padding: 'px-1.5 py-0.5', boxSize: 'w-6 h-6' };
      default: return { iconSize: 14, fontSize: 'text-[11px]', padding: 'px-1.5 py-0.5', boxSize: 'w-5 h-5' };
    }
  }, [tagDisplaySize]);

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
    const label = element.label || t('empty.unnamed');
    const labelLength = label.length;

    // Estimate text width (average 7px per character + padding)
    const estimatedTextWidth = labelLength * 7 + 24;

    const shape = element.visual.shape;

    if (shape === 'rectangle') {
      // Rectangle: clearly wider than tall, horizontal card-like shape
      const width = Math.max(estimatedTextWidth * 1.2, 120);
      const height = Math.max(baseSize * 0.5, 40);
      return { width: Math.min(width, 280), height };
    }

    if (shape === 'square') {
      // Square: equal width and height, compact
      const size = Math.max(baseSize, 60);
      return { width: size, height: size };
    }

    if (shape === 'circle') {
      // Circle: need to be big enough to contain text
      // Diameter should accommodate text width with some margin
      const size = Math.max(estimatedTextWidth * 0.8, baseSize, 50);
      return { width: Math.min(size, 150), height: Math.min(size, 150) };
    }

    if (shape === 'diamond') {
      // Diamond: rotated 45°, needs more space
      const size = Math.max(estimatedTextWidth * 0.9, baseSize, 60);
      return { width: Math.min(size, 150), height: Math.min(size, 150) };
    }

    // Default fallback (shouldn't reach here)
    return { width: baseSize, height: baseSize };
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
  };

  // Handle visibility: show when hovered or selected
  const handleOpacity = isHovered || isSelected ? 'opacity-100' : 'opacity-0';

  // Live resize handler - updates visual preview
  const handleResize = (_event: unknown, params: { width: number; height: number }) => {
    setDimensions({ width: params.width, height: params.height });
  };

  // Final resize handler - persists to database
  const handleResizeEnd = (_event: unknown, params: { x: number; y: number; width: number; height: number }) => {
    if (onResize) {
      onResize(params.width, params.height, { x: params.x, y: params.y });
    }
  };

  const { width, height } = dimensions;

  // HD image LOD: load full-resolution from OPFS when node is large enough on screen
  // Skip HD loading when media is hidden — thumbnail is enough for pixelated display
  const firstAssetId = (hasThumbnail && !hideMedia) ? element.assetIds?.[0] : undefined;
  const hdImageUrl = useHdImage(firstAssetId, width, height);

  return (
    <div
      className={`relative cursor-pointer ${isDimmed ? 'opacity-30' : 'opacity-100'}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onPointerDown={(e) => {
        // Prevent canvas panning when element is position-locked
        if (element.isPositionLocked && e.button === 0) {
          e.stopPropagation();
        }
      }}
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

      {/* Source handles on all 4 sides */}
      <Handle
        type="source"
        position={Position.Top}
        id="source-top"
        className={`!w-2 !h-2 !bg-accent !border !border-white ${handleOpacity}`}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="source-bottom"
        className={`!w-2 !h-2 !bg-accent !border !border-white ${handleOpacity}`}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="source-left"
        className={`!w-2 !h-2 !bg-accent !border !border-white ${handleOpacity}`}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source-right"
        className={`!w-2 !h-2 !bg-accent !border !border-white ${handleOpacity}`}
      />

      {/* Target handles on all 4 sides */}
      <Handle
        type="target"
        position={Position.Top}
        id="target-top"
        className={`!w-2 !h-2 !bg-accent !border !border-white ${handleOpacity}`}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="target-bottom"
        className={`!w-2 !h-2 !bg-accent !border !border-white ${handleOpacity}`}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
        className={`!w-2 !h-2 !bg-accent !border !border-white ${handleOpacity}`}
      />
      <Handle
        type="target"
        position={Position.Right}
        id="target-right"
        className={`!w-2 !h-2 !bg-accent !border !border-white ${handleOpacity}`}
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

      {/* Confidence indicator - 🤝 + % */}
      {showConfidenceIndicator && element.confidence !== null && (
        <div
          className="absolute -top-2 -left-2 px-1.5 py-0.5 bg-bg-secondary border border-border-default rounded text-xs flex items-center gap-1 shadow-sm z-10"
          title={`Confiance: ${element.confidence}%`}
        >
          <span className="text-sm">🤝</span>
          <span className="text-text-secondary font-medium">{element.confidence}%</span>
        </div>
      )}

      {/* Tags display */}
      {tagsToDisplay.length > 0 && (
        <div
          className="absolute -bottom-1 -right-1 flex items-center gap-0.5 z-10"
        >
          {tagsToDisplay.slice(0, 4).map(({ name, iconName }) => {
            const IconComponent = iconName
              ? (LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number; className?: string }>>)[iconName]
              : null;
            const showIcon = (tagDisplayMode === 'icons' || tagDisplayMode === 'both') && IconComponent;
            const showLabel = tagDisplayMode === 'labels' || tagDisplayMode === 'both';

            // Icon only mode
            if (tagDisplayMode === 'icons') {
              if (!IconComponent) return null;
              return (
                <div
                  key={name}
                  className={`${tagSizeConfig.boxSize} rounded bg-bg-secondary border border-border-default flex items-center justify-center shadow-sm`}
                  title={name}
                >
                  <IconComponent size={tagSizeConfig.iconSize} className="text-text-secondary" />
                </div>
              );
            }

            // Label or both mode
            return (
              <div
                key={name}
                className={`${tagSizeConfig.padding} rounded bg-bg-secondary border border-border-default flex items-center gap-0.5 shadow-sm`}
                title={name}
              >
                {showIcon && <IconComponent size={tagSizeConfig.iconSize} className="text-text-secondary" />}
                {showLabel && <span className={`${tagSizeConfig.fontSize} text-text-secondary whitespace-nowrap`}>{name}</span>}
              </div>
            );
          })}
          {tagsToDisplay.length > 4 && (
            <div
              className={`${tagSizeConfig.boxSize} rounded bg-bg-secondary border border-border-default flex items-center justify-center ${tagSizeConfig.fontSize} text-text-tertiary shadow-sm`}
              title={tagsToDisplay.slice(4).map(t => t.name).join(', ')}
            >
              +{tagsToDisplay.length - 4}
            </div>
          )}
        </div>
      )}

      {/* Property badge - shows filtered property value */}
      {badgeProperty && !anonymousMode && (
        <div
          className={`absolute -bottom-6 left-1/2 -translate-x-1/2 bg-bg-secondary border border-border-default rounded shadow-sm z-10 ${
            (badgeProperty.type === 'country' || isLikelyCountryCode(badgeProperty.value))
              ? 'px-1.5 py-0.5 text-lg'
              : 'px-2 py-0.5 text-xs text-text-secondary whitespace-nowrap'
          }`}
        >
          {(badgeProperty.type === 'country' || isLikelyCountryCode(badgeProperty.value))
            ? countryCodeToFlag(badgeProperty.value)
            : badgeProperty.value}
        </div>
      )}

      {/* Displayed properties - shows selected properties below the element */}
      {displayedPropertyValues && displayedPropertyValues.length > 0 && !anonymousMode && (
        <div
          className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 z-10"
          style={{ top: badgeProperty ? 'calc(100% + 28px)' : 'calc(100% + 6px)' }}
        >
          {displayedPropertyValues.slice(0, 3).map(({ key, value }) => {
            const isCountry = isLikelyCountryCode(value);
            // Truncate value to 20 chars max
            const displayValue = value.length > 20 ? value.slice(0, 20) + '...' : value;
            return (
              <div
                key={key}
                className="px-1.5 py-0.5 bg-bg-tertiary border border-border-default rounded shadow-sm whitespace-nowrap"
                title={`${key}: ${value}`}
              >
                <span className="text-[10px] text-text-tertiary">{key}:</span>{' '}
                {isCountry ? (
                  <span className="text-base">{countryCodeToFlag(value)}</span>
                ) : (
                  <span className="text-[11px] text-text-secondary">{displayValue}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Node body */}
      <div
        className={`
          w-full h-full
          flex flex-col items-center justify-center overflow-hidden
          ${hasThumbnail ? 'sketchy-border-soft' : shapeStyles[element.visual.shape]}
          ${isSelected ? 'selection-ring' : 'node-shadow'}
        `}
        style={{
          backgroundColor: hasThumbnail
            ? 'var(--color-bg-primary)'
            : getThemeAwareColor(element.visual.color, themeMode === 'dark'),
          // Border properties
          borderWidth: element.visual.borderWidth ?? 2,
          borderStyle: element.visual.borderStyle ?? 'solid',
          borderColor: themeMode === 'dark' && !hasThumbnail
            ? getThemeAwareColor(element.visual.borderColor, true)
            : element.visual.borderColor,
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
                {element.label || t('status.loading')}
              </span>
            </div>
          </>
        ) : hasThumbnail ? (
          <>
            {/* Thumbnail preview - using contain to show full image, pixelate+grayscale if hideMedia */}
            <div
              className="flex-1 w-full bg-contain bg-center bg-no-repeat"
              style={{
                backgroundImage: `url(${hideMedia ? thumbnail : (hdImageUrl || thumbnail)})`,
                backgroundColor: 'var(--color-bg-secondary)',
                filter: hideMedia ? 'blur(16px) grayscale(1)' : undefined,
                imageRendering: hideMedia ? 'pixelated' : undefined,
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
                  text={element.label || t('empty.unnamed')}
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
                  {element.label || t('empty.unnamed')}
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
                className="w-full font-medium text-center bg-transparent border-none outline-none focus:ring-1 focus:ring-accent rounded"
                style={{
                  fontSize: labelFontSize,
                  color: isLightColor(getThemeAwareColor(element.visual.color, themeMode === 'dark'))
                    ? '#111827'
                    : '#ffffff',
                  fontFamily: fontMode === 'handwritten' ? '"Caveat", cursive' : undefined,
                }}
              />
            ) : anonymousMode ? (
              <RedactedText
                text={element.label || t('empty.unnamed')}
                className={`font-medium leading-tight block ${fontMode === 'handwritten' ? 'canvas-handwritten-text' : ''}`}
                style={{ fontSize: labelFontSize }}
              />
            ) : (
              <span
                className={`font-medium leading-tight block ${fontMode === 'handwritten' ? 'canvas-handwritten-text' : ''}`}
                style={{
                  fontSize: labelFontSize,
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
                {element.label || t('empty.unnamed')}
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

  // In dark mode, invert very light colors to darker equivalents
  // This ensures elements remain visible on dark canvas
  const brightness = getColorBrightness(color);
  if (brightness > 230) {
    // Very light colors (white, near-white, very light grays) -> invert to dark
    // Map brightness 230-255 to a dark range (40-60)
    const darkBrightness = 50;
    const factor = darkBrightness / brightness;
    return darkenColor(color, factor);
  }
  if (brightness > 200) {
    // Light colors (light grays, pastels) -> darken moderately
    return darkenColor(color, 0.5);
  }
  // Keep medium and dark colors as-is
  return color;
}

// Custom comparison for React.memo - only re-render when data actually changes
function arePropsEqual(prevProps: NodeProps, nextProps: NodeProps): boolean {
  const prevData = prevProps.data as ElementNodeData;
  const nextData = nextProps.data as ElementNodeData;

  // Compare essential props that affect rendering
  if (prevData.isSelected !== nextData.isSelected) return false;
  if (prevData.isDimmed !== nextData.isDimmed) return false;
  if (prevData.isEditing !== nextData.isEditing) return false;
  if (prevData.thumbnail !== nextData.thumbnail) return false;
  if (prevData.unresolvedCommentCount !== nextData.unresolvedCommentCount) return false;
  if (prevData.isLoadingAsset !== nextData.isLoadingAsset) return false;
  if (prevData.badgeProperty?.value !== nextData.badgeProperty?.value) return false;
  if (prevData.badgeProperty?.type !== nextData.badgeProperty?.type) return false;

  // Compare remote selectors
  const prevRemote = prevData.remoteSelectors ?? [];
  const nextRemote = nextData.remoteSelectors ?? [];
  if (prevRemote.length !== nextRemote.length) return false;
  for (let i = 0; i < prevRemote.length; i++) {
    if (prevRemote[i].name !== nextRemote[i].name) return false;
    if (prevRemote[i].color !== nextRemote[i].color) return false;
    if (prevRemote[i].isDragging !== nextRemote[i].isDragging) return false;
  }

  // Compare display settings that affect rendering
  if (prevData.showConfidenceIndicator !== nextData.showConfidenceIndicator) return false;
  if (prevData.tagDisplayMode !== nextData.tagDisplayMode) return false;
  if (prevData.tagDisplaySize !== nextData.tagDisplaySize) return false;
  if (prevData.themeMode !== nextData.themeMode) return false;

  // Compare displayed properties (shallow array comparison)
  const prevProps2 = prevData.displayedPropertyValues ?? [];
  const nextProps2 = nextData.displayedPropertyValues ?? [];
  if (prevProps2.length !== nextProps2.length) return false;
  for (let i = 0; i < prevProps2.length; i++) {
    if (prevProps2[i].key !== nextProps2[i].key || prevProps2[i].value !== nextProps2[i].value) return false;
  }

  // Compare element properties that affect rendering
  const prevEl = prevData.element;
  const nextEl = nextData.element;
  if (prevEl.id !== nextEl.id) return false;
  if (prevEl.label !== nextEl.label) return false;
  if (prevEl.confidence !== nextEl.confidence) return false;
  if (prevEl.visual.color !== nextEl.visual.color) return false;
  if (prevEl.visual.borderColor !== nextEl.visual.borderColor) return false;
  if (prevEl.visual.borderWidth !== nextEl.visual.borderWidth) return false;
  if (prevEl.visual.borderStyle !== nextEl.visual.borderStyle) return false;
  if (prevEl.visual.shape !== nextEl.visual.shape) return false;
  if (prevEl.visual.size !== nextEl.visual.size) return false;
  if (prevEl.visual.icon !== nextEl.visual.icon) return false;
  if (prevEl.visual.image !== nextEl.visual.image) return false;
  if (prevEl.visual.customWidth !== nextEl.visual.customWidth) return false;
  if (prevEl.visual.customHeight !== nextEl.visual.customHeight) return false;
  if (prevEl.visual.fontSize !== nextEl.visual.fontSize) return false;
  if (prevEl.assetIds?.length !== nextEl.assetIds?.length) return false;

  // Compare tags for tag display
  if (prevEl.tags?.length !== nextEl.tags?.length) return false;
  if (prevEl.tags && nextEl.tags) {
    for (let i = 0; i < prevEl.tags.length; i++) {
      if (prevEl.tags[i] !== nextEl.tags[i]) return false;
    }
  }

  return true;
}

// Memoize to prevent re-renders during drag of other nodes
export const ElementNode = memo(ElementNodeComponent, arePropsEqual);
