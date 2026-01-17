import { X, Keyboard } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const shortcuts = [
  {
    category: 'Navigation',
    items: [
      { keys: ['1'], description: 'Vue Canvas' },
      { keys: ['2'], description: 'Vue Carte' },
      { keys: ['3'], description: 'Vue Split (Canvas + Carte)' },
      { keys: ['4'], description: 'Vue Timeline' },
    ],
  },
  {
    category: 'Recherche',
    items: [
      { keys: ['Ctrl', 'K'], description: 'Ouvrir la recherche' },
      { keys: ['Escape'], description: 'Fermer la recherche' },
    ],
  },
  {
    category: 'Canvas',
    items: [
      { keys: ['Suppr'], description: 'Supprimer la selection' },
      { keys: ['Ctrl', 'A'], description: 'Tout selectionner' },
      { keys: ['Escape'], description: 'Annuler la selection' },
      { keys: ['Clic droit'], description: 'Menu contextuel' },
    ],
  },
  {
    category: 'Edition',
    items: [
      { keys: ['Double-clic'], description: 'Editer un element' },
      { keys: ['Shift', 'Clic'], description: 'Selection multiple' },
      { keys: ['Glisser'], description: 'Deplacer les elements' },
    ],
  },
  {
    category: 'Zoom',
    items: [
      { keys: ['Molette'], description: 'Zoom avant/arriere' },
      { keys: ['Ctrl', '0'], description: 'Reinitialiser le zoom' },
    ],
  },
];

export function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-bg-primary rounded-lg shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default shrink-0">
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Keyboard size={16} />
            Raccourcis clavier
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
            {shortcuts.map((section) => (
              <div key={section.category}>
                <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
                  {section.category}
                </h3>
                <div className="space-y-2">
                  {section.items.map((shortcut, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-1"
                    >
                      <span className="text-sm text-text-primary">
                        {shortcut.description}
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
            Appuyez sur <kbd className="px-1.5 py-0.5 bg-bg-primary border border-border-default rounded text-[10px]">?</kbd> pour afficher cette aide
          </p>
        </div>
      </div>
    </>
  );
}
