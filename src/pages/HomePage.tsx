import { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, FolderOpen, Upload, Tags, Home, Info, Sun, Moon, HardDrive, BookOpen, Search, X, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Layout, Button, EmptyState, LanguageSwitcher } from '../components/common';
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
  InvestigationTagsModal,
} from '../components/modals';
import { useInvestigationStore, useUIStore } from '../stores';
import { investigationRepository } from '../db/repositories';

type ViewMode = 'landing' | 'list';
type SortMode = 'updated' | 'created' | 'name';

export function HomePage() {
  const { t } = useTranslation('pages');
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
  const [tagsTarget, setTagsTarget] = useState<string | null>(null);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('updated');
  const [allTags, setAllTags] = useState<string[]>([]);
  const [isTagFilterOpen, setIsTagFilterOpen] = useState(false);

  // Load all tags used across investigations
  useEffect(() => {
    investigationRepository.getAllTags().then(setAllTags);
  }, [investigations]);

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

  const handleToggleFavorite = useCallback(async (id: string) => {
    const inv = investigations.find((i) => i.id === id);
    if (inv) {
      await updateInvestigation(id, { isFavorite: !inv.isFavorite });
    }
  }, [investigations, updateInvestigation]);

  const handleSaveTags = useCallback(async (tags: string[]) => {
    if (tagsTarget) {
      await updateInvestigation(tagsTarget, { tags });
    }
  }, [tagsTarget, updateInvestigation]);

  const handleTagFilterToggle = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedTags([]);
  }, []);

  // Filter and sort investigations
  const filteredInvestigations = useMemo(() => {
    let result = [...investigations];

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (inv) =>
          inv.name.toLowerCase().includes(query) ||
          inv.description?.toLowerCase().includes(query)
      );
    }

    // Filter by selected tags
    if (selectedTags.length > 0) {
      result = result.filter((inv) =>
        selectedTags.some((tag) => inv.tags?.includes(tag))
      );
    }

    // Sort
    result.sort((a, b) => {
      // Favorites always first
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;

      // Then by sort mode
      switch (sortMode) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'created':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'updated':
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });

    return result;
  }, [investigations, searchQuery, selectedTags, sortMode]);

  const targetInvestigation = investigations.find(
    (inv) => inv.id === (deleteTarget || renameTarget || tagsTarget)
  );

  const hasActiveFilters = searchQuery.trim() !== '' || selectedTags.length > 0;

  return (
    <Layout>
      {/* Header - only shown in list view */}
      {viewMode === 'list' && (
        <header className="h-12 flex items-center justify-between px-4 border-b border-border-default bg-bg-primary panel-shadow">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-text-primary">{t('home.title')}</h1>
            <button
              onClick={() => setViewMode('landing')}
              className="p-1.5 hover:bg-bg-tertiary rounded transition-colors"
              title={t('home.backToHome')}
            >
              <Home size={16} className="text-text-secondary" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleThemeMode}
              title={themeMode === 'light' ? t('home.darkMode') : t('home.lightMode')}
            >
              {themeMode === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </Button>
            <LanguageSwitcher size="md" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsAboutModalOpen(true)}
              title={t('home.about')}
            >
              <Info size={16} />
            </Button>
            <a
              href="https://doc.zeroneurone.com"
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded transition-colors"
              title={t('home.documentation')}
            >
              <BookOpen size={16} />
            </a>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsStorageModalOpen(true)}
              title={t('home.storage')}
            >
              <HardDrive size={16} />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsTagSetModalOpen(true)}
            >
              <Tags size={16} />
              {t('home.manageTags')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsImportModalOpen(true)}
              data-testid="import-button"
            >
              <Upload size={16} />
              {t('home.import')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenCreateModal}
              data-testid="new-investigation"
            >
              <Plus size={16} />
              {t('home.newInvestigation')}
            </Button>
          </div>
        </header>
      )}

      {/* Content */}
      {isLoading || viewMode === null ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-sm text-text-secondary">{t('home.loading')}</span>
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
        <main className="flex-1 overflow-y-auto p-6" data-testid="investigation-list">
          {investigations.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title={t('home.noInvestigations')}
              description={t('home.createFirst')}
              action={
                <Button
                  variant="primary"
                  onClick={handleOpenCreateModal}
                >
                  <Plus size={16} />
                  {t('home.newInvestigation')}
                </Button>
              }
            />
          ) : (
            <div className="max-w-3xl mx-auto">
              {/* Search and filter bar */}
              <div className="mb-4 space-y-2">
                <div className="flex gap-2">
                  {/* Search input */}
                  <div className="flex-1 relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t('home.searchPlaceholder')}
                      className="w-full pl-9 pr-8 py-1.5 text-sm border border-border-default rounded bg-bg-primary text-text-primary placeholder:text-text-tertiary"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Tag filter dropdown */}
                  {allTags.length > 0 && (
                    <div className="relative">
                      <button
                        onClick={() => setIsTagFilterOpen(!isTagFilterOpen)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded transition-colors ${
                          selectedTags.length > 0
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-border-default bg-bg-primary text-text-secondary hover:bg-bg-secondary'
                        }`}
                      >
                        <Tags size={14} />
                        {selectedTags.length > 0 ? (
                          <span>{selectedTags.length}</span>
                        ) : (
                          <span>{t('home.filterByTag')}</span>
                        )}
                        <ChevronDown size={14} />
                      </button>

                      {isTagFilterOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setIsTagFilterOpen(false)}
                          />
                          <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-bg-primary border border-border-default rounded shadow-lg py-1">
                            {allTags.map((tag) => (
                              <button
                                key={tag}
                                onClick={() => handleTagFilterToggle(tag)}
                                className={`w-full px-3 py-1.5 text-left text-sm flex items-center justify-between hover:bg-bg-secondary ${
                                  selectedTags.includes(tag) ? 'text-accent' : 'text-text-primary'
                                }`}
                              >
                                <span>{tag}</span>
                                {selectedTags.includes(tag) && (
                                  <span className="text-accent">✓</span>
                                )}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Sort dropdown */}
                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as SortMode)}
                    className="px-3 py-1.5 text-sm border border-border-default rounded bg-bg-primary text-text-secondary"
                  >
                    <option value="updated">{t('home.sortUpdated')}</option>
                    <option value="created">{t('home.sortCreated')}</option>
                    <option value="name">{t('home.sortName')}</option>
                  </select>
                </div>

                {/* Active filters display */}
                {hasActiveFilters && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-text-tertiary">{t('home.activeFilters')}:</span>
                    {searchQuery && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-bg-tertiary text-text-secondary rounded">
                        "{searchQuery}"
                        <button onClick={() => setSearchQuery('')} className="hover:text-text-primary">
                          <X size={12} />
                        </button>
                      </span>
                    )}
                    {selectedTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-accent/10 text-accent rounded"
                      >
                        {tag}
                        <button onClick={() => handleTagFilterToggle(tag)} className="hover:text-accent/70">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    <button
                      onClick={clearFilters}
                      className="text-xs text-text-tertiary hover:text-text-secondary underline"
                    >
                      {t('home.clearFilters')}
                    </button>
                  </div>
                )}

                {/* Results count */}
                {hasActiveFilters && (
                  <div className="text-xs text-text-tertiary">
                    {t('home.resultsCount', { count: filteredInvestigations.length, total: investigations.length })}
                  </div>
                )}
              </div>

              {/* Investigation grid */}
              {filteredInvestigations.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm text-text-secondary">{t('home.noResults')}</p>
                  <button
                    onClick={clearFilters}
                    className="mt-2 text-sm text-accent hover:underline"
                  >
                    {t('home.clearFilters')}
                  </button>
                </div>
              ) : (
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredInvestigations.map((investigation) => (
                    <InvestigationCard
                      key={investigation.id}
                      investigation={investigation}
                      onDelete={setDeleteTarget}
                      onRename={setRenameTarget}
                      onToggleFavorite={handleToggleFavorite}
                      onEditTags={setTagsTarget}
                    />
                  ))}
                </div>
              )}
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
        title={t('modals:confirmDelete.deleteInvestigation')}
        message={t('modals:confirmDelete.deleteInvestigationMessage', { name: targetInvestigation?.name })}
      />

      <RenameModal
        isOpen={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        onRename={handleRename}
        currentName={targetInvestigation?.name || ''}
        title={t('modals:rename.renameInvestigation')}
      />

      <InvestigationTagsModal
        isOpen={!!tagsTarget}
        onClose={() => setTagsTarget(null)}
        investigation={targetInvestigation || null}
        allTags={allTags}
        onSave={handleSaveTags}
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
