import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button, Input } from '../common';

interface RenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRename: (newName: string) => Promise<void>;
  currentName: string;
  title?: string;
  label?: string;
}

export function RenameModal({
  isOpen,
  onClose,
  onRename,
  currentName,
  title,
  label,
}: RenameModalProps) {
  const { t } = useTranslation(['modals', 'common']);
  const [name, setName] = useState(currentName);
  const [isLoading, setIsLoading] = useState(false);
  const modalTitle = title || t('modals:rename.title');
  const fieldLabel = label || t('modals:rename.label');

  useEffect(() => {
    setName(currentName);
  }, [currentName, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name.trim() === currentName) return;

    setIsLoading(true);
    try {
      await onRename(name.trim());
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      width="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!name.trim() || name.trim() === currentName || isLoading}
          >
            {isLoading ? t('modals:rename.renaming') : t('modals:rename.rename')}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <Input
          label={fieldLabel}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </form>
    </Modal>
  );
}
