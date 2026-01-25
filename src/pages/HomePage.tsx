import { useEffect, useState } from 'react';
import { Plus, FolderOpen, Upload, Tags, Home, Info, Sun, Moon, HardDrive } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Layout, Button, EmptyState } from '../components/common';
import { InvestigationCard, LandingSection } from '../components/home';
import {
  CreateInvestigationModal,
  ConfirmDeleteModal,
  RenameModal,
  ImportModal,
  TagSetManagerModal,
  AboutModal,
  StorageModal,
  LocalStorageDisclaimerModal,
  hasAcknowledgedLocalStorage,
} from '../components/modals';
import { useInvestigationStore, useUIStore } from '../stores';

type ViewMode = 'landing' | 'list';

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

  const { themeMode, toggleThemeMode } = useUIStore();

  const [viewMode, setViewMode] = useState<ViewMode | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isTagSetModalOpen, setIsTagSetModalOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);
  const [isDisclaimerModalOpen, setIsDisclaimerModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);

  // Handle opening create modal with disclaimer check
  const handleOpenCreateModal = () => {
    if (hasAcknowledgedLocalStorage()) {
      setIsCreateModalOpen(true);
    } else {
      setIsDisclaimerModalOpen(true);
    }
  };

  // Handle disclaimer acceptance - proceed to create modal
  const handleDisclaimerAccept = () => {
    setIsDisclaimerModalOpen(false);
    setIsCreateModalOpen(true);
  };

  useEffect(() => {
    loadInvestigations();
  }, [loadInvestigations]);

  // Set initial view mode based on whether there are investigations
  useEffect(() => {
    if (!isLoading && viewMode === null) {
      setViewMode(investigations.length > 0 ? 'list' : 'landing');
    }
  }, [isLoading, investigations.length, viewMode]);

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
      {/* Header - only shown in list view */}
      {viewMode === 'list' && (
        <header className="h-12 flex items-center justify-between px-4 border-b border-border-default bg-bg-primary panel-shadow">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-text-primary">ZeroNeurone</h1>
            <button
              onClick={() => setViewMode('landing')}
              className="p-1.5 hover:bg-bg-tertiary rounded transition-colors"
              title="Retour à l'accueil"
            >
              <Home size={16} className="text-text-secondary" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleThemeMode}
              title={themeMode === 'light' ? 'Mode sombre' : 'Mode clair'}
            >
              {themeMode === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsAboutModalOpen(true)}
              title="À propos"
            >
              <Info size={16} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsStorageModalOpen(true)}
              title="Stockage"
            >
              <HardDrive size={16} />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsTagSetModalOpen(true)}
            >
              <Tags size={16} />
              Gérer les tags
            </Button>
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
              onClick={handleOpenCreateModal}
            >
              <Plus size={16} />
              Nouvelle enquête
            </Button>
          </div>
        </header>
      )}

      {/* Content */}
      {isLoading || viewMode === null ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-sm text-text-secondary">Chargement...</span>
        </div>
      ) : viewMode === 'landing' ? (
        <LandingSection
          onNewInvestigation={handleOpenCreateModal}
          onImport={() => setIsImportModalOpen(true)}
          onAbout={() => setIsAboutModalOpen(true)}
          investigationCount={investigations.length}
          onViewInvestigations={() => setViewMode('list')}
          themeMode={themeMode}
          onToggleTheme={toggleThemeMode}
        />
      ) : (
        <main className="flex-1 overflow-y-auto p-6">
          {investigations.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title="Aucune enquête"
              description="Créez votre première enquête pour commencer"
              action={
                <Button
                  variant="primary"
                  onClick={handleOpenCreateModal}
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
      )}

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

      <TagSetManagerModal
        isOpen={isTagSetModalOpen}
        onClose={() => setIsTagSetModalOpen(false)}
      />

      <AboutModal
        isOpen={isAboutModalOpen}
        onClose={() => setIsAboutModalOpen(false)}
      />

      <StorageModal
        isOpen={isStorageModalOpen}
        onClose={() => setIsStorageModalOpen(false)}
      />

      <LocalStorageDisclaimerModal
        isOpen={isDisclaimerModalOpen}
        onClose={() => setIsDisclaimerModalOpen(false)}
        onAccept={handleDisclaimerAccept}
      />
    </Layout>
  );
}
