import { useState, useCallback, useRef, useEffect, useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, FileText, Download, Printer, FileCode, Loader, Braces, ChevronUp, ChevronDown, FileType, Save, RotateCcw } from 'lucide-react';
import {
  reportService,
  type ReportFormat,
  type ReportOptions,
  type ReportSection,
  DEFAULT_REPORT_OPTIONS,
  normalizeSectionOrder,
  REPORT_SECTIONS,
} from '../../services/reportService';
import { useDossierStore, useViewStore, useUIStore, useTabStore, useSelectionStore, toast } from '../../stores';
import { scopeReportData, type ReportScope } from '../../services/reportScope';
import { useShallow } from 'zustand/react/shallow';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { useEvaluationModel } from '../../hooks/useEvaluationModel';
import { emitExport } from '../../plugins/pluginEventBus';
import { downloadBlob } from '../../utils/download';
import { captureViewOf, withOnlyElementsShown, type CaptureView } from './synthesisCapture';
import { clearTemplate, defaultTemplate, loadTemplate, saveTemplate } from './synthesisTemplate';

interface SynthesisModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Where the chosen order of the parts is kept between syntheses */
const SECTION_ORDER_KEY = 'zn:synthesis:sectionOrder';

function loadSectionOrder(): ReportSection[] {
  try {
    const raw = localStorage.getItem(SECTION_ORDER_KEY);
    return normalizeSectionOrder(raw ? JSON.parse(raw) : null);
  } catch {
    return [...REPORT_SECTIONS];
  }
}

function saveSectionOrder(order: ReportSection[]): void {
  try {
    localStorage.setItem(SECTION_ORDER_KEY, JSON.stringify(order));
  } catch {
    // Storage full or disabled: the order only lasts for this synthesis
  }
}

/** The view each capture part shows */
const CAPTURE_OF: Partial<Record<ReportSection, CaptureView>> = { graph: 'canvas', map: 'map', timelineView: 'timeline' };

type ContentOption = 'includeDescription' | 'includeSummary' | 'includeInsights' | 'includeTimeline'
  | 'includeElements' | 'includeLinks' | 'includeFiles' | 'includeFiches';

/** The option a content part depends on */
const OPTION_OF: Partial<Record<ReportSection, ContentOption>> = {
  description: 'includeDescription',
  summary: 'includeSummary',
  insights: 'includeInsights',
  timeline: 'includeTimeline',
  elements: 'includeElements',
  links: 'includeLinks',
  files: 'includeFiles',
  fiches: 'includeFiches',
};

/** Label key of each part in the list */
const LABEL_OF: Record<ReportSection, string> = {
  description: 'includeDescription',
  summary: 'includeSummary',
  graph: 'includeCanvasCapture',
  map: 'includeMapCapture',
  timelineView: 'includeTimelineCapture',
  insights: 'includeInsights',
  timeline: 'includeTimeline',
  elements: 'includeElements',
  links: 'includeLinks',
  files: 'includeFiles',
  fiches: 'includeFiches',
};

