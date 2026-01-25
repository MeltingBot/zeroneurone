import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button } from '../common';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
}

export function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
}: ConfirmDeleteModalProps) {
  const { t } = useTranslation(['modals', 'common']);
  const [isLoading, setIsLoading] = useState(false);
  const label = confirmLabel || t('modals:confirmDelete.confirm');

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      width="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={isLoading}
            className="bg-error hover:bg-red-700"
            data-testid="confirm-delete"
          >
            {isLoading ? t('modals:confirmDelete.deleting') : label}
          </Button>
        </>
      }
    >
      <p className="text-sm text-text-secondary">{message}</p>
    </Modal>
  );
}
