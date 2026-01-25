import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, FileJson, FileSpreadsheet, FileText, FileArchive, Image, ChevronDown, Pen } from 'lucide-react';
import { exportService, type ExportFormat } from '../../services/exportService';
import { buildSVGExport } from '../../services/svgExportService';
import { fileService } from '../../services/fileService';
import { useInvestigationStore, toast } from '../../stores';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const exportFormats: { format: ExportFormat; labelKey: string; descKey: string; icon: typeof FileJson }[] = [
  { format: 'zip', labelKey: 'zip', descKey: 'zipDesc', icon: FileArchive },
  { format: 'json', labelKey: 'json', descKey: 'jsonDesc', icon: FileJson },
  { format: 'csv', labelKey: 'csv', descKey: 'csvDesc', icon: FileSpreadsheet },
  { format: 'graphml', labelKey: 'graphml', descKey: 'graphmlDesc', icon: FileText },
];

const pngScaleOptions = [
  { scale: 1, label: '1x', descKey: '1x' },
  { scale: 2, label: '2x', descKey: '2x' },
  { scale: 3, label: '3x', descKey: '3x' },
  { scale: 4, label: '4x', descKey: '4x' },
];

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const { t } = useTranslation('modals');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPngScale, setSelectedPngScale] = useState(2);
  const [showPngOptions, setShowPngOptions] = useState(false);

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
      toast.success(t('export.successFormat', { format: format.toUpperCase() }));
      onClose();
    } catch {
      toast.error(t('export.error'));
    } finally {
      setIsProcessing(false);
    }
  }, [currentInvestigation, elements, links, onClose, t]);

  const handleExportPng = useCallback(async (scale: number) => {
    if (!currentInvestigation) return;

    setIsProcessing(true);
    try {
      const element = document.querySelector('[data-report-capture="canvas"]') as HTMLElement;
      if (!element) {
        toast.error(t('export.canvasNotFound'));
        return;
      }

      // Dynamic import html-to-image (better SVG support than html2canvas)
      const { toPng } = await import('html-to-image');

      const dataUrl = await toPng(element, {
        backgroundColor: '#faf8f5',
        pixelRatio: scale, // Higher pixel ratio = higher resolution output
        skipFonts: true, // Skip font embedding to avoid errors
      });

      // Download the PNG
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${currentInvestigation.name.replace(/[^a-zA-Z0-9]/g, '_')}_canvas_${scale}x.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(t('export.successFormat', { format: `PNG (${scale}x)` }));
      onClose();
    } catch (err) {
      console.error('PNG export failed:', err);
      toast.error(t('export.errorPng'));
    } finally {
      setIsProcessing(false);
    }
  }, [currentInvestigation, onClose, t]);

  const handleExportSvg = useCallback(() => {
    if (!currentInvestigation) return;

    const settings = currentInvestigation.settings;
    const svgString = buildSVGExport(elements, links, {
      linkAnchorMode: settings?.linkAnchorMode ?? 'auto',
      linkCurveMode: settings?.linkCurveMode ?? 'curved',
    });
    const baseName = currentInvestigation.name.replace(/[^a-zA-Z0-9]/g, '_');
    exportService.download(svgString, `${baseName}_canvas.svg`, 'image/svg+xml');
    toast.success(t('export.successFormat', { format: 'SVG' }));
    onClose();
  }, [currentInvestigation, elements, links, onClose, t]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[1000] bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed z-[1000] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-bg-primary rounded-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <h2 className="text-sm font-semibold text-text-primary">
            {t('export.title')}
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
            {t('export.description', {
              name: currentInvestigation?.name,
              elements: elements.length,
              links: links.length,
            })}
          </p>

          <div className="space-y-3">
            {/* PNG Export with scale selection */}
            <div className="rounded-lg border border-border-default overflow-hidden">
              <button
                onClick={() => setShowPngOptions(!showPngOptions)}
                disabled={isProcessing}
                className="w-full flex items-center gap-3 p-3 hover:bg-accent/5 transition-colors disabled:opacity-50"
              >
                <Image size={20} className="text-text-secondary" />
                <div className="text-left flex-1">
                  <div className="text-sm font-medium text-text-primary">
                    {t('export.formats.png')}
                  </div>
                  <div className="text-xs text-text-tertiary">
                    {t('export.formats.pngDesc')}
                  </div>
                </div>
                <ChevronDown
                  size={16}
                  className={`text-text-tertiary transition-transform ${showPngOptions ? 'rotate-180' : ''}`}
                />
              </button>
              {showPngOptions && (
                <div className="border-t border-border-default bg-bg-secondary p-2">
                  <div className="text-xs text-text-tertiary mb-2 px-1">{t('export.resolution')} :</div>
                  <div className="grid grid-cols-4 gap-2">
                    {pngScaleOptions.map((option) => (
                      <button
                        key={option.scale}
                        onClick={() => handleExportPng(option.scale)}
                        disabled={isProcessing}
                        className={`px-3 py-2 rounded border text-sm font-medium transition-colors disabled:opacity-50 ${
                          selectedPngScale === option.scale
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-border-default hover:border-accent hover:bg-accent/5 text-text-primary'
                        }`}
                        title={t(`export.scale.${option.descKey}`)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* SVG Export */}
            <button
              onClick={handleExportSvg}
              disabled={isProcessing}
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-border-default hover:border-accent hover:bg-accent/5 transition-colors disabled:opacity-50"
            >
              <Pen size={20} className="text-text-secondary" />
              <div className="text-left">
                <div className="text-sm font-medium text-text-primary">
                  {t('export.formats.svg')}
                </div>
                <div className="text-xs text-text-tertiary">
                  {t('export.formats.svgDesc')}
                </div>
              </div>
            </button>

            {/* Other export formats */}
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
                      {t(`export.formats.${format.labelKey}`)}
                    </div>
                    <div className="text-xs text-text-tertiary">
                      {t(`export.formats.${format.descKey}`)}
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
