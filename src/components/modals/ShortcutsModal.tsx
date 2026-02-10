import { useTranslation } from 'react-i18next';
import { X, Keyboard } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const shortcutsByCategory = [
  {
    categoryKey: 'navigation',
    items: [
      { keys: ['1'], descKey: 'canvasView' },
      { keys: ['2'], descKey: 'mapView' },
      { keys: ['3'], descKey: 'timelineView' },
    ],
  },
  {
    categoryKey: 'search',
    items: [
      { keys: ['Ctrl', 'K'], descKey: 'search' },
      { keys: ['Escape'], descKey: 'closeSearch' },
    ],
  },
  {
    categoryKey: 'tabs',
    items: [
      { keys: ['Alt', '←'], descKey: 'prevTab' },
      { keys: ['Alt', '→'], descKey: 'nextTab' },
      { keys: ['Alt', '0'], descKey: 'firstTab' },
    ],
  },
  {
    categoryKey: 'canvas',
    items: [
      { keys: ['Del'], descKey: 'delete' },
      { keys: ['Ctrl', 'A'], descKey: 'selectAll' },
      { keys: ['Escape'], descKey: 'cancelSelection' },
      { keys: ['→'], descKey: 'contextMenu' },
    ],
  },
  {
    categoryKey: 'editing',
    items: [
      { keys: ['⏬⏬'], descKey: 'editElement' },
      { keys: ['Shift', '⏬'], descKey: 'multiSelect' },
      { keys: ['⌖'], descKey: 'moveElements' },
    ],
  },
  {
    categoryKey: 'zoom',
    items: [
      { keys: ['⟳'], descKey: 'zoomOut' },
      { keys: ['Ctrl', '0'], descKey: 'resetZoom' },
    ],
  },
];

export function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  const { t } = useTranslation('modals');

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[1000] bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed z-[1000] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-bg-primary rounded-lg shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default shrink-0">
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Keyboard size={16} />
            {t('shortcuts.title')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-text-tertiary hover:text-text-primary rounded"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          <div className="space-y-6">
            {shortcutsByCategory.map((section) => (
              <div key={section.categoryKey}>
                <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
                  {t(`shortcuts.categories.${section.categoryKey}`)}
                </h3>
                <div className="space-y-2">
                  {section.items.map((shortcut, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-1"
                    >
                      <span className="text-sm text-text-primary">
                        {t(`shortcuts.shortcuts.${shortcut.descKey}`)}
                      </span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, keyIndex) => (
                          <span key={keyIndex}>
                            <kbd className="px-2 py-1 text-xs font-mono bg-bg-secondary border border-border-default rounded shadow-sm">
                              {key}
                            </kbd>
                            {keyIndex < shortcut.keys.length - 1 && (
                              <span className="text-text-tertiary mx-1">+</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border-default bg-bg-secondary text-center shrink-0">
          <p className="text-xs text-text-tertiary">
            {t('shortcuts.helpHint', { key: '?' })}
          </p>
        </div>
      </div>
    </>
  );
}
