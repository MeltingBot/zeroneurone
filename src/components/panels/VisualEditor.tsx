import { useCallback } from 'react';
import type { ElementVisual, ElementShape, FontSize } from '../../types';
import { DEFAULT_COLORS, FONT_SIZE_PX } from '../../types';

interface VisualEditorProps {
  visual: ElementVisual;
  onChange: (visual: Partial<ElementVisual>) => void;
  hideShape?: boolean;
}

const SHAPES: { value: ElementShape; label: string }[] = [
  { value: 'circle', label: 'Cercle' },
  { value: 'square', label: 'Carré' },
  { value: 'diamond', label: 'Losange' },
  { value: 'rectangle', label: 'Rectangle' },
];

const FONT_SIZES: { value: FontSize; label: string }[] = [
  { value: 'xs', label: 'XS' },
  { value: 'sm', label: 'S' },
  { value: 'md', label: 'M' },
  { value: 'lg', label: 'L' },
  { value: 'xl', label: 'XL' },
];

const BORDER_WIDTHS = [1, 2, 3, 4, 5];
const BORDER_STYLES: { value: 'solid' | 'dashed' | 'dotted'; label: string }[] = [
  { value: 'solid', label: 'Continu' },
  { value: 'dashed', label: 'Tirets' },
  { value: 'dotted', label: 'Pointillé' },
];

export function VisualEditor({ visual, onChange, hideShape }: VisualEditorProps) {
  const handleColorChange = useCallback(
    (color: string) => {
      onChange({ color });
    },
    [onChange]
  );

  const handleBorderColorChange = useCallback(
    (borderColor: string) => {
      onChange({ borderColor });
    },
    [onChange]
  );

  const handleBorderWidthChange = useCallback(
    (borderWidth: number) => {
      onChange({ borderWidth });
    },
    [onChange]
  );

  const handleBorderStyleChange = useCallback(
    (borderStyle: 'solid' | 'dashed' | 'dotted') => {
      onChange({ borderStyle });
    },
    [onChange]
  );

  const handleFontSizeChange = useCallback(
    (fontSize: FontSize) => {
      onChange({ fontSize });
    },
    [onChange]
  );

  const handleShapeChange = useCallback(
    (shape: ElementShape) => {
      // Reset custom dimensions when changing shape so new shape uses its default dimensions
      onChange({ shape, customWidth: undefined, customHeight: undefined });
    },
    [onChange]
  );

  return (
    <div className="space-y-4">
      {/* Color */}
      <div className="space-y-1.5">
        <label className="text-xs text-text-tertiary">Couleur de fond</label>
        <div className="flex flex-wrap gap-1.5">
          {/* White option */}
          <button
            onClick={() => handleColorChange('#ffffff')}
            className={`w-6 h-6 rounded border-2 ${
              visual.color === '#ffffff'
                ? 'border-accent'
                : 'border-border-default'
            }`}
            style={{ backgroundColor: '#ffffff' }}
            aria-label="Blanc"
          />
          {/* Color palette */}
          {DEFAULT_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => handleColorChange(color)}
              className={`w-6 h-6 rounded border-2 ${
                visual.color === color ? 'border-accent' : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
              aria-label={`Couleur ${color}`}
            />
          ))}
          {/* Custom color input */}
          <div className="relative">
            <input
              type="color"
              value={visual.color}
              onChange={(e) => handleColorChange(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer border-0 p-0"
              aria-label="Couleur personnalisée"
            />
          </div>
        </div>
      </div>

      {/* Border color */}
      <div className="space-y-1.5">
        <label className="text-xs text-text-tertiary">Couleur de bordure</label>
        <div className="flex flex-wrap gap-1.5">
          {/* Default gray */}
          <button
            onClick={() => handleBorderColorChange('#374151')}
            className={`w-6 h-6 rounded border-2 ${
              visual.borderColor === '#374151'
                ? 'border-accent'
                : 'border-border-default'
            }`}
            style={{ backgroundColor: '#374151' }}
            aria-label="Gris par défaut"
          />
          {/* Color palette */}
          {DEFAULT_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => handleBorderColorChange(color)}
              className={`w-6 h-6 rounded border-2 ${
                visual.borderColor === color
                  ? 'border-accent'
                  : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
              aria-label={`Bordure ${color}`}
            />
          ))}
          {/* Custom color input */}
          <div className="relative">
            <input
              type="color"
              value={visual.borderColor}
              onChange={(e) => handleBorderColorChange(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer border-0 p-0"
              aria-label="Bordure personnalisée"
            />
          </div>
        </div>
      </div>

      {/* Border style */}
      <div className="space-y-1.5">
        <label className="text-xs text-text-tertiary">Style de bordure</label>
        <div className="flex gap-2">
          {BORDER_STYLES.map((style) => (
            <button
              key={style.value}
              onClick={() => handleBorderStyleChange(style.value)}
              className={`flex-1 px-2 py-1.5 text-xs rounded border ${
                (visual.borderStyle ?? 'solid') === style.value
                  ? 'bg-accent text-white border-accent'
                  : 'bg-bg-secondary text-text-secondary border-border-default hover:border-accent'
              }`}
            >
              {style.label}
            </button>
          ))}
        </div>
      </div>

      {/* Border width */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs text-text-tertiary">Épaisseur</label>
          <span className="text-xs text-text-tertiary">{visual.borderWidth ?? 2}px</span>
        </div>
        <div className="flex gap-1">
          {BORDER_WIDTHS.map((width) => (
            <button
              key={width}
              onClick={() => handleBorderWidthChange(width)}
              className={`flex-1 h-8 rounded border flex items-center justify-center ${
                (visual.borderWidth ?? 2) === width
                  ? 'bg-accent border-accent'
                  : 'bg-bg-secondary border-border-default hover:border-accent'
              }`}
            >
              <div
                className="rounded-full"
                style={{
                  width: '100%',
                  height: width,
                  backgroundColor: (visual.borderWidth ?? 2) === width ? 'white' : visual.borderColor,
                }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Font size */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs text-text-tertiary">Taille du texte</label>
          <span className="text-xs text-text-tertiary">{FONT_SIZE_PX[visual.fontSize || 'sm']}px</span>
        </div>
        <div className="flex gap-1">
          {FONT_SIZES.map((fs) => (
            <button
              key={fs.value}
              onClick={() => handleFontSizeChange(fs.value)}
              className={`flex-1 h-8 rounded border flex items-center justify-center ${
                (visual.fontSize || 'sm') === fs.value
                  ? 'bg-accent text-white border-accent'
                  : 'bg-bg-secondary text-text-secondary border-border-default hover:border-accent'
              }`}
              style={{ fontSize: FONT_SIZE_PX[fs.value] }}
            >
              {fs.label}
            </button>
          ))}
        </div>
      </div>

      {/* Shape */}
      {!hideShape && (
      <div className="space-y-1.5">
        <label className="text-xs text-text-tertiary">Forme</label>
        <select
          value={visual.shape}
          onChange={(e) => handleShapeChange(e.target.value as ElementShape)}
          className="w-full px-2 py-1.5 text-xs bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary"
        >
          {SHAPES.map((shape) => (
            <option key={shape.value} value={shape.value}>
              {shape.label}
            </option>
          ))}
        </select>
      </div>
      )}
    </div>
  );
}
