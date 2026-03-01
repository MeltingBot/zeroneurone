import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button, Input, Textarea } from '../common';

interface CreateDossierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, description: string) => Promise<void>;
}

export function CreateDossierModal({
  isOpen,
  onClose,
  onCreate,
}: CreateDossierModalProps) {
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
      title={t('createDossier.title')}
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
            {isLoading ? t('common:status.saving') : t('createDossier.create')}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label={t('common:labels.name')}
          placeholder={t('createDossier.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          data-testid="dossier-name"
        />
        <Textarea
          label={t('createDossier.descriptionPlaceholder')}
          placeholder={t('common:labels.description')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          data-testid="dossier-description"
        />
      </form>
    </Modal>
  );
}
