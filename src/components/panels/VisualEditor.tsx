import { useCallback } from 'react';
import type { ElementVisual, ElementShape } from '../../types';
import { DEFAULT_COLORS } from '../../types';

interface VisualEditorProps {
  visual: ElementVisual;
  onChange: (visual: Partial<ElementVisual>) => void;
}

const SHAPES: { value: ElementShape; label: string }[] = [
  { value: 'circle', label: 'Cercle' },
  { value: 'square', label: 'Carré' },
  { value: 'diamond', label: 'Losange' },
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'hexagon', label: 'Hexagone' },
];

const BORDER_WIDTHS = [1, 2, 3, 4];
const BORDER_STYLES: { value: 'solid' | 'dashed' | 'dotted'; label: string }[] = [
  { value: 'solid', label: 'Plein' },
  { value: 'dashed', label: 'Tirets' },
  { value: 'dotted', label: 'Points' },
];

export function VisualEditor({ visual, onChange }: VisualEditorProps) {
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

  const handleShapeChange = useCallback(
    (shape: ElementShape) => {
      onChange({ shape });
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

      {/* Border width and style - side by side */}
      <div className="flex gap-4">
        {/* Border width */}
        <div className="space-y-1.5 flex-1">
          <label className="text-xs text-text-tertiary">Épaisseur</label>
          <div className="flex gap-1">
            {BORDER_WIDTHS.map((width) => (
              <button
                key={width}
                onClick={() => handleBorderWidthChange(width)}
                className={`flex-1 px-2 py-1 text-xs rounded border transition-colors ${
                  (visual.borderWidth ?? 2) === width
                    ? 'bg-accent text-white border-accent'
                    : 'bg-bg-secondary text-text-secondary border-border-default hover:border-accent'
                }`}
              >
                {width}
              </button>
            ))}
          </div>
        </div>

        {/* Border style */}
        <div className="space-y-1.5 flex-1">
          <label className="text-xs text-text-tertiary">Style</label>
          <div className="flex gap-1">
            {BORDER_STYLES.map((style) => (
              <button
                key={style.value}
                onClick={() => handleBorderStyleChange(style.value)}
                className={`flex-1 px-2 py-1 text-xs rounded border transition-colors ${
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
      </div>

      {/* Shape */}
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
    </div>
  );
}