export function SynthesisModal({ isOpen, onClose }: SynthesisModalProps) {
  const { t, i18n } = useTranslation('modals');
  const evaluationModel = useEvaluationModel();
  const { currentDossier, elements: allElements, links: allLinks, assets: allAssets } = useDossierStore(useShallow((s) => ({ currentDossier: s.currentDossier, elements: s.elements, links: s.links, assets: s.assets })));
  const { tabs, activeTabId } = useTabStore(useShallow((s) => ({ tabs: s.tabs, activeTabId: s.activeTabId })));
  const { selectedElementIds, selectedLinkIds } = useSelectionStore(useShallow((s) => ({ selectedElementIds: s.selectedElementIds, selectedLinkIds: s.selectedLinkIds })));
  const selectionCount = selectedElementIds.size + selectedLinkIds.size;

  // What the synthesis covers: 'all', 'selection' or a tab id
  const [scopeKey, setScopeKey] = useState<string>('all');
  const [includeLinked, setIncludeLinked] = useState(false);
  // Chosen on opening, from the selection or the tab open at that moment
  const [wasOpen, setWasOpen] = useState(false);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setScopeKey(selectionCount > 0 ? 'selection' : activeTabId ?? 'all');
  }

  const { elements, links, assets, primaryElementIds } = useMemo(() => {
    const tab = tabs.find((tb) => tb.id === scopeKey);
    const scope: ReportScope = scopeKey === 'selection' && selectionCount > 0
      ? { kind: 'selection', elementIds: [...selectedElementIds], linkIds: [...selectedLinkIds] }
      : tab ? { kind: 'tab', tab } : { kind: 'all' };
    return scopeReportData({ elements: allElements, links: allLinks, assets: allAssets }, scope, includeLinked);
  }, [scopeKey, includeLinked, tabs, selectedElementIds, selectedLinkIds, selectionCount, allElements, allLinks, allAssets]);
  const { displayMode, setDisplayMode } = useViewStore(useShallow((s) => ({ displayMode: s.displayMode, setDisplayMode: s.setDisplayMode })));
  const { themeMode, setThemeMode } = useUIStore(useShallow((s) => ({ themeMode: s.themeMode, setThemeMode: s.setThemeMode })));

  // The saved template, if any, gives the options; the title and the order are kept apart
  const [hasTemplate, setHasTemplate] = useState(() => loadTemplate() !== null);
  const [options, setOptions] = useState<ReportOptions>(() => ({
    ...DEFAULT_REPORT_OPTIONS,
    ...(loadTemplate() ?? defaultTemplate()).options,
    title: currentDossier?.name || '',
    sectionOrder: loadSectionOrder(),
  }));
  const [captures, setCaptures] = useState<Record<CaptureView, boolean>>(() => (loadTemplate() ?? defaultTemplate()).captures);
  const [isGenerating, setIsGenerating] = useState(false);
  const [captureStatus, setCaptureStatus] = useState<string>('');
  // Steps done out of the steps of this generation (one per capture, then the document)
  const [progress, setProgress] = useState({ done: 0, total: 1 });
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

  /** Whether a part is to be written */
  const isIncluded = (section: ReportSection): boolean => {
    const view = CAPTURE_OF[section];
    if (view) return captures[view];
    const option = OPTION_OF[section];
    return option ? options[option] : false;
  };

  const setIncluded = (section: ReportSection, value: boolean) => {
    const view = CAPTURE_OF[section];
    if (view) {
      setCaptures((prev) => ({ ...prev, [view]: value }));
      return;
    }
    const option = OPTION_OF[section];
    if (option) updateOption(option, value);
  };

  // Arrow buttons by "part:direction", to keep the keyboard focus on the moved part
  const moveButtons = useRef(new Map<string, HTMLButtonElement>());

  /** Move a part one place up (-1) or down (+1), and keep the order for next time */
  const moveSection = (index: number, delta: -1 | 1) => {
    const order = [...options.sectionOrder];
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    saveSectionOrder(order);
    updateOption('sectionOrder', order);
    // The row moves in the page and its button may now be disabled: focus the one still usable
    const atEnd = target === 0 || target === order.length - 1;
    const key = `${order[target]}:${atEnd ? -delta : delta}`;
    requestAnimationFrame(() => moveButtons.current.get(key)?.focus());
  };

  const resetSectionOrder = () => {
    const order = [...REPORT_SECTIONS];
    saveSectionOrder(order);
    updateOption('sectionOrder', order);
  };

  /** Keep the current options as the template of the next syntheses */
  const handleSaveTemplate = () => {
    if (saveTemplate(options, captures)) {
      setHasTemplate(true);
      toast.success(t('synthesis.templateSaved'));
    } else {
      toast.error(t('synthesis.templateError'));
    }
  };

  /** Forget the template and go back to the default options */
  const handleResetTemplate = () => {
    clearTemplate();
    setHasTemplate(false);
    const { options: defaults, captures: noCaptures } = defaultTemplate();
    setOptions((prev) => ({ ...prev, ...defaults }));
    setCaptures(noCaptures);
  };

  const isDefaultOrder = options.sectionOrder.every((s, i) => s === REPORT_SECTIONS[i]);

  /** Count shown next to a part in the list */
  const countOf = (section: ReportSection): number | null =>
    section === 'elements' ? elements.length : section === 'links' ? links.length : section === 'files' ? assets.length : null;

  const handleGenerate = useCallback(async (format: ReportFormat | 'docx', action: 'download' | 'print') => {
    if (!currentDossier) return;

    // Captures, in the order of their parts
    const wanted = options.sectionOrder
      .map((section) => CAPTURE_OF[section])
      .filter((view): view is CaptureView => view !== undefined && captures[view]);
    const hasScreenshots = wanted.length > 0;
    const originalState = { ...originalStateRef.current };

    setIsGenerating(true);
    const total = wanted.length + 1;
    setProgress({ done: 0, total });
    if (hasScreenshots) {
      setShowCaptureOverlay(true);
      // Small delay to ensure overlay is visible before any changes
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    try {
      const finalOptions: ReportOptions = { ...options, primaryElementIds };

      if (hasScreenshots) {
        // Force light theme for screenshots
        if (themeMode !== 'light') {
          setCaptureStatus(t('synthesis.capture.switchingLight'));
          setThemeMode('light');
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        try {
          // A part of the dossier is captured without the rest
          const keep = scopeKey === 'all' ? null : new Set(elements.map((el) => el.id));
          await withOnlyElementsShown(keep, allElements.map((el) => el.id), async () => {
            for (const [index, view] of wanted.entries()) {
              setProgress({ done: index, total });
              setCaptureStatus(t(`synthesis.capture.capturing.${view}`));
              const result = await captureViewOf(view);
              if (view === 'canvas') finalOptions.canvasScreenshot = result?.format === 'png' ? result.data : null;
              if (view === 'map') finalOptions.mapSvg = result?.format === 'svg' ? result.data : null;
              if (view === 'timeline') finalOptions.timelineSvg = result?.format === 'svg' ? result.data : null;
            }
          });
        } finally {
          // Restore original view and theme (use getState for fresh value)
          if (useViewStore.getState().displayMode !== originalState.displayMode) {
            setCaptureStatus(t('synthesis.capture.restoringView'));
            setDisplayMode(originalState.displayMode);
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          if (originalState.themeMode !== 'light') {
            setCaptureStatus(t('synthesis.capture.restoringTheme'));
            setThemeMode(originalState.themeMode);
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      }

      setProgress({ done: wanted.length, total });
      setCaptureStatus(t('synthesis.capture.generating'));

      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `${(options.title || currentDossier.name).replace(/[^a-z0-9]/gi, '_')}_${timestamp}`;

      if (format === 'docx') {
        const blob = await reportService.generateDocx(currentDossier, elements, links, assets, finalOptions, i18n.language);
        downloadBlob(blob, `${filename}.docx`);
        emitExport('synthesis-docx', undefined, currentDossier.id);
        return;
      }

      const content = reportService.generate(format, currentDossier, elements, links, assets, finalOptions, i18n.language);

      if (action === 'print') {
        const htmlContent = format === 'html'
          ? content
          : reportService.generate('html', currentDossier, elements, links, assets, finalOptions, i18n.language);
        reportService.openForPrint(htmlContent);
        emitExport('print', { content: 'synthesis' }, currentDossier.id);
      } else {
        reportService.download(content, filename, format);
        emitExport(`synthesis-${format}`, undefined, currentDossier.id);
      }
    } catch (err) {
      console.error('Synthesis generation failed:', err);
      toast.error(t('synthesis.error'));
    } finally {
      setIsGenerating(false);
      setShowCaptureOverlay(false);
      setCaptureStatus('');
    }
  }, [currentDossier, elements, links, assets, allElements, primaryElementIds, scopeKey, options, captures, setDisplayMode, themeMode, setThemeMode, t, i18n.language]);

  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Frozen while generating: the views are being switched behind it
  const closeUnlessGenerating = useCallback(() => { if (!isGenerating) onClose(); }, [isGenerating, onClose]);
  useDialogA11y(isOpen, dialogRef, closeUnlessGenerating);

  if (!isOpen) return null;

  const formatButton = 'flex flex-col items-center gap-1 p-3 rounded border border-border-default hover:border-accent hover:bg-accent/5 transition-colors disabled:opacity-50';

  return (
    <>
      {/* Capture overlay - covers everything during screenshot capture */}
      {showCaptureOverlay && (
        <div className="fixed inset-0 z-[1000] bg-bg-primary flex flex-col items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader size={32} className="animate-spin text-accent" />
            <p className="text-sm text-text-primary font-medium">
              {captureStatus || t('synthesis.capture.preparing')}
            </p>
            <p className="text-xs text-text-tertiary">
              {t('synthesis.capture.viewsAdjusted')}
            </p>
          </div>
        </div>
      )}

      <div
        className="fixed inset-0 z-[1000] bg-black/50"
        onClick={closeUnlessGenerating}
        aria-hidden="true"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={isGenerating}
        className="fixed z-[1000] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl bg-bg-primary sketchy-border-soft modal-shadow max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default shrink-0">
          <h2 id={titleId} className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <FileText size={16} />
            {t('synthesis.title')}
          </h2>
          <div className="flex items-center gap-1">
            {/* Template: the options taken again at the next syntheses */}
            {hasTemplate && (
              <button
                type="button"
                onClick={handleResetTemplate}
                title={t('synthesis.resetTemplate')}
                aria-label={t('synthesis.resetTemplate')}
                className="p-1 text-text-tertiary hover:text-text-primary rounded"
                disabled={isGenerating}
              >
                <RotateCcw size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={handleSaveTemplate}
              title={t('synthesis.saveTemplate')}
              aria-label={t('synthesis.saveTemplate')}
              className="p-1 text-text-tertiary hover:text-text-primary rounded"
              disabled={isGenerating}
            >
              <Save size={16} />
            </button>
            <button
              onClick={onClose}
              aria-label={t('common:actions.close')}
              className="p-1 text-text-tertiary hover:text-text-primary rounded"
              disabled={isGenerating}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content, locked while generating */}
        <fieldset disabled={isGenerating} className="p-4 overflow-y-auto flex-1 min-w-0 border-0 m-0 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 content-start disabled:opacity-60">
          {/* Left: the parts, in the order they are written */}
          <div className="min-w-0">
            {/* Parts, in the order they are written */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span id={`${titleId}-parts`} className="text-xs font-medium text-text-secondary">
                  {t('synthesis.contentToInclude')}
                </span>
                {!isDefaultOrder && (
                  <button
                    type="button"
                    onClick={resetSectionOrder}
                    disabled={isGenerating}
                    className="text-xs text-text-secondary hover:text-text-primary underline"
                  >
                    {t('synthesis.resetOrder')}
                  </button>
                )}
              </div>
              <ul aria-labelledby={`${titleId}-parts`} className="space-y-0.5">
                {options.sectionOrder.map((section, index) => {
                  const label = t(`synthesis.${LABEL_OF[section]}`);
                  const count = countOf(section);
                  return (
                    <li key={section} className="flex items-center gap-2 text-sm rounded hover:bg-bg-secondary pr-1">
                      <label className="flex items-center gap-2 flex-1 min-w-0 py-0.5">
                        <input
                          type="checkbox"
                          checked={isIncluded(section)}
                          onChange={(e) => setIncluded(section, e.target.checked)}
                          className="rounded border-border-default"
                          disabled={isGenerating}
                        />
                        <span className="text-text-primary truncate">
                          {label}{count !== null ? ` (${count})` : ''}
                        </span>
                      </label>
                      <button
                        type="button"
                        ref={(node) => { if (node) moveButtons.current.set(`${section}:-1`, node); else moveButtons.current.delete(`${section}:-1`); }}
                        onClick={() => moveSection(index, -1)}
                        disabled={isGenerating || index === 0}
                        aria-label={t('synthesis.moveUp', { part: label })}
                        title={t('synthesis.moveUp', { part: label })}
                        className="p-0.5 text-text-tertiary hover:text-text-primary rounded disabled:opacity-30"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        ref={(node) => { if (node) moveButtons.current.set(`${section}:1`, node); else moveButtons.current.delete(`${section}:1`); }}
                        onClick={() => moveSection(index, 1)}
                        disabled={isGenerating || index === options.sectionOrder.length - 1}
                        aria-label={t('synthesis.moveDown', { part: label })}
                        title={t('synthesis.moveDown', { part: label })}
                        className="p-0.5 text-text-tertiary hover:text-text-primary rounded disabled:opacity-30"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* Right: what the synthesis covers and how it is laid out */}
          <div className="min-w-0">
            {/* Title */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-text-secondary mb-1">
                {t('synthesis.reportTitle')}
              </label>
              <input
                type="text"
                value={options.title}
                onChange={(e) => updateOption('title', e.target.value)}
                placeholder={currentDossier?.name}
                className="w-full px-3 py-2 text-sm border border-border-default rounded bg-bg-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                disabled={isGenerating}
              />
            </div>

            {/* Scope */}
            <div className="mb-4">
              <label htmlFor={`${titleId}-scope`} className="block text-xs font-medium text-text-secondary mb-1">
                {t('synthesis.scope')}
              </label>
              <div className="flex items-center gap-3">
                <select
                  id={`${titleId}-scope`}
                  value={scopeKey}
                  onChange={(e) => setScopeKey(e.target.value)}
                  className="flex-1 min-w-0 px-2 py-1 text-sm border border-border-default rounded bg-bg-primary"
                  disabled={isGenerating}
                >
                  <option value="all">{t('synthesis.scopeAll')}</option>
                  {selectionCount > 0 && (
                    <option value="selection">{t('synthesis.scopeSelection', { count: selectionCount })}</option>
                  )}
                  {tabs.map((tb) => (
                    <option key={tb.id} value={tb.id}>{tb.name || t('synthesis.scopeTab')}</option>
                  ))}
                </select>
                {scopeKey !== 'all' && (
                  <label className="flex items-center gap-2 text-sm shrink-0">
                    <input
                      type="checkbox"
                      checked={includeLinked}
                      onChange={(e) => setIncludeLinked(e.target.checked)}
                      className="rounded border-border-default"
                      disabled={isGenerating}
                    />
                    <span className="text-text-primary">{t('synthesis.scopeLinked')}</span>
                  </label>
                )}
              </div>
            </div>

            {/* Layout */}
            <div className="mb-4">
              <span className="block text-xs font-medium text-text-secondary mb-2">{t('synthesis.layout')}</span>
              <label className="flex items-center gap-2 text-sm mb-1">
                <input
                  type="checkbox"
                  checked={options.pageBreaks}
                  onChange={(e) => updateOption('pageBreaks', e.target.checked)}
                  className="rounded border-border-default"
                />
                <span className="text-text-primary">{t('synthesis.pageBreaks')}</span>
              </label>
              {options.includeFiches && (
                <label className="flex items-center gap-2 text-sm mb-1">
                  <input
                    type="checkbox"
                    checked={options.fichePerPage}
                    onChange={(e) => updateOption('fichePerPage', e.target.checked)}
                    className="rounded border-border-default"
                  />
                  <span className="text-text-primary">{t('synthesis.fichePerPage')}</span>
                </label>
              )}
              {options.includeFiches && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={options.ficheLinks}
                    onChange={(e) => updateOption('ficheLinks', e.target.checked)}
                    className="rounded border-border-default"
                  />
                  <span className="text-text-primary">{t('synthesis.ficheLinks')}</span>
                </label>
              )}
            </div>

            {/* Element options */}
            {options.includeElements && (
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-2">
                  {t('synthesis.elementOptions')}
                </label>
                <label className="flex items-center gap-2 text-sm mb-2">
                  <input
                    type="checkbox"
                    checked={options.includeProperties}
                    onChange={(e) => updateOption('includeProperties', e.target.checked)}
                    className="rounded border-border-default"
                    disabled={isGenerating}
                  />
                  <span className="text-text-primary">{t('synthesis.includeProperties')}</span>
                </label>
                <label className="flex items-center gap-2 text-sm mb-2">
                  <input
                    type="checkbox"
                    checked={options.groupElementsByTag}
                    onChange={(e) => updateOption('groupElementsByTag', e.target.checked)}
                    className="rounded border-border-default"
                    disabled={isGenerating}
                  />
                  <span className="text-text-primary">{t('synthesis.groupByTag')}</span>
                </label>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-text-secondary">{t('synthesis.sortBy')}</span>
                  <select
                    value={options.sortElementsBy}
                    onChange={(e) => updateOption('sortElementsBy', e.target.value as ReportOptions['sortElementsBy'])}
                    className="px-2 py-1 text-sm border border-border-default rounded bg-bg-primary"
                    disabled={isGenerating}
                  >
                    <option value="label">{t('synthesis.sortByName')}</option>
                    <option value="date">{t('synthesis.sortByDate')}</option>
                    <option value="confidence">
                      {evaluationModel === 'zeroneurone' ? t('synthesis.sortByConfidence') : t('synthesis.sortByEvaluation')}
                    </option>
                  </select>
                </div>
              </div>
            )}

          </div>
        </fieldset>

        {/* Actions */}
        <div className="p-4 border-t border-border-default bg-bg-secondary shrink-0">
          {isGenerating ? (
            <div className="py-2">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-text-primary font-medium">{captureStatus || t('synthesis.capture.preparing')}</span>
                <span className="text-text-tertiary">{t('synthesis.step', { done: Math.min(progress.done + 1, progress.total), total: progress.total })}</span>
              </div>
              <div
                className="h-1.5 rounded bg-bg-tertiary overflow-hidden"
                role="progressbar"
                aria-label={captureStatus || t('synthesis.capture.preparing')}
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.done}
              >
                <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${Math.max(4, (progress.done / progress.total) * 100)}%` }} />
              </div>
            </div>
          ) : (
          <>
          <div className="grid grid-cols-5 gap-2">
            <button onClick={() => handleGenerate('html', 'download')} disabled={isGenerating} className={formatButton}>
              <Download size={20} className="text-text-secondary" />
              <span className="text-xs font-medium text-text-primary">HTML</span>
            </button>
            <button onClick={() => handleGenerate('docx', 'download')} disabled={isGenerating} className={formatButton}>
              <FileType size={20} className="text-text-secondary" />
              <span className="text-xs font-medium text-text-primary">DOCX</span>
            </button>
            <button onClick={() => handleGenerate('markdown', 'download')} disabled={isGenerating} className={formatButton}>
              <FileCode size={20} className="text-text-secondary" />
              <span className="text-xs font-medium text-text-primary">Markdown</span>
            </button>
            <button
              onClick={() => handleGenerate('extended-json', 'download')}
              disabled={isGenerating}
              className={formatButton}
              title={t('synthesis.jsonTooltip')}
            >
              <Braces size={20} className="text-text-secondary" />
              <span className="text-xs font-medium text-text-primary">JSON+</span>
            </button>
            <button onClick={() => handleGenerate('html', 'print')} disabled={isGenerating} className={formatButton}>
              <Printer size={20} className="text-text-secondary" />
              <span className="text-xs font-medium text-text-primary">{t('synthesis.print')}</span>
            </button>
          </div>
          <p className="text-xs text-text-tertiary text-center mt-2">
            {t('synthesis.jsonDescription')}
          </p>
          </>
          )}
        </div>
      </div>
    </>
  );
}
