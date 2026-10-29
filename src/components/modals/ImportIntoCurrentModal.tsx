import { useState, useCallback, useEffect, useRef, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { X, AlertCircle } from 'lucide-react';
import { importService } from '../../services/importService';
import type { ZipTabsOverview } from '../../services/zipTabSelection';
import { exportService } from '../../services/exportService';
import { importANB, isANBFormat } from '../../services/importANB';
import {
  isFECFormat,
  analyzeFEC,
  previewFECGraph,
  DEFAULT_FEC_OPTIONS,
  suggestMinLinkAmount,
  type FECAggregate,
  type FECImportOptions,
} from '../../services/importFEC';
import { FECOptionsPanel } from './FECOptionsPanel';
import { GeoJSONOptionsPanel, type PendingGeoJSON } from './GeoJSONOptionsPanel';
import { snapshotBeforeImport, commitImportToYDoc } from '../../services/importCommit';
import { withImportProgress } from '../../services/importProgress';
import { ImportDropZone, ImportMappingEntry, CsvTemplateCard } from './ImportSections';
import { startMermaidPlacement } from '../../services/mermaidPlacement';
import { startDotPlacement } from '../../services/dotPlacement';
import { useDossierStore, useUIStore, useViewStore, toast } from '../../stores';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { splitCSVRecords, isNativeCSV } from '../../utils/csv';

interface ImportIntoCurrentModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Open the column mapping modal (closes this one first), with a CSV
   *  file the native import does not understand */
  onOpenJsonMapping?: (initial?: { content: string; name: string }) => void;
  /** File chosen elsewhere (home page): processed as soon as the modal opens. */
  initialFile?: File | null;
}

/**
 * Estimate element count from file content for non-ZIP formats.
 * Used to show a preview in placement mode.
 */
