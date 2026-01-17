import { useState, useCallback } from 'react';
import { X, FileText, Download, Printer, FileCode } from 'lucide-react';
import {
  reportService,
  type ReportFormat,
  type ReportOptions,
  DEFAULT_REPORT_OPTIONS,
} from '../../services/reportService';
import { useInvestigationStore } from '../../stores';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ReportModal({ isOpen, onClose }: ReportModalProps) {
  const { currentInvestigation, elements, links } = useInvestigationStore();

  const [options, setOptions] = useState<ReportOptions>({
    ...DEFAULT_REPORT_OPTIONS,
    title: currentInvestigation?.name || '',
  });
  const [isGenerating, setIsGenerating] = useState(false);

  const updateOption = useCallback(<K extends keyof ReportOptions>(
    key: K,
    value: ReportOptions[K]
  ) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleGenerate = useCallback(async (format: ReportFormat, action: 'download' | 'print') => {
    if (!currentInvestigation) return;

    setIsGenerating(true);
    try {
      const content = reportService.generate(
        format,
        currentInvestigation,
        elements,
        links,
        options
      );

      if (action === 'print') {
        // For print, always generate HTML
        const htmlContent = format === 'html'
          ? content
          : reportService.generate('html', currentInvestigation, elements, links, options);
        reportService.openForPrint(htmlContent);
      } else {
        const timestamp = new Date().toISOString().slice(0, 10);
        const filename = `${(options.title || currentInvestigation.name).replace(/[^a-z0-9]/gi, '_')}_${timestamp}`;
        reportService.download(content, filename, format);
      }
    } finally {
      setIsGenerating(false);
    }
  }, [currentInvestigation, elements, links, options]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-bg-primary rounded-lg shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default shrink-0">
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <FileText size={16} />
            Generer un rapport
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-text-tertiary hover:text-text-primary rounded"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {/* Title */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Titre du rapport
            </label>
            <input
              type="text"
              value={options.title}
              onChange={(e) => updateOption('title', e.target.value)}
              placeholder={currentInvestigation?.name}
              className="w-full px-3 py-2 text-sm border border-border-default rounded-lg bg-bg-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
          </div>

          {/* Content options */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-text-secondary mb-2">
              Contenu a inclure
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={options.includeDescription}
                  onChange={(e) => updateOption('includeDescription', e.target.checked)}
                  className="rounded border-border-default"
                />
                <span className="text-text-primary">Description de l'enquete</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={options.includeSummary}
                  onChange={(e) => updateOption('includeSummary', e.target.checked)}
                  className="rounded border-border-default"
                />
                <span className="text-text-primary">Resume statistique</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={options.includeInsights}
                  onChange={(e) => updateOption('includeInsights', e.target.checked)}
                  className="rounded border-border-default"
                />
                <span className="text-text-primary">Analyse du graphe (clusters, centralite)</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={options.includeTimeline}
                  onChange={(e) => updateOption('includeTimeline', e.target.checked)}
                  className="rounded border-border-default"
                />
                <span className="text-text-primary">Chronologie</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={options.includeElements}
                  onChange={(e) => updateOption('includeElements', e.target.checked)}
                  className="rounded border-border-default"
                />
                <span className="text-text-primary">Liste des elements ({elements.length})</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={options.includeLinks}
                  onChange={(e) => updateOption('includeLinks', e.target.checked)}
                  className="rounded border-border-default"
                />
                <span className="text-text-primary">Liste des liens ({links.length})</span>
              </label>
            </div>
          </div>

          {/* Element options */}
          {options.includeElements && (
            <div className="mb-4 pl-4 border-l-2 border-border-default">
              <label className="block text-xs font-medium text-text-secondary mb-2">
                Options des elements
              </label>
              <label className="flex items-center gap-2 text-sm mb-2">
                <input
                  type="checkbox"
                  checked={options.groupElementsByTag}
                  onChange={(e) => updateOption('groupElementsByTag', e.target.checked)}
                  className="rounded border-border-default"
                />
                <span className="text-text-primary">Grouper par tag</span>
              </label>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-text-secondary">Trier par:</span>
                <select
                  value={options.sortElementsBy}
                  onChange={(e) => updateOption('sortElementsBy', e.target.value as ReportOptions['sortElementsBy'])}
                  className="px-2 py-1 text-sm border border-border-default rounded bg-bg-primary"
                >
                  <option value="label">Nom</option>
                  <option value="date">Date</option>
                  <option value="confidence">Confiance</option>
                </select>
              </div>
            </div>
          )}

          {/* Preview info */}
          <div className="p-3 bg-bg-secondary rounded-lg text-xs text-text-secondary">
            <p className="font-medium mb-1">Apercu:</p>
            <p>
              Le rapport contiendra{' '}
              {[
                options.includeDescription && 'la description',
                options.includeSummary && 'un resume',
                options.includeInsights && 'l\'analyse',
                options.includeTimeline && 'la chronologie',
                options.includeElements && `${elements.length} elements`,
                options.includeLinks && `${links.length} liens`,
              ].filter(Boolean).join(', ') || 'aucun contenu'}.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-border-default bg-bg-secondary shrink-0">
          <div className="grid grid-cols-3 gap-2">
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
              onClick={() => handleGenerate('html', 'print')}
              disabled={isGenerating}
              className="flex flex-col items-center gap-1 p-3 rounded-lg border border-border-default hover:border-accent hover:bg-accent/5 transition-colors disabled:opacity-50"
            >
              <Printer size={20} className="text-text-secondary" />
              <span className="text-xs font-medium text-text-primary">Imprimer</span>
            </button>
          </div>
          <p className="text-xs text-text-tertiary text-center mt-2">
            L'impression genere un PDF via le navigateur
          </p>
        </div>
      </div>
    </>
  );
}
