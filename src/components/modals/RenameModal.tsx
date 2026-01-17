import { useState, useEffect } from 'react';
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
  title = 'Renommer',
  label = 'Nom',
}: RenameModalProps) {
  const [name, setName] = useState(currentName);
  const [isLoading, setIsLoading] = useState(false);

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
      title={title}
      width="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!name.trim() || name.trim() === currentName || isLoading}
          >
            {isLoading ? 'Renommage...' : 'Renommer'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <Input
          label={label}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </form>
    </Modal>
  );
}
