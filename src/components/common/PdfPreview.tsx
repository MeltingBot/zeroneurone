import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, FileWarning } from 'lucide-react';
import { loadPdfjs } from '../../services/pdfjsLoader';

const MIN_SCALE = 0.4;
const MAX_SCALE = 3;
const ZOOM_STEP = 0.25;
const CONTAINER_PADDING = 32;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface PdfPreviewProps {
  url: string;
}

/**
 * Renders a PDF via pdfjs-dist onto a canvas instead of the browser's native
 * PDF plugin. Avoids the iframe/sandbox tradeoffs (Chrome refuses to run its
 * PDF plugin inside a sandboxed iframe at all; without sandbox, a mislabeled
 * file gets same-origin script execution). pdf.js parses PDF bytes directly
 * and never executes them as a document.
 */
export function PdfPreview({ url }: PdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
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

    loadPdfjs()
      .then((pdfjsLib) => {
        // pdf.js 6 dropped PDFDocumentProxy.destroy(); tearing down the worker
        // transport now goes through the loading task.
        const task = pdfjsLib.getDocument({ url });
        loadingTaskRef.current = task;
        return task.promise;
      })
      .then(async (doc) => {
        if (cancelled) {
          void loadingTaskRef.current?.destroy();
          loadingTaskRef.current = null;
          return;
        }
        docRef.current = doc;
        const firstPage = await doc.getPage(1);
        const baseViewport = firstPage.getViewport({ scale: 1 });
        const containerWidth = containerRef.current?.clientWidth || baseViewport.width;
        const fitScale = clamp((containerWidth - CONTAINER_PADDING) / baseViewport.width, MIN_SCALE, MAX_SCALE);
        if (cancelled) return;
        setNumPages(doc.numPages);
        setScale(fitScale);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Erreur de chargement du PDF:', err);
        if (!cancelled) {
          setError(true);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      void loadingTaskRef.current?.destroy();
      loadingTaskRef.current = null;
      docRef.current = null;
    };
  }, [url]);

  // Render the current page whenever the page or zoom changes
  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || scale === null) return;
    let cancelled = false;

    // Held so the effect cleanup can cancel it: without this, changing page or
    // zoom leaves the previous render running against the same canvas, and
    // pdf.js aborts it on its own with a RenderingCancelledException.
    let renderTask: RenderTask | null = null;

    doc.getPage(pageNum)
      .then(async (page) => {
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        renderTask = page.render({ canvasContext: ctx, viewport, canvas });
        await renderTask.promise;
      })
      .catch((err: unknown) => {
        // Cancelling is how this component switches page or zoom level; it is
        // control flow, not a failure to report.
        if ((err as { name?: string })?.name === 'RenderingCancelledException') return;
        console.error('Erreur de rendu de la page PDF:', err);
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pageNum, scale]);

  const goPrev = () => setPageNum((p) => Math.max(1, p - 1));
  const goNext = () => setPageNum((p) => Math.min(numPages, p + 1));
  const zoomOut = () => setScale((s) => clamp((s ?? 1) - ZOOM_STEP, MIN_SCALE, MAX_SCALE));
  const zoomIn = () => setScale((s) => clamp((s ?? 1) + ZOOM_STEP, MIN_SCALE, MAX_SCALE));

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
        <div className="flex items-center gap-1">
          <button
            onClick={zoomOut}
            disabled={scale === null || scale <= MIN_SCALE}
            className="p-1 text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-tertiary"
            title="Zoom arrière"
          >
            <ZoomOut size={14} />
          </button>
          <span className="text-text-secondary tabular-nums w-10 text-center">
            {scale !== null ? `${Math.round(scale * 100)}%` : '—'}
          </span>
          <button
            onClick={zoomIn}
            disabled={scale === null || scale >= MAX_SCALE}
            className="p-1 text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-tertiary"
            title="Zoom avant"
          >
            <ZoomIn size={14} />
          </button>
        </div>
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
          <canvas ref={canvasRef} className="bg-white" />
        )}
      </div>
    </div>
  );
}
