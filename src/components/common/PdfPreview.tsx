import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask, TextLayer } from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, FileWarning } from 'lucide-react';
import { ZoomControls } from './ZoomControls';
import { ZOOM_STEP, clampScale } from './zoom';
import { loadPdfjs } from '../../services/pdfjsLoader';

const CONTAINER_PADDING = 32;

interface PdfPreviewProps {
  file: Blob;
}

/**
 * Renders a PDF via pdfjs-dist onto a canvas instead of the browser's native
 * PDF plugin. Avoids the iframe/sandbox tradeoffs (Chrome refuses to run its
 * PDF plugin inside a sandboxed iframe at all; without sandbox, a mislabeled
 * file gets same-origin script execution). pdf.js parses PDF bytes directly
 * and never executes them as a document.
 *
 * Takes the bytes, not a blob: URL. Given a URL, pdf.js loads it with fetch(),
 * which the production CSP (connect-src without blob:) refuses: the load fails
 * with an opaque "Unexpected server response (0)".
 */
export function PdfPreview({ file }: PdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [scale, setScale] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  // Load the document and compute an initial fit-to-width scale
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(false);
    setNumPages(0);
    setPageNum(1);
    setScale(null);

    // Local to this effect run, never a ref: in StrictMode the effect runs
    // twice, and a ref shared between runs let the first run's late promise
    // destroy the second run's task — leaving a live document whose transport
    // was already torn down.
    let task: PDFDocumentLoadingTask | null = null;

    Promise.all([loadPdfjs(), file.arrayBuffer()])
      .then(([pdfjsLib, data]) => {
        // pdf.js 6 dropped PDFDocumentProxy.destroy(); tearing down the worker
        // transport now goes through the loading task.
        task = pdfjsLib.getDocument({ data });
        if (cancelled) {
          void task.destroy();
          return null;
        }
        return task.promise;
      })
      .then(async (doc) => {
        if (!doc || cancelled) return;
        docRef.current = doc;
        const firstPage = await doc.getPage(1);
        const baseViewport = firstPage.getViewport({ scale: 1 });
        const containerWidth = containerRef.current?.clientWidth || baseViewport.width;
        const fitScale = clampScale((containerWidth - CONTAINER_PADDING) / baseViewport.width);
        if (cancelled) return;
        setNumPages(doc.numPages);
        setScale(fitScale);
        setIsLoading(false);
      })
      .catch((err) => {
        // Destroying the task rejects its pending promise: expected here.
        if (cancelled) return;
        console.error('Erreur de chargement du PDF:', err);
        setError(true);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
      void task?.destroy();
      docRef.current = null;
    };
  }, [file]);

  // Render the current page whenever the page or zoom changes
  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    const textDiv = textLayerRef.current;
    if (!doc || !canvas || !textDiv || scale === null) return;
    let cancelled = false;

    // Held so the effect cleanup can cancel it: without this, changing page or
    // zoom leaves the previous render running against the same canvas, and
    // pdf.js aborts it on its own with a RenderingCancelledException.
    let renderTask: RenderTask | null = null;
    let textLayer: TextLayer | null = null;

    Promise.all([loadPdfjs(), doc.getPage(pageNum)])
      .then(async ([pdfjsLib, page]) => {
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);

        // Transparent spans laid over the canvas, at the glyphs' positions, so
        // the text can be selected and copied. The layer sizes itself from
        // CSS variables: viewport.scale, not the zoom state, since it already
        // includes the page's UserUnit.
        textDiv.replaceChildren();
        textDiv.style.setProperty('--total-scale-factor', String(viewport.scale));
        textDiv.style.setProperty('--scale-round-x', '1px');
        textDiv.style.setProperty('--scale-round-y', '1px');
        textLayer = new pdfjsLib.TextLayer({
          textContentSource: page.streamTextContent(),
          container: textDiv,
          viewport,
        });

        renderTask = page.render({ canvasContext: ctx, viewport, canvas });
        await Promise.all([renderTask.promise, textLayer.render()]);
      })
      .catch((err: unknown) => {
        // Cancelling is how this component switches page or zoom level; it is
        // control flow, not a failure to report.
        if (cancelled || (err as { name?: string })?.name === 'RenderingCancelledException') return;
        console.error('Erreur de rendu de la page PDF:', err);
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [pageNum, scale]);

  const goPrev = () => setPageNum((p) => Math.max(1, p - 1));
  const goNext = () => setPageNum((p) => Math.min(numPages, p + 1));
  const zoomOut = () => setScale((s) => clampScale((s ?? 1) - ZOOM_STEP));
  const zoomIn = () => setScale((s) => clampScale((s ?? 1) + ZOOM_STEP));

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-border-default bg-bg-secondary flex-shrink-0 text-xs">
        <div className="flex items-center gap-1">
          <button
            onClick={goPrev}
            disabled={pageNum <= 1}
            className="p-1 text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-tertiary"
            title="Page précédente"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-text-secondary tabular-nums min-w-[3.5rem] text-center">
            {numPages > 0 ? `${pageNum} / ${numPages}` : '—'}
          </span>
          <button
            onClick={goNext}
            disabled={pageNum >= numPages}
            className="p-1 text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-tertiary"
            title="Page suivante"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <ZoomControls scale={scale} onZoomIn={zoomIn} onZoomOut={zoomOut} />
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto bg-bg-tertiary flex items-start justify-center p-4">
        {error ? (
          <div className="flex flex-col items-center justify-center gap-2 text-text-tertiary py-8">
            <FileWarning size={32} />
            <p className="text-xs">Impossible d'afficher ce PDF</p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center p-8">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="relative bg-white">
            <canvas ref={canvasRef} data-testid="pdf-preview-canvas" className="block" />
            <div ref={textLayerRef} data-testid="pdf-preview-text" className="textLayer" />
          </div>
        )}
      </div>
    </div>
  );
}
