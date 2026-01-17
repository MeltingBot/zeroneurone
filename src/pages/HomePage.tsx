import { useEffect, useState } from 'react';
import { Plus, FolderOpen, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Layout, Button, EmptyState } from '../components/common';
import { InvestigationCard } from '../components/home';
import {
  CreateInvestigationModal,
  ConfirmDeleteModal,
  RenameModal,
  ImportModal,
} from '../components/modals';
import { useInvestigationStore } from '../stores';

export function HomePage() {
  const navigate = useNavigate();
  const {
    investigations,
    isLoading,
    loadInvestigations,
    createInvestigation,
    updateInvestigation,
    deleteInvestigation,
  } = useInvestigationStore();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);

  useEffect(() => {
    loadInvestigations();
  }, [loadInvestigations]);

  const handleCreate = async (name: string, description: string) => {
    const investigation = await createInvestigation(name, description);
    navigate(`/investigation/${investigation.id}`);
  };

  const handleDelete = async () => {
    if (deleteTarget) {
      await deleteInvestigation(deleteTarget);
    }
  };

  const handleRename = async (newName: string) => {
    if (renameTarget) {
      await updateInvestigation(renameTarget, { name: newName });
    }
  };

  const targetInvestigation = investigations.find(
    (inv) => inv.id === (deleteTarget || renameTarget)
  );

  return (
    <Layout>
      {/* Header */}
      <header className="h-12 flex items-center justify-between px-4 border-b border-border-default bg-bg-primary panel-shadow">
        <h1 className="text-sm font-semibold text-text-primary">zeroneurone</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsImportModalOpen(true)}
          >
            <Upload size={16} />
            Importer
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus size={16} />
            Nouvelle enquête
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-sm text-text-secondary">Chargement...</span>
          </div>
        ) : investigations.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="Aucune enquête"
            description="Créez votre première enquête pour commencer"
            action={
              <Button
                variant="primary"
                onClick={() => setIsCreateModalOpen(true)}
              >
                <Plus size={16} />
                Nouvelle enquête
              </Button>
            }
          />
        ) : (
          <div className="max-w-3xl mx-auto">
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {investigations.map((investigation) => (
                <InvestigationCard
                  key={investigation.id}
                  investigation={investigation}
                  onDelete={setDeleteTarget}
                  onRename={setRenameTarget}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <CreateInvestigationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreate}
      />

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Supprimer l'enquête"
        message={`Supprimer "${targetInvestigation?.name}" ? Cette action est irréversible.`}
      />

      <RenameModal
        isOpen={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        onRename={handleRename}
        currentName={targetInvestigation?.name || ''}
        title="Renommer l'enquête"
      />

      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />
    </Layout>
  );
}
