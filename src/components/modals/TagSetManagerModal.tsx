import { useState, useCallback, useRef } from 'react';
import { Plus, RotateCcw, Pencil, Trash2, Circle, Square, Diamond, Hexagon, RectangleHorizontal, Download, Upload } from 'lucide-react';
import { Modal, Button, IconButton } from '../common';
import { useTagSetStore, useUIStore } from '../../stores';
import { TagSetEditorModal } from './TagSetEditorModal';
import type { TagSet, TagSetId, ElementShape, SuggestedProperty, TagSetDefaultVisual } from '../../types';

interface TagSetManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const shapeIcons: Record<ElementShape, typeof Circle> = {
  circle: Circle,
  square: Square,
  diamond: Diamond,
  hexagon: Hexagon,
  rectangle: RectangleHorizontal,
};

// Export format version for future compatibility
const EXPORT_VERSION = 1;

interface ExportedTagSet {
  name: string;
  description: string;
  defaultVisual: TagSetDefaultVisual;
  suggestedProperties: SuggestedProperty[];
}

interface TagSetExportData {
  version: number;
  exportedAt: string;
  tagSets: ExportedTagSet[];
}

// Validation helpers
function isValidExportData(data: unknown): data is TagSetExportData {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;

  if (typeof obj.version !== 'number') return false;
  if (!Array.isArray(obj.tagSets)) return false;

  return obj.tagSets.every(isValidExportedTagSet);
}

function isValidExportedTagSet(data: unknown): data is ExportedTagSet {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;

  if (typeof obj.name !== 'string' || !obj.name.trim()) return false;
  if (typeof obj.description !== 'string') return false;
  if (!obj.defaultVisual || typeof obj.defaultVisual !== 'object') return false;
  if (!Array.isArray(obj.suggestedProperties)) return false;

  return true;
}

