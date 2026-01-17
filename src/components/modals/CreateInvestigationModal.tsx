import { useState } from 'react';
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
      title="Nouvelle enquête"
      width="sm"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!name.trim() || isLoading}
          >
            {isLoading ? 'Création...' : 'Créer'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Nom"
          placeholder="Affaire..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <Textarea
          label="Description (optionnel)"
          placeholder="Notes sur l'enquête..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </form>
    </Modal>
  );
}
