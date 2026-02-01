import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Upload, AlertCircle, CheckCircle, Download, FileSpreadsheet } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { importService, type ImportResult } from '../../services/importService';
import { exportService } from '../../services/exportService';
import { useInvestigationStore, useUIStore, toast } from '../../stores';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ImportModal({ isOpen, onClose }: ImportModalProps) {
  const { t, i18n } = useTranslation('modals');
  const navigate = useNavigate();
  const location = useLocation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [createMissingElements, setCreateMissingElements] = useState(true);
  const [targetInvestigationId, setTargetInvestigationId] = useState<string>('new');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { investigations, createInvestigation, currentInvestigation } = useInvestigationStore();
  const enterImportPlacementMode = useUIStore((state) => state.enterImportPlacementMode);

  // Check if we're currently on an investigation page
  const isOnInvestigationPage = location.pathname.startsWith('/investigation/');

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setImportResult(null);

    try {
      // Determine target investigation
      let investigationId = targetInvestigationId;
      const isImportingIntoExisting = targetInvestigationId !== 'new';

      if (targetInvestigationId === 'new') {
        // Create new investigation with file name (without extension)
        const name = file.name.replace(/\.(zip|json|csv|osintracker|graphml|xml)$/i, '');
        const investigation = await createInvestigation(name, '');
        investigationId = investigation.id;
      }

      // Special case: importing ZIP into existing investigation while on canvas
      // → Enter placement mode so user can choose where to place elements
      if (isImportingIntoExisting && file.name.endsWith('.zip') && isOnInvestigationPage && currentInvestigation?.id === targetInvestigationId) {
        // Parse the ZIP to get bounding box
        const parseResult = await importService.parseZipForPlacement(file);

        if (parseResult.success && parseResult.boundingBox.elementCount > 0) {
          // Enter placement mode - the modal will close automatically
          enterImportPlacementMode({
            boundingBox: parseResult.boundingBox,
            file,
            investigationId,
            onComplete: () => {
              // Reset state after successful import
              setImportResult(null);
              setTargetInvestigationId('new');
            }
          });

          // Clear the file input
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
          setIsProcessing(false);
          return;
        } else if (!parseResult.success) {
          // If parsing failed, show error and don't proceed
          setImportResult({
            success: false,
            elementsImported: 0,
            linksImported: 0,
            assetsImported: 0,
            errors: [parseResult.error || t('import.unknownError')],
            warnings: [],
          });
          setIsProcessing(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
          return;
        }
        // If bounding box is empty, fall through to regular import
      }

      let result: ImportResult;

      if (file.name.endsWith('.zip')) {
        result = await importService.importFromZip(file, investigationId);
      } else if (file.name.endsWith('.osintracker')) {
        const content = await importService.readFileAsText(file);
        result = await importService.importFromOsintracker(content, investigationId);
      } else if (file.name.endsWith('.json') || file.name.endsWith('.excalidraw')) {
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
        // Unknown extension: try JSON auto-detection (handles .excalidraw and similar)
        const content = await importService.readFileAsText(file);
        try {
          JSON.parse(content);
          result = await importService.importFromJSON(content, investigationId);
        } catch {
          result = {
            success: false,
            elementsImported: 0,
            linksImported: 0,
            assetsImported: 0,
            errors: [t('import.unknownFormat')],
            warnings: [],
          };
        }
      }

      setImportResult(result);

      if (result.success) {
        toast.success(t('import.success'));
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
        errors: [error instanceof Error ? error.message : t('import.unknownError')],
        warnings: [],
      });
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [targetInvestigationId, createMissingElements, createInvestigation, navigate, onClose, t, isOnInvestigationPage, currentInvestigation, enterImportPlacementMode]);

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
    const filename = i18n.language === 'fr' ? 'modele_csv.csv' : 'csv_template.csv';
    exportService.download(template, filename, 'text/csv');
  }, [i18n.language]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[1000] bg-black/50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed z-[1000] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-bg-primary rounded-lg shadow-xl" data-testid="import-modal">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <h2 className="text-sm font-semibold text-text-primary">
            {t('import.title')}
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
              {t('import.importInto')}
            </label>
            <select
              value={targetInvestigationId}
              onChange={(e) => setTargetInvestigationId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border-default rounded bg-bg-primary text-text-primary"
            >
              <option value="new">{t('import.newInvestigation')}</option>
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
            accept=".zip,.json,.csv,.osintracker,.graphml,.xml,.excalidraw,*/*"
            onChange={handleFileSelect}
            className="hidden"
            data-testid="import-file-input"
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
                {isProcessing ? t('import.importing') : t('import.selectFile')}
              </div>
              <div className="text-xs text-text-tertiary mt-1">
                {t('import.supportedFormats')}
              </div>
              <div className="text-xs text-text-tertiary mt-0.5">
                {t('import.jsonFormats')}
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
              {t('import.createMissing')}
            </label>
          </div>

          {/* CSV Template */}
          <div className="p-3 bg-bg-secondary rounded-lg border border-border-default">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={14} className="text-text-secondary" />
                <span className="text-xs font-medium text-text-primary">{t('import.csvTemplate.title')}</span>
              </div>
              <button
                onClick={downloadCSVTemplate}
                className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-secondary hover:text-accent hover:bg-accent/5 rounded transition-colors"
              >
                <Download size={12} />
                {t('import.csvTemplate.download')}
              </button>
            </div>
            <div className="text-xs text-text-tertiary space-y-1">
              <p dangerouslySetInnerHTML={{ __html: t('import.csvTemplate.format') }} />
              <p>{t('import.csvTemplate.description')}</p>
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
                  {importResult.success ? t('import.success') : t('import.error')}
                </span>
              </div>

              {importResult.success && (
                <div className="text-xs text-green-700 space-y-1">
                  {importResult.elementsImported > 0 && (
                    <p>{t('import.successElements', { count: importResult.elementsImported })}</p>
                  )}
                  {importResult.linksImported > 0 && (
                    <p>{t('import.successLinks', { count: importResult.linksImported })}</p>
                  )}
                  {importResult.assetsImported > 0 && (
                    <p>{t('import.successAssets', { count: importResult.assetsImported })}</p>
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
                  <p className="font-medium">{t('import.warnings')}</p>
                  {importResult.warnings.slice(0, 5).map((warn, i) => (
                    <p key={i}>{warn}</p>
                  ))}
                  {importResult.warnings.length > 5 && (
                    <p>{t('import.andMore', { count: importResult.warnings.length - 5 })}</p>
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
