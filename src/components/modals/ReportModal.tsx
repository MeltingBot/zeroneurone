import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, FileText, Download, Printer, FileCode, Camera, Loader, Braces } from 'lucide-react';
import {
  reportService,
  type ReportFormat,
  type ReportOptions,
  DEFAULT_REPORT_OPTIONS,
} from '../../services/reportService';
import { useInvestigationStore, useViewStore, useUIStore } from '../../stores';
import type { DisplayMode } from '../../types';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Screenshot capture options (map/timeline have separate export system)
interface ScreenshotOptions {
  canvas: boolean;
}

export function ReportModal({ isOpen, onClose }: ReportModalProps) {
  const { t, i18n } = useTranslation('modals');
  const { currentInvestigation, elements, links, assets } = useInvestigationStore();
  const { displayMode, setDisplayMode } = useViewStore();
  const { captureView, captureHandlers, themeMode, setThemeMode } = useUIStore();

  const [options, setOptions] = useState<ReportOptions>({
    ...DEFAULT_REPORT_OPTIONS,
    title: currentInvestigation?.name || '',
  });
  const [screenshotOptions, setScreenshotOptions] = useState<ScreenshotOptions>({
    canvas: false,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [captureStatus, setCaptureStatus] = useState<string>('');
  const [showCaptureOverlay, setShowCaptureOverlay] = useState(false);

  // Store original state to restore after capture
  const originalStateRef = useRef({ displayMode, themeMode });

  // Update refs when not generating
  useEffect(() => {
    if (!isGenerating) {
      originalStateRef.current = { displayMode, themeMode };
    }
  }, [displayMode, themeMode, isGenerating]);

  const updateOption = useCallback(<K extends keyof ReportOptions>(
    key: K,
    value: ReportOptions[K]
  ) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateScreenshotOption = useCallback((key: keyof ScreenshotOptions, value: boolean) => {
    setScreenshotOptions((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Wait for capture handler to be registered
  const waitForHandler = async (mode: DisplayMode, maxWait = 5000): Promise<boolean> => {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      // Get fresh reference to captureHandlers
      const handlers = useUIStore.getState().captureHandlers;
      if (handlers.has(mode)) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.error(`Handler for ${mode} not registered after ${maxWait}ms`);
    return false;
  };

  // Capture a specific view (switches view if needed, hidden by overlay)
  const captureViewScreenshot = async (mode: DisplayMode): Promise<string | null> => {
    // Always switch to ensure the view is properly mounted and visible
    setDisplayMode(mode);

    // Wait for React to render the new view and Leaflet/React Flow to initialize
    // This needs to be long enough for lazy-loaded components to mount
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Wait for handler to be available (component needs to mount and register)
    const handlerReady = await waitForHandler(mode);
    if (!handlerReady) {
      return null;
    }

    // Extra delay for map tiles, canvas layout, and timeline rendering
    const extraDelay = mode === 'map' ? 1000 : mode === 'timeline' ? 500 : 300;
    await new Promise(resolve => setTimeout(resolve, extraDelay));

    // Capture using fresh reference
    const result = await useUIStore.getState().captureView(mode);

    return result;
  };

  const handleGenerate = useCallback(async (format: ReportFormat, action: 'download' | 'print') => {
    if (!currentInvestigation) return;

    const hasScreenshots = screenshotOptions.canvas;
    const originalState = { ...originalStateRef.current };

    setIsGenerating(true);
    if (hasScreenshots) {
      setShowCaptureOverlay(true);
      // Small delay to ensure overlay is visible before any changes
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    try {
      const finalOptions = { ...options };

      // Force light theme for screenshots
      if (hasScreenshots && themeMode !== 'light') {
        setCaptureStatus(t('report.capture.switchingLight'));
        setThemeMode('light');
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Capture canvas screenshot
      if (screenshotOptions.canvas) {
        setCaptureStatus(t('report.capture.capturingGraph'));
        finalOptions.canvasScreenshot = await captureViewScreenshot('canvas');
      }

      // Restore original view if we switched (use getState for fresh value)
      const currentMode = useViewStore.getState().displayMode;
      if (hasScreenshots && currentMode !== originalState.displayMode) {
        setCaptureStatus(t('report.capture.restoringView'));
        setDisplayMode(originalState.displayMode);
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Restore original theme
      if (hasScreenshots && originalState.themeMode !== 'light') {
        setCaptureStatus(t('report.capture.restoringTheme'));
        setThemeMode(originalState.themeMode);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      setCaptureStatus(t('report.capture.generating'));

      const content = reportService.generate(
        format,
        currentInvestigation,
        elements,
        links,
        assets,
        finalOptions,
        i18n.language
      );

      if (action === 'print') {
        const htmlContent = format === 'html'
          ? content
          : reportService.generate('html', currentInvestigation, elements, links, assets, finalOptions, i18n.language);
        reportService.openForPrint(htmlContent);
      } else {
        const timestamp = new Date().toISOString().slice(0, 10);
        const filename = `${(options.title || currentInvestigation.name).replace(/[^a-z0-9]/gi, '_')}_${timestamp}`;
        reportService.download(content, filename, format);
      }
    } finally {
      setIsGenerating(false);
      setShowCaptureOverlay(false);
      setCaptureStatus('');
    }
  }, [currentInvestigation, elements, links, assets, options, screenshotOptions, displayMode, setDisplayMode, themeMode, setThemeMode, captureView, captureHandlers]);

  if (!isOpen) return null;

  return (
    <>
      {/* Capture overlay - covers everything during screenshot capture */}
      {showCaptureOverlay && (
        <div className="fixed inset-0 z-[100] bg-bg-primary flex flex-col items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader size={32} className="animate-spin text-accent" />
            <p className="text-sm text-text-primary font-medium">
              {captureStatus || t('report.capture.preparing')}
            </p>
            <p className="text-xs text-text-tertiary">
              {t('report.capture.viewsAdjusted')}
            </p>
          </div>
        </div>
      )}

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[1000] bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed z-[1000] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-bg-primary rounded-lg shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default shrink-0">
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <FileText size={16} />
            {t('report.title')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-text-tertiary hover:text-text-primary rounded"
            disabled={isGenerating}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {/* Title */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-text-secondary mb-1">
              {t('report.reportTitle')}
            </label>
            <input
              type="text"
              value={options.title}
              onChange={(e) => updateOption('title', e.target.value)}
              placeholder={currentInvestigation?.name}
              className="w-full px-3 py-2 text-sm border border-border-default rounded-lg bg-bg-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
              disabled={isGenerating}
            />
          </div>

          {/* Content options */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-text-secondary mb-2">
              {t('report.contentToInclude')}
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={options.includeDescription}
                  onChange={(e) => updateOption('includeDescription', e.target.checked)}
                  className="rounded border-border-default"
                  disabled={isGenerating}
                />
                <span className="text-text-primary">{t('report.includeDescription')}</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={options.includeSummary}
                  onChange={(e) => updateOption('includeSummary', e.target.checked)}
                  className="rounded border-border-default"
                  disabled={isGenerating}
                />
                <span className="text-text-primary">{t('report.includeSummary')}</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={options.includeInsights}
                  onChange={(e) => updateOption('includeInsights', e.target.checked)}
                  className="rounded border-border-default"
                  disabled={isGenerating}
                />
                <span className="text-text-primary">{t('report.includeInsights')}</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={options.includeTimeline}
                  onChange={(e) => updateOption('includeTimeline', e.target.checked)}
                  className="rounded border-border-default"
                  disabled={isGenerating}
                />
                <span className="text-text-primary">{t('report.includeTimeline')}</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={options.includeElements}
                  onChange={(e) => updateOption('includeElements', e.target.checked)}
                  className="rounded border-border-default"
                  disabled={isGenerating}
                />
                <span className="text-text-primary">{t('report.includeElements')} ({elements.length})</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={options.includeLinks}
                  onChange={(e) => updateOption('includeLinks', e.target.checked)}
                  className="rounded border-border-default"
                  disabled={isGenerating}
                />
                <span className="text-text-primary">{t('report.includeLinks')} ({links.length})</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={options.includeProperties}
                  onChange={(e) => updateOption('includeProperties', e.target.checked)}
                  className="rounded border-border-default"
                  disabled={isGenerating}
                />
                <span className="text-text-primary">{t('report.includeProperties')}</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={options.includeFiles}
                  onChange={(e) => updateOption('includeFiles', e.target.checked)}
                  className="rounded border-border-default"
                  disabled={isGenerating}
                />
                <span className="text-text-primary">{t('report.includeFiles')} ({assets.length})</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={options.includeFiches}
                  onChange={(e) => updateOption('includeFiches', e.target.checked)}
                  className="rounded border-border-default"
                  disabled={isGenerating}
                />
                <span className="text-text-primary">{t('report.includeFiches')}</span>
              </label>
            </div>
          </div>

          {/* Screenshot options */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-text-secondary mb-2 flex items-center gap-1">
              <Camera size={12} />
              {t('report.screenshot')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={screenshotOptions.canvas}
                onChange={(e) => updateScreenshotOption('canvas', e.target.checked)}
                disabled={isGenerating}
                className="rounded border-border-default"
              />
              <span className="text-text-primary">{t('report.includeGraph')}</span>
            </label>
            <p className="text-xs text-text-tertiary mt-1">
              {t('report.screenshotHint')}
            </p>
          </div>

          {/* Element options */}
          {options.includeElements && (
            <div className="mb-4 pl-4 border-l-2 border-border-default">
              <label className="block text-xs font-medium text-text-secondary mb-2">
                {t('report.elementOptions')}
              </label>
              <label className="flex items-center gap-2 text-sm mb-2">
                <input
                  type="checkbox"
                  checked={options.groupElementsByTag}
                  onChange={(e) => updateOption('groupElementsByTag', e.target.checked)}
                  className="rounded border-border-default"
                  disabled={isGenerating}
                />
                <span className="text-text-primary">{t('report.groupByTag')}</span>
              </label>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-text-secondary">{t('report.sortBy')}</span>
                <select
                  value={options.sortElementsBy}
                  onChange={(e) => updateOption('sortElementsBy', e.target.value as ReportOptions['sortElementsBy'])}
                  className="px-2 py-1 text-sm border border-border-default rounded bg-bg-primary"
                  disabled={isGenerating}
                >
                  <option value="label">{t('report.sortByName')}</option>
                  <option value="date">{t('report.sortByDate')}</option>
                  <option value="confidence">{t('report.sortByConfidence')}</option>
                </select>
              </div>
            </div>
          )}

          {/* Preview info */}
          <div className="p-3 bg-bg-secondary rounded-lg text-xs text-text-secondary">
            <p className="font-medium mb-1">{t('report.preview')}</p>
            <p>
              {t('report.previewContent')}{' '}
              {[
                options.includeDescription && t('report.previewDescription'),
                options.includeSummary && t('report.previewSummary'),
                options.includeInsights && t('report.previewInsights'),
                options.includeTimeline && t('report.previewTimeline'),
                options.includeElements && t('report.previewElements', { count: elements.length }),
                options.includeLinks && t('report.previewLinks', { count: links.length }),
                options.includeProperties && t('report.previewProperties'),
                options.includeFiles && t('report.previewFiles', { count: assets.length }),
                options.includeFiches && t('report.previewFiches'),
                screenshotOptions.canvas && t('report.previewGraphCapture'),
              ].filter(Boolean).join(', ') || t('report.previewNoContent')}.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-border-default bg-bg-secondary shrink-0">
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => handleGenerate('html', 'download')}
              disabled={isGenerating}
              className="flex flex-col items-center gap-1 p-3 rounded-lg border border-border-default hover:border-accent hover:bg-accent/5 transition-colors disabled:opacity-50"
            >
              <Download size={20} className="text-text-secondary" />
              <span className="text-xs font-medium text-text-primary">HTML</span>
            </button>
            <button
              onClick={() => handleGenerate('markdown', 'download')}
              disabled={isGenerating}
              className="flex flex-col items-center gap-1 p-3 rounded-lg border border-border-default hover:border-accent hover:bg-accent/5 transition-colors disabled:opacity-50"
            >
              <FileCode size={20} className="text-text-secondary" />
              <span className="text-xs font-medium text-text-primary">Markdown</span>
            </button>
            <button
              onClick={() => handleGenerate('extended-json', 'download')}
              disabled={isGenerating}
              className="flex flex-col items-center gap-1 p-3 rounded-lg border border-border-default hover:border-accent hover:bg-accent/5 transition-colors disabled:opacity-50"
              title={t('report.jsonTooltip')}
            >
              <Braces size={20} className="text-text-secondary" />
              <span className="text-xs font-medium text-text-primary">JSON+</span>
            </button>
            <button
              onClick={() => handleGenerate('html', 'print')}
              disabled={isGenerating}
              className="flex flex-col items-center gap-1 p-3 rounded-lg border border-border-default hover:border-accent hover:bg-accent/5 transition-colors disabled:opacity-50"
            >
              <Printer size={20} className="text-text-secondary" />
              <span className="text-xs font-medium text-text-primary">{t('report.print')}</span>
            </button>
          </div>
          <p className="text-xs text-text-tertiary text-center mt-2">
            {t('report.jsonDescription')}
          </p>
        </div>
      </div>
    </>
  );
}
