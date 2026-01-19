import { memo, useRef, useState, useLayoutEffect } from 'react';
import { Plus, Clipboard } from 'lucide-react';

interface CanvasContextMenuProps {
  x: number;
  y: number;
  onCreateElement: () => void;
  onPaste: () => void;
  onClose: () => void;
}

function CanvasContextMenuComponent({
  x,
  y,
  onCreateElement,
  onPaste,
  onClose,
}: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  // Adjust position to keep menu within viewport
  useLayoutEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const padding = 8;
      let newX = x;
      let newY = y;

      // Check right edge
      if (x + rect.width > window.innerWidth - padding) {
        newX = window.innerWidth - rect.width - padding;
      }

      // Check bottom edge
      if (y + rect.height > window.innerHeight - padding) {
        newY = window.innerHeight - rect.height - padding;
      }

      // Check left edge
      if (newX < padding) {
        newX = padding;
      }

      // Check top edge
      if (newY < padding) {
        newY = padding;
      }

      if (newX !== x || newY !== y) {
        setPosition({ x: newX, y: newY });
      }
    }
  }, [x, y]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />

      {/* Menu */}
      <div
        ref={menuRef}
        className="fixed z-50 min-w-44 py-1 bg-bg-primary border border-border-default sketchy-border-soft panel-shadow"
        style={{ left: position.x, top: position.y }}
      >
        {/* Create new element */}
        <div className="py-1">
          <button
            onClick={() => {
              onCreateElement();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
          >
            <Plus size={14} />
            Nouvel element
            <span className="ml-auto text-xs text-text-tertiary">Dbl-clic</span>
          </button>
        </div>

        {/* Paste */}
        <div className="py-1 border-t border-border-default">
          <button
            onClick={() => {
              onPaste();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
          >
            <Clipboard size={14} />
            Coller
            <span className="ml-auto text-xs text-text-tertiary">Ctrl+V</span>
          </button>
        </div>
      </div>
    </>
  );
}

export const CanvasContextMenu = memo(CanvasContextMenuComponent);
