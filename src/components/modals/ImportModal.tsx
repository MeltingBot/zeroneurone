import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Upload, AlertCircle, CheckCircle, Download, FileSpreadsheet, Eye, EyeOff } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { importService, isEncryptedZipFile, decryptZipFile, type ImportResult } from '../../services/importService';
import { importGEXF } from '../../services/importGephi';
import { importANX, isANXFormat } from '../../services/importANX';
import { exportService } from '../../services/exportService';
import { useDossierStore, useUIStore, useViewStore, toast } from '../../stores';

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
  const [targetDossierId, setTargetDossierId] = useState<string>('new');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Déchiffrement .znzip
  const [pendingEncryptedFile, setPendingEncryptedFile] = useState<File | null>(null);
  const [znzipPassword, setZnzipPassword] = useState('');
  const [znzipError, setZnzipError] = useState<string | null>(null);
  const [showZnzipPassword, setShowZnzipPassword] = useState(false);

  const { dossiers, createDossier, deleteDossier, currentDossier } = useDossierStore();
  const enterImportPlacementMode = useUIStore((state) => state.enterImportPlacementMode);
  const requestFitView = useViewStore((state) => state.requestFitView);

  // Check if we're currently on an dossier page
  const isOnDossierPage = location.pathname.startsWith('/dossier/');

  const handleDecryptAndImport = useCallback(async (encFile: File, password: string) => {
    setZnzipError(null);
    setIsProcessing(true);
    try {
      const decryptedFile = await decryptZipFile(encFile, password);
      setPendingEncryptedFile(null);
      setZnzipPassword('');
      // Simuler un FileList pour réutiliser handleFileSelect
      await processFile(decryptedFile);
    } catch (err) {
      setZnzipError(err instanceof Error ? err.message : 'Mot de passe incorrect');
    } finally {
      setIsProcessing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetDossierId]);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Détection .znzip avant tout traitement
    if (file.name.endsWith('.znzip') || await isEncryptedZipFile(file)) {
      setPendingEncryptedFile(file);
      setZnzipPassword('');
      setZnzipError(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsProcessing(true);
    setImportResult(null);
    await processFile(file);
    setIsProcessing(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetDossierId]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const processFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    setImportResult(null);

    let dossierId = targetDossierId;
    let createdNewDossier = false;

    try {
      // Determine target dossier
      const isImportingIntoExisting = targetDossierId !== 'new';

      if (targetDossierId === 'new') {
        // Create new dossier with file name (without extension)
        const name = file.name.replace(/\.(zip|json|csv|osintracker|graphml|gexf|xml|anx|ged|gw)$/i, '');
        const dossier = await createDossier(name, '');
        dossierId = dossier.id;
        createdNewDossier = true;
      }

      // Special case: importing ZIP into existing dossier while on canvas
      // → Enter placement mode so user can choose where to place elements
      if (isImportingIntoExisting && file.name.endsWith('.zip') && isOnDossierPage && currentDossier?.id === targetDossierId) {
        // Parse the ZIP to get bounding box
        const parseResult = await importService.parseZipForPlacement(file);

        if (parseResult.success && parseResult.boundingBox.elementCount > 0) {
          // Enter placement mode - the modal will close automatically
          enterImportPlacementMode({
            boundingBox: parseResult.boundingBox,
            file,
            dossierId,
            onComplete: () => {
              // Reset state after successful import
              setImportResult(null);
              setTargetDossierId('new');
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
          reportImported: false,
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
        result = await importService.importFromZip(file, dossierId);
      } else if (file.name.endsWith('.osintracker')) {
        const content = await importService.readFileAsText(file);
        result = await importService.importFromOsintracker(content, dossierId);
      } else if (file.name.endsWith('.json') || file.name.endsWith('.excalidraw')) {
        const content = await importService.readFileAsText(file);
        result = await importService.importFromJSON(content, dossierId);
      } else if (file.name.endsWith('.csv')) {
        const content = await importService.readFileAsText(file);
        result = await importService.importFromCSV(content, dossierId, {
          createMissingElements,
        });
      } else if (file.name.endsWith('.gexf')) {
        const content = await importService.readFileAsText(file);
        result = await importGEXF(content, dossierId);
      } else if (file.name.endsWith('.anx')) {
        const content = await importService.readFileAsText(file);
        result = await importANX(content, dossierId);
      } else if (file.name.endsWith('.graphml') || file.name.endsWith('.xml')) {
        const content = await importService.readFileAsText(file);
        if (isANXFormat(content)) {
          result = await importANX(content, dossierId);
        } else {
          result = await importService.importFromGraphML(content, dossierId);
        }
      } else if (file.name.endsWith('.geojson')) {
        const content = await importService.readFileAsText(file);
        result = await importService.importFromGeoJSON(content, dossierId);
      } else if (file.name.endsWith('.ged') || file.name.endsWith('.gw')) {
        result = await importService.importFromGenealogy(file, dossierId);
      } else {
        // Unknown extension: try JSON auto-detection (handles .excalidraw and similar)
        const content = await importService.readFileAsText(file);
        try {
          JSON.parse(content);
          result = await importService.importFromJSON(content, dossierId);
        } catch {
          result = {
            success: false,
            elementsImported: 0,
            linksImported: 0,
            assetsImported: 0,
          reportImported: false,
            errors: [t('import.unknownFormat')],
            warnings: [],
          };
        }
      }

      setImportResult(result);

      if (result.success) {
        toast.success(t('import.success'));
        // Request fitView to show the entire graph after import
        requestFitView();
        // Navigate to the dossier
        setTimeout(() => {
          onClose();
          navigate(`/dossier/${dossierId}`);
        }, 1500);
      } else if (createdNewDossier) {
        // Import failed — delete the empty dossier we just created
        await deleteDossier(dossierId);
      }
    } catch (error) {
      // Delete the empty dossier if we created one before the error
      if (createdNewDossier) {
        await deleteDossier(dossierId).catch(() => {});
      }
      setImportResult({
        success: false,
        elementsImported: 0,
        linksImported: 0,
        assetsImported: 0,
          reportImported: false,
        errors: [error instanceof Error ? error.message : t('import.unknownError')],
        warnings: [],
      });
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [targetDossierId, createMissingElements, createDossier, deleteDossier, navigate, onClose, t, isOnDossierPage, currentDossier, enterImportPlacementMode, requestFitView]);

  const triggerFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleClose = useCallback(() => {
    setImportResult(null);
    setTargetDossierId('new');
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
              value={targetDossierId}
              onChange={(e) => setTargetDossierId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border-default rounded bg-bg-primary text-text-primary"
            >
              <option value="new">{t('import.newDossier')}</option>
              {dossiers.map((inv) => (
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
            accept=".zip,.znzip,.json,.csv,.osintracker,.graphml,.gexf,.xml,.anx,.excalidraw,.ged,.gw,.geojson,*/*"
            onChange={handleFileSelect}
            className="hidden"
            data-testid="import-file-input"
          />

          {/* Déchiffrement .znzip */}
          {pendingEncryptedFile && (
            <div className="p-3 border border-border-default rounded bg-bg-secondary space-y-2">
              <p className="text-xs text-text-secondary">
                <span className="font-mono">{pendingEncryptedFile.name}</span> est chiffré. Entrez le mot de passe pour importer.
              </p>
              <div className="relative">
                <input
                  type={showZnzipPassword ? 'text' : 'password'}
                  value={znzipPassword}
                  onChange={e => setZnzipPassword(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && znzipPassword && pendingEncryptedFile) {
                      handleDecryptAndImport(pendingEncryptedFile, znzipPassword);
                    }
                  }}
                  placeholder="Mot de passe"
                  autoFocus
                  className="w-full text-sm border border-border-default rounded px-3 py-1.5 pr-8 focus:outline-none focus:border-accent bg-bg-primary"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowZnzipPassword(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                >
                  {showZnzipPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              {znzipError && (
                <p className="text-xs text-error">{znzipError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => { setPendingEncryptedFile(null); setZnzipPassword(''); setZnzipError(null); }}
                  className="flex-1 text-xs text-text-secondary border border-border-default rounded py-1.5 hover:bg-bg-tertiary"
                >
                  Annuler
                </button>
                <button
                  onClick={() => pendingEncryptedFile && handleDecryptAndImport(pendingEncryptedFile, znzipPassword)}
                  disabled={!znzipPassword || isProcessing}
                  className="flex-1 text-xs font-medium bg-accent text-white rounded py-1.5 hover:bg-blue-700 disabled:opacity-40"
                >
                  {isProcessing ? 'Déchiffrement…' : 'Importer'}
                </button>
              </div>
            </div>
          )}

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
              <div className="text-xs text-text-tertiary mt-0.5">
                {t('import.genealogyFormats')}
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
