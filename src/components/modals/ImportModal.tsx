import { useState, useCallback, useRef, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { X, AlertCircle, CheckCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { importService, isEncryptedZipFile, decryptZipFile, type ImportResult } from '../../services/importService';
import { InvalidEncryptedZipError, WrongZipPasswordError } from '../../services/encryption/zipEncryption';
import { importGEXF } from '../../services/importGephi';
import { importANX, isANXFormat } from '../../services/importANX';
import { importANB, isANBFormat } from '../../services/importANB';
import {
  importFEC,
  isFECFormat,
  analyzeFEC,
  DEFAULT_FEC_OPTIONS,
  suggestMinLinkAmount,
  type FECAggregate,
  type FECImportOptions,
} from '../../services/importFEC';
import { FECOptionsPanel } from './FECOptionsPanel';
import { GeoJSONOptionsPanel, type PendingGeoJSON } from './GeoJSONOptionsPanel';
import { ImportProgressLine } from './ImportProgressLine';
import { ImportDropZone, ImportMappingEntry, CsvTemplateCard } from './ImportSections';
import { withImportProgress } from '../../services/importProgress';
import { isNativeCSV } from '../../utils/csv';
import { exportService } from '../../services/exportService';
import { useDossierStore, useUIStore, useViewStore, toast } from '../../stores';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { emitImported, importFormatOf } from '../../plugins/pluginEventBus';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ImportModal({ isOpen, onClose }: ImportModalProps) {
  const { t, i18n } = useTranslation('modals');
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [targetDossierId, setTargetDossierId] = useState<string>('new');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Import en cours : Annuler l'interrompt (ZIP : entre deux médias)
  const abortRef = useRef<AbortController | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  // Déchiffrement .znzip
  const [pendingEncryptedFile, setPendingEncryptedFile] = useState<File | null>(null);
  const [znzipPassword, setZnzipPassword] = useState('');
  const [znzipError, setZnzipError] = useState<string | null>(null);
  const [showZnzipPassword, setShowZnzipPassword] = useState(false);
  // Étape d'options FEC (le fichier est analysé une fois, les options filtrent)
  const [pendingFEC, setPendingFEC] = useState<{
    fileName: string;
    content: string;
    aggregate: FECAggregate;
  } | null>(null);
  const [fecOptions, setFecOptions] = useState<FECImportOptions>(DEFAULT_FEC_OPTIONS);
  // Étape d'options GeoJSON : choix de la propriété qui sert de libellé
  const [pendingGeoJSON, setPendingGeoJSON] = useState<PendingGeoJSON | null>(null);
  const [geoJSONLabelField, setGeoJSONLabelField] = useState('');
  const [geoJSONFields, setGeoJSONFields] = useState<Set<string>>(new Set());
  const [geoJSONTag, setGeoJSONTag] = useState('');

  const { dossiers, createDossier, deleteDossier } = useDossierStore();
  const setPendingDossierImport = useUIStore((state) => state.setPendingDossierImport);
  const requestFitView = useViewStore((state) => state.requestFitView);

  // An existing dossier shows its Y.Doc, not what an import writes to Dexie:
  // open it and let its own import modal run (options, placement, Y.Doc sync).
  const importIntoExistingDossier = useCallback((file: File) => {
    setPendingDossierImport({ dossierId: targetDossierId, file });
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTargetDossierId('new');
    onClose();
    navigate(`/dossier/${targetDossierId}`);
  }, [targetDossierId, setPendingDossierImport, onClose, navigate]);

  const processFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    setImportResult(null);

    // Decrypted .znzip into an existing dossier
    if (targetDossierId !== 'new') {
      setIsProcessing(false);
      importIntoExistingDossier(file);
      return;
    }

    let dossierId = targetDossierId;
    let createdNewDossier = false;
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Create new dossier with file name (without extension)
      const name = file.name.replace(/\.(zip|json|csv|osintracker|graphml|gexf|gml|dot|gv|xml|drawio|anx|anb|ged|gw|mmd|mermaid|md|markdown)$/i, '');
      const dossier = await createDossier(name, '');
      dossierId = dossier.id;
      createdNewDossier = true;

      // CSV without the native columns: the dossier opens on the column mapping
      if (/\.(csv|tsv)$/i.test(file.name)) {
        const content = await importService.readFileAsText(file);
        if (!isNativeCSV(content)) {
          useUIStore.getState().setProvisionalDossierId(dossierId);
          setPendingDossierImport({ dossierId, file });
          onClose();
          navigate(`/dossier/${dossierId}`);
          return;
        }
      }

      let result: ImportResult;

      if (file.name.endsWith('.zip')) {
        result = await importService.importFromZip(file, dossierId, undefined, undefined, controller.signal);
      } else if (file.name.endsWith('.osintracker')) {
        const content = await importService.readFileAsText(file);
        result = await importService.importFromOsintracker(content, dossierId);
      } else if (file.name.endsWith('.json') || file.name.endsWith('.excalidraw')) {
        const content = await importService.readFileAsText(file);
        result = await importService.importFromJSON(content, dossierId);
      } else if (file.name.endsWith('.csv')) {
        const content = await importService.readFileAsText(file);
        result = await importService.importFromCSV(content, dossierId);
      } else if (file.name.endsWith('.anb')) {
        const buffer = await file.arrayBuffer();
        if (!isANBFormat(buffer)) {
          result = { success: false, elementsImported: 0, linksImported: 0, assetsImported: 0, reportImported: false, errors: [t('import.unknownFormat')], warnings: [] };
        } else {
          result = await importANB(buffer, dossierId);
        }
      } else if (file.name.endsWith('.gexf')) {
        const content = await importService.readFileAsText(file);
        result = await importGEXF(content, dossierId);
      } else if (file.name.toLowerCase().endsWith('.gml')) {
        const content = await importService.readFileAsText(file);
        const { importGML } = await import('../../services/importGML');
        result = await importGML(content, dossierId);
      } else if (/\.(dot|gv)$/i.test(file.name)) {
        const content = await importService.readFileAsText(file);
        const { importDOT } = await import('../../services/importDOT');
        result = await importDOT(content, dossierId);
      } else if (file.name.endsWith('.anx')) {
        const content = await importService.readFileAsText(file);
        result = await importANX(content, dossierId);
      } else if (file.name.endsWith('.graphml') || file.name.endsWith('.xml') || file.name.endsWith('.drawio')) {
        const content = await importService.readFileAsText(file);
        const { isDrawioFormat, importDrawio } = await import('../../services/importDrawio');
        if (isDrawioFormat(content)) {
          result = await importDrawio(content, dossierId);
        } else if (isANXFormat(content)) {
          result = await importANX(content, dossierId);
        } else {
          result = await importService.importFromGraphML(content, dossierId);
        }
      } else if (/\.(mmd|mermaid|md|markdown)$/i.test(file.name)) {
        const content = await importService.readFileAsText(file);
        const { importMermaid } = await import('../../services/importMermaid');
        result = await importMermaid(content, dossierId);
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

      // Annulé : rien ne reste, même si l'import a fini entre-temps
      if (controller.signal.aborted) {
        await deleteDossier(dossierId).catch(() => {});
        toast.info(t('import.cancelled'));
        return;
      }

      setImportResult(result);

      if (result.success) {
        emitImported(dossierId, importFormatOf(file.name), false,
          { elements: result.elementsImported, links: result.linksImported, assets: result.assetsImported });
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
      if (controller.signal.aborted) {
        toast.info(t('import.cancelled'));
        return;
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
      abortRef.current = null;
      setIsCancelling(false);
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [targetDossierId, createDossier, deleteDossier, navigate, onClose, t, requestFitView, importIntoExistingDossier, setPendingDossierImport]);

  const handleDecryptAndImport = useCallback(async (encFile: File, password: string) => {
    setZnzipError(null);
    setIsProcessing(true);
    try {
      const decryptedFile = await decryptZipFile(encFile, password);
      setPendingEncryptedFile(null);
      setZnzipPassword('');
      // Simuler un FileList pour réutiliser handleFileSelect
      await withImportProgress(() => processFile(decryptedFile));
    } catch (err) {
      setZnzipError(
        err instanceof WrongZipPasswordError ? t('import.wrongPassword')
          : err instanceof InvalidEncryptedZipError ? t('import.invalidEncryptedFile')
          : err instanceof Error ? err.message : String(err),
      );
    } finally {
      setIsProcessing(false);
    }
  }, [processFile, t]);

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

    if (targetDossierId !== 'new') {
      importIntoExistingDossier(file);
      return;
    }

    // Détection FEC (par contenu — .txt est trop générique) : ouvre l'étape
    // d'options au lieu d'importer directement. Le dossier n'est créé qu'à la
    // confirmation, pour ne rien laisser derrière en cas d'annulation.
    if (/\.(txt|fec)$/i.test(file.name)) {
      const content = await importService.readFileAsText(file);
      if (isFECFormat(content)) {
        setIsProcessing(true);
        try {
          const aggregate = analyzeFEC(content);
          setPendingFEC({ fileName: file.name, content, aggregate });
          const base = {
            ...DEFAULT_FEC_OPTIONS,
            dateFrom: aggregate.dateMin,
            dateTo: aggregate.dateMax,
          };
          // Seuil adaptatif : viser ~300 liens quel que soit le volume du FEC.
          setFecOptions({ ...base, minLinkAmount: suggestMinLinkAmount(aggregate, base) });
          setImportResult(null);
        } finally {
          setIsProcessing(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
        return;
      }
    }

    // GeoJSON avec propriétés : l'utilisateur choisit le champ de libellé
    if (/\.(geo)?json$/i.test(file.name)) {
      const content = await importService.readFileAsText(file);
      const analysis = importService.analyzeGeoJSONFields(content);
      if (analysis && analysis.fields.length > 0) {
        setPendingGeoJSON({ fileName: file.name, content, featureCount: analysis.featureCount, fields: analysis.fields });
        setGeoJSONLabelField(analysis.suggested ?? analysis.fields[0].key);
        setGeoJSONFields(new Set(analysis.fields.map((f) => f.key)));
        setImportResult(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }

    setIsProcessing(true);
    setImportResult(null);
    await withImportProgress(() => processFile(file));
    setIsProcessing(false);
  }, [processFile, targetDossierId, importIntoExistingDossier]);

  // Confirmation d'une étape d'options (FEC, GeoJSON) : le dossier est créé
  // ici seulement, et supprimé si l'import échoue.
  const runPendingImport = useCallback(async (
    format: string,
    dossierName: string,
    run: (dossierId: string) => Promise<ImportResult>,
    clearPending: () => void,
  ) => {
    setIsProcessing(true);
    let dossierId = targetDossierId;
    let createdNewDossier = false;
    try {
      if (targetDossierId === 'new') {
        const dossier = await createDossier(dossierName, '');
        dossierId = dossier.id;
        createdNewDossier = true;
      }
      const result = await withImportProgress(() => run(dossierId));
      setImportResult(result);
      if (result.success) {
        emitImported(dossierId, format, targetDossierId !== 'new',
          { elements: result.elementsImported, links: result.linksImported, assets: result.assetsImported });
        clearPending();
        toast.success(t('import.success'));
        requestFitView();
        setTimeout(() => {
          onClose();
          navigate(`/dossier/${dossierId}`);
        }, 1500);
      } else if (createdNewDossier) {
        await deleteDossier(dossierId).catch(() => {});
      }
    } catch (error) {
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
    }
  }, [targetDossierId, createDossier, deleteDossier, navigate, onClose, requestFitView, t]);

  const handleFecImport = useCallback(() => {
    if (!pendingFEC) return;
    return runPendingImport(
      'fec',
      pendingFEC.fileName.replace(/\.(txt|fec)$/i, ''),
      (dossierId) => importFEC(pendingFEC.content, dossierId, fecOptions),
      () => setPendingFEC(null),
    );
  }, [pendingFEC, fecOptions, runPendingImport]);

  const handleGeoJSONImport = useCallback(() => {
    if (!pendingGeoJSON) return;
    return runPendingImport(
      'geojson',
      pendingGeoJSON.fileName.replace(/\.(geo)?json$/i, ''),
      (dossierId) => importService.importFromGeoJSON(pendingGeoJSON.content, dossierId, {
        labelField: geoJSONLabelField,
        fields: [...geoJSONFields],
        tag: geoJSONTag,
      }),
      () => setPendingGeoJSON(null),
    );
  }, [pendingGeoJSON, geoJSONLabelField, geoJSONFields, geoJSONTag, runPendingImport]);

  // The mapping lives in a dossier: the chosen one, or a new one created here
  const setPendingJsonMapping = useUIStore((state) => state.setPendingJsonMapping);
  const openMapping = useCallback(async () => {
    const created = targetDossierId === 'new';
    const dossierId = created ? (await createDossier(t('import.newDossier'), '')).id : targetDossierId;
    if (created) useUIStore.getState().setProvisionalDossierId(dossierId);
    setPendingJsonMapping(dossierId);
    onClose();
    navigate(`/dossier/${dossierId}`);
  }, [targetDossierId, createDossier, t, setPendingJsonMapping, onClose, navigate]);

  const triggerFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleCancelImport = useCallback(() => {
    abortRef.current?.abort();
    setIsCancelling(true);
  }, []);

  const handleClose = useCallback(() => {
    // Pendant l'import, seul Annuler permet de sortir
    if (abortRef.current) return;
    setImportResult(null);
    setTargetDossierId('new');
    setPendingFEC(null);
    setPendingGeoJSON(null);
    onClose();
  }, [onClose]);

  const downloadCSVTemplate = useCallback(() => {
    const template = exportService.generateCSVTemplate();
    const filename = i18n.language === 'fr' ? 'modele_csv.csv' : 'csv_template.csv';
    exportService.download(template, filename, 'text/csv');
  }, [i18n.language]);

  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogA11y(isOpen, dialogRef, handleClose);
  // Import lancé depuis la zone (pas une étape FEC/GeoJSON, qui a ses boutons)
  const importRunning = isProcessing && !pendingFEC && !pendingGeoJSON && !pendingEncryptedFile;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[1000] bg-black/50"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed z-[1000] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-bg-primary sketchy-border-soft modal-shadow flex flex-col max-h-[calc(100dvh-2rem)]" data-testid="import-modal"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <h2 id={titleId} className="text-sm font-semibold text-text-primary">
            {t('import.title')}
          </h2>
          <button
            onClick={handleClose}
            disabled={importRunning}
            aria-label={t('common:actions.close')}
            className="p-1 text-text-tertiary hover:text-text-primary rounded disabled:opacity-40 disabled:pointer-events-none"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto min-h-0 space-y-4">
          {/* Target selection */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-2">
              {t('import.importInto')}
            </label>
            <select
              value={targetDossierId}
              onChange={(e) => setTargetDossierId(e.target.value)}
              disabled={isProcessing}
              className="w-full px-3 py-2 text-sm border border-border-default rounded bg-bg-primary text-text-primary disabled:opacity-50"
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
            accept=".zip,.znzip,.json,.csv,.tsv,.osintracker,.graphml,.gexf,.gml,.dot,.gv,.xml,.drawio,.anx,.anb,.excalidraw,.ged,.gw,.geojson,.txt,.fec,.mmd,.mermaid,.md,*/*"
            onChange={handleFileSelect}
            className="hidden"
            data-testid="import-file-input"
          />

          {/* Étape d'options FEC */}
          {pendingFEC && (
            <div className="space-y-2">
              <ImportProgressLine />
              <p className="text-xs font-medium text-text-primary">{t('import.fec.optionsTitle')}</p>
              <FECOptionsPanel
                fileName={pendingFEC.fileName}
                aggregate={pendingFEC.aggregate}
                options={fecOptions}
                onChange={setFecOptions}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setPendingFEC(null)}
                  className="flex-1 text-xs text-text-secondary border border-border-default rounded py-1.5 hover:bg-bg-tertiary"
                >
                  {t('common:actions.cancel')}
                </button>
                <button
                  onClick={handleFecImport}
                  disabled={isProcessing}
                  data-testid="fec-import-confirm"
                  className="flex-1 text-xs font-medium bg-accent text-white rounded py-1.5 hover:bg-accent-hover disabled:opacity-40"
                >
                  {isProcessing ? t('import.importing') : t('import.fec.confirm')}
                </button>
              </div>
            </div>
          )}

          {/* Étape d'options GeoJSON */}
          {pendingGeoJSON && (
            <div className="space-y-2">
              <ImportProgressLine />
              <p className="text-xs font-medium text-text-primary">{t('import.geojson.optionsTitle')}</p>
              <GeoJSONOptionsPanel
                pending={pendingGeoJSON}
                labelField={geoJSONLabelField}
                onLabelFieldChange={setGeoJSONLabelField}
                fields={geoJSONFields}
                onFieldsChange={setGeoJSONFields}
                tag={geoJSONTag}
                onTagChange={setGeoJSONTag}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setPendingGeoJSON(null)}
                  className="flex-1 text-xs text-text-secondary border border-border-default rounded py-1.5 hover:bg-bg-tertiary"
                >
                  {t('common:actions.cancel')}
                </button>
                <button
                  onClick={handleGeoJSONImport}
                  disabled={isProcessing}
                  data-testid="geojson-import-confirm"
                  className="flex-1 text-xs font-medium bg-accent text-white rounded py-1.5 hover:bg-accent-hover disabled:opacity-40"
                >
                  {isProcessing ? t('import.importing') : t('import.geojson.confirm')}
                </button>
              </div>
            </div>
          )}

          {/* Déchiffrement .znzip */}
          {pendingEncryptedFile && (
            <div className="p-3 border border-border-default rounded bg-bg-secondary space-y-2">
              <p className="text-xs text-text-secondary">
                <span className="font-mono block truncate">{pendingEncryptedFile.name}</span>
                {t('import.encryptedPrompt')}
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
                  placeholder={t('passwordModal.passwordLabel')}
                  autoFocus
                  className="w-full text-sm border border-border-default rounded px-3 py-1.5 pr-8 focus:outline-none focus:border-accent bg-bg-primary"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowZnzipPassword(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                  aria-label={showZnzipPassword ? t('passwordModal.hidePassword') : t('passwordModal.showPassword')}
                  title={showZnzipPassword ? t('passwordModal.hidePassword') : t('passwordModal.showPassword')}
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
                  {t('common:actions.cancel')}
                </button>
                <button
                  onClick={() => pendingEncryptedFile && handleDecryptAndImport(pendingEncryptedFile, znzipPassword)}
                  disabled={!znzipPassword || isProcessing}
                  className="flex-1 text-xs font-medium bg-accent text-white rounded py-1.5 hover:bg-accent-hover disabled:opacity-40"
                >
                  {isProcessing ? t('import.decrypting') : t('common:actions.import')}
                </button>
              </div>
            </div>
          )}

          {/* Import running: zone replaced by status and Annuler */}
          {importRunning && (
            <div className="w-full flex flex-col items-center gap-2 p-6 rounded border-2 border-dashed border-border-default bg-bg-secondary" data-testid="import-running">
              <Loader2 size={24} className="animate-spin text-text-tertiary" />
              <div className="text-sm font-medium text-text-primary">{t('import.importing')}</div>
              <ImportProgressLine className="text-xs text-text-secondary" />
              <div className="text-xs text-text-tertiary">{t('import.keepOpen')}</div>
              <button
                onClick={handleCancelImport}
                disabled={isCancelling}
                className="mt-1 px-3 py-1.5 text-sm font-medium rounded border border-border-default text-text-primary bg-bg-primary hover:bg-bg-tertiary disabled:opacity-50"
              >
                {isCancelling ? t('import.cancelling') : t('common:actions.cancel')}
              </button>
            </div>
          )}

          {/* Same zones as the import into a dossier: file, mapping, CSV template */}
          {!pendingFEC && !pendingGeoJSON && !importRunning && (
            <>
              <ImportDropZone onClick={triggerFileSelect} busy={isProcessing} />
              <ImportMappingEntry onClick={openMapping} />
              <CsvTemplateCard onDownload={downloadCSVTemplate} />
            </>
          )}

          {/* Import result */}
          {importResult && (
            <div
              className={`p-3 rounded ${
                importResult.success
                  ? 'bg-success/10 border border-success/30'
                  : 'bg-error/10 border border-error/30'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {importResult.success ? (
                  <CheckCircle size={16} className="text-success" />
                ) : (
                  <AlertCircle size={16} className="text-error" />
                )}
                <span
                  className={`text-sm font-medium ${
                    importResult.success ? 'text-success' : 'text-error'
                  }`}
                >
                  {importResult.success ? t('import.success') : t('import.error')}
                </span>
              </div>

              {importResult.success && (
                <div className="text-xs text-success space-y-1">
                  {importResult.elementsImported > 0 && (
                    <p>{t('import.successElements', { count: importResult.elementsImported })}</p>
                  )}
                  {importResult.linksImported > 0 && (
                    <p>{t('import.successLinks', { count: importResult.linksImported })}</p>
                  )}
                  {(importResult.eventsImported ?? 0) > 0 && (
                    <p>{t('import.successEvents', { count: importResult.eventsImported })}</p>
                  )}
                  {importResult.assetsImported > 0 && (
                    <p>{t('import.successAssets', { count: importResult.assetsImported })}</p>
                  )}
                </div>
              )}

              {importResult.errors.length > 0 && (
                <div className="text-xs text-error mt-2">
                  {importResult.errors.map((err, i) => (
                    <p key={i}>{err}</p>
                  ))}
                </div>
              )}

              {importResult.warnings.length > 0 && (
                <div className="text-xs text-warning mt-2">
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
