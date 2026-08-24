import { useRef, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { X, Keyboard } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Every entry below is bound in the code. Anything removed from a handler must
// be removed here too: a help panel that lists a shortcut which does nothing is
// worse than one that omits it.
const shortcutsByCategory = [
  {
    categoryKey: 'navigation',
    items: [
      { keys: ['1'], descKey: 'canvasView' },
      { keys: ['2'], descKey: 'mapView' },
      { keys: ['3'], descKey: 'timelineView' },
      { keys: ['4'], descKey: 'matrixView' },
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
      { keys: ['E'], descKey: 'newElement' },
      { keys: ['N'], descKey: 'newAnnotation' },
      { keys: ['G'], descKey: 'newGroup' },
      { keys: ['Del'], descKey: 'delete' },
      { keys: ['Ctrl', 'A'], descKey: 'selectAll' },
      { keys: ['Escape'], descKey: 'cancelSelection' },
    ],
  },
  {
    categoryKey: 'editing',
    items: [
      { keys: ['Ctrl', 'Z'], descKey: 'undo' },
      { keys: ['Ctrl', 'Shift', 'Z'], descKey: 'redo' },
      { keys: ['Ctrl', 'C'], descKey: 'copy' },
      { keys: ['Ctrl', 'X'], descKey: 'cut' },
      { keys: ['Ctrl', 'V'], descKey: 'paste' },
      { keys: ['Ctrl', 'D'], descKey: 'duplicate' },
      { keys: ['⏬⏬'], descKey: 'editElement' },
      { keys: ['Shift', '⏬'], descKey: 'multiSelect' },
      { keys: ['⌖'], descKey: 'moveElements' },
    ],
  },
  {
    categoryKey: 'security',
    items: [
      { keys: ['Alt', 'L'], descKey: 'lockSession' },
    ],
  },
];

export function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  const { t } = useTranslation('modals');
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useDialogA11y(isOpen, dialogRef, onClose);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[1000] bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed z-[1000] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-bg-primary sketchy-border-soft modal-shadow max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default shrink-0">
          <h2 id={titleId} className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Keyboard size={16} />
            {t('shortcuts.title')}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('common:actions.close')}
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
