import { useState, useCallback } from 'react';
import { X, FileJson, FileSpreadsheet, FileText, FileArchive, Image, ChevronDown } from 'lucide-react';
import { exportService, type ExportFormat } from '../../services/exportService';
import { fileService } from '../../services/fileService';
import { useInvestigationStore, toast } from '../../stores';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const exportFormats: { format: ExportFormat; label: string; description: string; icon: typeof FileJson }[] = [
  { format: 'zip', label: 'ZIP (complet)', description: 'Archive avec fichiers joints (recommandé)', icon: FileArchive },
  { format: 'json', label: 'JSON', description: 'Métadonnées uniquement (sans fichiers)', icon: FileJson },
  { format: 'csv', label: 'CSV', description: 'Tableaux éléments et liens séparés', icon: FileSpreadsheet },
  { format: 'graphml', label: 'GraphML', description: 'Format graphe standard (Gephi, yEd)', icon: FileText },
];

const pngScaleOptions = [
  { scale: 1, label: '1x', description: 'Taille normale' },
  { scale: 2, label: '2x', description: 'Haute définition' },
  { scale: 3, label: '3x', description: 'Très haute définition' },
  { scale: 4, label: '4x', description: 'Ultra haute définition' },
];

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
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
      toast.success(`Export ${format.toUpperCase()} terminé`);
      onClose();
    } catch {
      toast.error('Erreur lors de l\'export');
    } finally {
      setIsProcessing(false);
    }
  }, [currentInvestigation, elements, links, onClose]);

  const handleExportPng = useCallback(async (scale: number) => {
    if (!currentInvestigation) return;

    setIsProcessing(true);
    try {
      const element = document.querySelector('[data-report-capture="canvas"]') as HTMLElement;
      if (!element) {
        toast.error('Canvas non trouvé');
        return;
      }

      // Dynamic import html2canvas
      const html2canvas = (await import('html2canvas')).default;

      // Prepare SVG elements for capture - inline all styles
      const svgElements = element.querySelectorAll('svg');
      const originalSvgStyles: { el: SVGElement; style: string }[] = [];

      svgElements.forEach((svg) => {
        originalSvgStyles.push({ el: svg, style: svg.getAttribute('style') || '' });
        // Ensure SVG is visible and has proper dimensions
        const rect = svg.getBoundingClientRect();
        svg.setAttribute('style', `${svg.getAttribute('style') || ''}; overflow: visible;`);
        svg.setAttribute('width', String(rect.width));
        svg.setAttribute('height', String(rect.height));
      });

      // Prepare edges - inline stroke styles for better capture
      const edges = element.querySelectorAll('.react-flow__edge path, .react-flow__edge line, .react-flow__edge polyline');
      const originalEdgeStyles: { el: SVGElement; stroke: string; strokeWidth: string; fill: string }[] = [];

      edges.forEach((edge) => {
        const el = edge as SVGElement;
        const computedStyle = window.getComputedStyle(el);
        originalEdgeStyles.push({
          el,
          stroke: el.getAttribute('stroke') || '',
          strokeWidth: el.getAttribute('stroke-width') || '',
          fill: el.getAttribute('fill') || '',
        });

        // Force inline styles for html2canvas to pick up
        el.setAttribute('stroke', computedStyle.stroke || '#6b7280');
        el.setAttribute('stroke-width', String(Math.max(2, parseFloat(computedStyle.strokeWidth || '1') * 1.5)));
        el.setAttribute('fill', computedStyle.fill || 'none');
      });

      // Also handle edge markers (arrows)
      const markers = element.querySelectorAll('marker path, marker polygon');
      const originalMarkerStyles: { el: SVGElement; fill: string; stroke: string }[] = [];

      markers.forEach((marker) => {
        const el = marker as SVGElement;
        const computedStyle = window.getComputedStyle(el);
        originalMarkerStyles.push({
          el,
          fill: el.getAttribute('fill') || '',
          stroke: el.getAttribute('stroke') || '',
        });
        el.setAttribute('fill', computedStyle.fill || '#6b7280');
        el.setAttribute('stroke', computedStyle.stroke || 'none');
      });

      try {
        const canvas = await html2canvas(element, {
          backgroundColor: '#faf8f5',
          scale: scale,
          logging: false,
          useCORS: true,
          allowTaint: true,
          imageTimeout: 15000,
          foreignObjectRendering: false,
          onclone: (clonedDoc) => {
            // Ensure SVG edges are visible in cloned document
            const clonedEdges = clonedDoc.querySelectorAll('.react-flow__edge');
            clonedEdges.forEach((edge) => {
              (edge as HTMLElement).style.opacity = '1';
              (edge as HTMLElement).style.visibility = 'visible';
            });
          },
        });

        // Download the PNG
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `${currentInvestigation.name.replace(/[^a-zA-Z0-9]/g, '_')}_canvas_${scale}x.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast.success(`Export PNG (${scale}x) terminé`);
        onClose();
      } finally {
        // Restore original SVG styles
        originalSvgStyles.forEach(({ el, style }) => {
          if (style) {
            el.setAttribute('style', style);
          } else {
            el.removeAttribute('style');
          }
        });

        // Restore original edge styles
        originalEdgeStyles.forEach(({ el, stroke, strokeWidth, fill }) => {
          if (stroke) el.setAttribute('stroke', stroke); else el.removeAttribute('stroke');
          if (strokeWidth) el.setAttribute('stroke-width', strokeWidth); else el.removeAttribute('stroke-width');
          if (fill) el.setAttribute('fill', fill); else el.removeAttribute('fill');
        });

        // Restore marker styles
        originalMarkerStyles.forEach(({ el, fill, stroke }) => {
          if (fill) el.setAttribute('fill', fill); else el.removeAttribute('fill');
          if (stroke) el.setAttribute('stroke', stroke); else el.removeAttribute('stroke');
        });
      }
    } catch (err) {
      console.error('PNG export failed:', err);
      toast.error('Erreur lors de l\'export PNG');
    } finally {
      setIsProcessing(false);
    }
  }, [currentInvestigation, onClose]);

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
            Exporter l'enquête
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
            Exporter "{currentInvestigation?.name}" ({elements.length} éléments, {links.length} liens)
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
                    PNG (image du canvas)
                  </div>
                  <div className="text-xs text-text-tertiary">
                    Capture visuelle avec choix de résolution
                  </div>
                </div>
                <ChevronDown
                  size={16}
                  className={`text-text-tertiary transition-transform ${showPngOptions ? 'rotate-180' : ''}`}
                />
              </button>
              {showPngOptions && (
                <div className="border-t border-border-default bg-bg-secondary p-2">
                  <div className="text-xs text-text-tertiary mb-2 px-1">Résolution :</div>
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
                        title={option.description}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

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
                      {format.label}
                    </div>
                    <div className="text-xs text-text-tertiary">
                      {format.description}
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
