import { useState, useCallback, useRef } from 'react';
import { X, Download, Upload, FileJson, FileSpreadsheet, FileText, FileArchive, AlertCircle, CheckCircle } from 'lucide-react';
import { exportService, type ExportFormat } from '../../services/exportService';
import { importService, type ImportResult } from '../../services/importService';
import { fileService } from '../../services/fileService';
import { tabRepository } from '../../db/repositories';
import { useInvestigationStore, useViewStore, toast } from '../../stores';

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'export' | 'import';

const exportFormats: { format: ExportFormat; label: string; description: string; icon: typeof FileJson }[] = [
  { format: 'zip', label: 'ZIP (complet)', description: 'Archive avec fichiers joints (recommande)', icon: FileArchive },
  { format: 'json', label: 'JSON', description: 'Metadonnees uniquement (sans fichiers)', icon: FileJson },
  { format: 'csv', label: 'CSV', description: 'Tableaux elements et liens separes', icon: FileSpreadsheet },
  { format: 'graphml', label: 'GraphML', description: 'Format graphe standard (Gephi, yEd)', icon: FileText },
];

export function ImportExportModal({ isOpen, onClose }: ImportExportModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('export');
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [createMissingElements, setCreateMissingElements] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { currentInvestigation, elements, links, loadInvestigation } = useInvestigationStore();
  const requestFitView = useViewStore((state) => state.requestFitView);

  const handleExport = useCallback(async (format: ExportFormat) => {
    if (!currentInvestigation) return;

    setIsProcessing(true);
    try {
      // Fetch assets and tabs for ZIP/JSON export
      let assets;
      if (format === 'zip') {
        assets = await fileService.getAssetsByInvestigation(currentInvestigation.id);
      }
      const tabs = (format === 'zip' || format === 'json')
        ? await tabRepository.getByInvestigation(currentInvestigation.id)
        : undefined;

      await exportService.exportInvestigation(format, currentInvestigation, elements, links, assets, undefined, tabs);
      toast.success(`Export ${format.toUpperCase()} termine`);
    } catch {
      toast.error('Erreur lors de l\'export');
    } finally {
      setIsProcessing(false);
    }
  }, [currentInvestigation, elements, links]);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentInvestigation) return;

    setIsProcessing(true);
    setImportResult(null);

    try {
      let result: ImportResult;

      if (file.name.endsWith('.zip')) {
        // ZIP import (with assets)
        result = await importService.importFromZip(file, currentInvestigation.id);
      } else if (file.name.endsWith('.json')) {
        const content = await importService.readFileAsText(file);
        result = await importService.importFromJSON(content, currentInvestigation.id);
      } else if (file.name.endsWith('.csv')) {
        const content = await importService.readFileAsText(file);
        result = await importService.importFromCSV(content, currentInvestigation.id, {
          createMissingElements,
        });
      } else if (file.name.endsWith('.graphml') || file.name.endsWith('.xml')) {
        const content = await importService.readFileAsText(file);
        result = await importService.importFromGraphML(content, currentInvestigation.id);
      } else {
        result = {
          success: false,
          elementsImported: 0,
          linksImported: 0,
          assetsImported: 0,
          reportImported: false,
          errors: ['Format de fichier non supporte. Utilisez ZIP, JSON, CSV ou GraphML.'],
          warnings: [],
        };
      }

      setImportResult(result);

      // Reload investigation to refresh data
      if (result.success) {
        await loadInvestigation(currentInvestigation.id);
        // Request fitView to show all imported elements
        requestFitView();
      }
    } catch (error) {
      setImportResult({
        success: false,
        elementsImported: 0,
        linksImported: 0,
        assetsImported: 0,
          reportImported: false,
        errors: [error instanceof Error ? error.message : 'Erreur inconnue'],
        warnings: [],
      });
    } finally {
      setIsProcessing(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [currentInvestigation, createMissingElements, loadInvestigation]);

  const triggerFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[1000] bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed z-[1000] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-bg-primary rounded-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <h2 className="text-sm font-semibold text-text-primary">
            Import / Export
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-text-tertiary hover:text-text-primary rounded"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border-default">
          <button
            onClick={() => setActiveTab('export')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm transition-colors ${
              activeTab === 'export'
                ? 'text-accent border-b-2 border-accent bg-accent/5'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Download size={16} />
            Exporter
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm transition-colors ${
              activeTab === 'import'
                ? 'text-accent border-b-2 border-accent bg-accent/5'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Upload size={16} />
            Importer
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {activeTab === 'export' ? (
            <div className="space-y-3">
              <p className="text-xs text-text-secondary mb-4">
                Exporter l'enquete "{currentInvestigation?.name}" ({elements.length} elements, {links.length} liens)
              </p>

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
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-text-secondary">
                Importer des donnees dans l'enquete "{currentInvestigation?.name}"
              </p>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,.json,.csv,.graphml,.xml"
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Import button */}
              <button
                onClick={triggerFileSelect}
                disabled={isProcessing}
                className="w-full flex flex-col items-center gap-3 p-6 rounded-lg border-2 border-dashed border-border-default hover:border-accent hover:bg-accent/5 transition-colors disabled:opacity-50"
              >
                <Upload size={32} className="text-text-tertiary" />
                <div className="text-center">
                  <div className="text-sm font-medium text-text-primary">
                    {isProcessing ? 'Import en cours...' : 'Selectionner un fichier'}
                  </div>
                  <div className="text-xs text-text-tertiary mt-1">
                    Formats supportes: ZIP, JSON, CSV, GraphML/XML
                  </div>
                </div>
              </button>

              {/* Options */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="createMissing"
                  checked={createMissingElements}
                  onChange={(e) => setCreateMissingElements(e.target.checked)}
                  className="rounded border-border-default"
                />
                <label htmlFor="createMissing" className="text-xs text-text-secondary">
                  Creer les elements manquants lors de l'import des liens
                </label>
              </div>

              {/* Import result */}
              {importResult && (
                <div
                  className={`p-3 rounded-lg ${
                    importResult.success
                      ? 'bg-green-50 border border-green-200'
                      : 'bg-red-50 border border-red-200'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {importResult.success ? (
                      <CheckCircle size={16} className="text-green-600" />
                    ) : (
                      <AlertCircle size={16} className="text-red-600" />
                    )}
                    <span
                      className={`text-sm font-medium ${
                        importResult.success ? 'text-green-800' : 'text-red-800'
                      }`}
                    >
                      {importResult.success ? 'Import reussi' : 'Erreur d\'import'}
                    </span>
                  </div>

                  {importResult.success && (
                    <div className="text-xs text-green-700 space-y-1">
                      {importResult.elementsImported > 0 && (
                        <p>{importResult.elementsImported} element(s) importe(s)</p>
                      )}
                      {importResult.linksImported > 0 && (
                        <p>{importResult.linksImported} lien(s) importe(s)</p>
                      )}
                      {importResult.assetsImported > 0 && (
                        <p>{importResult.assetsImported} fichier(s) importe(s)</p>
                      )}
                    </div>
                  )}

                  {importResult.errors.length > 0 && (
                    <div className="text-xs text-red-700 mt-2">
                      {importResult.errors.map((err, i) => (
                        <p key={i}>{err}</p>
                      ))}
                    </div>
                  )}

                  {importResult.warnings.length > 0 && (
                    <div className="text-xs text-yellow-700 mt-2">
                      <p className="font-medium">Avertissements:</p>
                      {importResult.warnings.slice(0, 5).map((warn, i) => (
                        <p key={i}>{warn}</p>
                      ))}
                      {importResult.warnings.length > 5 && (
                        <p>... et {importResult.warnings.length - 5} autres</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* CSV Template */}
              <div className="p-3 bg-bg-secondary rounded-lg border border-border-default">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-text-primary">Modèle CSV</span>
                  <button
                    onClick={() => {
                      const template = exportService.generateCSVTemplate();
                      exportService.download(template, 'modele_csv.csv', 'text/csv');
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-accent rounded transition-colors"
                  >
                    <Download size={12} />
                    Télécharger
                  </button>
                </div>
                <div className="text-xs text-text-tertiary space-y-1">
                  <p><strong>Format unifié:</strong> type (element/lien), label, de, vers, notes, tags, confiance...</p>
                  <p>Les liens référencent les éléments par leur label dans les colonnes "de" et "vers"</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