function estimateElementCount(file: File, content: string): number {
  const name = file.name.toLowerCase();

  if (name.endsWith('.csv')) {
    // Count non-empty, non-header lines
    const lines = splitCSVRecords(content);
    return Math.max(lines.length - 1, 1); // minus header
  }

  if (name.endsWith('.geojson')) {
    try {
      const data = JSON.parse(content);
      if (data.type === 'FeatureCollection' && Array.isArray(data.features)) return data.features.length;
    } catch { /* fall through */ }
    return 10;
  }

  if (name.endsWith('.json') || name.endsWith('.excalidraw')) {
    try {
      const data = JSON.parse(content);
      // GeoJSON via .json extension
      if (data.type === 'FeatureCollection' && Array.isArray(data.features)) return data.features.length;
      // ZeroNeurone native
      if (data.elements && Array.isArray(data.elements)) return data.elements.length;
      // Excalidraw
      if (data.type === 'excalidraw' && Array.isArray(data.elements)) return data.elements.length;
      // STIX 2.1
      if (data.type === 'bundle' && Array.isArray(data.objects)) return data.objects.length;
      // OSINT Industries (array format)
      if (Array.isArray(data)) return data.length;
      // OI Palette / PredicaGraph
      if (data.nodes) return Object.keys(data.nodes).length;
    } catch { /* fall through */ }
    return 10;
  }

  if (name.endsWith('.gexf')) {
    // Count <node> tags in GEXF
    const matches = content.match(/<node[\s>]/g);
    return matches ? matches.length : 10;
  }

  if (name.endsWith('.gml')) {
    const matches = content.match(/(^|\s)node\s*\[/g);
    return matches ? matches.length : 10;
  }

  if (name.endsWith('.anx')) {
    // Count <Entity EntityId= tags in ANX
    const matches = content.match(/<Entity\s+EntityId=/g);
    return matches ? matches.length : 10;
  }

  if (name.endsWith('.drawio') || (name.endsWith('.xml') && /<(mxfile|mxGraphModel)[\s>]/.test(content.slice(0, 2000)))) {
    // Count vertices (compressed diagrams cannot be counted synchronously)
    const matches = content.match(/vertex="1"/g);
    return matches ? matches.length : 10;
  }

  if (name.endsWith('.graphml') || name.endsWith('.xml')) {
    // Count <node> tags
    const matches = content.match(/<node[\s>]/g);
    return matches ? matches.length : 10;
  }

  if (name.endsWith('.osintracker')) {
    try {
      const data = JSON.parse(content);
      if (data.elements && Array.isArray(data.elements)) return data.elements.length;
    } catch { /* fall through */ }
    return 10;
  }

  // GEDCOM/GeneWeb — can't quick-parse without full parser
  return 20;
}

/**
 * Import modal for importing data into the current dossier.
 * Supports all formats: ZIP, CSV, JSON, GraphML, GEDCOM, etc.
 * All imports go through placement mode so the user can choose where to place elements.
 */
export function ImportIntoCurrentModal({ isOpen, onClose, onOpenJsonMapping, initialFile }: ImportIntoCurrentModalProps) {
  const { t, i18n } = useTranslation('modals');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFEC, setPendingFEC] = useState<{
    file: File;
    content: string;
    aggregate: FECAggregate;
  } | null>(null);
  const [fecOptions, setFecOptions] = useState<FECImportOptions>(DEFAULT_FEC_OPTIONS);
  const [pendingGeoJSON, setPendingGeoJSON] = useState<(PendingGeoJSON & { file: File }) | null>(null);
  const [geoJSONLabelField, setGeoJSONLabelField] = useState('');
  const [geoJSONFields, setGeoJSONFields] = useState<Set<string>>(new Set());
  const [geoJSONTag, setGeoJSONTag] = useState('');
  // ZIP with tabs: the analyst picks the tabs to bring in
  const [pendingZip, setPendingZip] = useState<{ file: File; overview: ZipTabsOverview } | null>(null);
  const [zipTabIds, setZipTabIds] = useState<Set<string>>(new Set());
  const [zipUnassigned, setZipUnassigned] = useState(true);
  const [zipLinked, setZipLinked] = useState(true);
  const [zipRecreate, setZipRecreate] = useState(true);
  const [zipReport, setZipReport] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { currentDossier, loadDossier } = useDossierStore();
  const enterImportPlacementMode = useUIStore((state) => state.enterImportPlacementMode);
  const requestFitView = useViewStore((state) => state.requestFitView);

  const processFile = useCallback(async (file: File) => {
    if (!currentDossier) return;

    const dossierId = currentDossier.id;

    setIsProcessing(true);
    setError(null);

    try {
      // ANB (binary) → import directly without placement mode
      if (file.name.toLowerCase().endsWith('.anb')) {
        const buffer = await file.arrayBuffer();
        if (!isANBFormat(buffer)) {
          setError(t('import.unknownFormat'));
          setIsProcessing(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }
        const snapshot = await snapshotBeforeImport(dossierId);
        const result = await withImportProgress(() => importANB(buffer, dossierId));
        if (result.success) {
          await commitImportToYDoc(snapshot, 'anb');
          await loadDossier(dossierId);
          toast.success(t('import.success'));
          requestFitView();
          onClose();
        } else {
          setError(result.errors[0] ?? t('import.unknownError'));
        }
        setIsProcessing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      // DOT (Graphviz) → built in memory, then placement mode
      if (/\.(dot|gv)$/i.test(file.name)) {
        const content = await importService.readFileAsText(file);
        const res = startDotPlacement(content, dossierId);
        if (res.ok) onClose();
        else setError(res.error);
        return;
      }

      // Mermaid (.mmd / .mermaid, or Markdown with a ```mermaid block) → built in memory, then placement mode
      if (/\.(mmd|mermaid|md|markdown)$/i.test(file.name)) {
        const content = await importService.readFileAsText(file);
        const res = startMermaidPlacement(content, dossierId);
        if (res.ok) onClose();
        else setError(res.error);
        return;
      }

      if (file.name.toLowerCase().endsWith('.zip')) {
        // ZIP → parse for exact bounding box, then placement mode
        const parseResult = await importService.parseZipForPlacement(file);

        if (parseResult.success && parseResult.boundingBox.elementCount > 0 && parseResult.tabs && parseResult.tabs.tabs.length > 0) {
          setPendingZip({ file, overview: parseResult.tabs });
          setZipTabIds(new Set(parseResult.tabs.tabs.map((tab) => tab.id)));
          setZipUnassigned(true);
          setZipLinked(true);
          setZipRecreate(true);
          setZipReport(true);
          setIsProcessing(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }
        if (parseResult.success && parseResult.boundingBox.elementCount > 0) {
          enterImportPlacementMode({
            boundingBox: parseResult.boundingBox,
            file,
            dossierId,
            onComplete: () => setError(null),
          });
          onClose();
          return;
        } else if (!parseResult.success) {
          setError(parseResult.error || t('import.unknownError'));
          setIsProcessing(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        } else {
          setError(t('importIntoCurrent.emptyZip'));
          setIsProcessing(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }
      }

      // Non-ZIP formats → read content, estimate count, enter placement mode
      let content: string;
      if (file.name.endsWith('.ged') || file.name.endsWith('.gw')) {
        // GEDCOM/GeneWeb are binary-ish — read as text for count estimation
        content = await importService.readFileAsText(file);
      } else {
        content = await importService.readFileAsText(file);
      }

      // CSV without the native columns (label, from/to, type) → column mapping
      if (/\.(csv|tsv)$/i.test(file.name) && onOpenJsonMapping && !isNativeCSV(content)) {
        setIsProcessing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        onClose();
        onOpenJsonMapping({ content, name: file.name });
        return;
      }

      // FEC (détection par contenu) → étape d'options avant le mode placement
      if (/\.(txt|fec)$/i.test(file.name) && isFECFormat(content)) {
        const aggregate = analyzeFEC(content);
        setPendingFEC({ file, content, aggregate });
        const base = {
          ...DEFAULT_FEC_OPTIONS,
          dateFrom: aggregate.dateMin,
          dateTo: aggregate.dateMax,
        };
        // Seuil adaptatif : viser ~300 liens quel que soit le volume du FEC.
        setFecOptions({ ...base, minLinkAmount: suggestMinLinkAmount(aggregate, base) });
        setIsProcessing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      // GeoJSON avec propriétés → choix du libellé et des champs avant le mode placement
      if (/\.(geo)?json$/i.test(file.name)) {
        const analysis = importService.analyzeGeoJSONFields(content);
        if (analysis && analysis.fields.length > 0) {
          setPendingGeoJSON({ file, fileName: file.name, content, featureCount: analysis.featureCount, fields: analysis.fields });
          setGeoJSONLabelField(analysis.suggested ?? analysis.fields[0].key);
          setGeoJSONFields(new Set(analysis.fields.map((f) => f.key)));
          setIsProcessing(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }
      }

      // Validate content is parseable before entering placement mode
      if (file.name.endsWith('.json') || file.name.endsWith('.excalidraw')) {
        try {
          JSON.parse(content);
        } catch {
          setError(t('import.unknownFormat'));
          setIsProcessing(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }
      }

      const elementCount = estimateElementCount(file, content);

      // Estimate bounding box: spread elements in a rough grid
      const gridSize = Math.ceil(Math.sqrt(elementCount));
      const estimatedWidth = gridSize * 200;
      const estimatedHeight = gridSize * 150;

      enterImportPlacementMode({
        boundingBox: {
          minX: 0,
          minY: 0,
          maxX: estimatedWidth,
          maxY: estimatedHeight,
          width: estimatedWidth,
          height: estimatedHeight,
          elementCount,
        },
        file,
        dossierId,
        fileContent: content,
        onComplete: () => setError(null),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('import.unknownError'));
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [currentDossier, enterImportPlacementMode, onClose, onOpenJsonMapping, t, requestFitView, loadDossier]);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  // File handed over by the home page: process it once the modal is open.
  const handledInitialFile = useRef<File | null>(null);
  useEffect(() => {
    if (!isOpen || !initialFile || handledInitialFile.current === initialFile) return;
    handledInitialFile.current = initialFile;
    processFile(initialFile);
  }, [isOpen, initialFile, processFile]);

  // Confirmation des options FEC → mode placement avec les options choisies.
  const handleFecConfirm = useCallback(() => {
    if (!pendingFEC || !currentDossier) return;
    const preview = previewFECGraph(pendingFEC.aggregate, fecOptions);
    const gridSize = Math.ceil(Math.sqrt(Math.max(1, preview.elementCount)));
    const estimatedWidth = gridSize * 280;
    const estimatedHeight = gridSize * 140;
    enterImportPlacementMode({
      boundingBox: {
        minX: 0,
        minY: 0,
        maxX: estimatedWidth,
        maxY: estimatedHeight,
        width: estimatedWidth,
        height: estimatedHeight,
        elementCount: preview.elementCount,
      },
      file: pendingFEC.file,
      dossierId: currentDossier.id,
      fileContent: pendingFEC.content,
      importOptions: { fec: fecOptions },
      onComplete: () => setError(null),
    });
    setPendingFEC(null);
    onClose();
  }, [pendingFEC, fecOptions, currentDossier, enterImportPlacementMode, onClose]);

  // Confirmation des options GeoJSON → mode placement avec le libellé et les champs choisis.
  const handleGeoJSONConfirm = useCallback(() => {
    if (!pendingGeoJSON || !currentDossier) return;
    const gridSize = Math.ceil(Math.sqrt(Math.max(1, pendingGeoJSON.featureCount)));
    enterImportPlacementMode({
      boundingBox: {
        minX: 0,
        minY: 0,
        maxX: gridSize * 200,
        maxY: gridSize * 150,
        width: gridSize * 200,
        height: gridSize * 150,
        elementCount: pendingGeoJSON.featureCount,
      },
      file: pendingGeoJSON.file,
      dossierId: currentDossier.id,
      fileContent: pendingGeoJSON.content,
      importOptions: { geojson: { labelField: geoJSONLabelField, fields: [...geoJSONFields], tag: geoJSONTag } },
      onComplete: () => setError(null),
    });
    setPendingGeoJSON(null);
    onClose();
  }, [pendingGeoJSON, geoJSONLabelField, geoJSONFields, geoJSONTag, currentDossier, enterImportPlacementMode, onClose]);

  // Chosen tabs → placement, framed on what they hold
  const handleZipConfirm = useCallback(async () => {
    if (!pendingZip || !currentDossier) return;
    const selection = { tabIds: [...zipTabIds], includeUnassigned: zipUnassigned, includeLinked: zipLinked, recreateTabs: zipRecreate, includeReport: zipReport };
    setIsProcessing(true);
    const parsed = await importService.parseZipForPlacement(pendingZip.file, selection);
    setIsProcessing(false);
    if (!parsed.success || parsed.boundingBox.elementCount === 0) {
      setError(parsed.error || t('importIntoCurrent.emptyZip'));
      return;
    }
    enterImportPlacementMode({
      boundingBox: parsed.boundingBox,
      file: pendingZip.file,
      dossierId: currentDossier.id,
      importOptions: { zipTabs: selection },
      onComplete: () => setError(null),
    });
    setPendingZip(null);
    onClose();
  }, [pendingZip, zipTabIds, zipUnassigned, zipLinked, zipRecreate, zipReport, currentDossier, enterImportPlacementMode, onClose, t]);

  const triggerFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleClose = useCallback(() => {
    setError(null);
    setPendingFEC(null);
    setPendingGeoJSON(null);
    setPendingZip(null);
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
        className="fixed z-[1000] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-bg-primary sketchy-border-soft modal-shadow flex flex-col max-h-[calc(100dvh-2rem)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <h2 id={titleId} className="text-sm font-semibold text-text-primary">
            {t('importIntoCurrent.title')}
          </h2>
          <button
            onClick={handleClose}
            aria-label={t('common:actions.close')}
            className="p-1 text-text-tertiary hover:text-text-primary rounded"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto min-h-0 space-y-4">
          <p className="text-xs text-text-secondary">
            {t('importIntoCurrent.description')}
          </p>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.json,.csv,.osintracker,.graphml,.gexf,.gml,.dot,.gv,.xml,.drawio,.anx,.anb,.excalidraw,.ged,.gw,.geojson,.txt,.fec,.mmd,.mermaid,.md"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Étape d'options FEC */}
          {pendingFEC && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-text-primary">{t('import.fec.optionsTitle')}</p>
              <FECOptionsPanel
                fileName={pendingFEC.file.name}
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
                  onClick={handleFecConfirm}
                  disabled={isProcessing}
                  className="flex-1 text-xs font-medium bg-accent text-white rounded py-1.5 hover:bg-accent-hover disabled:opacity-40"
                >
                  {t('import.fec.confirm')}
                </button>
              </div>
            </div>
          )}

          {/* Étape d'options GeoJSON */}
          {pendingGeoJSON && (
            <div className="space-y-2">
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
                  onClick={handleGeoJSONConfirm}
                  disabled={isProcessing}
                  data-testid="geojson-import-confirm"
                  className="flex-1 text-xs font-medium bg-accent text-white rounded py-1.5 hover:bg-accent-hover disabled:opacity-40"
                >
                  {t('import.geojson.confirm')}
                </button>
              </div>
            </div>
          )}

          {/* Archive tabs to bring in */}
          {pendingZip && (
            <div className="space-y-2" data-testid="zip-tabs-step">
              <p className="text-xs font-medium text-text-primary">{t('importIntoCurrent.tabsTitle')}</p>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {pendingZip.overview.tabs.map((tab) => (
                  <label key={tab.id} className="flex items-center gap-2 text-xs text-text-secondary">
                    <input
                      type="checkbox"
                      checked={zipTabIds.has(tab.id)}
                      onChange={(e) => setZipTabIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(tab.id); else next.delete(tab.id);
                        return next;
                      })}
                      className="rounded border-border-default"
                    />
                    <span className="flex-1 truncate text-text-primary">{tab.name || t('importIntoCurrent.untitledTab')}</span>
                    <span className="text-text-tertiary">{tab.count}</span>
                  </label>
                ))}
                {pendingZip.overview.unassignedCount > 0 && (
                  <label className="flex items-center gap-2 text-xs text-text-secondary">
                    <input
                      type="checkbox"
                      checked={zipUnassigned}
                      onChange={(e) => setZipUnassigned(e.target.checked)}
                      className="rounded border-border-default"
                    />
                    <span className="flex-1 truncate italic">{t('importIntoCurrent.unassigned')}</span>
                    <span className="text-text-tertiary">{pendingZip.overview.unassignedCount}</span>
                  </label>
                )}
              </div>
              <label className="flex items-center gap-2 text-xs text-text-secondary pt-1 border-t border-border-default">
                <input
                  type="checkbox"
                  checked={zipLinked}
                  onChange={(e) => setZipLinked(e.target.checked)}
                  data-testid="zip-tabs-linked"
                  className="rounded border-border-default"
                />
                {t('importIntoCurrent.includeLinked')}
              </label>
              {pendingZip.overview.reportSections > 0 && (
                <label className="flex items-center gap-2 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={zipReport}
                    onChange={(e) => setZipReport(e.target.checked)}
                    data-testid="zip-tabs-report"
                    className="rounded border-border-default"
                  />
                  <span className="flex-1">{t('importIntoCurrent.includeReport')}</span>
                  <span className="text-text-tertiary">{pendingZip.overview.reportSections}</span>
                </label>
              )}
              <div className="flex flex-col gap-1 pt-1 border-t border-border-default" role="radiogroup" aria-label={t('importIntoCurrent.tabsTarget')}>
                {([true, false] as const).map((recreate) => (
                  <label key={String(recreate)} className="flex items-center gap-2 text-xs text-text-secondary">
                    <input
                      type="radio"
                      name="zip-tabs-target"
                      checked={zipRecreate === recreate}
                      onChange={() => setZipRecreate(recreate)}
                      data-testid={recreate ? 'zip-tabs-recreate' : 'zip-tabs-open-tab'}
                      className="border-border-default"
                    />
                    {t(recreate ? 'importIntoCurrent.recreateTabs' : 'importIntoCurrent.intoOpenTab')}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPendingZip(null)}
                  className="flex-1 text-xs text-text-secondary border border-border-default rounded py-1.5 hover:bg-bg-tertiary"
                >
                  {t('common:actions.cancel')}
                </button>
                <button
                  onClick={handleZipConfirm}
                  disabled={isProcessing || (zipTabIds.size === 0 && !(zipUnassigned && pendingZip.overview.unassignedCount > 0))}
                  data-testid="zip-tabs-confirm"
                  className="flex-1 text-xs font-medium bg-accent text-white rounded py-1.5 hover:bg-accent-hover disabled:opacity-40"
                >
                  {t('importIntoCurrent.tabsConfirm')}
                </button>
              </div>
            </div>
          )}

          {/* Same zones as the import into a new dossier: file, mapping, CSV template */}
          {!pendingFEC && !pendingGeoJSON && !pendingZip && (
            <>
              <ImportDropZone onClick={triggerFileSelect} busy={isProcessing} />
              {onOpenJsonMapping && <ImportMappingEntry onClick={() => { onClose(); onOpenJsonMapping(); }} />}
              <CsvTemplateCard onDownload={downloadCSVTemplate} />
            </>
          )}

          {/* Error message */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-red-600" />
                <span className="text-sm text-red-800">{error}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
