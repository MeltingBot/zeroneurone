import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
}

const widthStyles = {
  sm: 'w-[360px]',
  md: 'w-[480px]',
  lg: 'w-[640px]',
};

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  width = 'md',
}: ModalProps) {
  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-text-primary/40"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`
          relative
          bg-bg-primary sketchy-border-soft modal-shadow
          max-h-[80vh] overflow-hidden
          flex flex-col
          ${widthStyles[width]}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          <IconButton onClick={onClose} size="sm">
            <X size={16} />
          </IconButton>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto flex-1">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex justify-end gap-2 px-4 py-3 border-t border-border-default bg-bg-secondary">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
