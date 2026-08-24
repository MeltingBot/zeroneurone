import { useRef, useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';
import { useDialogA11y } from '../../hooks/useDialogA11y';

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
  const { t } = useTranslation('common');
  const titleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);

  useDialogA11y(isOpen, modalRef, onClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-text-primary/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
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
          <h2 id={titleId} className="text-sm font-semibold text-text-primary">{title}</h2>
          <IconButton onClick={onClose} size="sm" aria-label={t('actions.close')}>
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
