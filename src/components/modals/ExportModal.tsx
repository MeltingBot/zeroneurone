import { useState, useCallback, useRef, useId } from 'react';
import { withExportProgress } from '../../services/exportProgress';
import { useTranslation } from 'react-i18next';
import { X, FileSpreadsheet, FileArchive, Image, Eye, EyeOff, Network, NotebookText } from 'lucide-react';
import { exportService, type CSVExportOptions, type ExportFormat } from '../../services/exportService';
import { buildSVGExport } from '../../services/svgExportService';
import { scaleElementsByDegree } from '../../utils/degreeSize';
import { fileService } from '../../services/fileService';
import { reportRepository, tabRepository } from '../../db/repositories';
import { db } from '../../db/database';
import { useDossierStore, useQueryStore, toast } from '../../stores';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { isExportedNode, withLayersAt } from '../canvas/overview/exportLayers';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type CategoryId = 'backup' | 'graph' | 'data' | 'notes' | 'image';
type FormatId = ExportFormat | 'png' | 'svg';

/** Formats by use, in the order of the user documentation. */
const CATEGORIES: { id: CategoryId; icon: typeof FileArchive; formats: { id: FormatId; ext: string }[] }[] = [
  { id: 'backup', icon: FileArchive, formats: [
    { id: 'zip', ext: '.zip' },
    { id: 'json', ext: '.json' },
  ] },
  { id: 'graph', icon: Network, formats: [
    { id: 'graphml', ext: '.graphml' },
    { id: 'gexf', ext: '.gexf' },
    { id: 'gml', ext: '.gml' },
    { id: 'dot', ext: '.dot' },
    { id: 'anx', ext: '.anx' },
  ] },
  { id: 'data', icon: FileSpreadsheet, formats: [
    { id: 'csv', ext: '.csv' },
    { id: 'geojson', ext: '.geojson' },
  ] },
  { id: 'notes', icon: NotebookText, formats: [
    { id: 'obsidian', ext: '.zip' },
  ] },
  { id: 'image', icon: Image, formats: [
    { id: 'png', ext: '.png' },
    { id: 'svg', ext: '.svg' },
  ] },
];

const PNG_SCALES = [1, 2, 3, 4] as const;
const PNG_SCALE_KEYS: Record<number, string> = { 1: '1x', 2: '2x', 3: '3x', 4: '4x' };
/** Last format chosen, per viewer: the modal reopens on it. */
const LAST_FORMAT_KEY = 'zn.export.lastFormat';

