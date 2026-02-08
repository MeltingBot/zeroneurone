import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Upload, AlertCircle, Download, FileSpreadsheet } from 'lucide-react';
import { importService } from '../../services/importService';
import { exportService } from '../../services/exportService';
import { useInvestigationStore, useUIStore } from '../../stores';

interface ImportIntoCurrentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Estimate element count from file content for non-ZIP formats.
 * Used to show a preview in placement mode.
 */
function estimateElementCount(file: File, content: string): number {
  const name = file.name.toLowerCase();

  if (name.endsWith('.csv')) {
    // Count non-empty, non-header lines
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    return Math.max(lines.length - 1, 1); // minus header
  }

  if (name.endsWith('.json') || name.endsWith('.excalidraw')) {
    try {
      const data = JSON.parse(content);
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
 * Import modal for importing data into the current investigation.
 * Supports all formats: ZIP, CSV, JSON, GraphML, GEDCOM, etc.
 * All imports go through placement mode so the user can choose where to place elements.
 */
export function ImportIntoCurrentModal({ isOpen, onClose }: ImportIntoCurrentModalProps) {
  const { t, i18n } = useTranslation('modals');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createMissingElements, setCreateMissingElements] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { currentInvestigation } = useInvestigationStore();
  const enterImportPlacementMode = useUIStore((state) => state.enterImportPlacementMode);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentInvestigation) return;

    const investigationId = currentInvestigation.id;

    setIsProcessing(true);
    setError(null);

    try {
      if (file.name.toLowerCase().endsWith('.zip')) {
        // ZIP → parse for exact bounding box, then placement mode
        const parseResult = await importService.parseZipForPlacement(file);

        if (parseResult.success && parseResult.boundingBox.elementCount > 0) {
          enterImportPlacementMode({
            boundingBox: parseResult.boundingBox,
            file,
            investigationId,
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
        investigationId,
        fileContent: content,
        importOptions: { createMissingElements },
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
  }, [currentInvestigation, createMissingElements, enterImportPlacementMode, onClose, t]);

  const triggerFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleClose = useCallback(() => {
    setError(null);
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
      <div className="fixed z-[1000] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-bg-primary rounded-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <h2 className="text-sm font-semibold text-text-primary">
            {t('importIntoCurrent.title')}
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
          <p className="text-xs text-text-secondary">
            {t('importIntoCurrent.description')}
          </p>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.json,.csv,.osintracker,.graphml,.xml,.excalidraw,.ged,.gw"
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
                {isProcessing ? t('import.importing') : t('importIntoCurrent.selectFile')}
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

          {/* CSV options */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="createMissingIntoCurrent"
              checked={createMissingElements}
              onChange={(e) => setCreateMissingElements(e.target.checked)}
              className="rounded border-border-default"
            />
            <label htmlFor="createMissingIntoCurrent" className="text-xs text-text-secondary">
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
