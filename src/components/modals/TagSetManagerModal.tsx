import { useState, useCallback, useRef } from 'react';
import { Plus, RotateCcw, Pencil, Trash2, Circle, Square, Diamond, Hexagon, RectangleHorizontal, Download, Upload, HelpCircle } from 'lucide-react';
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
  const [showHelp, setShowHelp] = useState(false);
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
  const handleExportJSON = useCallback(() => {
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

    showToast('success', `${tagSets.length} tags exportés (JSON)`);
  }, [tagSets, showToast]);

  // Export all TagSets to CSV file
  const handleExportCSV = useCallback(() => {
    const escapeCSV = (value: string) => {
      if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes(';')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const headers = ['nom', 'description', 'couleur', 'forme', 'proprietes'];
    const rows = tagSets.map((ts) => {
      // Format properties as "key:type;key:type;..."
      const propsStr = ts.suggestedProperties
        .map((p) => `${p.key}:${p.type}${p.choices ? ':' + p.choices.join('|') : ''}`)
        .join(';');
      return [
        escapeCSV(ts.name),
        escapeCSV(ts.description),
        ts.defaultVisual.color || '',
        ts.defaultVisual.shape || '',
        escapeCSV(propsStr),
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `zeroneurone-tagsets-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('success', `${tagSets.length} tags exportés (CSV)`);
  }, [tagSets, showToast]);

  // Download CSV template for TagSets
  const handleDownloadTemplate = useCallback(() => {
    const template = `nom,description,couleur,forme,proprietes
Personne,Une personne physique,#3b82f6,circle,prenom:text;nom:text;date_naissance:date
Entreprise,Une societe,#22c55e,square,raison_sociale:text;siret:text
Vehicule,Un vehicule,#f97316,diamond,immatriculation:text;marque:text;modele:text
Adresse,Une adresse postale,#8b5cf6,hexagon,rue:text;ville:text;code_postal:text`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modele-tagsets.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  // Trigger file input for import
  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Parse CSV line handling quoted values
  const parseCSVLine = useCallback((line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }, []);

  // Handle file selection for import (JSON or CSV)
  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input for future imports
    event.target.value = '';

    try {
      const text = await file.text();
      let imported = 0;
      let skipped = 0;

      if (file.name.endsWith('.csv')) {
        // CSV import
        const lines = text.split('\n').filter((l) => l.trim());
        if (lines.length < 2) {
          showToast('error', 'Fichier CSV vide ou invalide');
          return;
        }

        const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
        const nameIdx = headers.findIndex((h) => ['nom', 'name'].includes(h));
        const descIdx = headers.findIndex((h) => ['description', 'desc'].includes(h));
        const colorIdx = headers.findIndex((h) => ['couleur', 'color'].includes(h));
        const shapeIdx = headers.findIndex((h) => ['forme', 'shape'].includes(h));
        const propsIdx = headers.findIndex((h) => ['proprietes', 'properties', 'props'].includes(h));

        if (nameIdx === -1) {
          showToast('error', 'Colonne "nom" manquante dans le CSV');
          return;
        }

        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          const name = values[nameIdx]?.trim();
          if (!name) continue;

          if (nameExists(name)) {
            skipped++;
            continue;
          }

          // Parse properties from "key:type;key:type" format
          const suggestedProperties: SuggestedProperty[] = [];
          if (propsIdx >= 0 && values[propsIdx]) {
            const propsStr = values[propsIdx].trim();
            if (propsStr) {
              const propParts = propsStr.split(';');
              for (const part of propParts) {
                const [key, type, choicesStr] = part.split(':');
                if (key && type) {
                  const prop: SuggestedProperty = {
                    key: key.trim(),
                    type: type.trim() as SuggestedProperty['type'],
                    description: '',
                    placeholder: '',
                  };
                  if (choicesStr) {
                    prop.choices = choicesStr.split('|').map((c) => c.trim());
                  }
                  suggestedProperties.push(prop);
                }
              }
            }
          }

          const shape = shapeIdx >= 0 ? values[shapeIdx]?.trim() : '';
          const validShapes = ['circle', 'square', 'diamond', 'hexagon', 'rectangle'];

          await create({
            name,
            description: descIdx >= 0 ? values[descIdx] || '' : '',
            defaultVisual: {
              color: colorIdx >= 0 && values[colorIdx] ? values[colorIdx].trim() : null,
              shape: validShapes.includes(shape) ? shape as ElementShape : null,
              icon: null,
            },
            suggestedProperties,
            isBuiltIn: false,
          });
          imported++;
        }
      } else {
        // JSON import
        const data = JSON.parse(text);

        if (!isValidExportData(data)) {
          showToast('error', 'Format de fichier JSON invalide');
          return;
        }

        for (const exportedTagSet of data.tagSets) {
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
  }, [create, nameExists, showToast, parseCSVLine]);

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
              <Button variant="secondary" onClick={handleExportCSV}>
                <Download size={14} />
                CSV
              </Button>
              <Button variant="secondary" onClick={handleExportJSON}>
                <Download size={14} />
                JSON
              </Button>
              <Button variant="secondary" onClick={onClose}>
                Fermer
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          {/* Help section */}
          <div className="border border-border-default rounded">
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              <HelpCircle size={14} />
              <span>Comment utiliser les tags ?</span>
              <span className="ml-auto text-text-tertiary">{showHelp ? '−' : '+'}</span>
            </button>
            {showHelp && (
              <div className="px-3 pb-3 text-xs text-text-tertiary space-y-3 border-t border-border-default pt-2">
                <div>
                  <p className="font-medium text-text-secondary mb-1">Qu'est-ce qu'un Tag ?</p>
                  <p>
                    Un tag catégorise vos éléments (ex: "Personne", "Entreprise", "Véhicule").
                    Chaque tag peut définir une couleur, une forme, et des propriétés suggérées.
                  </p>
                </div>
                <div>
                  <p className="font-medium text-text-secondary mb-1">Propriétés suggérées</p>
                  <p>
                    Quand vous ajoutez un tag à un élément, ses propriétés suggérées s'affichent automatiquement.
                    Ex: tag "Personne" → champs "Prénom", "Nom", "Date de naissance".
                  </p>
                </div>
                <div>
                  <p className="font-medium text-text-secondary mb-1">Importer vos tags (CSV ou JSON)</p>
                  <p className="mb-2">
                    Créez vos propres tags en important un fichier CSV ou JSON.
                  </p>
                  <div className="bg-bg-secondary p-2 rounded text-xs font-mono">
                    <p className="text-text-secondary mb-1">Format CSV:</p>
                    <p>nom,description,couleur,forme,proprietes</p>
                    <p>Personne,Une personne,#3b82f6,circle,prenom:text;nom:text</p>
                  </div>
                  <button
                    onClick={handleDownloadTemplate}
                    className="mt-2 flex items-center gap-1 text-accent hover:underline"
                  >
                    <Download size={12} />
                    Télécharger le modèle CSV
                  </button>
                </div>
                <div>
                  <p className="font-medium text-text-secondary mb-1">Types de propriétés</p>
                  <p className="font-mono text-xs">
                    text, number, date, datetime, boolean, choice, country, geo, link
                  </p>
                  <p className="mt-1">
                    Pour les choix multiples: <code className="bg-bg-tertiary px-1 rounded">statut:choice:actif|inactif|suspendu</code>
                  </p>
                </div>
              </div>
            )}
          </div>

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
            accept=".json,.csv"
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
