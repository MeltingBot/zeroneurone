import { createPortal } from 'react-dom';
import i18next from 'i18next';

export interface BundleItem {
  id: string;
  label: string;
  color: string;
}

/**
 * Labels of the links merged into one line, shown while the pointer is on it: each one behind a
 * swatch of its link's colour. Drawn over the page (screen position), whatever the zoom.
 */
export function LinkBundleTooltip({ items, x, y }: { items: BundleItem[]; x: number; y: number }) {
  return createPortal(
    <div
      role="tooltip"
      data-testid="link-bundle-tooltip"
      className="fixed z-[1100] pointer-events-none max-w-xs px-2 py-1.5 rounded border border-border-default bg-bg-primary text-xs text-text-primary shadow-sm space-y-0.5"
      style={{ left: x + 14, top: y + 14 }}
    >
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-1.5 min-w-0">
          <span className="w-2.5 h-2.5 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
          {item.label
            ? <span className="truncate">{item.label}</span>
            : <span className="truncate text-text-tertiary">{i18next.t('pages:dossier.contextMenu.noLabel')}</span>}
        </div>
      ))}
    </div>,
    document.body,
  );
}