function readLastFormat(): { category: CategoryId; format: FormatId } {
  try {
    const saved = localStorage.getItem(LAST_FORMAT_KEY);
    const category = CATEGORIES.find((c) => c.formats.some((f) => f.id === saved));
    if (category && saved) return { category: category.id, format: saved as FormatId };
  } catch {
    // Storage unavailable: start on the first format
  }
  return { category: 'backup', format: 'zip' };
}

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const { t, i18n } = useTranslation('modals');
  const [isProcessing, setIsProcessing] = useState(false);
  const [category, setCategory] = useState<CategoryId>(() => readLastFormat().category);
  const [format, setFormat] = useState<FormatId>(() => readLastFormat().format);
  const [zipEncrypted, setZipEncrypted] = useState(false);
  const [obsidianByTag, setObsidianByTag] = useState(true);
  const [pngScale, setPngScale] = useState(2);
  const [pngTransparent, setPngTransparent] = useState(false);
  const [csvContent, setCsvContent] = useState<NonNullable<CSVExportOptions['content']>>('all');
  const [csvDelimiter, setCsvDelimiter] = useState<NonNullable<CSVExportOptions['delimiter']>>(',');
  const [csvExcel, setCsvExcel] = useState(false);
  const [zipPassword, setZipPassword] = useState('');
  const [zipPasswordConfirm, setZipPasswordConfirm] = useState('');
  const [showZipPassword, setShowZipPassword] = useState(false);

  const { currentDossier, elements, links, comments } = useDossierStore();

  const handleExport = useCallback(async (format: ExportFormat, obsidianFolderByTag?: boolean, csvOptions?: CSVExportOptions) => {
    if (!currentDossier) return;

    setIsProcessing(true);
    try {
      // Fetch assets, report and tabs for ZIP/JSON export
      // The archive formats carry the files and the report (progress shown meanwhile)
      let assets: Awaited<ReturnType<typeof fileService.getAssetsByDossier>> | undefined;
      let report: Awaited<ReturnType<typeof reportRepository.getByDossierWithYDoc>> | undefined;
      if (format === 'zip' || format === 'obsidian') {
        assets = await fileService.getAssetsByDossier(currentDossier.id);
        // Use getByDossierWithYDoc to check both Dexie and Y.Doc storage
        report = await reportRepository.getByDossierWithYDoc(currentDossier.id);
      }
      const includeStructure = format === 'zip' || format === 'json';
      const tabs = includeStructure || format === 'obsidian'
        ? await tabRepository.getByDossier(currentDossier.id)
        : undefined;
      const views = includeStructure
        ? await db.views.where({ dossierId: currentDossier.id }).toArray()
        : undefined;
      const queries = includeStructure
        ? await db.savedQueries.where({ dossierId: currentDossier.id }).toArray()
        : undefined;
      const queryHistory = includeStructure
        ? useQueryStore.getState().recentQueries
        : undefined;
      const exportComments = includeStructure ? comments : undefined;

      const obsidianLabels = format === 'obsidian'
        ? {
            elementsFolder: t('export.obsidian.elementsFolder'),
            canvasFolder: t('export.obsidian.canvasFolder'),
            reportFolder: t('export.obsidian.reportFolder'),
            relations: t('export.obsidian.relations'),
            events: t('export.obsidian.events'),
            members: t('export.obsidian.members'),
            attachments: t('export.obsidian.attachments'),
            canvases: t('export.obsidian.canvases'),
            elements: t('export.obsidian.elements'),
            report: t('export.obsidian.report'),
            related: t('export.obsidian.related'),
            untitled: t('export.obsidian.untitled'),
          }
        : undefined;

      const build = () => exportService.exportDossier(format, currentDossier, elements, links, assets, report, tabs, views, queries, queryHistory, exportComments, obsidianLabels, obsidianFolderByTag, csvOptions);
      await (format === 'zip' || format === 'obsidian' ? withExportProgress(build) : build());
      toast.success(t('export.successFormat', { format: format.toUpperCase() }));
      onClose();
    } catch {
      toast.error(t('export.error'));
    } finally {
      setIsProcessing(false);
    }
  }, [currentDossier, elements, links, comments, onClose, t]);

  const handleExportEncryptedZip = useCallback(async () => {
    if (!currentDossier || zipPassword.length < 1) return;
    setIsProcessing(true);
    try {
      const assets = await fileService.getAssetsByDossier(currentDossier.id);
      const report = await reportRepository.getByDossierWithYDoc(currentDossier.id);
      const tabs = await tabRepository.getByDossier(currentDossier.id);
      const views = await db.views.where({ dossierId: currentDossier.id }).toArray();
      const queries = await db.savedQueries.where({ dossierId: currentDossier.id }).toArray();
      const queryHistory = useQueryStore.getState().recentQueries;

      const encBlob = await withExportProgress(() => exportService.exportToEncryptedZip(
        zipPassword,
        currentDossier,
        elements,
        links,
        assets,
        report,
        tabs,
        views,
        queries,
        queryHistory,
        comments
      ));

      const now = new Date();
      const timestamp = `${now.toISOString().slice(0, 10)}_${now.toTimeString().slice(0, 8).replace(/:/g, '-')}`;
      const baseName = `${currentDossier.name.replace(/[^a-z0-9]/gi, '_')}_${timestamp}`;
      exportService.downloadBlob(encBlob, `${baseName}.znzip`);

      toast.success(t('export.zip.success'));
      setZipPassword('');
      setZipPasswordConfirm('');
      onClose();
    } catch {
      toast.error(t('export.error'));
    } finally {
      setIsProcessing(false);
    }
  }, [currentDossier, elements, links, comments, zipPassword, onClose, t]);

  const handleExportPng = useCallback(async (scale: number) => {
    if (!currentDossier) return;

    setIsProcessing(true);
    try {
      const element = document.querySelector('[data-report-capture="canvas"]') as HTMLElement;
      if (!element) {
        toast.error(t('export.canvasNotFound'));
        return;
      }

      // Dynamic import html-to-image (better SVG support than html2canvas)
      const { toPng } = await import('html-to-image');

      // Canvas layers (overview, links beyond React Flow's cap) redrawn at the output ratio
      // Without grid or minimap: the graph alone, on white or transparent
      const dataUrl = await withLayersAt(scale, () => toPng(element, {
        backgroundColor: pngTransparent ? undefined : '#ffffff',
        filter: isExportedNode,
        pixelRatio: scale, // Higher pixel ratio = higher resolution output
        skipFonts: true, // Skip font embedding to avoid errors
      }));

      // Download the PNG
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${currentDossier.name.replace(/[^a-zA-Z0-9]/g, '_')}_canvas_${scale}x.png`;
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
  }, [currentDossier, pngTransparent, onClose, t]);

  const handleExportSvg = useCallback(async () => {
    if (!currentDossier) return;

    setIsProcessing(true);
    try {
      // Fetch assets to embed media thumbnails in SVG nodes
      const assets = await fileService.getAssetsByDossier(currentDossier.id);
      const assetDataUrls = new Map<string, string>();
      for (const asset of assets) {
        if (asset.thumbnailDataUrl) {
          assetDataUrls.set(asset.id, asset.thumbnailDataUrl);
        }
      }

      const settings = currentDossier.settings;
      // Drawn as on the canvas: larger with more links when the option is on
      const shownElements = currentDossier.settings?.sizeByDegree
        ? scaleElementsByDegree(elements, links, (el) =>
          Boolean(el.assetIds?.[0] && assetDataUrls.has(el.assetIds[0])) && el.visual.hideMedia !== true)
        : elements;
      const svgString = buildSVGExport(shownElements, links, {
        // Same default as the canvas
        linkAnchorMode: settings?.linkAnchorMode ?? 'manual',
        linkCurveMode: settings?.linkCurveMode ?? 'curved',
        assetDataUrls: assetDataUrls.size > 0 ? assetDataUrls : undefined,
      });
      const baseName = currentDossier.name.replace(/[^a-zA-Z0-9]/g, '_');
      exportService.download(svgString, `${baseName}_canvas.svg`, 'image/svg+xml');
      toast.success(t('export.successFormat', { format: 'SVG' }));
      onClose();
    } catch (err) {
      console.error('SVG export failed:', err);
      toast.error(t('export.error'));
    } finally {
      setIsProcessing(false);
    }
  }, [currentDossier, elements, links, onClose, t]);

  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogA11y(isOpen, dialogRef, onClose);

  if (!isOpen) return null;

  const formats = CATEGORIES.find((c) => c.id === category)?.formats ?? [];
  const passwordsMismatch = zipPasswordConfirm !== '' && zipPassword !== zipPasswordConfirm;
  const needsPassword = format === 'zip' && zipEncrypted && (!zipPassword || zipPassword !== zipPasswordConfirm);
  const canExport = !isProcessing && !!currentDossier && !needsPassword;

  const chooseFormat = (id: FormatId) => {
    setFormat(id);
    try { localStorage.setItem(LAST_FORMAT_KEY, id); } catch { /* per-viewer convenience only */ }
  };
  const chooseCategory = (id: CategoryId) => {
    setCategory(id);
    const first = CATEGORIES.find((c) => c.id === id)?.formats[0];
    if (first && !CATEGORIES.find((c) => c.id === id)?.formats.some((f) => f.id === format)) chooseFormat(first.id);
  };

  // Excel opens a CSV with the list separator of its locale: comma in
  // English, semicolon in the other interface languages (decimal comma)
  const toggleCsvExcel = (on: boolean) => {
    setCsvExcel(on);
    if (on) setCsvDelimiter(i18n.language.startsWith('en') ? ',' : ';');
  };

  const runExport = () => {
    if (!canExport) return;
    switch (format) {
      case 'png': return handleExportPng(pngScale);
      case 'svg': return handleExportSvg();
      case 'zip': return zipEncrypted ? handleExportEncryptedZip() : handleExport('zip');
      case 'obsidian': return handleExport('obsidian', obsidianByTag);
      case 'csv': return handleExport('csv', undefined, { content: csvContent, delimiter: csvDelimiter, excel: csvExcel });
      default: return handleExport(format);
    }
  };

  const sectionTitle = 'text-xs text-text-secondary font-medium uppercase tracking-wider';
  const input = 'w-full px-2 py-1.5 text-sm rounded border bg-bg-primary text-text-primary focus:outline-none sketchy-border';

  /** Small toggle buttons for a short choice (resolution, separator). */
  const segmented = <V extends string | number>(value: V, options: { value: V; label: string; title?: string }[], onChange: (v: V) => void) => (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          title={o.title}
          className={`px-2.5 py-1 text-sm rounded border transition-colors ${
            value === o.value
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border-default text-text-primary hover:bg-bg-secondary'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
  const checkbox = (checked: boolean, onChange: (v: boolean) => void, label: string) => (
    <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[var(--color-accent)]"
      />
      {label}
    </label>
  );
  const fieldLabel = 'w-24 shrink-0 text-xs font-medium text-text-primary';

  /** A radio row: label, optional extension, optional hint. */
  const choice = (name: string, checked: boolean, onSelect: () => void, label: string, ext?: string, hint?: string) => (
    <label
      key={label}
      className={`flex items-start gap-3 px-3 py-2 rounded border cursor-pointer transition-colors ${
        checked ? 'border-accent bg-accent/5' : 'border-border-default hover:bg-bg-secondary'
      }`}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="mt-0.5 accent-[var(--color-accent)]" />
      <span className="flex-1 min-w-0">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-text-primary">{label}</span>
          {ext && <span className="text-xs font-mono text-text-tertiary">{ext}</span>}
        </span>
        {hint && <span className="block text-xs text-text-tertiary">{hint}</span>}
      </span>
    </label>
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[1000] bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed z-[1000] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-2rem)] max-w-3xl h-[min(560px,calc(100dvh-2rem))] bg-bg-primary sketchy-border-soft modal-shadow flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-semibold text-text-primary">
              {t('export.title')}
            </h2>
            <p className="text-xs text-text-tertiary truncate">
              {t('export.description', {
                name: currentDossier?.name,
                elements: elements.length,
                links: links.length,
              })}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common:actions.close')}
            className="p-1 text-text-tertiary hover:text-text-primary rounded"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row flex-1 min-h-0">
          {/* Categories */}
          <nav
            aria-label={t('export.format')}
            className="flex sm:flex-col gap-0.5 p-2 shrink-0 sm:w-44 overflow-x-auto border-b sm:border-b-0 sm:border-r border-border-default bg-bg-secondary"
          >
            {CATEGORIES.map((c) => {
              const Icon = c.icon;
              const active = c.id === category;
              return (
                <button
                  key={c.id}
                  onClick={() => chooseCategory(c.id)}
                  aria-current={active ? 'true' : undefined}
                  className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded whitespace-nowrap text-left transition-colors ${
                    active
                      ? 'bg-bg-primary text-text-primary border border-border-default'
                      : 'text-text-secondary hover:bg-bg-tertiary border border-transparent'
                  }`}
                >
                  <Icon size={16} className="shrink-0" />
                  {t(`export.categories.${c.id}`)}
                </button>
              );
            })}
          </nav>

          {/* Formats and options */}
          <div className="flex-1 min-w-0 overflow-y-auto p-4 space-y-4">
            <div role="radiogroup" aria-label={t(`export.categories.${category}`)} className="space-y-1.5">
              {formats.map((f) => choice(
                'export-format',
                f.id === format,
                () => chooseFormat(f.id),
                t(`export.formats.${f.id}`),
                f.id === 'zip' && zipEncrypted ? '.znzip' : f.ext,
                t(`export.formats.${f.id}Desc`),
              ))}
            </div>

            {format === 'zip' && (
              <div className="space-y-2">
                <div className={sectionTitle}>{t('export.optionsTitle')}</div>
                <div role="radiogroup" className="space-y-1.5">
                  {choice('export-zip', !zipEncrypted, () => setZipEncrypted(false), t('export.zip.standard'), '.zip')}
                  {choice('export-zip', zipEncrypted, () => setZipEncrypted(true), t('export.zip.encrypted'), '.znzip')}
                </div>
                {zipEncrypted && (
                  <div className="space-y-2 pt-1">
                    <div className="relative">
                      <input
                        autoFocus
                        type={showZipPassword ? 'text' : 'password'}
                        value={zipPassword}
                        onChange={(e) => setZipPassword(e.target.value)}
                        placeholder={t('export.zip.password')}
                        aria-label={t('export.zip.password')}
                        className={`${input} pr-8 border-border-default focus:border-accent`}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowZipPassword((v) => !v)}
                        aria-label={t('export.zip.password')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                      >
                        {showZipPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <input
                      type={showZipPassword ? 'text' : 'password'}
                      value={zipPasswordConfirm}
                      onChange={(e) => setZipPasswordConfirm(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') runExport(); }}
                      placeholder={t('export.zip.confirm')}
                      aria-label={t('export.zip.confirm')}
                      className={`${input} ${passwordsMismatch ? 'border-error' : 'border-border-default focus:border-accent'}`}
                      autoComplete="new-password"
                    />
                    {passwordsMismatch && <p className="text-xs text-error">{t('export.zip.mismatch')}</p>}
                  </div>
                )}
              </div>
            )}

            {format === 'obsidian' && (
              <div className="space-y-2">
                <div className={sectionTitle}>{t('export.optionsTitle')}</div>
                <div role="radiogroup" className="space-y-1.5">
                  {choice('export-obsidian', obsidianByTag, () => setObsidianByTag(true), t('export.obsidian.folderByTag'))}
                  {choice('export-obsidian', !obsidianByTag, () => setObsidianByTag(false), t('export.obsidian.folderFlat'))}
                </div>
              </div>
            )}

            {format === 'csv' && (
              <div className="space-y-3">
                <div className={sectionTitle}>{t('export.optionsTitle')}</div>
                <div className="flex items-center gap-3">
                  <span className={fieldLabel}>{t('export.csv.content')}</span>
                  {segmented(csvContent, [
                    { value: 'all', label: t('export.csv.all') },
                    { value: 'elements', label: t('export.csv.elements') },
                    { value: 'links', label: t('export.csv.links') },
                  ], setCsvContent)}
                </div>
                <div className="flex items-center gap-3">
                  <span className={fieldLabel}>{t('export.csv.separator')}</span>
                  {segmented(csvDelimiter, [
                    { value: ',', label: t('export.csv.comma') },
                    { value: ';', label: t('export.csv.semicolon') },
                    { value: '\t', label: t('export.csv.tab') },
                  ], setCsvDelimiter)}
                </div>
                {checkbox(csvExcel, toggleCsvExcel, t('export.csv.excel'))}
              </div>
            )}

            {format === 'png' && (
              <div className="space-y-3">
                <div className={sectionTitle}>{t('export.optionsTitle')}</div>
                <div className="flex items-center gap-3">
                  <span className={fieldLabel}>{t('export.resolution')}</span>
                  {segmented(pngScale, PNG_SCALES.map((scale) => ({
                    value: scale as number,
                    label: `${scale}x`,
                    title: t(`export.scale.${PNG_SCALE_KEYS[scale]}`),
                  })), setPngScale)}
                </div>
                {checkbox(pngTransparent, setPngTransparent, t('export.png.transparent'))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border-default bg-bg-secondary">
          <button
            onClick={onClose}
            className="border border-border-default text-text-primary bg-bg-primary hover:bg-bg-secondary px-3 py-1.5 text-sm font-medium rounded sketchy-border"
          >
            {t('common:actions.cancel')}
          </button>
          <button
            onClick={runExport}
            disabled={!canExport}
            className="bg-accent text-white hover:bg-accent-hover px-3 py-1.5 text-sm font-medium rounded sketchy-border disabled:opacity-50"
          >
            {isProcessing ? t('export.exporting') : t('common:actions.export')}
          </button>
        </div>
      </div>
    </>
  );
}
