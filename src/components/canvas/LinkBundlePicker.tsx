import i18next from 'i18next';
import type { BundleItem } from './LinkBundleTooltip';

interface LinkBundlePickerProps {
  items: BundleItem[];
  /** Position in the canvas wrapper, in CSS pixels */
  x: number;
  y: number;
  /** Opens to the left of the point (near the right edge of the canvas) */
  toLeft?: boolean;
  onPick: (linkId: string) => void;
}

/**
 * The links of a merged line, where it was clicked: one of them picked alone. Each label behind
 * the colour of its link, as on hover.
 */
export function LinkBundlePicker({ items, x, y, toLeft, onPick }: LinkBundlePickerProps) {
  return (
    <div
      role="menu"
      data-testid="link-bundle-picker"
      className="absolute z-20 max-w-xs p-1 bg-bg-primary border border-border-default rounded shadow-sm"
      style={toLeft ? { right: `calc(100% - ${x - 12}px)`, top: y + 12 } : { left: x + 12, top: y + 12 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          onClick={(e) => { e.stopPropagation(); onPick(item.id); }}
          className="w-full flex items-center gap-1.5 min-w-0 px-2 py-1 text-xs text-left text-text-primary rounded hover:bg-bg-secondary"
        >
          <span className="w-2.5 h-2.5 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
          {item.label
            ? <span className="truncate">{item.label}</span>
            : <span className="truncate text-text-tertiary">{i18next.t('pages:dossier.contextMenu.noLabel')}</span>}
        </button>
      ))}
    </div>
  );
}