export function TagSetManagerModal({ isOpen, onClose }: TagSetManagerModalProps) {
  const { getAll, delete: deleteTagSet, resetToDefaults, create, nameExists } = useTagSetStore();
  const showToast = useUIStore((state) => state.showToast);

  const [editingTagSet, setEditingTagSet] = useState<TagSet | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tagSets = getAll();

  const handleEdit = useCallback((tagSet: TagSet) => {
    setEditingTagSet(tagSet);
  }, []);

  const handleCreate = useCallback(() => {
    setIsCreating(true);
  }, []);

  const handleCloseEditor = useCallback(() => {
    setEditingTagSet(null);
    setIsCreating(false);
  }, []);

  const handleDelete = useCallback(async (id: TagSetId, name: string) => {
    if (!confirm(`Supprimer le tag "${name}" ? Les tags existants sur les éléments resteront mais ne seront plus associés à ce TagSet.`)) {
      return;
    }
    await deleteTagSet(id);
    showToast('success', `Tag "${name}" supprimé`);
  }, [deleteTagSet, showToast]);

  const handleReset = useCallback(async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    await resetToDefaults();
    showToast('success', 'Tags réinitialisés aux valeurs par défaut');
    setConfirmReset(false);
  }, [confirmReset, resetToDefaults, showToast]);

  // Export all TagSets to JSON file
  const handleExport = useCallback(() => {
    const exportData: TagSetExportData = {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      tagSets: tagSets.map((ts) => ({
        name: ts.name,
        description: ts.description,
        defaultVisual: ts.defaultVisual,
        suggestedProperties: ts.suggestedProperties,
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `zeroneurone-tagsets-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('success', `${tagSets.length} tags exportés`);
  }, [tagSets, showToast]);

  // Trigger file input for import
  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Handle file selection for import
  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input for future imports
    event.target.value = '';

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!isValidExportData(data)) {
        showToast('error', 'Format de fichier invalide');
        return;
      }

      let imported = 0;
      let skipped = 0;

      for (const exportedTagSet of data.tagSets) {
        // Skip if name already exists
        if (nameExists(exportedTagSet.name)) {
          skipped++;
          continue;
        }

        await create({
          name: exportedTagSet.name,
          description: exportedTagSet.description,
          defaultVisual: exportedTagSet.defaultVisual,
          suggestedProperties: exportedTagSet.suggestedProperties,
          isBuiltIn: false,
        });
        imported++;
      }

      if (imported > 0 && skipped > 0) {
        showToast('success', `${imported} tags importés, ${skipped} ignorés (déjà existants)`);
      } else if (imported > 0) {
        showToast('success', `${imported} tags importés`);
      } else if (skipped > 0) {
        showToast('warning', `Aucun tag importé (${skipped} déjà existants)`);
      } else {
        showToast('warning', 'Aucun tag à importer');
      }
    } catch (err) {
      console.error('Import error:', err);
      showToast('error', 'Erreur lors de l\'import du fichier');
    }
  }, [create, nameExists, showToast]);

  return (
    <>
      <Modal
        isOpen={isOpen && !editingTagSet && !isCreating}
        onClose={onClose}
        title="Gestion des tags"
        width="lg"
        footer={
          <div className="flex justify-between w-full">
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={handleReset}
                className={confirmReset ? 'text-error border-error' : ''}
              >
                <RotateCcw size={14} />
                {confirmReset ? 'Confirmer' : 'Réinitialiser'}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleImportClick}>
                <Upload size={14} />
                Importer
              </Button>
              <Button variant="secondary" onClick={handleExport}>
                <Download size={14} />
                Exporter
              </Button>
              <Button variant="secondary" onClick={onClose}>
                Fermer
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-2">
          {/* TagSet list */}
          {tagSets.map((tagSet) => (
            <TagSetListItem
              key={tagSet.id}
              tagSet={tagSet}
              onEdit={() => handleEdit(tagSet)}
              onDelete={() => handleDelete(tagSet.id, tagSet.name)}
            />
          ))}

          {/* Add button */}
          <button
            onClick={handleCreate}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-secondary border border-dashed border-border-default rounded transition-colors"
          >
            <Plus size={14} />
            Nouveau tag
          </button>

          {/* Hidden file input for import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </Modal>

      {/* Editor modal for editing */}
      {editingTagSet && (
        <TagSetEditorModal
          isOpen={true}
          onClose={handleCloseEditor}
          tagSet={editingTagSet}
        />
      )}

      {/* Editor modal for creating */}
      {isCreating && (
        <TagSetEditorModal
          isOpen={true}
          onClose={handleCloseEditor}
        />
      )}
    </>
  );
}

interface TagSetListItemProps {
  tagSet: TagSet;
  onEdit: () => void;
  onDelete: () => void;
}

function TagSetListItem({ tagSet, onEdit, onDelete }: TagSetListItemProps) {
  const ShapeIcon = tagSet.defaultVisual.shape
    ? shapeIcons[tagSet.defaultVisual.shape]
    : Circle;

  return (
    <div className="flex items-center gap-3 p-3 bg-bg-secondary border border-border-default rounded hover:border-border-strong transition-colors group">
      {/* Visual indicator */}
      <div
        className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded"
        style={{
          backgroundColor: tagSet.defaultVisual.color || 'var(--color-bg-tertiary)',
        }}
      >
        <ShapeIcon
          size={16}
          className="text-text-primary"
          style={{
            color: tagSet.defaultVisual.color ? 'white' : 'var(--color-text-secondary)',
          }}
        />
      </div>

      {/* Name and info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary truncate">
          {tagSet.name}
        </div>
        <div className="text-xs text-text-tertiary">
          {tagSet.suggestedProperties.length} propriétés
          {tagSet.isBuiltIn && ' • Par défaut'}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <IconButton onClick={onEdit} size="sm" title="Modifier">
          <Pencil size={14} />
        </IconButton>
        {!tagSet.isBuiltIn && (
          <IconButton onClick={onDelete} size="sm" title="Supprimer">
            <Trash2 size={14} />
          </IconButton>
        )}
      </div>
    </div>
  );
}
