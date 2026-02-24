import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, FileJson, FileSpreadsheet, FileText, FileArchive, Image, ChevronDown, Pen, MapPin, Lock, Eye, EyeOff } from 'lucide-react';
import { exportService, type ExportFormat } from '../../services/exportService';
import { buildSVGExport } from '../../services/svgExportService';
import { fileService } from '../../services/fileService';
import { reportRepository, tabRepository } from '../../db/repositories';
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
  { format: 'geojson', labelKey: 'geojson', descKey: 'geojsonDesc', icon: MapPin },
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
  const [selectedPngScale, _setSelectedPngScale] = useState(2);
  const [showPngOptions, setShowPngOptions] = useState(false);
  const [showZipOptions, setShowZipOptions] = useState(false);
  const [zipPassword, setZipPassword] = useState('');
  const [zipPasswordConfirm, setZipPasswordConfirm] = useState('');
  const [showZipPassword, setShowZipPassword] = useState(false);
  const zipPasswordRef = useRef<HTMLInputElement>(null);

  const { currentInvestigation, elements, links } = useInvestigationStore();

  const handleExport = useCallback(async (format: ExportFormat) => {
    if (!currentInvestigation) return;

    setIsProcessing(true);
    try {
      // Fetch assets, report and tabs for ZIP/JSON export
      let assets;
      let report;
      if (format === 'zip') {
        assets = await fileService.getAssetsByInvestigation(currentInvestigation.id);
        // Use getByInvestigationWithYDoc to check both Dexie and Y.Doc storage
        report = await reportRepository.getByInvestigationWithYDoc(currentInvestigation.id);
      }
      const tabs = (format === 'zip' || format === 'json')
        ? await tabRepository.getByInvestigation(currentInvestigation.id)
        : undefined;

      await exportService.exportInvestigation(format, currentInvestigation, elements, links, assets, report, tabs);
      toast.success(t('export.successFormat', { format: format.toUpperCase() }));
      onClose();
    } catch {
      toast.error(t('export.error'));
    } finally {
      setIsProcessing(false);
    }
  }, [currentInvestigation, elements, links, onClose, t]);

  const handleExportEncryptedZip = useCallback(async () => {
    if (!currentInvestigation || zipPassword.length < 1) return;
    setIsProcessing(true);
    try {
      const assets = await fileService.getAssetsByInvestigation(currentInvestigation.id);
      const report = await reportRepository.getByInvestigationWithYDoc(currentInvestigation.id);
      const tabs = await tabRepository.getByInvestigation(currentInvestigation.id);

      const encBlob = await exportService.exportToEncryptedZip(
        zipPassword,
        currentInvestigation,
        elements,
        links,
        assets,
        report,
        tabs
      );

      const now = new Date();
      const timestamp = `${now.toISOString().slice(0, 10)}_${now.toTimeString().slice(0, 8).replace(/:/g, '-')}`;
      const baseName = `${currentInvestigation.name.replace(/[^a-z0-9]/gi, '_')}_${timestamp}`;
      exportService.downloadBlob(encBlob, `${baseName}.znzip`);

      toast.success('Export chiffré téléchargé (.znzip)');
      setZipPassword('');
      setZipPasswordConfirm('');
      setShowZipOptions(false);
      onClose();
    } catch {
      toast.error(t('export.error'));
    } finally {
      setIsProcessing(false);
    }
  }, [currentInvestigation, elements, links, zipPassword, onClose, t]);

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

  const handleExportSvg = useCallback(async () => {
    if (!currentInvestigation) return;

    setIsProcessing(true);
    try {
      // Fetch assets to embed media thumbnails in SVG nodes
      const assets = await fileService.getAssetsByInvestigation(currentInvestigation.id);
      const assetDataUrls = new Map<string, string>();
      for (const asset of assets) {
        if (asset.thumbnailDataUrl) {
          assetDataUrls.set(asset.id, asset.thumbnailDataUrl);
        }
      }

      const settings = currentInvestigation.settings;
      const svgString = buildSVGExport(elements, links, {
        linkAnchorMode: settings?.linkAnchorMode ?? 'auto',
        linkCurveMode: settings?.linkCurveMode ?? 'curved',
        assetDataUrls: assetDataUrls.size > 0 ? assetDataUrls : undefined,
      });
      const baseName = currentInvestigation.name.replace(/[^a-zA-Z0-9]/g, '_');
      exportService.download(svgString, `${baseName}_canvas.svg`, 'image/svg+xml');
      toast.success(t('export.successFormat', { format: 'SVG' }));
      onClose();
    } catch (err) {
      console.error('SVG export failed:', err);
      toast.error(t('export.error'));
    } finally {
      setIsProcessing(false);
    }
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

            {/* ZIP export (standard + chiffré) */}
            <div className="rounded-lg border border-border-default overflow-hidden">
              <button
                onClick={() => {
                  if (showZipOptions) { setShowZipOptions(false); return; }
                  handleExport('zip');
                }}
                onContextMenu={(e) => { e.preventDefault(); setShowZipOptions(v => !v); }}
                disabled={isProcessing}
                className="w-full flex items-center gap-3 p-3 hover:bg-accent/5 transition-colors disabled:opacity-50"
              >
                <FileArchive size={20} className="text-text-secondary" />
                <div className="text-left flex-1">
                  <div className="text-sm font-medium text-text-primary">
                    {t(`export.formats.zip`)}
                  </div>
                  <div className="text-xs text-text-tertiary">
                    {t(`export.formats.zipDesc`)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowZipOptions(v => !v); }}
                  className="p-1 rounded hover:bg-bg-tertiary"
                  title="Exporter avec mot de passe"
                >
                  <Lock size={14} className="text-text-tertiary" />
                </button>
              </button>

              {/* Options chiffrement ZIP */}
              {showZipOptions && (
                <div className="border-t border-border-default bg-bg-secondary p-3 space-y-2">
                  <p className="text-xs text-text-secondary">
                    Protéger l'export par un mot de passe — format <span className="font-mono">.znzip</span>
                  </p>
                  <div className="relative">
                    <input
                      ref={zipPasswordRef}
                      type={showZipPassword ? 'text' : 'password'}
                      value={zipPassword}
                      onChange={e => setZipPassword(e.target.value)}
                      placeholder="Mot de passe"
                      className="w-full text-sm border border-border-default rounded px-3 py-1.5 pr-8 focus:outline-none focus:border-accent bg-bg-primary"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowZipPassword(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                    >
                      {showZipPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  <input
                    type={showZipPassword ? 'text' : 'password'}
                    value={zipPasswordConfirm}
                    onChange={e => setZipPasswordConfirm(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && zipPassword && zipPassword === zipPasswordConfirm) {
                        handleExportEncryptedZip();
                      }
                    }}
                    placeholder="Confirmer le mot de passe"
                    className={`w-full text-sm border rounded px-3 py-1.5 focus:outline-none bg-bg-primary ${
                      zipPasswordConfirm && zipPassword !== zipPasswordConfirm
                        ? 'border-error'
                        : 'border-border-default focus:border-accent'
                    }`}
                    autoComplete="new-password"
                  />
                  {zipPasswordConfirm && zipPassword !== zipPasswordConfirm && (
                    <p className="text-xs text-error">Les mots de passe ne correspondent pas</p>
                  )}
                  <button
                    onClick={handleExportEncryptedZip}
                    disabled={!zipPassword || zipPassword !== zipPasswordConfirm || isProcessing}
                    className="w-full text-xs font-medium bg-accent text-white rounded px-3 py-1.5 hover:bg-blue-700 disabled:opacity-40"
                  >
                    {isProcessing ? 'Chiffrement…' : 'Exporter en .znzip'}
                  </button>
                </div>
              )}
            </div>

            {/* Other export formats (sans ZIP) */}
            {exportFormats.filter(f => f.format !== 'zip').map((format) => {
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
