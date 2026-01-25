import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button, Input, Textarea } from '../common';

interface CreateInvestigationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, description: string) => Promise<void>;
}

export function CreateInvestigationModal({
  isOpen,
  onClose,
  onCreate,
}: CreateInvestigationModalProps) {
  const { t } = useTranslation('modals');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    try {
      await onCreate(name.trim(), description.trim());
      setName('');
      setDescription('');
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('createInvestigation.title')}
      width="sm"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!name.trim() || isLoading}
            data-testid="create-button"
          >
            {isLoading ? t('common:status.saving') : t('createInvestigation.create')}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label={t('common:labels.name')}
          placeholder={t('createInvestigation.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          data-testid="investigation-name"
        />
        <Textarea
          label={t('createInvestigation.descriptionPlaceholder')}
          placeholder={t('common:labels.description')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          data-testid="investigation-description"
        />
      </form>
    </Modal>
  );
}
