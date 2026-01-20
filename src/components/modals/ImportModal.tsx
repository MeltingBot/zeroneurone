import { useState, useCallback, useRef } from 'react';
import { X, Upload, AlertCircle, CheckCircle, Download, FileSpreadsheet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { importService, type ImportResult } from '../../services/importService';
import { exportService } from '../../services/exportService';
import { useInvestigationStore, toast } from '../../stores';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ImportModal({ isOpen, onClose }: ImportModalProps) {
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [createMissingElements, setCreateMissingElements] = useState(true);
  const [targetInvestigationId, setTargetInvestigationId] = useState<string>('new');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { investigations, createInvestigation } = useInvestigationStore();

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setImportResult(null);

    try {
      // Determine target investigation
      let investigationId = targetInvestigationId;

      if (targetInvestigationId === 'new') {
        // Create new investigation with file name (without extension)
        const name = file.name.replace(/\.(zip|json|csv|osintracker|graphml|xml)$/i, '');
        const investigation = await createInvestigation(name, '');
        investigationId = investigation.id;
      }

      let result: ImportResult;

      if (file.name.endsWith('.zip')) {
        result = await importService.importFromZip(file, investigationId);
      } else if (file.name.endsWith('.osintracker')) {
        const content = await importService.readFileAsText(file);
        result = await importService.importFromOsintracker(content, investigationId);
      } else if (file.name.endsWith('.json')) {
        const content = await importService.readFileAsText(file);
        result = await importService.importFromJSON(content, investigationId);
      } else if (file.name.endsWith('.csv')) {
        const content = await importService.readFileAsText(file);
        result = await importService.importFromCSV(content, investigationId, {
          createMissingElements,
        });
      } else if (file.name.endsWith('.graphml') || file.name.endsWith('.xml')) {
        const content = await importService.readFileAsText(file);
        result = await importService.importFromGraphML(content, investigationId);
      } else {
        result = {
          success: false,
          elementsImported: 0,
          linksImported: 0,
          assetsImported: 0,
          errors: ['Format de fichier non supporté. Utilisez ZIP, JSON, CSV, GraphML/XML ou OSINTracker.'],
          warnings: [],
        };
      }

      setImportResult(result);

      if (result.success) {
        toast.success('Import réussi');
        // Navigate to the investigation
        setTimeout(() => {
          onClose();
          navigate(`/investigation/${investigationId}`);
        }, 1500);
      }
    } catch (error) {
      setImportResult({
        success: false,
        elementsImported: 0,
        linksImported: 0,
        assetsImported: 0,
        errors: [error instanceof Error ? error.message : 'Erreur inconnue'],
        warnings: [],
      });
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [targetInvestigationId, createMissingElements, createInvestigation, navigate, onClose]);

  const triggerFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleClose = useCallback(() => {
    setImportResult(null);
    setTargetInvestigationId('new');
    onClose();
  }, [onClose]);

  const downloadCSVTemplate = useCallback(() => {
    const template = exportService.generateCSVTemplate();
    exportService.download(template, 'modele_csv.csv', 'text/csv');
  }, []);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[1000] bg-black/50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed z-[1000] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-bg-primary rounded-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <h2 className="text-sm font-semibold text-text-primary">
            Importer une enquête
          </h2>
          <button
            onClick={handleClose}
            className="p-1 text-text-tertiary hover:text-text-primary rounded"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Target selection */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-2">
              Importer dans
            </label>
            <select
              value={targetInvestigationId}
              onChange={(e) => setTargetInvestigationId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border-default rounded bg-bg-primary text-text-primary"
            >
              <option value="new">Nouvelle enquête</option>
              {investigations.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.name}
                </option>
              ))}
            </select>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.json,.csv,.osintracker,.graphml,.xml"
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
                {isProcessing ? 'Import en cours...' : 'Sélectionner un fichier'}
              </div>
              <div className="text-xs text-text-tertiary mt-1">
                ZIP, JSON, CSV, GraphML/XML, OSINTracker
              </div>
            </div>
          </button>

          {/* Options for CSV */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="createMissing"
              checked={createMissingElements}
              onChange={(e) => setCreateMissingElements(e.target.checked)}
              className="rounded border-border-default"
            />
            <label htmlFor="createMissing" className="text-xs text-text-secondary">
              Créer les éléments manquants (CSV liens)
            </label>
          </div>

          {/* CSV Template */}
          <div className="p-3 bg-bg-secondary rounded-lg border border-border-default">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={14} className="text-text-secondary" />
                <span className="text-xs font-medium text-text-primary">Modèle CSV</span>
              </div>
              <button
                onClick={downloadCSVTemplate}
                className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-secondary hover:text-accent hover:bg-accent/5 rounded transition-colors"
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
                  {importResult.success ? 'Import réussi' : 'Erreur d\'import'}
                </span>
              </div>

              {importResult.success && (
                <div className="text-xs text-green-700 space-y-1">
                  {importResult.elementsImported > 0 && (
                    <p>{importResult.elementsImported} élément(s) importé(s)</p>
                  )}
                  {importResult.linksImported > 0 && (
                    <p>{importResult.linksImported} lien(s) importé(s)</p>
                  )}
                  {importResult.assetsImported > 0 && (
                    <p>{importResult.assetsImported} fichier(s) importé(s)</p>
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
        </div>
      </div>
    </>
  );
}
