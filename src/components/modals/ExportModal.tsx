import { useState, useCallback } from 'react';
import { X, FileJson, FileSpreadsheet, FileText, FileArchive } from 'lucide-react';
import { exportService, type ExportFormat } from '../../services/exportService';
import { fileService } from '../../services/fileService';
import { useInvestigationStore, toast } from '../../stores';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const exportFormats: { format: ExportFormat; label: string; description: string; icon: typeof FileJson }[] = [
  { format: 'zip', label: 'ZIP (complet)', description: 'Archive avec fichiers joints (recommandé)', icon: FileArchive },
  { format: 'json', label: 'JSON', description: 'Métadonnées uniquement (sans fichiers)', icon: FileJson },
  { format: 'csv', label: 'CSV', description: 'Tableaux éléments et liens séparés', icon: FileSpreadsheet },
  { format: 'graphml', label: 'GraphML', description: 'Format graphe standard (Gephi, yEd)', icon: FileText },
];

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const { currentInvestigation, elements, links } = useInvestigationStore();

  const handleExport = useCallback(async (format: ExportFormat) => {
    if (!currentInvestigation) return;

    setIsProcessing(true);
    try {
      // Fetch assets for ZIP export
      let assets;
      if (format === 'zip') {
        assets = await fileService.getAssetsByInvestigation(currentInvestigation.id);
      }

      await exportService.exportInvestigation(format, currentInvestigation, elements, links, assets);
      toast.success(`Export ${format.toUpperCase()} terminé`);
      onClose();
    } catch {
      toast.error('Erreur lors de l\'export');
    } finally {
      setIsProcessing(false);
    }
  }, [currentInvestigation, elements, links, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-bg-primary rounded-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <h2 className="text-sm font-semibold text-text-primary">
            Exporter l'enquête
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-text-tertiary hover:text-text-primary rounded"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-xs text-text-secondary mb-4">
            Exporter "{currentInvestigation?.name}" ({elements.length} éléments, {links.length} liens)
          </p>

          <div className="space-y-3">
            {exportFormats.map((format) => {
              const Icon = format.icon;
              return (
                <button
                  key={format.format}
                  onClick={() => handleExport(format.format)}
                  disabled={isProcessing}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-border-default hover:border-accent hover:bg-accent/5 transition-colors disabled:opacity-50"
                >
                  <Icon size={20} className="text-text-secondary" />
                  <div className="text-left">
                    <div className="text-sm font-medium text-text-primary">
                      {format.label}
                    </div>
                    <div className="text-xs text-text-tertiary">
                      {format.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
